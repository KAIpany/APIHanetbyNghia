// tokenStorage.js - Module lưu trữ token cho môi trường Serverless
// Phiên bản cải tiến sử dụng nhiều phương thức lưu trữ

// Sử dụng fetch API để gửi yêu cầu HTTP
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Thư mục lưu trữ token trong /tmp (cho AWS Lambda)
const TOKEN_DIR = path.join('/tmp', 'oauth-tokens');
const TOKEN_FILE = path.join(TOKEN_DIR, 'tokens.json');

// Tạo thư mục nếu không tồn tại
if (!fs.existsSync(TOKEN_DIR)) {
  try {
    fs.mkdirSync(TOKEN_DIR, { recursive: true });
    console.log(`[${new Date().toISOString()}] Đã tạo thư mục lưu trữ token: ${TOKEN_DIR}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi tạo thư mục token:`, error.message);
  }
}

// URL của API lưu trữ bên ngoài (ưu tiên sử dụng)
// Đây có thể là endpoint của API Gateway + DynamoDB, MongoDB Atlas, hoặc dịch vụ lưu trữ khác
const EXTERNAL_STORAGE_URL = process.env.TOKEN_STORAGE_API_URL || '';

// Bộ nhớ RAM cho môi trường phát triển
let memoryStorage = {};
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';

// Kiểm tra xem có đang chạy trên môi trường serverless không
const IS_SERVERLESS = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME || false;

// ===== PHƯƠNG THỨC MÃ HÓA DỮ LIỆU =====
function encodeData(data) {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

function decodeData(encodedData) {
  try {
    return JSON.parse(Buffer.from(encodedData, 'base64').toString('utf8'));
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi giải mã dữ liệu:`, error.message);
    return null;
  }
}

// ===== PHƯƠNG THỨC LƯU TRỮ TẠM /TMP =====
// Lưu token vào file trong thư mục /tmp
function saveTokenToTmpFile(tokens) {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens), 'utf8');
    console.log(`[${new Date().toISOString()}] Đã lưu token vào file: ${TOKEN_FILE}`);
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi lưu token vào file:`, error.message);
    return false;
  }
}

// Đọc token từ file trong thư mục /tmp
function loadTokenFromTmpFile() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const data = fs.readFileSync(TOKEN_FILE, 'utf8');
      console.log(`[${new Date().toISOString()}] Đã đọc token từ file: ${TOKEN_FILE}`);
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi đọc token từ file:`, error.message);
  }
  return null;
}

// ===== LƯU TOKEN CHÍNH =====
async function saveTokens(tokens) {
  try {
    // Lưu vào biến môi trường (tạm thời trong phiên hiện tại)
    if (tokens.refreshToken) {
      process.env.HANET_REFRESH_TOKEN = tokens.refreshToken;
    }
    
    // Nếu là môi trường phát triển, lưu vào bộ nhớ
    if (IS_DEVELOPMENT) {
      memoryStorage.tokens = tokens;
      console.log(`[${new Date().toISOString()}] Đã lưu token vào bộ nhớ RAM`);
    }
    
    // Lưu vào file /tmp cho AWS Lambda
    if (IS_SERVERLESS) {
      saveTokenToTmpFile(tokens);
    }
    
    // Nếu có API lưu trữ bên ngoài, ưu tiên sử dụng
    if (EXTERNAL_STORAGE_URL) {
      try {
        const response = await fetch(EXTERNAL_STORAGE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'saveTokens',
            data: encodeData(tokens),
            key: process.env.TOKEN_STORAGE_API_KEY || 'default-key'
          })
        });
        
        const result = await response.json();
        
        if (result && result.success) {
          console.log(`[${new Date().toISOString()}] Đã lưu token qua API thành công`);
          return true;
        } else {
          console.warn(`[${new Date().toISOString()}] API lưu trữ không trả về kết quả thành công:`, result?.message || 'Unknown error');
        }
      } catch (apiError) {
        console.error(`[${new Date().toISOString()}] Lỗi khi lưu token qua API:`, apiError.message);
      }
    }
    
    console.log(`[${new Date().toISOString()}] Đã lưu token (có thể không bền vững trong môi trường serverless)`);
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi lưu token:`, error.message);
    return false;
  }
}

