// tokenManager.js
require("dotenv").config();
const axios = require("axios");
const qs = require("qs");
const tokenStorage = require("./tokenStorage");
const localConfigStore = require('./localConfigStore');

// TOKEN MẶC ĐỊNH CHO MÔI TRƯỜNG SERVERLESS
// ⚠️ CHÚ Ý: Đây không phải là phương pháp bảo mật tốt nhất
// Chỉ sử dụng cho mục đích phát triển hoặc trong trường hợp đặc biệt
const DEFAULT_TOKENS = {
  refreshToken: "YOUR_REFRESH_TOKEN_HERE", // Thay thế bằng refresh token của bạn
  clientId: "YOUR_CLIENT_ID_HERE", // Thay thế bằng client ID của bạn
  clientSecret: "YOUR_CLIENT_SECRET_HERE" // Thay thế bằng client secret của bạn
};

// Biến để kiểm soát thử lại và trạng thái token
const TOKEN_STATE = {
  VALID: 'valid',
  REFRESHING: 'refreshing', 
  FAILED: 'failed',
  UNKNOWN: 'unknown'
};

// Khoảng thời gian theo dõi token health
const TOKEN_MONITOR_INTERVAL = 10 * 60 * 1000; // 10 phút

// Số lần thử lại tối đa khi làm mới token
const MAX_REFRESH_RETRIES = 3;

// Lưu trữ thông tin token hiện tại
let cachedTokenData = {
  accessToken: null,
  refreshToken: DEFAULT_TOKENS.refreshToken || null,
  expiresAt: null,
  lastSync: Date.now(), // Timestamp cho lần đồng bộ cuối
  state: TOKEN_STATE.UNKNOWN, // Trạng thái token hiện tại
  refreshAttempts: 0, // Số lần thử làm mới liên tiếp
  lastRefreshTime: null, // Lần cuối làm mới token
  lastRefreshError: null, // Lỗi gặp phải khi làm mới token
  healthCheckInterval: null // Interval cho việc kiểm tra sức khỏe token
};

let currentUsername = null; // Tài khoản đang sử dụng

// Lưu trữ cấu hình động từ client
let dynamicConfig = {
  clientId: DEFAULT_TOKENS.clientId,
  clientSecret: DEFAULT_TOKENS.clientSecret,
  refreshToken: DEFAULT_TOKENS.refreshToken,
  baseUrl: "https://partner.hanet.ai",
  tokenUrl: "https://oauth.hanet.com/token"
};

