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

// Kết nối đến MongoDB
async function connectToDatabase() {
  // Nếu đã có kết nối, sử dụng lại
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // Nếu chưa có kết nối, tạo mới
  try {
    const client = await MongoClient.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10, // Giới hạn số kết nối trong pool
      connectTimeoutMS: 5000, // Timeout kết nối
      serverSelectionTimeoutMS: 5000 // Timeout chọn server
    });

    const db = client.db(DB_NAME);
    console.log(`[${new Date().toISOString()}] Đã kết nối thành công đến MongoDB`);
    
    // Lưu kết nối vào cache
    cachedClient = client;
    cachedDb = db;
    
    return { client, db };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi kết nối MongoDB:`, error.message);
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
  closeConnection
}; 