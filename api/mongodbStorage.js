// mongodbStorage.js - Module kết nối MongoDB để lưu trữ token
const { MongoClient } = require('mongodb');

// Cấu hình kết nối
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB_NAME || 'hanetTokens';
const TOKENS_COLLECTION = 'tokens';
const CONFIGS_COLLECTION = 'oauthConfigs';

// Biến lưu trữ kết nối
let cachedClient = null;
let cachedDb = null;

// Kết nối đến MongoDB - phiên bản tối ưu cho serverless
async function connectToDatabase() {
  // Nếu đã có kết nối, sử dụng lại
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // Thiết lập hàm timeout
  const connectWithTimeout = (timeoutMs = 10000) => {
    return new Promise(async (resolve, reject) => {
      // Tạo timeout
      const timeoutId = setTimeout(() => {
        reject(new Error(`MongoDB connection timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      try {
        const client = new MongoClient(MONGODB_URI, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          maxPoolSize: 1, // Giảm pool size tối đa cho serverless
          connectTimeoutMS: 8000, // Tăng timeout kết nối
          serverSelectionTimeoutMS: 8000, // Tăng timeout chọn server
          socketTimeoutMS: 10000, // Tăng giới hạn thời gian socket
          directConnection: false, // Cho phép kết nối qua replica set
          retryWrites: true, // Cho phép retry writes
          retryReads: true // Cho phép retry reads
        });

        // Thử kết nối
        await client.connect();
        const db = client.db(DB_NAME);
        
        // Kết nối thành công, hủy timeout
        clearTimeout(timeoutId);
        
        // Trả về kết nối
        resolve({ client, db });
      } catch (error) {
        // Lỗi kết nối, hủy timeout
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  };

  // Nếu chưa có kết nối, tạo mới với timeout
  try {
    console.log(`[${new Date().toISOString()}] Đang kết nối đến MongoDB...`);
    const { client, db } = await connectWithTimeout(8000);

    console.log(`[${new Date().toISOString()}] Đã kết nối thành công đến MongoDB`);
    
    // Lưu kết nối vào cache
    cachedClient = client;
    cachedDb = db;
    
    return { client, db };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi kết nối MongoDB:`, error.message);
    
    // Nếu đang chạy trong môi trường serverless của Vercel, thử kết nối đến MongoDB Atlas
    // với cấu hình dự phòng trước khi trả về dummy DB
    if (process.env.VERCEL === '1') {
      // Thử sử dụng chuỗi kết nối dự phòng nếu có
      const backupUri = process.env.MONGODB_URI_BACKUP;
      if (backupUri && backupUri !== MONGODB_URI) {
        try {
          console.warn(`[${new Date().toISOString()}] Thử kết nối đến MongoDB với URI dự phòng...`);
          const backupClient = new MongoClient(backupUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: 1,
            connectTimeoutMS: 10000,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 12000,
            retryWrites: true,
            retryReads: true
          });
          
          await backupClient.connect();
          const backupDb = backupClient.db(DB_NAME);
          
          // Lưu kết nối vào cache
          cachedClient = backupClient;
          cachedDb = backupDb;
          
          console.log(`[${new Date().toISOString()}] Kết nối thành công đến MongoDB dự phòng`);
          return { client: backupClient, db: backupDb };
        } catch (backupError) {
          console.error(`[${new Date().toISOString()}] Lỗi kết nối MongoDB dự phòng:`, backupError.message);
        }
      }
      
      console.warn(`[${new Date().toISOString()}] Đang chạy trên Vercel, trả về dummy DB`);
      return {
        client: { close: () => {} },
        db: {
          collection: () => ({
            findOne: async () => null,
            find: async () => ({ toArray: async () => [] }),
            updateOne: async () => ({ modifiedCount: 0 }),
            deleteOne: async () => ({ deletedCount: 0 })
          })
        }
      };
    }
    
    throw error;
  }
}

// Lưu token vào MongoDB
async function saveToken(key = 'default', tokenData) {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection(TOKENS_COLLECTION);
    
    // Cập nhật hoặc thêm mới dựa trên key
    const result = await collection.updateOne(
      { _id: key },
      { 
        $set: { 
          ...tokenData,
          updatedAt: new Date()
        }
      },
      { upsert: true } // Tạo mới nếu không tồn tại
    );
    
    console.log(`[${new Date().toISOString()}] Đã lưu token vào MongoDB: ${key}`);
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi lưu token vào MongoDB:`, error.message);
    return false;
  }
}

// Đọc token từ MongoDB
async function getToken(key = 'default') {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection(TOKENS_COLLECTION);
    
    const result = await collection.findOne({ _id: key });
    
    if (result) {
      console.log(`[${new Date().toISOString()}] Đã đọc token từ MongoDB: ${key}`);
      return result;
    } else {
      console.log(`[${new Date().toISOString()}] Không tìm thấy token trong MongoDB: ${key}`);
      return null;
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi đọc token từ MongoDB:`, error.message);
    return null;
  }
}

// Lưu cấu hình OAuth
async function saveOAuthConfig(configName, config) {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection(CONFIGS_COLLECTION);
    
    // Cập nhật hoặc thêm mới dựa trên configName
    const result = await collection.updateOne(
      { _id: configName },
      { 
        $set: { 
          ...config,
          updatedAt: new Date()
        }
      },
      { upsert: true } // Tạo mới nếu không tồn tại
    );
    
    console.log(`[${new Date().toISOString()}] Đã lưu cấu hình OAuth vào MongoDB: ${configName}`);
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi lưu cấu hình OAuth vào MongoDB:`, error.message);
    return false;
  }
}

// Đọc cấu hình OAuth
async function getOAuthConfig(configName) {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection(CONFIGS_COLLECTION);
    
    const result = await collection.findOne({ _id: configName });
    
    if (result) {
      console.log(`[${new Date().toISOString()}] Đã đọc cấu hình OAuth từ MongoDB: ${configName}`);
      return result;
    } else {
      console.log(`[${new Date().toISOString()}] Không tìm thấy cấu hình OAuth trong MongoDB: ${configName}`);
      return null;
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi đọc cấu hình OAuth từ MongoDB:`, error.message);
    return null;
  }
}