// Khai báo hàm initializeTokens trước khi sử dụng
// Khởi tạo và tải token từ storage
const initializeTokens = async () => {
  try {
    // Đảm bảo token mặc định luôn được set nếu không có token nào khác
    if (DEFAULT_TOKENS.refreshToken) {
      process.env.HANET_REFRESH_TOKEN = process.env.HANET_REFRESH_TOKEN || DEFAULT_TOKENS.refreshToken;
      process.env.HANET_CLIENT_ID = process.env.HANET_CLIENT_ID || DEFAULT_TOKENS.clientId;
      process.env.HANET_CLIENT_SECRET = process.env.HANET_CLIENT_SECRET || DEFAULT_TOKENS.clientSecret;
    }
    
    // Luôn đọc từ tokenStorage trước
    const storedTokens = await tokenStorage.loadTokens();
    
    if (storedTokens && storedTokens.refreshToken) {
      console.log(`[${new Date().toISOString()}] Tải refresh token từ storage thành công`);
      cachedTokenData.refreshToken = storedTokens.refreshToken;
      cachedTokenData.accessToken = storedTokens.accessToken || null;
      cachedTokenData.expiresAt = storedTokens.expiresAt || null;
      cachedTokenData.lastSync = Date.now();
      
      // Đảm bảo biến môi trường cũng được cập nhật
      process.env.HANET_REFRESH_TOKEN = storedTokens.refreshToken;
      
      return;
    }
    
    // Nếu không tìm thấy trong storage, thử đọc từ file config local
    if (process.env.NODE_ENV !== 'production') {
      const fileConfig = localConfigStore.loadConfig(currentUsername);
      if (fileConfig && fileConfig.refreshToken) {
        console.log(`[${new Date().toISOString()}] Tải refresh token từ file localConfigStore thành công`);
        cachedTokenData.refreshToken = fileConfig.refreshToken;
        cachedTokenData.lastSync = Date.now();
        dynamicConfig = fileConfig;
        
        // Cập nhật vào storage
        await tokenStorage.saveTokens({
          refreshToken: fileConfig.refreshToken,
          lastSync: cachedTokenData.lastSync
        });
        
        return;
      }
    }

    // Thử đọc từ biến môi trường
    if (process.env.HANET_REFRESH_TOKEN) {
      console.log(`[${new Date().toISOString()}] Tải refresh token từ biến môi trường thành công`);
      cachedTokenData.refreshToken = process.env.HANET_REFRESH_TOKEN;
      cachedTokenData.lastSync = Date.now();
      
      // Cập nhật vào storage
      await tokenStorage.saveTokens({
        refreshToken: process.env.HANET_REFRESH_TOKEN,
        lastSync: cachedTokenData.lastSync
      });
      
      return;
    }
    
    // Nếu vẫn không có token nào, sử dụng token mặc định
    if (DEFAULT_TOKENS.refreshToken) {
      console.log(`[${new Date().toISOString()}] Sử dụng refresh token mặc định từ code`);
      cachedTokenData.refreshToken = DEFAULT_TOKENS.refreshToken;
      cachedTokenData.lastSync = Date.now();
      
      // Cập nhật vào storage
      await tokenStorage.saveTokens({
        refreshToken: DEFAULT_TOKENS.refreshToken,
        lastSync: cachedTokenData.lastSync
      });
      
      return;
    }
    
    console.log(`[${new Date().toISOString()}] Không tìm thấy refresh token`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi khởi tạo token:`, error.message);
    
    // Cuối cùng, nếu có lỗi và có token mặc định, sử dụng nó
    if (DEFAULT_TOKENS.refreshToken) {
      cachedTokenData.refreshToken = DEFAULT_TOKENS.refreshToken;
      console.log(`[${new Date().toISOString()}] Sử dụng refresh token mặc định sau lỗi`);
    }
  }
};

// Khởi tạo và tải token từ storage ngay khi module được import
(async function initializeModule() {
  try {
    console.log(`[${new Date().toISOString()}] Khởi tạo TokenManager...`);
    await initializeTokens();
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi khởi tạo TokenManager:`, error.message);
  }
})();

