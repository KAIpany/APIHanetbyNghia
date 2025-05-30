/**
 * Module tự động kết nối với Hanet API khi khởi động
 * Giúp duy trì kết nối liên tục mà không cần người dùng kích hoạt thủ công
 */

const mongodbStorage = require('./mongodbStorage');
const tokenManager = require('./tokenManager');
const tokenValidator = require('./tokenValidator');

// Thời gian chờ giữa các lần thử kết nối (mặc định: 30 giây)
const CONNECTION_RETRY_DELAY = process.env.CONNECTION_RETRY_DELAY || 30000;
// Số lần thử kết nối tối đa
const MAX_CONNECTION_RETRIES = process.env.MAX_CONNECTION_RETRIES || 5;

let connectionRetryCount = 0;
let connectionTimer = null;
let isConnecting = false;

/**
 * Khởi tạo kết nối tự động khi server khởi động
 */
async function initialize() {
  console.log('[AutoConnector] Khởi tạo kết nối tự động với Hanet API...');
  
  try {
    // Tắt timer nếu đang chạy
    if (connectionTimer) {
      clearTimeout(connectionTimer);
      connectionTimer = null;
    }
    
    // Đặt cờ hiệu đang kết nối
    isConnecting = true;
    
    // Tìm cấu hình active trong cơ sở dữ liệu
    const activeConfig = await mongodbStorage.getActiveConfig();
    
    if (!activeConfig || !activeConfig.configName) {
      console.log('[AutoConnector] Không tìm thấy cấu hình active, bỏ qua kết nối tự động');
      setupConnectionRetry();
      return false;
    }
    
    console.log(`[AutoConnector] Tìm thấy cấu hình active: ${activeConfig.configName}, đang kích hoạt...`);
    
    // Tải cấu hình và khởi tạo token manager
    const config = await mongodbStorage.getOAuthConfig(activeConfig.configName);
    
    if (!config) {
      console.log(`[AutoConnector] Không tìm thấy thông tin cấu hình ${activeConfig.configName}, bỏ qua kết nối tự động`);
      setupConnectionRetry();
      return false;
    }
    
    // Cập nhật cấu hình vào token manager
    await tokenManager.setDynamicConfig(config);
    
    // Lấy token hợp lệ
    console.log('[AutoConnector] Đang lấy token hợp lệ...');
    
    try {
      // Thử xác minh token với Hanet API
      const token = await tokenValidator.getVerifiedToken({ 
        maxRetries: 2, 
        forceRefresh: true 
      });
      
      if (token) {
        console.log('[AutoConnector] Đã kết nối thành công với Hanet API!');
        
        // Reset retry counter sau khi kết nối thành công
        connectionRetryCount = 0;
        
        // Cài đặt kiểm tra định kỳ
        setupHealthCheck();
        return true;
      } else {
        console.log('[AutoConnector] Không thể lấy token hợp lệ');
        setupConnectionRetry();
        return false;
      }
    } catch (tokenError) {
      console.error('[AutoConnector] Lỗi khi lấy token:', tokenError.message);
      setupConnectionRetry();
      return false;
    }
  } catch (error) {
    console.error('[AutoConnector] Lỗi khi khởi tạo kết nối tự động:', error.message);
    setupConnectionRetry();
    return false;
  } finally {
    isConnecting = false;
  }
}

/**
 * Thiết lập việc thử kết nối lại sau một khoảng thời gian
 */
function setupConnectionRetry() {
  // Tăng số lần thử
  connectionRetryCount++;
  
  // Nếu đã thử quá số lần tối đa, dừng lại
  if (connectionRetryCount > MAX_CONNECTION_RETRIES) {
    console.log(`[AutoConnector] Đã thử kết nối ${connectionRetryCount} lần không thành công, dừng thử lại`);
    return;
  }
  
  // Tính toán thời gian chờ (tăng dần theo số lần thử)
  const delay = Math.min(CONNECTION_RETRY_DELAY * connectionRetryCount, 5 * 60 * 1000); // Tối đa 5 phút
  
  console.log(`[AutoConnector] Sẽ thử kết nối lại sau ${Math.round(delay/1000)} giây (lần thử ${connectionRetryCount}/${MAX_CONNECTION_RETRIES})`);
  
  // Đặt lịch thử lại
  connectionTimer = setTimeout(() => {
    if (!isConnecting) {
      initialize();
    }
  }, delay);
}

/**
 * Thiết lập kiểm tra sức khỏe kết nối định kỳ
 */
function setupHealthCheck() {
  // Kiểm tra token mỗi 10 phút
  const healthCheckInterval = 10 * 60 * 1000; // 10 phút
  
  console.log(`[AutoConnector] Thiết lập kiểm tra sức khỏe kết nối mỗi ${healthCheckInterval/60000} phút`);
  
  // Xóa timer cũ nếu có
  if (connectionTimer) {
    clearTimeout(connectionTimer);
  }
  
  // Đặt lịch kiểm tra sức khỏe định kỳ
  connectionTimer = setInterval(async () => {
    if (isConnecting) return;
    
    console.log('[AutoConnector] Đang kiểm tra sức khỏe kết nối...');
    isConnecting = true;
    
    try {
      // Kiểm tra token có còn hợp lệ không
      const isValid = await tokenValidator.isTokenValid();
      
      if (isValid) {
        console.log('[AutoConnector] Kết nối Hanet API đang hoạt động tốt');
      } else {
        console.warn('[AutoConnector] Token không hợp lệ, đang thử làm mới...');
        
        try {
          await tokenValidator.getVerifiedToken({ forceRefresh: true });
          console.log('[AutoConnector] Đã làm mới token thành công');
        } catch (refreshError) {
          console.error('[AutoConnector] Không thể làm mới token:', refreshError.message);
          // Khi không thể làm mới, thiết lập lại từ đầu
          setupConnectionRetry();
        }
      }
    } catch (error) {
      console.error('[AutoConnector] Lỗi khi kiểm tra sức khỏe kết nối:', error.message);
    } finally {
      isConnecting = false;
    }
  }, healthCheckInterval);
}

module.exports = {
  initialize,
  setupHealthCheck,
};
