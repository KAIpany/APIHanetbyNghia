// tokenStorage.js - Module lưu trữ token cho môi trường Vercel Serverless
// Phiên bản này lưu trữ token bằng API Fetch cho phép làm việc với Vercel Serverless

// Sử dụng fetch API để gửi yêu cầu HTTP
const fetch = require('node-fetch');

// URL của API lưu trữ, có thể là một API của bạn hoặc một dịch vụ lưu trữ bên ngoài
// Đối với môi trường phát triển, mặc định sẽ sử dụng bộ nhớ trong RAM
let memoryStorage = {};
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';

// Tùy chọn sử dụng dịch vụ lưu trữ bên ngoài
const API_STORAGE_URL = process.env.TOKEN_STORAGE_API_URL || '';

// Kiểm tra xem môi trường có phải là production trên Vercel không
const isVercelProduction = process.env.VERCEL === '1';

// Tạo khóa bảo mật cho dữ liệu (chỉ là base64 đơn giản)
function encodeData(data) {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

// Giải mã dữ liệu
function decodeData(encodedData) {
  try {
    return JSON.parse(Buffer.from(encodedData, 'base64').toString('utf8'));
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi giải mã dữ liệu:`, error.message);
    return null;
  }
}

// Lưu token vào kho lưu trữ
async function saveTokens(tokens) {
  try {
    // Cập nhật môi trường
    process.env.HANET_REFRESH_TOKEN = tokens.refreshToken || process.env.HANET_REFRESH_TOKEN;
    
    // Nếu là môi trường phát triển, lưu vào bộ nhớ
    if (IS_DEVELOPMENT) {
      memoryStorage.tokens = tokens;
      console.log(`[${new Date().toISOString()}] Đã lưu token vào bộ nhớ`);
      return true;
    }
    
    // Nếu là Vercel production và có API lưu trữ
    if (isVercelProduction && API_STORAGE_URL) {
      // Gửi yêu cầu API để lưu token
      const response = await fetch(API_STORAGE_URL, {
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
      
      if (result.success) {
        console.log(`[${new Date().toISOString()}] Đã lưu token qua API thành công`);
        return true;
      } else {
        throw new Error(result.message || 'Lỗi không xác định từ API lưu trữ');
      }
    }
    
    // Mặc định nếu không có phương thức lưu trữ nào khác
    console.log(`[${new Date().toISOString()}] Không có phương thức lưu trữ phù hợp, chỉ lưu vào môi trường`);
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi lưu token:`, error.message);
    return false;
  }
}

// Đọc token từ kho lưu trữ
async function loadTokens() {
  try {
    // Luôn ưu tiên đọc từ biến môi trường
    const envToken = process.env.HANET_REFRESH_TOKEN;
    let result = envToken ? { refreshToken: envToken } : null;
    
    // Nếu là môi trường phát triển, đọc từ bộ nhớ
    if (IS_DEVELOPMENT && memoryStorage.tokens) {
      console.log(`[${new Date().toISOString()}] Đã đọc token từ bộ nhớ`);
      return memoryStorage.tokens;
    }
    
    // Nếu là Vercel production và có API lưu trữ
    if (isVercelProduction && API_STORAGE_URL) {
      try {
        // Gửi yêu cầu API để đọc token
        const response = await fetch(`${API_STORAGE_URL}?action=loadTokens&key=${process.env.TOKEN_STORAGE_API_KEY || 'default-key'}`);
        
        const apiResult = await response.json();
        
        if (apiResult.success && apiResult.data) {
          const storedTokens = decodeData(apiResult.data);
          console.log(`[${new Date().toISOString()}] Đã đọc token từ API thành công`);
          result = storedTokens;
        }
      } catch (apiError) {
        console.error(`[${new Date().toISOString()}] Không thể đọc token từ API:`, apiError.message);
      }
    }
    
    // Nếu không tìm thấy token
    if (!result) {
      console.log(`[${new Date().toISOString()}] Không tìm thấy token đã lưu trữ, sử dụng từ env`);
      return { refreshToken: envToken };
    }
    
    return result;
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
    if (isVercelProduction && API_STORAGE_URL) {
      const response = await fetch(API_STORAGE_URL, {
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
    if (isVercelProduction && API_STORAGE_URL) {
      try {
        const response = await fetch(`${API_STORAGE_URL}?action=loadOAuthConfig&name=${encodeURIComponent(configName)}&key=${process.env.TOKEN_STORAGE_API_KEY || 'default-key'}`);
        
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
    if (isVercelProduction && API_STORAGE_URL) {
      try {
        const response = await fetch(`${API_STORAGE_URL}?action=getConfigNames&key=${process.env.TOKEN_STORAGE_API_KEY || 'default-key'}`);
        
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