// Thiết lập cấu hình động từ client
async function setDynamicConfig(config) {
  dynamicConfig = config;
  
  // Cập nhật token từ cấu hình
  if (config.refreshToken) {
    cachedTokenData.refreshToken = config.refreshToken;
    cachedTokenData.lastSync = Date.now();
    
    // Lưu refresh token vào storage
    try {
      // Lưu vào process.env cho phiên hiện tại
      process.env.HANET_REFRESH_TOKEN = config.refreshToken;
      
      // Lưu vào storage cho lưu trữ liên tục
      await tokenStorage.saveTokens({
        refreshToken: config.refreshToken,
        accessToken: cachedTokenData.accessToken,
        expiresAt: cachedTokenData.expiresAt,
        lastSync: cachedTokenData.lastSync
      });
      
      // Nếu có tên cấu hình, lưu dưới tên đó
      if (config.appName) {
        await tokenStorage.saveOAuthConfig(config.appName, config);
      }
      
      // Nếu là môi trường phát triển, lưu config vào file theo username/appName
      if (process.env.NODE_ENV !== 'production' && (config.username || config.appName)) {
        const username = config.username || config.appName;
        localConfigStore.saveConfig(username, config);
        currentUsername = username;
      }
      
      console.log(`[${new Date().toISOString()}] Đã cập nhật và lưu trữ refresh token từ cấu hình client`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Lỗi khi lưu refresh token:`, error.message);
    }
  }
  
  // Reset access token để buộc refresh lại
  cachedTokenData.accessToken = null;
  cachedTokenData.expiresAt = null;
  
  return true;
}

// Lấy cấu hình hiện tại
function getCurrentConfig() {
  // Kiểm tra xem có refreshToken được lưu trữ trong cachedTokenData hay không
  const configWithRefreshToken = {
    clientId: process.env.HANET_CLIENT_ID || (dynamicConfig?.clientId),
    clientSecret: process.env.HANET_CLIENT_SECRET || (dynamicConfig?.clientSecret),
    refreshToken: cachedTokenData.refreshToken || process.env.HANET_REFRESH_TOKEN || (dynamicConfig?.refreshToken),
    baseUrl: process.env.HANET_API_BASE_URL || (dynamicConfig?.baseUrl) || "https://partner.hanet.ai",
    tokenUrl: process.env.HANET_TOKEN_URL || (dynamicConfig?.tokenUrl) || "https://oauth.hanet.com/token"
  };

  // Trả về cấu hình động nếu có, hoặc cấu hình với refreshToken đã được lấy từ cache
  return dynamicConfig || configWithRefreshToken;
}

// Kiểm tra và refresh token khi cần
async function getValidHanetToken(forceRefresh = false) {
  const now = Date.now();
  const requestId = `token-req-${Date.now().toString(36)}`;
  
  // Thiết lập interval kiểm tra sức khỏe token nếu chưa có
  if (!cachedTokenData.healthCheckInterval) {
    console.log(`[${requestId}] Thiết lập interval kiểm tra sức khỏe token mới ${TOKEN_MONITOR_INTERVAL/60000} phút`);
    cachedTokenData.healthCheckInterval = setInterval(async () => {
      try {
        // Tự động đồng bộ và làm mới token trước khi hết hạn
        const tokenStatus = await getValidHanetToken(false);
        console.log(`[AUTO-HEALTH] Kiểm tra sức khỏe token thành công, trạng thái: ${cachedTokenData.state}`);
      } catch (err) {
        console.error(`[AUTO-HEALTH] Lỗi khi tự động kiểm tra sức khỏe token:`, err.message);
        // Cố gắng làm mới lại
        try {
          await getValidHanetToken(true);
        } catch (refreshErr) {
          console.error(`[AUTO-HEALTH] Không thể làm mới token:`, refreshErr.message);
        }
      }
    }, TOKEN_MONITOR_INTERVAL);
  }
  
  // Kiểm tra xem đã quá lâu chưa sync lại (5 phút)
  if (now - cachedTokenData.lastSync > 5 * 60 * 1000) {
    console.log(`[${requestId}] Đã quá 5 phút kể từ lần đồng bộ token cuối, đang kiểm tra lưu trữ...`);
    
    try {
      // Khởi tạo lại từ storage
      await initializeTokens();
      // Cập nhật trạng thái
      cachedTokenData.state = TOKEN_STATE.VALID;
    } catch (error) {
      console.error(`[${requestId}] Lỗi khi đồng bộ token:`, error.message);
      // Không đổi trạng thái vì có thể vẫn sử dụng được token hiện tại
    }
  }
  
  // Nếu token còn hạn và không bị buộc làm mới
  if (!forceRefresh && cachedTokenData.accessToken && cachedTokenData.expiresAt && now < cachedTokenData.expiresAt) {
    // Cập nhật trạng thái token
    cachedTokenData.state = TOKEN_STATE.VALID;
    
    // Nếu đã có lỗi trước đó và giờ đã dùng được, reset lại số lần thử
    if (cachedTokenData.refreshAttempts > 0) {
      cachedTokenData.refreshAttempts = 0;
      cachedTokenData.lastRefreshError = null;
    }
    
    return cachedTokenData.accessToken;
  }
  
  // Kiểm tra xem có đang trong quá trình làm mới không để tránh gọi API đồng thời
  if (cachedTokenData.state === TOKEN_STATE.REFRESHING) {
    console.log(`[${requestId}] Token đang được làm mới, đợi kết quả...`);
    // Đợi 2 giây và thử lại
    await new Promise(resolve => setTimeout(resolve, 2000));
    return getValidHanetToken(forceRefresh);
  }

  try {
    // Đánh dấu token đang được làm mới
    cachedTokenData.state = TOKEN_STATE.REFRESHING;
    cachedTokenData.lastRefreshTime = Date.now();
    cachedTokenData.refreshAttempts++;
    
    // Log thông tin quá trình làm mới
    console.log(`[${requestId}] Đang làm mới token, lần thử ${cachedTokenData.refreshAttempts}/${MAX_REFRESH_RETRIES}`);
    
    // Kiểm tra nếu quá số lần thử tối đa
    if (cachedTokenData.refreshAttempts > MAX_REFRESH_RETRIES) {
      // Reset để lần sau có thể thử lại
      setTimeout(() => {
        cachedTokenData.refreshAttempts = 0;
        cachedTokenData.state = TOKEN_STATE.UNKNOWN;
      }, 60000); // Reset sau 1 phút
      
      // Ném lỗi với thông tin chi tiết
      throw new Error(`Đã vượt quá số lần thử lại tối đa (${MAX_REFRESH_RETRIES}). Lỗi cuối: ${cachedTokenData.lastRefreshError || 'Không rõ'}`);
    }
    
    // Đảm bảo lấy cấu hình mới nhất từ storage
    // Nếu tài khoản hiện tại được xác định, hãy tải cấu hình cụ thể
    let config = null;
    
    // Ghi log cho debug
    console.log(`[${requestId}] DEBUG: Bắt đầu làm mới token...`);
    console.log(`[${requestId}] DEBUG: Tài khoản hiện tại: ${currentUsername || 'Chưa được xác định'}`);
    
    // Luôn đọn Tokens mới nhất từ storage để đảm bảo dùng dữ liệu đồng bộ
    const storedTokens = await tokenStorage.loadTokens();
    if (storedTokens && storedTokens.refreshToken) {
      console.log(`[${requestId}] DEBUG: Đã tìm thấy refresh token trong storage`);
      cachedTokenData.refreshToken = storedTokens.refreshToken;
    }
    
    // Cấu hình cụ thể cho tài khoản hiện tại
    if (currentUsername) {
      try {
        // Tải cấu hình từ MongoDB trước
        const storedConfig = await tokenStorage.loadOAuthConfig(currentUsername);
        if (storedConfig && storedConfig.clientId && storedConfig.clientSecret) {
          console.log(`[${new Date().toISOString()}] DEBUG: Tải cấu hình cho user ${currentUsername} từ MongoDB thành công`);
          config = storedConfig;
          
          // Cập nhật dynamicConfig
          dynamicConfig = { ...storedConfig };
          
          // Đảm bảo có refreshToken
          if (storedTokens && storedTokens.refreshToken) {
            config.refreshToken = storedTokens.refreshToken;
            dynamicConfig.refreshToken = storedTokens.refreshToken;
          }
        }
        
        // Nếu ở môi trường development, thử tải từ file
        if (!config && process.env.NODE_ENV !== 'production') {
          const fileConfig = localConfigStore.loadConfig(currentUsername);
          if (fileConfig && fileConfig.clientId && fileConfig.clientSecret) {
            console.log(`[${new Date().toISOString()}] DEBUG: Tải cấu hình cho user ${currentUsername} từ file thành công`);
            config = fileConfig;
            dynamicConfig = { ...fileConfig };
            
            // Đảm bảo có refreshToken
            if (storedTokens && storedTokens.refreshToken) {
              config.refreshToken = storedTokens.refreshToken;
              dynamicConfig.refreshToken = storedTokens.refreshToken;
            }
          }
        }
      } catch (configError) {
        console.error(`[${new Date().toISOString()}] Lỗi khi tải cấu hình cho ${currentUsername}:`, configError.message);
      }
    }

    // Nếu không lấy được cấu hình cụ thể, sử dụng cấu hình hiện tại
    if (!config) {
      console.log(`[${new Date().toISOString()}] DEBUG: Sử dụng cấu hình mặc định từ getCurrentConfig()`);
      config = getCurrentConfig();
    }

    // Đảm bảo refreshToken có giá trị đúng nhất từ nhiều nguồn
    const refreshToken = cachedTokenData.refreshToken || config.refreshToken || storedTokens?.refreshToken;
    
    if (!refreshToken) {
      throw new Error("Không có refresh token để làm mới access token");
    }

    if (!config.clientId || !config.clientSecret) {
      throw new Error("Thiếu thông tin Client ID hoặc Client Secret");
    }

    // Log thông tin chi tiết để debug
    console.log(`[${new Date().toISOString()}] DEBUG - Token refresh info:`, {
      tokenUrl: config.tokenUrl,
      clientIdLength: config.clientId ? config.clientId.length : 0,
      clientId: config.clientId ? config.clientId.substring(0, 5) + '...' : null,
      refreshTokenLength: refreshToken ? refreshToken.length : 0,
      refreshTokenPrefix: refreshToken ? refreshToken.substring(0, 5) + '...' : null,
      currentUsername: currentUsername,
      appName: config.appName || 'Không xác định',
      source: config === dynamicConfig ? 'dynamicConfig' : 'loadedFromStorage'
    });

    // Sử dụng tokenUrl theo đúng định dạng Hanet API yêu cầu
    const url = config.tokenUrl || "https://oauth.hanet.com/token";
    
    // Tạo data theo đúng định dạng form-urlencoded mà Hanet API yêu cầu
    const data = {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    };

    console.log(`[${new Date().toISOString()}] Đang gọi API làm mới Access Token tại: ${url}`);
    
    // Sử dụng axios với cấu hình đầy đủ và retry logic
    let response;
    try {
      response = await axios({
        method: "post",
        url: url,
        headers: { 
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json"
        },
        data: qs.stringify(data),
        timeout: 15000, // Tăng timeout để tránh lỗi mạng
      });
    } catch (axiosError) {
      // Nếu là lỗi mạng và còn lần thử, thử lại sau 2 giây
      if ((axiosError.code === 'ECONNABORTED' || axiosError.message.includes('timeout') || 
          axiosError.code === 'ENOTFOUND' || axiosError.message.includes('Network Error')) && 
          cachedTokenData.refreshAttempts < MAX_REFRESH_RETRIES) {
        console.log(`[${requestId}] Lỗi kết nối khi làm mới token, thử lại sau 2 giây...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return getValidHanetToken(true);
      }
      throw axiosError;
    }

    if (response.data && response.data.access_token) {
      console.log(`[${requestId}] Làm mới Access Token thành công.`);
      
      // Cập nhật trạng thái token và reset số lần thử
      cachedTokenData.state = TOKEN_STATE.VALID;
      cachedTokenData.refreshAttempts = 0;
      cachedTokenData.lastRefreshError = null;
      
      // Cập nhật token trong cache
      cachedTokenData.accessToken = response.data.access_token;
      cachedTokenData.expiresAt = Date.now() + (response.data.expires_in * 1000 * 0.9); // 90% thời gian để dự phòng
      
      // Cập nhật refresh token nếu được cấp mới
      if (response.data.refresh_token) {
        try {
          cachedTokenData.refreshToken = response.data.refresh_token;
          cachedTokenData.lastSync = Date.now();
          
          // Lưu vào process.env
          process.env.HANET_REFRESH_TOKEN = response.data.refresh_token;
          
          // Lưu vào storage cho lưu trữ liên tục
          await tokenStorage.saveTokens({
            refreshToken: response.data.refresh_token,
            accessToken: cachedTokenData.accessToken,
            expiresAt: cachedTokenData.expiresAt,
            lastSync: cachedTokenData.lastSync,
            state: TOKEN_STATE.VALID
          });
          
          // Cập nhật cấu hình động nếu có
          if (dynamicConfig) {
            dynamicConfig.refreshToken = response.data.refresh_token;
            
            // Nếu có tên app, lưu cấu hình vào storage
            if (dynamicConfig.appName) {
              await tokenStorage.saveOAuthConfig(dynamicConfig.appName, dynamicConfig);
            }
            
            // Nếu có username, lưu theo username
            if (currentUsername) {
              await tokenStorage.saveOAuthConfig(currentUsername, dynamicConfig);
              
              // Cập nhật trong file nếu ở môi trường development
              if (process.env.NODE_ENV !== 'production') {
                localConfigStore.saveConfig(currentUsername, dynamicConfig);
              }
            }
            
            // Gửi thông báo tới client để cập nhật refresh token nếu cần
            console.log(`[${requestId}] Đã nhận refresh token mới và cập nhật cấu hình`);
          }
        } catch (storageError) {
          console.error(`[${requestId}] Lỗi khi lưu token mới vào storage:`, storageError.message);
          // Vẫn tiếp tục dùng token mới trong bộ nhớ dù lưu trữ thất bại
        }
      } else {
        // Vẫn cập nhật thời gian đồng bộ và lưu lại trạng thái token
        cachedTokenData.lastSync = Date.now();
        await tokenStorage.saveTokens({
          refreshToken: cachedTokenData.refreshToken,
          accessToken: cachedTokenData.accessToken,
          expiresAt: cachedTokenData.expiresAt,
          lastSync: cachedTokenData.lastSync,
          state: TOKEN_STATE.VALID
        });
      }
      
      return cachedTokenData.accessToken;
    } else {
      cachedTokenData.state = TOKEN_STATE.FAILED;
      const errorMsg = "Phản hồi không chứa access token hợp lệ";
      cachedTokenData.lastRefreshError = errorMsg;
      throw new Error(errorMsg);
    }
  } catch (error) {
    // Xử lý chi tiết lỗi
    const errorDetail = {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      error_description: error.response?.data?.error_description,
      error_type: error.response?.data?.error,
      message: error.message
    };
    
    // Lưu lỗi vào trạng thái
    cachedTokenData.state = TOKEN_STATE.FAILED;
    cachedTokenData.lastRefreshError = error.message;
    
    const errorMessage = error.response?.data?.error_description || error.message;
    console.error(`[${requestId}] Lỗi khi làm mới token: ${errorMessage}`);
    console.error(`[${requestId}] Chi tiết lỗi:`, JSON.stringify(errorDetail, null, 2));
    
    // Reset token để tránh dùng token lỗi
    cachedTokenData.accessToken = null;
    cachedTokenData.expiresAt = null;
    
    // Lập lịch tự động thử lại sau một khoảng thời gian
    const retryDelay = Math.min(30000 * (cachedTokenData.refreshAttempts || 1), 5 * 60 * 1000); // Tối đa 5 phút
    console.log(`[${requestId}] Sẽ tự động thử lại sau ${retryDelay/1000} giây`);
    
    // Đặt trạng thái về UNKNOWN để lần sau có thể thử lại
    setTimeout(() => {
      if (cachedTokenData.state === TOKEN_STATE.FAILED) {
        console.log(`[AUTO-RECOVERY] Đặt lại trạng thái token về UNKNOWN để thử lại`);
        cachedTokenData.state = TOKEN_STATE.UNKNOWN;
      }
    }, retryDelay);
    
    // Xử lý các trường hợp lỗi cụ thể
    // Trường hợp 1: Lỗi 400 - Có thể do refresh token không hợp lệ hoặc hết hạn
    if (error.response?.status === 400) {
      const errorType = error.response?.data?.error;
      console.log(`[${new Date().toISOString()}] DEBUG: Lỗi 400 với loại lỗi: ${errorType}`);
      
      // Kiểm tra các loại lỗi đặc biệt của OAuth
      if (errorType === 'invalid_grant' || 
          errorType === 'invalid_request' ||
          errorMessage.includes('invalid_grant') ||
          errorMessage.includes('invalid refresh token') ||
          errorMessage.includes('expired') ||
          errorMessage.includes('revoked')) {
        
        console.log(`[${new Date().toISOString()}] Refresh token không hợp lệ hoặc hết hạn, xóa khỏi bộ nhớ`);
        
        // Xóa refresh token khỏi các nơi lưu trữ
        cachedTokenData.refreshToken = null;
        
        // Xóa khỏi MongoDB để đảm bảo đồng bộ
        try {
          tokenStorage.saveTokens({
            refreshToken: null,
            accessToken: null,
            expiresAt: null,
            lastSync: Date.now()
          });
        } catch (storageError) {
          console.error(`[${new Date().toISOString()}] Lỗi khi xóa token khỏi storage:`, storageError.message);
        }
        
        // Báo hiệu client rằng cần đăng nhập lại
        throw new Error(`Token đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại. Lỗi: ${errorType || errorMessage}`);
      }
      
      // Trường hợp lỗi client_id hoặc client_secret
      if (errorType === 'invalid_client' ||
          errorMessage.includes('client_id') ||
          errorMessage.includes('client_secret') ||
          errorMessage.includes('client credentials')) {
        console.log(`[${new Date().toISOString()}] Thông tin client không hợp lệ. Yêu cầu cấu hình lại.`);
        throw new Error(`Thông tin client không hợp lệ. Vui lòng kiểm tra Client ID và Client Secret. Lỗi: ${errorType || errorMessage}`);
      }
    }
    
    // Trường hợp 2: Lỗi mạng hoặc lỗi server (5xx)
    if (!error.response || error.response.status >= 500) {
      console.log(`[${new Date().toISOString()}] Lỗi kết nối hoặc lỗi server: ${errorMessage}`);
      throw new Error(`Lỗi kết nối đến máy chủ Hanet. Vui lòng kiểm tra kết nối mạng và thử lại sau: ${errorMessage}`);
    }
    
    // Trường hợp lỗi khác
    throw new Error(`Không thể làm mới token (mã lỗi ${error.response?.status || 'không xác định'}): ${errorMessage}`);
  }
}

