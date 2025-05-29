// apiService.js - Xử lý các yêu cầu API và tự động làm mới xác thực khi cần
const API_URL = process.env.REACT_APP_API_URL;

// Theo dõi thời gian kiểm tra xác thực cuối cùng
let lastAuthCheckTime = 0;
const AUTH_CHECK_INTERVAL = 2 * 60 * 1000; // 2 phút
const TOKEN_REFRESH_THRESHOLD = 13 * 60 * 1000; // Làm mới token trước khi hết hạn 2 phút

// Theo dõi nếu đang trong quá trình làm mới xác thực
let isRefreshingAuth = false;
let refreshPromise = null;

// Kiểm tra trạng thái xác thực
const checkAuthStatus = async (forceCheck = false) => {
  const now = Date.now();
  
  // Nếu đã kiểm tra gần đây và không bắt buộc kiểm tra, bỏ qua
  if (!forceCheck && now - lastAuthCheckTime < AUTH_CHECK_INTERVAL) {
    return;
  }
  
  try {
    console.log('[apiService] Kiểm tra trạng thái xác thực');
    lastAuthCheckTime = now;
    
    const response = await fetch(`${API_URL}/api/oauth/status`);
    const result = await response.json();
    
    if (result.success && result.data) {
      console.log(`[apiService] Trạng thái xác thực: ${result.data.status}`);
      
      // Nếu token sắp hết hạn hoặc chưa xác thực, thử làm mới
      if (result.data.status !== 'authenticated' || 
          (result.data.tokenExpiresIn && result.data.tokenExpiresIn < TOKEN_REFRESH_THRESHOLD)) {
        console.log('[apiService] Token sắp hết hạn hoặc không hợp lệ, thử làm mới');
        await refreshAuthentication();
      }
      
      return result.data;
    } else {
      throw new Error('Kết quả kiểm tra xác thực không hợp lệ');
    }
  } catch (error) {
    console.error("[apiService] Lỗi kiểm tra trạng thái xác thực:", error);
    throw error;
  }
};