// ===== ĐỌC TOKEN CHÍNH =====
async function loadTokens() {
  try {
    // Tạo đối tượng kết quả ban đầu từ biến môi trường
    const envToken = process.env.HANET_REFRESH_TOKEN;
    let result = envToken ? { refreshToken: envToken } : null;
    
    // Nếu là môi trường phát triển, đọc từ bộ nhớ RAM
    if (IS_DEVELOPMENT && memoryStorage.tokens) {
      console.log(`[${new Date().toISOString()}] Đã đọc token từ bộ nhớ RAM`);
      return memoryStorage.tokens;
    }
    
    // Đọc từ API lưu trữ (ưu tiên cao nhất cho môi trường production)
    if (EXTERNAL_STORAGE_URL) {
      try {
        const response = await fetch(`${EXTERNAL_STORAGE_URL}?action=loadTokens&key=${process.env.TOKEN_STORAGE_API_KEY || 'default-key'}`);
        const apiResult = await response.json();
        
        if (apiResult.success && apiResult.data) {
          const storedTokens = decodeData(apiResult.data);
          console.log(`[${new Date().toISOString()}] Đã đọc token từ API thành công`);
          
          // Cập nhật biến môi trường
          if (storedTokens.refreshToken) {
            process.env.HANET_REFRESH_TOKEN = storedTokens.refreshToken;
          }
          
          return storedTokens;
        }
      } catch (apiError) {
        console.warn(`[${new Date().toISOString()}] Không thể đọc token từ API:`, apiError.message);
      }
    }
    
    // Đọc từ file /tmp cho AWS Lambda
    if (IS_SERVERLESS) {
      const tmpTokens = loadTokenFromTmpFile();
      if (tmpTokens && tmpTokens.refreshToken) {
        console.log(`[${new Date().toISOString()}] Đã đọc token từ file /tmp`);
        
        // Cập nhật biến môi trường
        process.env.HANET_REFRESH_TOKEN = tmpTokens.refreshToken;
        
        return tmpTokens;
      }
    }
    
    // Nếu không tìm thấy token từ các nguồn khác
    console.log(`[${new Date().toISOString()}] Không tìm thấy token từ các nguồn lưu trữ, sử dụng giá trị từ env: ${envToken ? 'Có token' : 'Không có token'}`);
    return { refreshToken: envToken };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi đọc token:`, error.message);
    // Vẫn trả về token từ env nếu có
    return { refreshToken: process.env.HANET_REFRESH_TOKEN };
  }
}

// Lưu một cấu hình OAuth cụ thể
async function saveOAuthConfig(configName, config) {
  try {
    // Lưu refresh token vào biến môi trường
    if (config.refreshToken) {
      process.env.HANET_REFRESH_TOKEN = config.refreshToken;
    }
    
    // Nếu là môi trường phát triển, lưu vào bộ nhớ
    if (IS_DEVELOPMENT) {
      if (!memoryStorage.configs) memoryStorage.configs = {};
      memoryStorage.configs[configName] = config;
      console.log(`[${new Date().toISOString()}] Đã lưu cấu hình OAuth '${configName}' vào bộ nhớ`);
      return true;
    }
    
    // Nếu là Vercel production và có API lưu trữ
    if (process.env.VERCEL === '1' && EXTERNAL_STORAGE_URL) {
      const response = await fetch(EXTERNAL_STORAGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'saveOAuthConfig',
          name: configName,
          data: encodeData(config),
          key: process.env.TOKEN_STORAGE_API_KEY || 'default-key'
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`[${new Date().toISOString()}] Đã lưu cấu hình OAuth '${configName}' qua API thành công`);
        return true;
      } else {
        throw new Error(result.message || 'Lỗi không xác định từ API lưu trữ');
      }
    }
    
    console.log(`[${new Date().toISOString()}] Không có phương thức lưu trữ phù hợp cho cấu hình OAuth`);
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi lưu cấu hình OAuth:`, error.message);
    return false;
  }
}