// Xử lý authorization code để lấy token mới
async function exchangeCodeForToken(code, redirectUri) {
  try {
    const config = getCurrentConfig();
    
    if (!config.clientId || !config.clientSecret) {
      throw new Error("Thiếu thông tin Client ID hoặc Client Secret");
    }

    // Sử dụng tokenUrl thay vì tạo URL từ baseUrl
    const url = config.tokenUrl || "https://oauth.hanet.com/token";
    const data = {
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    };

    console.log(`[${new Date().toISOString()}] Đang trao đổi code lấy token...`);
    
    const response = await axios({
      method: "post",
      url: url,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: qs.stringify(data),
      timeout: 10000,
    });

    if (response.data && response.data.access_token) {
      console.log(`[${new Date().toISOString()}] Trao đổi code lấy token thành công.`);
      
      // Cập nhật token trong cache
      cachedTokenData.accessToken = response.data.access_token;
      cachedTokenData.expiresAt = Date.now() + (response.data.expires_in * 1000 * 0.9);
      
      if (response.data.refresh_token) {
        try {
          console.log(`[${new Date().toISOString()}] Đã nhận được refresh token mới.`);
          cachedTokenData.refreshToken = response.data.refresh_token;
          cachedTokenData.lastSync = Date.now();
          
          // Lưu vào process.env
          process.env.HANET_REFRESH_TOKEN = response.data.refresh_token;
          
          // Lưu vào storage cho lưu trữ liên tục
          await tokenStorage.saveTokens({
            refreshToken: response.data.refresh_token,
            accessToken: response.data.access_token,
            expiresIn: response.data.expires_in,
            expiresAt: Date.now() + (response.data.expires_in * 1000),
            lastSync: cachedTokenData.lastSync
          });
          
          // Cập nhật cấu hình động nếu có
          if (dynamicConfig) {
            dynamicConfig.refreshToken = response.data.refresh_token;
            
            // Nếu có tên app, lưu cấu hình vào storage
            if (dynamicConfig.appName) {
              await tokenStorage.saveOAuthConfig(dynamicConfig.appName, dynamicConfig);
            }
          }
        } catch (storageError) {
          console.error(`[${new Date().toISOString()}] Lỗi khi lưu token mới vào storage:`, storageError.message);
          // Dù có lỗi với storage, vẫn đảm bảo refresh token được lưu trong env
        }
      }
      
      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in
      };
    } else {
      throw new Error("Phản hồi không chứa access token hợp lệ");
    }
  } catch (error) {
    const errorMessage = error.response?.data?.error_description || error.message;
    console.error(`[${new Date().toISOString()}] Lỗi khi trao đổi code: ${errorMessage}`);
    throw new Error(`Không thể trao đổi code: ${errorMessage}`);
  }
}

// Hàm chuyển đổi tài khoản sử dụng
function useAccount(username) {
  const config = localConfigStore.loadConfig(username);
  if (!config) throw new Error('Không tìm thấy cấu hình cho tài khoản này');
  dynamicConfig = config;
  cachedTokenData.refreshToken = config.refreshToken;
  cachedTokenData.accessToken = null;
  cachedTokenData.expiresAt = null;
  currentUsername = username;
}

module.exports = {
  getValidHanetToken,
  setDynamicConfig,
  getCurrentConfig,
  exchangeCodeForToken,
  useAccount,
};