// Lấy danh sách tên cấu hình
async function getConfigNames() {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection(CONFIGS_COLLECTION);
    
    const results = await collection.find({}, { projection: { _id: 1 } }).toArray();
    const configNames = results.map(doc => doc._id);
    
    console.log(`[${new Date().toISOString()}] Đã lấy ${configNames.length} tên cấu hình từ MongoDB`);
    return configNames;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi lấy danh sách cấu hình từ MongoDB:`, error.message);
    return [];
  }
}

// Lấy cấu hình đang kích hoạt
async function getActiveConfig() {
  try {
    const { db } = await connectToDatabase();
    const settingCollection = db.collection('settings');
    
    // Lấy thông tin cấu hình đang hoạt động
    const activeConfig = await settingCollection.findOne({ _id: 'activeConfig' });
    
    if (activeConfig) {
      console.log(`[${new Date().toISOString()}] Đã đọc cấu hình đang kích hoạt từ MongoDB: ${activeConfig.name}`);
      return activeConfig;
    } else {
      console.log(`[${new Date().toISOString()}] Không tìm thấy cấu hình đang kích hoạt trong MongoDB`);
      return null;
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi đọc cấu hình đang kích hoạt từ MongoDB:`, error.message);
    return null;
  }
}

// Đọc cấu hình theo tên
async function getConfig(configName) {
  // Đây là alias cho getOAuthConfig để giữ tính nhất quán API
  return await getOAuthConfig(configName);
}

// Lưu cấu hình đang kích hoạt
async function setActiveConfig(configName) {
  try {
    const { db } = await connectToDatabase();
    const settingCollection = db.collection('settings');
    
    // Cập nhật hoặc thêm mới cấu hình đang kích hoạt
    const result = await settingCollection.updateOne(
      { _id: 'activeConfig' },
      { 
        $set: { 
          name: configName,
          updatedAt: new Date()
        }
      },
      { upsert: true } // Tạo mới nếu không tồn tại
    );
    
    console.log(`[${new Date().toISOString()}] Đã lưu cấu hình đang kích hoạt vào MongoDB: ${configName}`);
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi lưu cấu hình đang kích hoạt vào MongoDB:`, error.message);
    return false;
  }
}

// Đóng kết nối khi ứng dụng kết thúc
function closeConnection() {
  if (cachedClient) {
    cachedClient.close().then(() => {
      console.log(`[${new Date().toISOString()}] Đã đóng kết nối MongoDB`);
    }).catch(err => {
      console.error(`[${new Date().toISOString()}] Lỗi khi đóng kết nối MongoDB:`, err.message);
    });
  }
}

// Xử lý sự kiện đóng ứng dụng để đóng kết nối
if (typeof process !== 'undefined') {
  process.on('SIGINT', closeConnection);
  process.on('SIGTERM', closeConnection);
}

module.exports = {
  connectToDatabase,
  saveToken,
  getToken,
  saveOAuthConfig,
  getOAuthConfig,
  getConfigNames,
  getActiveConfig,
  getConfig,
  setActiveConfig,
  closeConnection
};