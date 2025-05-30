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

// Lưu trữ thông tin token cho nhiều tài khoản
const accountTokens = new Map();

// Một hàm để tạo cấu trúc token data mới
function createDefaultTokenData() {
  return {
    accessToken: null,
    refreshToken: DEFAULT_TOKENS.refreshToken || null,
    expiresAt: null,
    lastSync: Date.now(),
    state: TOKEN_STATE.UNKNOWN,
    refreshAttempts: 0,
    lastRefreshTime: null,
    lastRefreshError: null,
    healthCheckInterval: null,
    dynamicConfig: {
      clientId: DEFAULT_TOKENS.clientId,
      clientSecret: DEFAULT_TOKENS.clientSecret,
      refreshToken: DEFAULT_TOKENS.refreshToken,
      baseUrl: "https://partner.hanet.ai",
      tokenUrl: "https://oauth.hanet.com/token"
    }
  };
}

// Khởi tạo token data cho tài khoản mặc định
accountTokens.set('default', createDefaultTokenData());

// Tài khoản đang sử dụng cho phiên hiện tại (thread local)
let currentUsername = 'default';

// Khai báo hàm initializeTokens trước khi sử dụng
// Khởi tạo và tải token từ storage cho một tài khoản cụ thể
const initializeTokens = async (username = 'default') => {
  try {
    // Đảm bảo tài khoản tồn tại trong Map
    if (!accountTokens.has(username)) {
      accountTokens.set(username, createDefaultTokenData());
    }
    
    // Lấy token data cho tài khoản cụ thể
    const tokenData = accountTokens.get(username);
    
    // Đảm bảo token mặc định luôn được set nếu không có token nào khác
    if (DEFAULT_TOKENS.refreshToken && username === 'default') {
      process.env.HANET_REFRESH_TOKEN = process.env.HANET_REFRESH_TOKEN || DEFAULT_TOKENS.refreshToken;
      process.env.HANET_CLIENT_ID = process.env.HANET_CLIENT_ID || DEFAULT_TOKENS.clientId;
      process.env.HANET_CLIENT_SECRET = process.env.HANET_CLIENT_SECRET || DEFAULT_TOKENS.clientSecret;
    }
    
    // Luôn đọc từ tokenStorage trước
    const storedTokens = await tokenStorage.loadTokens(username);
    
    if (storedTokens && storedTokens.refreshToken) {
      console.log(`[${new Date().toISOString()}] Tải refresh token cho tài khoản ${username} từ storage thành công`);
      tokenData.refreshToken = storedTokens.refreshToken;
      tokenData.accessToken = storedTokens.accessToken || null;
      tokenData.expiresAt = storedTokens.expiresAt || null;
      tokenData.lastSync = Date.now();
      
      // Cập nhật lại vào Map
      accountTokens.set(username, tokenData);
      
      // Nếu là tài khoản mặc định, cập nhật biến môi trường
      if (username === 'default') {
        process.env.HANET_REFRESH_TOKEN = storedTokens.refreshToken;
      }
      
      return;
    }
    
    // Nếu không tìm thấy trong storage, thử đọc từ file config local
    if (process.env.NODE_ENV !== 'production') {
      const fileConfig = localConfigStore.loadConfig(username);
      if (fileConfig && fileConfig.refreshToken) {
        console.log(`[${new Date().toISOString()}] Tải refresh token cho tài khoản ${username} từ file localConfigStore thành công`);
        tokenData.refreshToken = fileConfig.refreshToken;
        tokenData.lastSync = Date.now();
        tokenData.dynamicConfig = fileConfig;
        
        // Cập nhật vào storage
        await tokenStorage.saveTokens({
          refreshToken: fileConfig.refreshToken,
          lastSync: tokenData.lastSync
        }, username);
        
        // Cập nhật lại vào Map
        accountTokens.set(username, tokenData);
        
        return;
      }
    }

    // Thử đọc từ biến môi trường (chỉ cho tài khoản mặc định)
    if (username === 'default' && process.env.HANET_REFRESH_TOKEN) {
      console.log(`[${new Date().toISOString()}] Tải refresh token cho tài khoản ${username} từ biến môi trường thành công`);
      tokenData.refreshToken = process.env.HANET_REFRESH_TOKEN;
      tokenData.lastSync = Date.now();
      
      // Cập nhật vào storage
      await tokenStorage.saveTokens({
        refreshToken: process.env.HANET_REFRESH_TOKEN,
        lastSync: tokenData.lastSync
      }, username);
      
      // Cập nhật lại vào Map
      accountTokens.set(username, tokenData);
      
      return;
    }
    
    // Nếu vẫn không có token nào và là tài khoản mặc định, sử dụng token mặc định
    if (username === 'default' && DEFAULT_TOKENS.refreshToken) {
      console.log(`[${new Date().toISOString()}] Sử dụng refresh token mặc định cho tài khoản ${username}`);
      tokenData.refreshToken = DEFAULT_TOKENS.refreshToken;
      tokenData.lastSync = Date.now();
      
      // Cập nhật vào storage
      await tokenStorage.saveTokens({
        refreshToken: DEFAULT_TOKENS.refreshToken,
        lastSync: tokenData.lastSync
      }, username);
      
      // Cập nhật lại vào Map
      accountTokens.set(username, tokenData);
      
      return;
    }
    
    console.log(`[${new Date().toISOString()}] Không tìm thấy refresh token cho tài khoản ${username}`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi khởi tạo token cho tài khoản ${username}:`, error.message);
    
    // Nếu có lỗi và là tài khoản mặc định, sử dụng token mặc định
    if (username === 'default' && DEFAULT_TOKENS.refreshToken) {
      const tokenData = accountTokens.get(username);
      tokenData.refreshToken = DEFAULT_TOKENS.refreshToken;
      accountTokens.set(username, tokenData);
      console.log(`[${new Date().toISOString()}] Sử dụng refresh token mặc định sau lỗi cho tài khoản ${username}`);
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

// Thiết lập cấu hình động từ client cho một tài khoản cụ thể
async function setDynamicConfig(config, username = null) {
  // Sử dụng tài khoản được chỉ định hoặc tài khoản hiện tại
  const accountName = username || currentUsername || config.appName || 'default';
  
  // Đảm bảo tài khoản tồn tại trong Map
  if (!accountTokens.has(accountName)) {
    accountTokens.set(accountName, createDefaultTokenData());
  }
  
  // Lấy token data cho tài khoản
  const tokenData = accountTokens.get(accountName);
  
  // Cập nhật cấu hình động
  tokenData.dynamicConfig = config;
  
  // Cập nhật token từ cấu hình
  if (config.refreshToken) {
    tokenData.refreshToken = config.refreshToken;
    tokenData.lastSync = Date.now();
    
    // Lưu refresh token vào storage
    try {
      // Nếu là tài khoản mặc định, lưu vào process.env cho phiên hiện tại
      if (accountName === 'default') {
        process.env.HANET_REFRESH_TOKEN = config.refreshToken;
      }
      
      // Lưu vào storage cho lưu trữ liên tục
      await tokenStorage.saveTokens({
        refreshToken: config.refreshToken,
        accessToken: tokenData.accessToken,
        expiresAt: tokenData.expiresAt,
        lastSync: tokenData.lastSync
      }, accountName);
      
      // Nếu có tên cấu hình, lưu dưới tên đó
      if (config.appName) {
        await tokenStorage.saveOAuthConfig(config.appName, config);
      }
      
      // Nếu là môi trường phát triển, lưu config vào file theo username/appName
      if (process.env.NODE_ENV !== 'production' && (config.username || config.appName)) {
        const configUsername = config.username || config.appName;
        localConfigStore.saveConfig(configUsername, config);
        // Chỉ cập nhật currentUsername nếu không có username được chỉ định rõ ràng
        if (!username) {
          currentUsername = configUsername;
        }
      }
      
      console.log(`[${new Date().toISOString()}] Đã cập nhật và lưu trữ refresh token cho tài khoản ${accountName}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Lỗi khi lưu refresh token cho tài khoản ${accountName}:`, error.message);
    }
  }
  
  // Reset access token để buộc refresh lại
  tokenData.accessToken = null;
  tokenData.expiresAt = null;
  
  // Cập nhật lại vào Map
  accountTokens.set(accountName, tokenData);
  
  return true;
}

// Lấy cấu hình hiện tại cho một tài khoản cụ thể
function getCurrentConfig(username = null) {
  // Sử dụng tài khoản được chỉ định hoặc tài khoản hiện tại
  const accountName = username || currentUsername;
  
  // Kiểm tra xem tài khoản có tồn tại trong Map không
  if (!accountTokens.has(accountName)) {
    accountTokens.set(accountName, createDefaultTokenData());
  }
  
  // Lấy dữ liệu token cho tài khoản
  const tokenData = accountTokens.get(accountName);
  
  // Nếu là tài khoản mặc định, kết hợp với biến môi trường
  if (accountName === 'default') {
    const configWithRefreshToken = {
      clientId: process.env.HANET_CLIENT_ID || (tokenData.dynamicConfig?.clientId),
      clientSecret: process.env.HANET_CLIENT_SECRET || (tokenData.dynamicConfig?.clientSecret),
      refreshToken: tokenData.refreshToken || process.env.HANET_REFRESH_TOKEN || (tokenData.dynamicConfig?.refreshToken),
      baseUrl: process.env.HANET_API_BASE_URL || (tokenData.dynamicConfig?.baseUrl) || "https://partner.hanet.ai",
      tokenUrl: process.env.HANET_TOKEN_URL || (tokenData.dynamicConfig?.tokenUrl) || "https://oauth.hanet.com/token"
    };
    
    // Trả về cấu hình động nếu có, hoặc cấu hình với refreshToken đã được lấy từ cache
    return tokenData.dynamicConfig || configWithRefreshToken;
  } else {
    // Đối với các tài khoản khác, chỉ sử dụng dynamicConfig
    return tokenData.dynamicConfig || {
      clientId: tokenData.dynamicConfig?.clientId,
      clientSecret: tokenData.dynamicConfig?.clientSecret,
      refreshToken: tokenData.refreshToken || tokenData.dynamicConfig?.refreshToken,
      baseUrl: tokenData.dynamicConfig?.baseUrl || "https://partner.hanet.ai",
      tokenUrl: tokenData.dynamicConfig?.tokenUrl || "https://oauth.hanet.com/token"
    };
  }
}

// Kiểm tra và refresh token khi cần cho một tài khoản cụ thể
async function getValidHanetToken(forceRefresh = false, username = null) {
  // Sử dụng tài khoản được chỉ định hoặc tài khoản hiện tại
  const accountName = username || currentUsername;
  const now = Date.now();
  const requestId = `token-req-${accountName}-${Date.now().toString(36)}`;
  
  // Đảm bảo tài khoản tồn tại trong Map
  if (!accountTokens.has(accountName)) {
    console.log(`[${requestId}] Tài khoản ${accountName} chưa tồn tại, đang khởi tạo...`);
    accountTokens.set(accountName, createDefaultTokenData());
    // Khởi tạo token cho tài khoản mới
    try {
      await initializeTokens(accountName);
    } catch (initError) {
      console.error(`[${requestId}] Lỗi khi khởi tạo token cho tài khoản ${accountName}:`, initError.message);
    }
  }
  
  // Lấy token data cho tài khoản
  const tokenData = accountTokens.get(accountName);
  
  // Thiết lập interval kiểm tra sức khỏe token nếu chưa có
  if (!tokenData.healthCheckInterval && accountName === 'default') {
    console.log(`[${requestId}] Thiết lập interval kiểm tra sức khỏe token cho ${accountName}: ${TOKEN_MONITOR_INTERVAL/60000} phút`);
    tokenData.healthCheckInterval = setInterval(async () => {
      try {
        // Tự động đồng bộ và làm mới token trước khi hết hạn
        const tokenStatus = await getValidHanetToken(false, accountName);
        console.log(`[AUTO-HEALTH] Kiểm tra sức khỏe token cho ${accountName} thành công, trạng thái: ${tokenData.state}`);
      } catch (err) {
        console.error(`[AUTO-HEALTH] Lỗi khi kiểm tra sức khỏe token cho ${accountName}:`, err.message);
        // Cố gắng làm mới lại
        try {
          await getValidHanetToken(true, accountName);
        } catch (refreshErr) {
          console.error(`[AUTO-HEALTH] Không thể làm mới token cho ${accountName}:`, refreshErr.message);
        }
      }
    }, TOKEN_MONITOR_INTERVAL);
    
    // Cập nhật lại vào Map
    accountTokens.set(accountName, tokenData);
  }
  
  // Kiểm tra xem đã quá lâu chưa sync lại (5 phút)
  if (now - tokenData.lastSync > 5 * 60 * 1000) {
    console.log(`[${requestId}] Token của tài khoản ${accountName} quá lâu chưa được đồng bộ (${Math.round((now - tokenData.lastSync) / 1000)} giây), thử đồng bộ lại`);
    try {
      // Đọc lại token từ storage
      const freshTokens = await tokenStorage.loadTokens(accountName);
      if (freshTokens && freshTokens.refreshToken) {
        // Chỉ cập nhật refreshToken nếu đã thay đổi
        if (freshTokens.refreshToken !== tokenData.refreshToken) {
          console.log(`[${requestId}] Phát hiện refresh token mới trong storage cho tài khoản ${accountName}, cập nhật lại`);
          tokenData.refreshToken = freshTokens.refreshToken;
          // Nếu refreshToken đã thay đổi, buộc tạo mới access token
          tokenData.accessToken = null;
          tokenData.expiresAt = null;
        }
        
        // Kiểm tra cả accessToken và expiresAt
        if (freshTokens.accessToken && freshTokens.expiresAt) {
          const expiresAt = parseInt(freshTokens.expiresAt, 10);
          
          // Cập nhật nếu token còn hạn
          if (expiresAt > now + 60000) { // Còn ít nhất 1 phút
            console.log(`[${requestId}] Tìm thấy access token hợp lệ trong storage cho tài khoản ${accountName}, còn hạn ${Math.round((expiresAt - now) / 1000)} giây`);
            tokenData.accessToken = freshTokens.accessToken;
            tokenData.expiresAt = expiresAt;
            tokenData.lastSync = now;
          } else {
            console.log(`[${requestId}] Access token trong storage cho tài khoản ${accountName} đã hết hạn hoặc sắp hết hạn, cần làm mới`);
            // Nếu token trong storage đã hết hạn, buộc làm mới
            forceRefresh = true;
          }
        }
        
        // Cập nhật lại vào Map
        accountTokens.set(accountName, tokenData);
      }
    } catch (syncError) {
      console.error(`[${requestId}] Lỗi khi đồng bộ token cho tài khoản ${accountName}:`, syncError.message);
    }
  }
  
  // Kiểm tra nếu token hiện tại vẫn còn hạn
  if (!forceRefresh && tokenData.accessToken && tokenData.expiresAt) {
    const expiresAt = tokenData.expiresAt;
    
    // Nếu token còn hạn ít nhất 5 phút, dùng lại
    if (expiresAt > now + 5 * 60 * 1000) {
      console.log(`[${requestId}] Sử dụng token hiện tại cho tài khoản ${accountName}, còn hạn ${Math.round((expiresAt - now) / 1000)} giây`);
      return tokenData.accessToken;
    }
    
    // Nếu token sắp hết hạn (còn dưới 5 phút), làm mới
    console.log(`[${requestId}] Token của tài khoản ${accountName} sắp hết hạn (còn ${Math.round((expiresAt - now) / 1000)} giây), làm mới`);
  } else if (forceRefresh) {
    console.log(`[${requestId}] Buộc làm mới token cho tài khoản ${accountName} theo yêu cầu`);
  } else {
    console.log(`[${requestId}] Chưa có access token cho tài khoản ${accountName}, cần lấy mới`);
  }

  try {
    // Đánh dấu token đang được làm mới
    tokenData.state = TOKEN_STATE.REFRESHING;
    tokenData.lastRefreshTime = Date.now();
    tokenData.refreshAttempts++;
    
    // Log thông tin quá trình làm mới
    console.log(`[${requestId}] Đang làm mới token, lần thử ${tokenData.refreshAttempts}/${MAX_REFRESH_RETRIES}`);
    
    // Kiểm tra nếu quá số lần thử tối đa
    if (tokenData.refreshAttempts > MAX_REFRESH_RETRIES) {
      // Reset để lần sau có thể thử lại
      setTimeout(() => {
        tokenData.refreshAttempts = 0;
        tokenData.state = TOKEN_STATE.UNKNOWN;
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
      
      // Kiểm tra xem có refreshToken không
      if (!tokenData.refreshToken && !config.refreshToken) {
        const errMsg = `Không có refresh token cho tài khoản ${accountName}, vui lòng đăng nhập lại`;
        console.error(`[${requestId}] ${errMsg}`);
        
        // Cập nhật trạng thái token
        tokenData.state = TOKEN_STATE.FAILED;
        tokenData.lastRefreshError = errMsg;
        accountTokens.set(accountName, tokenData);
        
        throw new Error(errMsg);
      }
      
      // Sử dụng refresh token để lấy access token mới
      const refreshToken = tokenData.refreshToken || config.refreshToken;
      const tokenUrl = config.tokenUrl || "https://oauth.hanet.com/token";
      const clientId = config.clientId;
      const clientSecret = config.clientSecret;
      // Gọi API để làm mới token
      console.log(`[${requestId}] Đang làm mới token cho tài khoản ${accountName} với refresh token: ${refreshToken.substring(0, 5)}...${refreshToken.substring(refreshToken.length - 5)}`);
      const response = await axios.post(tokenUrl, data, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      // Xử lý kết quả
      if (response.data && response.data.access_token) {
        const responseData = response.data;
        const expiresIn = responseData.expires_in || 3600; // Mặc định 1 giờ
        const expiresAt = now + (expiresIn * 1000);
        
        // Cập nhật vào cache cho tài khoản cụ thể
        tokenData.accessToken = responseData.access_token;
        tokenData.expiresAt = expiresAt;
        tokenData.state = TOKEN_STATE.VALID;
        tokenData.lastSync = now;
        tokenData.lastRefreshTime = now;
        tokenData.refreshAttempts = 0; // Reset lại số lần thử
        tokenData.lastRefreshError = null;
        
        // Cập nhật lại vào Map
        accountTokens.set(accountName, tokenData);
        
        // Lưu token vào storage
        try {
          await tokenStorage.saveTokens({
            refreshToken: refreshToken,
            accessToken: responseData.access_token,
            expiresAt: expiresAt,
            lastSync: now
          }, accountName);
          
          console.log(`[${requestId}] Làm mới token cho tài khoản ${accountName} thành công, hết hạn sau ${expiresIn} giây`);
        } catch (saveError) {
          console.error(`[${requestId}] Lưu token vào storage cho tài khoản ${accountName} bị lỗi:`, saveError.message);
          // Vẫn trả về token vì đã làm mới thành công, chỉ lưu bị lỗi
        }
        
        return responseData.access_token;
      } else {
        throw new Error(`Dữ liệu trả về không chứa access_token cho tài khoản ${accountName}`);
      }
    }
    throw axiosError;
  } catch (error) {
    // Xử lý lỗi
    console.error(`[${requestId}] Lỗi khi làm mới token cho tài khoản ${accountName}:`, error.message);
    
    // Cập nhật trạng thái lỗi
    tokenData.state = TOKEN_STATE.FAILED;
    tokenData.lastRefreshError = error.message;
    accountTokens.set(accountName, tokenData);
    
    // Thử lại nếu có token mới trong storage
    if (error.message.includes('refresh token') || error.message.includes('Refresh token')) {
      try {
        // Thử đọc lại token từ các nguồn khác
        await initializeTokens(accountName);
        const updatedTokenData = accountTokens.get(accountName);
        if (updatedTokenData.refreshToken && updatedTokenData.refreshToken !== refreshToken) {
          console.log(`[${requestId}] Phát hiện refresh token mới cho tài khoản ${accountName}, thử lại...`);
          return getValidHanetToken(true, accountName); // Thử lại với token mới
        }
      } catch (retryError) {
        console.error(`[${requestId}] Không thể lấy token mới cho tài khoản ${accountName}:`, retryError.message);
      }
    }
    
    throw new Error(`Lỗi khi làm mới token cho tài khoản ${accountName}: ${error.message}`);
  }

  try {
    if (response.data && response.data.access_token) {
      console.log(`[${requestId}] Làm mới Access Token thành công cho tài khoản ${accountName}`);
      
      // Cập nhật trạng thái token và reset số lần thử
      tokenData.state = TOKEN_STATE.VALID;
      tokenData.refreshAttempts = 0;
      tokenData.lastRefreshError = null;
      
      // Cập nhật token trong cache
      tokenData.accessToken = response.data.access_token;
      tokenData.expiresAt = Date.now() + (response.data.expires_in * 1000 * 0.9); // 90% thời gian để dự phòng
    
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
    tokenData.state = TOKEN_STATE.FAILED;
    tokenData.lastRefreshError = error.message;
    accountTokens.set(accountName, tokenData);
    
    const errorMessage = error.response?.data?.error_description || error.message;
    console.error(`[${requestId}] Lỗi khi làm mới token cho tài khoản ${accountName}: ${errorMessage}`);
    console.error(`[${requestId}] Chi tiết lỗi:`, JSON.stringify(errorDetail, null, 2));
    
    // Reset token để tránh dùng token lỗi
    tokenData.accessToken = null;
    tokenData.expiresAt = null;
  
    // Lập lịch tự động thử lại sau một khoảng thời gian
    const retryDelay = Math.min(30000 * (tokenData.refreshAttempts || 1), 5 * 60 * 1000); // Tối đa 5 phút
    console.log(`[${requestId}] Sẽ tự động thử lại sau ${retryDelay/1000} giây cho tài khoản ${accountName}`);
    
    // Đặt trạng thái về UNKNOWN để lần sau có thể thử lại
    setTimeout(() => {
      if (tokenData.state === TOKEN_STATE.FAILED) {
        console.log(`[AUTO-RECOVERY] Đặt lại trạng thái token cho tài khoản ${accountName} về UNKNOWN để thử lại`);
        tokenData.state = TOKEN_STATE.UNKNOWN;
        accountTokens.set(accountName, tokenData);
      }
    }, retryDelay);
  
    // Xử lý các trường hợp lỗi cụ thể
    // Trường hợp 1: Lỗi 400 - Có thể do refresh token không hợp lệ hoặc hết hạn
    if (error.response?.status === 400) {
      const errorType = error.response?.data?.error;
      console.log(`[${new Date().toISOString()}] DEBUG: Lỗi 400 với loại lỗi: ${errorType} cho tài khoản ${accountName}`);
      
      // Kiểm tra các loại lỗi đặc biệt của OAuth
      if (errorType === 'invalid_grant' || 
          errorType === 'invalid_request' ||
          errorMessage.includes('invalid_grant') ||
          errorMessage.includes('invalid refresh token') ||
          errorMessage.includes('expired') ||
          errorMessage.includes('revoked')) {
        
        console.log(`[${new Date().toISOString()}] Refresh token không hợp lệ hoặc hết hạn cho tài khoản ${accountName}, xóa khỏi bộ nhớ`);
        
        // Xóa refresh token khỏi các nơi lưu trữ
        tokenData.refreshToken = null;
        accountTokens.set(accountName, tokenData);
        
        // Xóa khỏi MongoDB để đảm bảo đồng bộ
        try {
          tokenStorage.saveTokens({
            refreshToken: null,
            accessToken: null,
            expiresAt: null,
            lastSync: Date.now()
          }, accountName);
        } catch (storageError) {
          console.error(`[${new Date().toISOString()}] Lỗi khi xóa token khỏi storage cho tài khoản ${accountName}:`, storageError.message);
        }
      
        // Báo hiệu client rằng cần đăng nhập lại
        throw new Error(`Token đã hết hạn hoặc bị thu hồi cho tài khoản ${accountName}. Vui lòng đăng nhập lại. Lỗi: ${errorType || errorMessage}`);
      }
      
      // Trường hợp lỗi client_id hoặc client_secret
      if (errorType === 'invalid_client' ||
          errorMessage.includes('client_id') ||
          errorMessage.includes('client_secret') ||
          errorMessage.includes('client credentials')) {
        console.log(`[${new Date().toISOString()}] Thông tin client không hợp lệ cho tài khoản ${accountName}. Yêu cầu cấu hình lại.`);
        throw new Error(`Thông tin client không hợp lệ cho tài khoản ${accountName}. Vui lòng kiểm tra Client ID và Client Secret. Lỗi: ${errorType || errorMessage}`);
      }
    }
    
    // Trường hợp 2: Lỗi mạng hoặc lỗi server (5xx)
    if (!error.response || error.response.status >= 500) {
      console.log(`[${new Date().toISOString()}] Lỗi kết nối hoặc lỗi server cho tài khoản ${accountName}: ${errorMessage}`);
      throw new Error(`Lỗi kết nối đến máy chủ Hanet cho tài khoản ${accountName}. Vui lòng kiểm tra kết nối mạng và thử lại sau: ${errorMessage}`);
    }
    
    // Trường hợp lỗi khác
    throw new Error(`Không thể làm mới token cho tài khoản ${accountName} (mã lỗi ${error.response?.status || 'không xác định'}): ${errorMessage}`);
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

// Hàm chuyển đổi tài khoản sử dụng trong phiên hiện tại
async function useAccount(username) {
  try {
    console.log(`[${new Date().toISOString()}] Chuyển đổi sang tài khoản: ${username}`);
    // Nếu tài khoản chưa tồn tại trong memory, tạo mới
    if (!accountTokens.has(username)) {
      console.log(`[${new Date().toISOString()}] Tài khoản ${username} chưa tồn tại, đang tạo mới...`);
      // Thử nạp từ file config local trước
      const config = await tokenStorage.loadOAuthConfig(username);
      if (!config) {
        console.error(`[${new Date().toISOString()}] Không tìm thấy cấu hình cho tài khoản ${username}`);
        throw new Error(`Không tìm thấy cấu hình cho tài khoản ${username}`);
      }
      
      // Tạo token data mới
      const newTokenData = createDefaultTokenData();
      newTokenData.dynamicConfig = config;
      newTokenData.refreshToken = config.refreshToken;
      accountTokens.set(username, newTokenData);
      console.log(`[${new Date().toISOString()}] Đã tạo dữ liệu mới cho tài khoản ${username}`);
    }
    
    // Cập nhật tài khoản hiện tại
    currentUsername = username;
    console.log(`[${new Date().toISOString()}] Đã đặt tài khoản hiện tại: ${currentUsername}`);
    
    // Lấy token data cho tài khoản mới
    const tokenData = accountTokens.get(username);
    
    // Đảm bảo chúng ta có token mới
    tokenData.accessToken = null;
    tokenData.expiresAt = null;
    
    // Cập nhật lại vào Map
    accountTokens.set(username, tokenData);
    
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Lỗi khi chuyển đổi tài khoản: ${error.message}`);
    throw error;
  }
}

// Hàm lấy danh sách tất cả các tài khoản đã cấu hình
function getAllAccounts() {
  return Array.from(accountTokens.keys());
}

// Hàm lấy danh sách tất cả các tokens của tất cả các tài khoản đã cấu hình
async function getTokensForAllAccounts() {
  const result = {};
  
  for (const account of accountTokens.keys()) {
    try {
      const token = await getValidHanetToken(false, account);
      result[account] = { 
        token,
        success: true 
      };
    } catch (error) {
      result[account] = { 
        error: error.message, 
        success: false 
      };
    }
  }
  
  return result;
}

module.exports = {
  getValidHanetToken,
  setDynamicConfig,
  getCurrentConfig,
  useAccount,
  exchangeCodeForToken,
  initializeTokens,
  getAllAccounts,
  getTokensForAllAccounts
};
