// tokenValidator.js - Kiểm tra tính hợp lệ thực tế của token

const axios = require('axios');
const tokenManager = require('./tokenManager');

const API_TEST_ENDPOINT = '/api/v3/account/info'; // Endpoint ít tốn tài nguyên để kiểm tra token

// Mã lỗi và trạng thái xác thực
const AUTH_STATUS = {
  VALID: 'valid',
  EXPIRED: 'expired',
  INVALID: 'invalid',
  ERROR: 'error'
};

/**
 * Kiểm tra token có còn hoạt động không bằng cách gọi API test
 * @param {string} token - Token cần kiểm tra
 * @param {string} baseUrl - URL cơ sở của Hanet API
 * @returns {Promise<Object>} - Kết quả kiểm tra với status và thông tin chi tiết
 */
async function checkTokenStatus(token, baseUrl) {
  if (!token) {
    return {
      status: AUTH_STATUS.INVALID,
      code: 'missing_token',
      message: 'Token không được cung cấp'
    };
  }

  try {
    const response = await axios({
      method: 'get',
      url: `${baseUrl}${API_TEST_ENDPOINT}`,
      headers: {
        'Authorization': `Bearer ${token}`
      },
      timeout: 5000 // Timeout 5 giây
    });
    
    // Kiểm tra kết quả response
    if (response.data && response.data.code === '1') {
      return {
        status: AUTH_STATUS.VALID,
        code: 'ok',
        message: 'Token hợp lệ',
        data: response.data
      };
    }
    
    // Token không hợp lệ nhưng không có lỗi kết nối
    console.log('[TokenValidator] Token không hợp lệ:', response.data);
    return {
      status: AUTH_STATUS.INVALID,
      code: `api_${response.data.code || 'unknown'}`,
      message: response.data.message || 'Token không hợp lệ',
      data: response.data
    };
  } catch (error) {
    // Phân tích lỗi
    if (error.response) {
      // Lỗi từ API Hanet
      const statusCode = error.response.status;
      
      // Xử lý theo mã lỗi HTTP
      if (statusCode === 401 || statusCode === 403) {
        console.error('[TokenValidator] Token hết hạn hoặc không hợp lệ:', error.message);
        return {
          status: AUTH_STATUS.EXPIRED,
          code: `http_${statusCode}`,
          message: 'Token hết hạn hoặc không hợp lệ',
          httpStatus: statusCode,
          details: error.response.data
        };
      } else if (statusCode === 429) {
        console.error('[TokenValidator] Bị giới hạn tốc độ gọi API:', error.message);
        return {
          status: AUTH_STATUS.ERROR,
          code: 'rate_limited',
          message: 'API đang bị giới hạn tốc độ gọi',
          httpStatus: statusCode,
          details: error.response.data
        };
      }
      
      // Lỗi API khác
      return {
        status: AUTH_STATUS.ERROR,
        code: `api_error_${statusCode}`,
        message: `Lỗi API: ${error.message}`,
        httpStatus: statusCode,
        details: error.response.data
      };
    } else if (error.request) {
      // Không nhận được response
      console.error('[TokenValidator] Không nhận được phản hồi từ máy chủ:', error.message);
      return {
        status: AUTH_STATUS.ERROR,
        code: 'network_error',
        message: 'Không thể kết nối đến máy chủ Hanet API',
        details: error.message
      };
    }
    
    // Lỗi khác
    console.error('[TokenValidator] Lỗi khi xác thực token:', error.message);
    return {
      status: AUTH_STATUS.ERROR,
      code: 'unknown_error',
      message: 'Lỗi không xác định khi kiểm tra token',
      details: error.message
    };
  }
}

/**
 * Lấy token đã được xác minh là hoạt động
 * @param {Object} options - Tùy chọn
 * @param {boolean} options.forceRefresh - Buộc làm mới token
 * @param {number} options.maxRetries - Số lần thử lại tối đa
 * @returns {Promise<string>} - Token đã xác minh hoặc null nếu không thể lấy được token hợp lệ
 */
async function getVerifiedToken(options = {}) {
  const { forceRefresh = false, maxRetries = 2 } = options;
  let retryCount = 0;
  let lastError = null;
  
  try {
    // Nếu yêu cầu làm mới, làm mới token trước
    if (forceRefresh) {
      console.log('[TokenValidator] Làm mới token theo yêu cầu...');
      await tokenManager.refreshHanetToken();
    }
    
    // Lấy token từ tokenManager
    const token = await tokenManager.getValidHanetToken();
    const config = tokenManager.getCurrentConfig();
    const baseUrl = config.baseUrl || 'https://partner.hanet.ai';
    
    // Thử lấy token hợp lệ với số lần thử lại
    while (retryCount <= maxRetries) {
      // Kiểm tra tính hợp lệ của token
      const tokenStatus = await checkTokenStatus(token, baseUrl);
      
      if (tokenStatus.status === AUTH_STATUS.VALID) {
        return token;
      }
      
      // Nếu token hết hạn, thử làm mới
      if (tokenStatus.status === AUTH_STATUS.EXPIRED || 
          (tokenStatus.status === AUTH_STATUS.INVALID && retryCount < maxRetries)) {
        console.log(`[TokenValidator] Token không hợp lệ (${tokenStatus.code}), thử làm mới token... Lần thử ${retryCount + 1}/${maxRetries + 1}`);
        
        try {
          const refreshedToken = await tokenManager.refreshHanetToken();
          // Kiểm tra lại token mới
          const refreshStatus = await checkTokenStatus(refreshedToken, baseUrl);
          
          if (refreshStatus.status === AUTH_STATUS.VALID) {
            console.log('[TokenValidator] Làm mới token thành công');
            return refreshedToken;
          }
          
          lastError = new Error(`Làm mới token không thành công: ${refreshStatus.message}`);
        } catch (refreshError) {
          console.error('[TokenValidator] Lỗi khi làm mới token:', refreshError.message);
          lastError = refreshError;
        }
      } else {
        // Lưu lại lỗi cuối cùng
        lastError = new Error(`Token không hợp lệ: ${tokenStatus.message}`);
      }
      
      retryCount++;
    }
    
    // Không thể lấy token hợp lệ sau tất cả các lần thử
    throw lastError || new Error('Không thể lấy token hợp lệ sau nhiều lần thử');
  } catch (error) {
    console.error('[TokenValidator] Lỗi khi lấy token đã xác minh:', error.message);
    throw error;
  }
}

/**
 * Kiểm tra nhanh xem token có hợp lệ không
 * @returns {Promise<boolean>} - True nếu token hợp lệ, False nếu không
 */
async function isTokenValid() {
  try {
    const token = await tokenManager.getValidHanetToken();
    const config = tokenManager.getCurrentConfig();
    const baseUrl = config.baseUrl || 'https://partner.hanet.ai';
    
    const tokenStatus = await checkTokenStatus(token, baseUrl);
    return tokenStatus.status === AUTH_STATUS.VALID;
  } catch (error) {
    console.error('[TokenValidator] Lỗi khi kiểm tra tính hợp lệ của token:', error.message);
    return false;
  }
}

module.exports = {
  isTokenValid,
  getVerifiedToken,
  checkTokenStatus,
  AUTH_STATUS
};
