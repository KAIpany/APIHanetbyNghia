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

// Biến lưu trữ fallback data trong trường hợp không kết nối được MongoDB
let fallbackTokensCache = {};
let fallbackConfigsCache = {};
let fallbackActiveConfig = null;

// Kết nối đã thử bao nhiêu lần
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3; // Số lần thử tối đa trước khi sử dụng hoàn toàn cache

// Kiểm tra xem có đang chạy trên Vercel hay không
const isRunningOnVercel = process.env.VERCEL === '1';

// Kiểm tra xem có đang chạy trong môi trường dev hay không
const isDevEnvironment = process.env.NODE_ENV === 'development';

// Kết nối đến MongoDB - phiên bản tối ưu cho serverless với cơ chế dự phòng
async function connectToDatabase() {
  // Nếu đã có kết nối cache và vẫn hoạt động, sử dụng lại
  if (cachedClient && cachedDb) {
    try {
      // Kiểm tra nhanh xem kết nối có còn sống không (chỉ trong môi trường dev)
      if (!isRunningOnVercel && isDevEnvironment) {
        await cachedDb.command({ ping: 1 });
      }
      return { client: cachedClient, db: cachedDb };
    } catch (pingError) {
      console.log(`[${new Date().toISOString()}] Kết nối cache không còn hoạt động, đang tạo mới...`);
      // Nếu kết nối đã chết, đặt lại cache
      cachedClient = null;
      cachedDb = null;
    }
  }

  // Tăng số lần thử kết nối
  connectionAttempts++;
  
  // Nếu đã thử nhiều lần và đang ở môi trường Vercel, trả về dummy DB ngay
  if (isRunningOnVercel && connectionAttempts > MAX_CONNECTION_ATTEMPTS) {
    console.warn(`[${new Date().toISOString()}] Đã thử kết nối ${connectionAttempts} lần, chuyển sang sử dụng hoàn toàn local cache`);
    return createDummyDb();
  }

  // Thiết lập hàm timeout ngắn hơn khi ở Vercel
  const timeoutMs = isRunningOnVercel ? 2000 : 5000;
  
  // Thiết lập hàm timeout
  const connectWithTimeout = () => {
    return new Promise(async (resolve, reject) => {
      // Tạo timeout
      const timeoutId = setTimeout(() => {
        reject(new Error(`MongoDB connection timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      try {
        const client = new MongoClient(MONGODB_URI, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          maxPoolSize: isRunningOnVercel ? 3 : 5, // Giảm pool size cho serverless
          connectTimeoutMS: isRunningOnVercel ? 2000 : 3000, // Giảm timeout kết nối
          serverSelectionTimeoutMS: isRunningOnVercel ? 2000 : 3000, // Giảm timeout chọn server
          socketTimeoutMS: isRunningOnVercel ? 3000 : 5000, // Thêm giới hạn thời gian socket
          directConnection: false // Cho phép kết nối qua replica set
        });

        // Thử kết nối
        await client.connect();
        const db = client.db(DB_NAME);
        
        // Kiểm tra kết nối
        await db.command({ ping: 1 });
        
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
    console.log(`[${new Date().toISOString()}] Đang kết nối đến MongoDB (lần thử ${connectionAttempts})...`);
    const { client, db } = await connectWithTimeout();

    console.log(`[${new Date().toISOString()}] Đã kết nối thành công đến MongoDB`);
    
    // Đặt lại số lần thử
    connectionAttempts = 0;
    
    // Lưu kết nối vào cache
    cachedClient = client;
    cachedDb = db;
    
    return { client, db };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi kết nối MongoDB:`, error.message);
    
    // Nếu đang chạy trên Vercel hoặc đã thử nhiều lần, trả về dummy DB
    if (isRunningOnVercel || connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
      console.warn(`[${new Date().toISOString()}] Chuyển sang sử dụng local cache và dummy DB`);
      return createDummyDb();
    }
    
    throw error;
  }
}

// Tạo dummy DB cho trường hợp không kết nối được MongoDB
function createDummyDb() {
  return {
    client: { close: () => {} },
    db: {
      collection: (collectionName) => ({
        findOne: async (query) => {
          // Đối với tokens
          if (collectionName === TOKENS_COLLECTION) {
            const key = query._id || 'default';
            return fallbackTokensCache[key] || null;
          }
          // Đối với configs
          else if (collectionName === CONFIGS_COLLECTION) {
            const configName = query._id;
            return fallbackConfigsCache[configName] || null;
          }
          // Đối với active config
          else if (collectionName === 'activeConfig') {
            return fallbackActiveConfig || null;
          }
          return null;
        },
        find: async () => ({
          toArray: async () => {
            // Đối với danh sách configs
            if (collectionName === CONFIGS_COLLECTION) {
              return Object.keys(fallbackConfigsCache).map(key => ({
                _id: key,
                ...fallbackConfigsCache[key]
              }));
            }
            return [];
          }
        }),
        updateOne: async (query, update) => {
          // Đối với tokens
          if (collectionName === TOKENS_COLLECTION) {
            const key = query._id || 'default';
            if (update.$set) {
              fallbackTokensCache[key] = { _id: key, ...update.$set };
              return { modifiedCount: 1, upsertedCount: 0 };
            }
          }
          // Đối với configs
          else if (collectionName === CONFIGS_COLLECTION) {
            const configName = query._id;
            if (update.$set) {
              fallbackConfigsCache[configName] = { _id: configName, ...update.$set };
              return { modifiedCount: 1, upsertedCount: 0 };
            }
          }
          // Đối với active config
          else if (collectionName === 'activeConfig') {
            if (update.$set) {
              fallbackActiveConfig = { _id: 'active', ...update.$set };
              return { modifiedCount: 1, upsertedCount: 0 };
            }
          }
          return { modifiedCount: 0, upsertedCount: 0 };
        },
        deleteOne: async (query) => {
          // Đối với configs
          if (collectionName === CONFIGS_COLLECTION) {
            const configName = query._id;
            if (fallbackConfigsCache[configName]) {
              delete fallbackConfigsCache[configName];
              return { deletedCount: 1 };
            }
          }
          return { deletedCount: 0 };
        }
      })
    }
  };
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

// Đọc token từ MongoDB với cơ chế dự phòng từ biến môi trường
async function getToken(key = 'default') {
  try {
    // Thử lấy từ MongoDB trước
    try {
      const { db } = await connectToDatabase();
      const collection = db.collection(TOKENS_COLLECTION);
      
      // Tìm token dựa trên key
      const token = await collection.findOne({ _id: key });
      
      if (!token) {
        console.log(`[${new Date().toISOString()}] Không tìm thấy token trong MongoDB: ${key}`);
      } else {
        console.log(`[${new Date().toISOString()}] Đã tải token từ MongoDB thành công: ${key}`);
        
        // Lưu vào cache local cho dự phòng
        fallbackTokensCache[key] = token;
        
        return token;
      }
    } catch (dbError) {
      console.error(`[${new Date().toISOString()}] Lỗi khi đọc token từ MongoDB:`, dbError.message);
      
      // Nếu đã có trong cache local, sử dụng cache
      if (fallbackTokensCache[key]) {
        console.log(`[${new Date().toISOString()}] Sử dụng token từ cache local: ${key}`);
        return fallbackTokensCache[key];
      }
    }
    
    // Không có token từ cơ sở dữ liệu, thử lấy từ biến môi trường
    let envToken = null;
    
    // Kiểm tra các biến môi trường liên quan đến token
    if (key === 'default' || key === 'hanet') {
      // Thử lấy access token từ biến môi trường
      const accessToken = process.env.HANET_ACCESS_TOKEN;
      const refreshToken = process.env.HANET_REFRESH_TOKEN;
      
      if (accessToken || refreshToken) {
        console.log(`[${new Date().toISOString()}] Không tìm thấy token từ các nguồn lưu trữ, sử dụng giá trị từ env: ${accessToken ? 'Có token' : 'Không có token'}`);
        
        envToken = {
          _id: key,
          accessToken: accessToken || null,
          refreshToken: refreshToken || null,
          expiresIn: null,  // Không biết thời gian hết hạn
          tokenType: 'bearer',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        // Lưu vào cache local cho lần sau
        fallbackTokensCache[key] = envToken;
        
        return envToken;
      }
    }
    
    // Không tìm thấy token từ bất kỳ nguồn nào
    return null;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi đọc token:`, error.message);
    throw error;
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

// Đọc cấu hình OAuth với cơ chế dự phòng
async function getOAuthConfig(configName) {
  try {
    // Thử lấy từ MongoDB trước
    try {
      const { db } = await connectToDatabase();
      const collection = db.collection(CONFIGS_COLLECTION);
      
      const config = await collection.findOne({ _id: configName });
      
      if (!config) {
        console.log(`[${new Date().toISOString()}] Không tìm thấy cấu hình OAuth trong MongoDB: ${configName}`);
      } else {
        console.log(`[${new Date().toISOString()}] Đã tải cấu hình OAuth từ MongoDB thành công: ${configName}`);
        
        // Lưu vào cache local cho dự phòng
        fallbackConfigsCache[configName] = config;
        
        return config;
      }
    } catch (dbError) {
      console.error(`[${new Date().toISOString()}] Lỗi khi đọc cấu hình OAuth từ MongoDB:`, dbError.message);
      
      // Nếu đã có trong cache local, sử dụng cache
      if (fallbackConfigsCache[configName]) {
        console.log(`[${new Date().toISOString()}] Sử dụng cấu hình OAuth từ cache local: ${configName}`);
        return fallbackConfigsCache[configName];
      }
    }
    
    // Không có cấu hình từ cơ sở dữ liệu, thử lấy từ biến môi trường
    let envConfig = null;
    
    // Kiểm tra các biến môi trường liên quan đến OAuth
    if (configName === 'default' || configName === 'hanet') {
      // Thử lấy cấu hình từ biến môi trường
      const clientId = process.env.HANET_CLIENT_ID;
      const clientSecret = process.env.HANET_CLIENT_SECRET;
      const refreshToken = process.env.HANET_REFRESH_TOKEN;
      const baseUrl = process.env.HANET_API_BASE_URL || 'https://partner.hanet.ai';
      
      if (clientId && clientSecret) {
        console.log(`[${new Date().toISOString()}] Không tìm thấy cấu hình OAuth từ các nguồn lưu trữ, sử dụng giá trị từ env`);
        
        envConfig = {
          _id: configName,
          clientId,
          clientSecret,
          refreshToken: refreshToken || null,
          baseUrl,
          tokenUrl: 'https://oauth.hanet.com/token',
          appName: 'Hanet API (from ENV)',
          username: 'default',
          placeIds: [],
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        // Lưu vào cache local cho lần sau
        fallbackConfigsCache[configName] = envConfig;
        
        return envConfig;
      }
    }
    
    // Không tìm thấy cấu hình từ bất kỳ nguồn nào
    return null;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi đọc cấu hình OAuth:`, error.message);
    throw error;
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

// Lấy cấu hình đang kích hoạt với cơ chế dự phòng
async function getActiveConfig() {
  try {
    // Thử lấy từ MongoDB trước
    try {
      const { db } = await connectToDatabase();
      const collection = db.collection('activeConfig');
      
      const result = await collection.findOne({ _id: 'active' });
      
      if (!result) {
        console.log(`[${new Date().toISOString()}] Không tìm thấy cấu hình active trong MongoDB`);
      } else {
        console.log(`[${new Date().toISOString()}] Đã tải cấu hình active từ MongoDB thành công`);
        
        // Lưu vào cache local cho dự phòng
        fallbackActiveConfig = result;
        
        return result;
      }
    } catch (dbError) {
      console.error(`[${new Date().toISOString()}] Lỗi khi đọc cấu hình active từ MongoDB:`, dbError.message);
      
      // Nếu đã có trong cache local, sử dụng cache
      if (fallbackActiveConfig) {
        console.log(`[${new Date().toISOString()}] Sử dụng cấu hình active từ cache local`);
        return fallbackActiveConfig;
      }
    }
    
    // Không có cấu hình active từ cơ sở dữ liệu, thử tạo một cấu hình mặc định
    if (isRunningOnVercel && process.env.HANET_CLIENT_ID && process.env.HANET_CLIENT_SECRET) {
      console.log(`[${new Date().toISOString()}] Tạo cấu hình active mặc định từ biến môi trường`);
      
      const defaultConfig = {
        _id: 'active',
        configName: 'default',  // Trỏ đến cấu hình default
        updatedAt: new Date()
      };
      
      // Lưu vào cache
      fallbackActiveConfig = defaultConfig;
      
      return defaultConfig;
    }
    
    // Không tìm thấy cấu hình active từ bất kỳ nguồn nào
    return null;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi đọc cấu hình active:`, error.message);
    throw error;
  }
}

// Đọc cấu hình theo tên
async function getConfig(configName) {
  return getOAuthConfig(configName);
}

// Lưu cấu hình đang kích hoạt với cơ chế dự phòng
async function setActiveConfig(configName) {
  try {
    // Kiểm tra xem cấu hình có tồn tại không
    const config = await getOAuthConfig(configName);
    if (!config && configName !== 'default') {
      throw new Error(`Cấu hình ${configName} không tồn tại`);
    }
    
    // Lưu vào cache local trước
    fallbackActiveConfig = {
      _id: 'active',
      configName,
      updatedAt: new Date()
    };
    
    // Thử lưu vào MongoDB
    try {
      const { db } = await connectToDatabase();
      const collection = db.collection('activeConfig');
      
      const result = await collection.updateOne(
        { _id: 'active' },
        { 
          $set: { 
            configName, 
            updatedAt: new Date() 
          } 
        },
        { upsert: true }
      );
      
      console.log(`[${new Date().toISOString()}] Đã cập nhật cấu hình active trong MongoDB: ${configName}`);
      return result;
    } catch (dbError) {
      console.error(`[${new Date().toISOString()}] Lỗi khi cập nhật cấu hình active trong MongoDB:`, dbError.message);
      
      // Trả về kết quả giả nếu đang chạy trên Vercel
      if (isRunningOnVercel) {
        console.warn(`[${new Date().toISOString()}] Đã lưu cấu hình active vào cache local: ${configName}`);
        return { modifiedCount: 1, upsertedCount: 0 };
      }
      
      // Rồi ném lỗi để xử lý ở cấp cao hơn
      throw dbError;
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi cập nhật cấu hình active:`, error.message);
    throw error;
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