// Làm mới xác thực bằng cách kích hoạt cấu hình OAuth hiện tại
const refreshAuthentication = async () => {
  // Nếu đang làm mới, chờ hoàn thành
  if (isRefreshingAuth) {
    console.log('[apiService] Đang làm mới xác thực, chờ hoàn thành...');
    return refreshPromise;
  }
  
  try {
    isRefreshingAuth = true;
    refreshPromise = (async () => {
      console.log('[apiService] Bắt đầu làm mới xác thực');
      
      // Lấy thông tin cấu hình OAuth hiện tại
      const ACTIVE_CONFIG_KEY = 'hanet_oauth_active_config';
      const CONFIG_PREFIX = 'hanet_oauth_config_';
      
      const activeConfig = localStorage.getItem(ACTIVE_CONFIG_KEY);
      if (!activeConfig) {
        console.log('[apiService] Không tìm thấy cấu hình OAuth đang hoạt động');
        return false;
      }
      
      const configData = localStorage.getItem(CONFIG_PREFIX + activeConfig);
      if (!configData) {
        console.log(`[apiService] Không tìm thấy dữ liệu cấu hình OAuth: ${activeConfig}`);
        return false;
      }
      
      // Phân tích cấu hình
      const parsedConfig = JSON.parse(configData);
      
      // Kiểm tra refresh token
      if (!parsedConfig.refreshToken) {
        console.error('[apiService] Không có refresh token trong cấu hình');
        return false;
      }
      
      // Gửi yêu cầu làm mới token
      console.log('[apiService] Gửi yêu cầu làm mới token...');
      
      const response = await fetch(`${API_URL}/api/oauth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refreshToken: parsedConfig.refreshToken,
          clientId: parsedConfig.clientId,
          clientSecret: parsedConfig.clientSecret
        })
      });
      
      const result = await response.json();
      
      if (result.success && result.data) {
        // Cập nhật token mới vào cấu hình
        parsedConfig.accessToken = result.data.accessToken;
        if (result.data.refreshToken) {
          parsedConfig.refreshToken = result.data.refreshToken;
        }
        
        // Lưu cấu hình đã cập nhật
        localStorage.setItem(CONFIG_PREFIX + activeConfig, JSON.stringify(parsedConfig));
        localStorage.setItem('hanet_oauth_config', JSON.stringify(parsedConfig));
        
        console.log('[apiService] Làm mới token thành công');
        return true;
      } else {
        console.error('[apiService] Làm mới token thất bại:', result.message);
        return false;
      }
    })();
    
    return await refreshPromise;
  } catch (error) {
    console.error('[apiService] Lỗi khi làm mới xác thực:', error);
    return false;
  } finally {
    isRefreshingAuth = false;
    refreshPromise = null;
  }
};

// Xử lý các yêu cầu API với tự động làm mới xác thực
const fetchWithAuth = async (url, options = {}, retryCount = 0) => {
  const MAX_RETRIES = 3;
  
  try {
    console.log('Calling API:', url);
    const response = await fetch(url, options);
    const data = await response.json();

    // Kiểm tra nếu có lỗi xác thực
    if (!response.ok && (response.status === 401 || response.status === 403 || 
        (data.error && data.error.includes('Authentication failed')))) {
      console.log('Phát hiện lỗi xác thực, thử làm mới token...');
      
      // Chỉ thử làm mới token nếu chưa vượt quá số lần thử lại
      if (retryCount < MAX_RETRIES) {
        // Thử làm mới xác thực
        const refreshed = await refreshAuthentication();
        if (refreshed) {
          console.log('Làm mới token thành công, thử lại request...');
          // Thử lại request với token mới
          return fetchWithAuth(url, options, retryCount + 1);
        }
      }
      
      throw new Error('Không thể xác thực với Hanet API sau nhiều lần thử');
    }

    if (!response.ok) {
      console.error('API error:', data);
      throw new Error(data.message || 'API request failed');
    }

    if (data.success === false) {
      // Kiểm tra nếu là lỗi xác thực
      if (data.error === 'Authentication failed' || data.message?.includes('authenticate')) {
        if (retryCount < MAX_RETRIES) {
          console.log('Phát hiện lỗi xác thực từ response, thử làm mới token...');
          const refreshed = await refreshAuthentication();
          if (refreshed) {
            console.log('Làm mới token thành công, thử lại request...');
            return fetchWithAuth(url, options, retryCount + 1);
          }
        }
        throw new Error('Không thể xác thực với Hanet API sau nhiều lần thử');
      }
      throw new Error(data.message || 'Request was not successful');
    }

    // Log response data for debugging
    console.log('API Response:', data);

    // Case 1: Response has success and data structure (most common case)
    if (data.success && data.data) {
      console.log('Found success and data structure');
      return Array.isArray(data.data) ? data.data : [data.data];
    }

    // Case 2: Response has metadata and data structure
    if (data.metadata && data.data) {
      console.log('Found metadata and data structure');
      return Array.isArray(data.data) ? data.data : [data.data];
    }

    // Case 3: Response is an array directly
    if (Array.isArray(data)) {
      console.log('Found direct array response');
      return data;
    }

    // Case 4: Response has only data field
    if (data.data) {
      console.log('Found data field only');
      return Array.isArray(data.data) ? data.data : [data.data];
    }

    // No valid data found
    console.warn('Unexpected API response format:', data);
    return [];
  } catch (error) {
    console.error('Error in fetchWithAuth:', error);
    throw error;
  }
};

// Hàm sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Hàm tính thời gian chờ theo exponential backoff
const calculateBackoff = (attempt, baseDelay = 1000) => {
  return Math.min(baseDelay * Math.pow(2, attempt), 30000);
};

// API functions
const apiService = {
  // Kiểm tra trạng thái xác thực
  checkAuthStatus: checkAuthStatus,
  
  // Làm mới xác thực
  refreshAuthentication: refreshAuthentication,
  
  // Lấy danh sách địa điểm
  async getPlaces() {
    try {
      console.log('Fetching places from API...');
      const response = await fetch(`${API_URL}/api/place`);
      const data = await response.json();
      
      console.log('Places API Response:', data);
      
      // Kiểm tra response format
      if (!data) {
        console.error('Empty response from places API');
        throw new Error('Không nhận được dữ liệu từ API');
      }
      
      // Kiểm tra nếu có lỗi
      if (data.success === false) {
        console.error('API returned error:', data.message);
        throw new Error(data.message || 'Lỗi khi lấy danh sách địa điểm');
      }
      
      // Kiểm tra và xử lý dữ liệu
      if (data.success && Array.isArray(data.data)) {
        console.log(`Found ${data.data.length} places`);
        return data.data;
      }
      
      if (data.success && data.data) {
        console.log('Converting places data to array');
        return Array.isArray(data.data) ? data.data : [data.data];
      }
      
      // Nếu response là array trực tiếp
      if (Array.isArray(data)) {
        console.log(`Found ${data.length} places (direct array)`);
        return data;
      }
      
      console.error('Invalid places data format:', data);
      throw new Error('Dữ liệu địa điểm trả về không hợp lệ');
    } catch (error) {
      console.error('Error fetching places:', error);
      throw new Error('Lỗi khi lấy danh sách địa điểm: ' + error.message);
    }
  },
  
  // Lấy danh sách thiết bị theo địa điểm
  async getDevices(placeId) {
    try {
      console.log('Fetching devices for placeId:', placeId);
      
      if (!placeId) {
        throw new Error('Thiếu tham số placeId');
      }
      
      const response = await fetch(`${API_URL}/api/device?placeId=${placeId}`);
      const data = await response.json();
      
      console.log('Devices API Response:', data);
      
      // Validate response
      if (!data) {
        console.error('Empty response from devices API');
        return { success: false, message: 'Không nhận được dữ liệu từ API' };
      }
      
      // Check for API error
      if (data.success === false) {
        console.error('API returned error:', data.message);
        return { success: false, message: data.message || 'Lỗi khi lấy danh sách thiết bị' };
      }
      
      // Handle successful response with data.data array
      if (data.success && Array.isArray(data.data)) {
        console.log(`Found ${data.data.length} devices`);
        return { success: true, data: data.data };
      }
      
      // Handle direct array response
      if (Array.isArray(data)) {
        console.log(`Found ${data.length} devices (direct array)`);
        return { success: true, data: data };
      }
      
      // Handle single device response
      if (data.data) {
        console.log('Converting device data to array');
        const devices = Array.isArray(data.data) ? data.data : [data.data];
        return { success: true, data: devices };
      }
      
      console.error('Invalid device data format:', data);
      return { success: false, message: 'Dữ liệu thiết bị không hợp lệ' };
      
    } catch (error) {
      console.error('Error fetching devices:', error);
      return { success: false, message: 'Lỗi khi lấy danh sách thiết bị: ' + error.message };
    }
  },
  
  // Lấy dữ liệu check-in
  async getCheckins(placeId, fromDateTime, toDateTime, deviceId = '') {
    if (!placeId || !fromDateTime || !toDateTime) {
      throw new Error('Thiếu tham số bắt buộc');
    }
    
    const fromTimestamp = new Date(fromDateTime).getTime();
    const toTimestamp = new Date(toDateTime).getTime();
    
    // Hàm thử lại truy vấn khi gặp lỗi
    const fetchWithRetry = async (url, maxRetries = 3) => {
      let lastError = null;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            const delay = calculateBackoff(attempt);
            console.log(`Thử lại lần ${attempt + 1}/${maxRetries} sau ${delay}ms cho URL: ${url}`);
            await sleep(delay);
          }
          
          const result = await fetchWithAuth(url);
          
          // Kiểm tra và log kết quả
          console.log(`Received ${result ? (Array.isArray(result) ? result.length : 'non-array') : 'no'} results`);
          
          return result;
        } catch (error) {
          lastError = error;
          console.warn(`Lỗi lần thử ${attempt + 1}/${maxRetries}:`, error.message);
          
          if (error.message.includes('401') || error.message.includes('403')) {
            throw error; // Lỗi xác thực - không thử lại
          }
          
          if (error.message.includes('429')) {
            await sleep(calculateBackoff(attempt, 10000)); // Rate limit - chờ lâu hơn
            continue;
          }
          
          if (error.message.includes('500')) {
            await sleep(calculateBackoff(attempt, 5000));
            continue;
          }
        }
      }
      
      throw lastError || new Error('Không thể kết nối đến máy chủ sau nhiều lần thử');
    };
    
    // Tạo URL API
    let url = `${API_URL}/api/checkins?placeId=${placeId}&dateFrom=${fromTimestamp}&dateTo=${toTimestamp}`;
    if (deviceId) {
      url += `&devices=${deviceId}`;
    }
    
    try {
      console.log('Fetching data:', {
        placeId,
        fromDateTime: new Date(fromTimestamp).toLocaleString(),
        toDateTime: new Date(toTimestamp).toLocaleString(),
        deviceId
      });
      
      const results = await fetchWithRetry(url);
      
      if (!Array.isArray(results)) {
        console.error('Invalid API response format:', results);
        throw new Error('Định dạng dữ liệu không hợp lệ từ API');
      }
      
      console.log(`Nhận được ${results.length} bản ghi từ API`);
      return results;
      
    } catch (error) {
      console.error('Error fetching checkins:', error);
      throw error;
    }
  }
};

export default apiService;