// Đọc một cấu hình OAuth cụ thể
async function loadOAuthConfig(configName) {
  try {
    // Nếu là môi trường phát triển, đọc từ bộ nhớ
    if (IS_DEVELOPMENT && memoryStorage.configs && memoryStorage.configs[configName]) {
      console.log(`[${new Date().toISOString()}] Đã đọc cấu hình OAuth '${configName}' từ bộ nhớ`);
      return memoryStorage.configs[configName];
    }
    
    // Nếu là Vercel production và có API lưu trữ
    if (process.env.VERCEL === '1' && EXTERNAL_STORAGE_URL) {
      try {
        const response = await fetch(`${EXTERNAL_STORAGE_URL}?action=loadOAuthConfig&name=${encodeURIComponent(configName)}&key=${process.env.TOKEN_STORAGE_API_KEY || 'default-key'}`);
        
        const result = await response.json();
        
        if (result.success && result.data) {
          const config = decodeData(result.data);
          console.log(`[${new Date().toISOString()}] Đã đọc cấu hình OAuth '${configName}' từ API thành công`);
          return config;
        }
      } catch (apiError) {
        console.error(`[${new Date().toISOString()}] Không thể đọc cấu hình OAuth từ API:`, apiError.message);
      }
    }
    
    // Tạo cấu hình mặc định từ biến môi trường
    if (process.env.HANET_REFRESH_TOKEN) {
      console.log(`[${new Date().toISOString()}] Tạo cấu hình OAuth mặc định từ biến môi trường`);
      return {
        clientId: process.env.HANET_CLIENT_ID,
        clientSecret: process.env.HANET_CLIENT_SECRET,
        refreshToken: process.env.HANET_REFRESH_TOKEN,
        baseUrl: process.env.HANET_API_BASE_URL || "https://partner.hanet.ai",
        tokenUrl: process.env.HANET_TOKEN_URL || "https://oauth.hanet.com/token",
        appName: configName
      };
    }
    
    console.log(`[${new Date().toISOString()}] Không tìm thấy cấu hình OAuth '${configName}'`);
    return null;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi đọc cấu hình OAuth:`, error.message);
    return null;
  }
}

// Lấy danh sách tên các cấu hình đã lưu
async function getStoredConfigNames() {
  try {
    // Nếu là môi trường phát triển, đọc từ bộ nhớ
    if (IS_DEVELOPMENT && memoryStorage.configs) {
      console.log(`[${new Date().toISOString()}] Đã lấy danh sách cấu hình từ bộ nhớ`);
      return Object.keys(memoryStorage.configs);
    }
    
    // Nếu là Vercel production và có API lưu trữ
    if (process.env.VERCEL === '1' && EXTERNAL_STORAGE_URL) {
      try {
        const response = await fetch(`${EXTERNAL_STORAGE_URL}?action=getConfigNames&key=${process.env.TOKEN_STORAGE_API_KEY || 'default-key'}`);
        
        const result = await response.json();
        
        if (result.success && Array.isArray(result.data)) {
          console.log(`[${new Date().toISOString()}] Đã lấy danh sách cấu hình từ API thành công`);
          return result.data;
        }
      } catch (apiError) {
        console.error(`[${new Date().toISOString()}] Không thể lấy danh sách cấu hình từ API:`, apiError.message);
      }
    }
    
    // Mặc định trả về một danh sách với 'default' nếu có refresh token
    if (process.env.HANET_REFRESH_TOKEN) {
      return ['default'];
    }
    
    return [];
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi lấy danh sách cấu hình:`, error.message);
    return [];
  }
}

// Cần cài đặt node-fetch nếu chưa có:
// npm install node-fetch@2

module.exports = {
  saveTokens,
  loadTokens,
  saveOAuthConfig,
  loadOAuthConfig,
  getStoredConfigNames
};
