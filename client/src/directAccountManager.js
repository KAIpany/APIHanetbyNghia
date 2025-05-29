/**
 * Quản lý tài khoản trực tiếp - file mới để thay thế accountManager.js
 */

// Các khóa localStorage
const ACCOUNTS_KEY = 'hanet_accounts_v2'; // Đổi tên key để tránh xung đột
const CURRENT_ACCOUNT_KEY = 'hanet_current_account_id_v2';
const USER_INFO_KEY = 'user_info'; 
const CONFIG_KEY = 'hanet_oauth_config';

/**
 * Kiểm tra localStorage có hoạt động không
 */
export const isStorageAvailable = () => {
  const test = 'test_storage';
  try {
    localStorage.setItem(test, test);
    const result = localStorage.getItem(test);
    localStorage.removeItem(test);
    return result === test;
  } catch (e) {
    console.error('localStorage không khả dụng:', e);
    return false;
  }
};

/**
 * Lấy danh sách tài khoản
 */
export const getAccounts = () => {
  if (!isStorageAvailable()) {
    console.error('Không thể lấy danh sách tài khoản vì localStorage không khả dụng');
    return [];
  }

  try {
    const rawData = localStorage.getItem(ACCOUNTS_KEY);
    console.log('Raw accounts data (new):', rawData);
    
    if (!rawData) {
      // Nếu danh sách mới chưa có, thử đọc từ key cũ
      const oldData = localStorage.getItem('hanet_accounts');
      if (oldData) {
        console.log('Đọc từ key cũ:', oldData);
        const oldAccounts = JSON.parse(oldData);
        // Di chuyển từ key cũ sang key mới
        localStorage.setItem(ACCOUNTS_KEY, oldData);
        return oldAccounts;
      }
      return [];
    }
    
    return JSON.parse(rawData);
  } catch (error) {
    console.error('Lỗi khi lấy danh sách tài khoản:', error);
    return [];
  }
};

/**
 * Lấy ID tài khoản hiện tại
 */
export const getCurrentAccountId = () => {
  if (!isStorageAvailable()) {
    console.error('Không thể lấy ID tài khoản hiện tại vì localStorage không khả dụng');
    return null;
  }

  try {
    // Kiểm tra cả key mới và key cũ
    let id = localStorage.getItem(CURRENT_ACCOUNT_KEY);
    if (!id) {
      id = localStorage.getItem('hanet_current_account_id');
      if (id) {
        // Di chuyển từ key cũ sang key mới
        localStorage.setItem(CURRENT_ACCOUNT_KEY, id);
      }
    }
    console.log('Current account ID (new):', id);
    return id;
  } catch (error) {
    console.error('Lỗi khi lấy ID tài khoản hiện tại:', error);
    return null;
  }
};

/**
 * Lấy thông tin tài khoản hiện tại
 */
export const getCurrentAccount = () => {
  const accountId = getCurrentAccountId();
  if (!accountId) {
    console.log('Không có tài khoản hiện tại (new)');
    return null;
  }
  
  const accounts = getAccounts();
  if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
    console.log('Danh sách tài khoản trống');
    return null;
  }
  
  const account = accounts.find(acc => acc && acc.id === accountId);
  console.log('Current account data (new):', account);
  return account || null;
};

/**
 * Lưu danh sách tài khoản
 */
export const saveAccountsList = (accounts) => {
  if (!isStorageAvailable()) {
    console.error('Không thể lưu danh sách tài khoản vì localStorage không khả dụng');
    return false;
  }

  if (!accounts || !Array.isArray(accounts)) {
    console.error('Dữ liệu tài khoản không hợp lệ:', accounts);
    return false;
  }

  try {
    // Làm sạch danh sách, loại bỏ các phần tử null/undefined
    const cleanAccounts = accounts.filter(acc => acc && acc.id);
    
    // Lưu danh sách
    const accountsJSON = JSON.stringify(cleanAccounts);
    console.log('Đang lưu danh sách tài khoản mới:', accountsJSON);
    
    // Xóa trước để tránh lỗi
    localStorage.removeItem(ACCOUNTS_KEY);
    localStorage.setItem(ACCOUNTS_KEY, accountsJSON);
    
    // Đồng thời cập nhật key cũ để tương thích
    try {
      localStorage.setItem('hanet_accounts', accountsJSON);
    } catch (e) {
      console.warn('Không thể cập nhật key cũ:', e);
    }
    
    // Kiểm tra lại
    const saved = localStorage.getItem(ACCOUNTS_KEY);
    if (!saved) {
      throw new Error('Không thể lưu danh sách tài khoản');
    }
    
    return true;
  } catch (error) {
    console.error('Lỗi khi lưu danh sách tài khoản:', error);
    return false;
  }
};

/**
 * Lưu tài khoản mới
 */
export const saveAccount = (userInfo, oauthConfig) => {
  console.log('Đang lưu tài khoản mới (direct):', userInfo);
  
  if (!isStorageAvailable()) {
    console.error('Không thể lưu tài khoản vì localStorage không khả dụng');
    return false;
  }
  
  if (!userInfo || !userInfo.username) {
    console.error('Không thể lưu tài khoản thiếu thông tin username');
    return false;
  }
  
  try {
    // Lưu thông tin và cấu hình hiện tại
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));
    localStorage.setItem(CONFIG_KEY, JSON.stringify(oauthConfig));
    
    // Tạo ID tài khoản
    const accountId = userInfo.username;
    
    // Lấy danh sách tài khoản
    let accounts = getAccounts();
    if (!Array.isArray(accounts)) accounts = [];
    
    // Dữ liệu tài khoản
    const accountData = {
      id: accountId,
      name: userInfo.name || userInfo.username,
      email: userInfo.email,
      config: oauthConfig,
      userInfo: userInfo,
      lastUpdated: new Date().toISOString()
    };
    
    // Kiểm tra tài khoản đã tồn tại chưa
    const existingIndex = accounts.findIndex(acc => acc && acc.id === accountId);
    
    if (existingIndex >= 0) {
      // Cập nhật
      accounts[existingIndex] = accountData;
      console.log('Đã cập nhật tài khoản:', accountId);
    } else {
      // Thêm mới
      accounts.push(accountData);
      console.log('Đã thêm tài khoản mới:', accountId);
    }
    
    // Lưu danh sách
    const saveResult = saveAccountsList(accounts);
    if (!saveResult) {
      console.error('Không thể lưu danh sách tài khoản');
      return false;
    }
    
    // Đặt làm tài khoản hiện tại
    localStorage.setItem(CURRENT_ACCOUNT_KEY, accountId);
    // Cập nhật cả key cũ
    try {
      localStorage.setItem('hanet_current_account_id', accountId);
    } catch (e) {
      console.warn('Không thể cập nhật key cũ cho tài khoản hiện tại:', e);
    }
    
    return true;
  } catch (error) {
    console.error('Lỗi khi lưu tài khoản:', error);
    return false;
  }
};

/**
 * Đặt tài khoản hiện tại
 */
export const setCurrentAccount = (accountId) => {
  console.log('Đặt tài khoản hiện tại (direct):', accountId);
  
  if (!isStorageAvailable() || !accountId) {
    console.error('Không thể đặt tài khoản hiện tại');
    return false;
  }
  
  try {
    // Lấy danh sách tài khoản
    const accounts = getAccounts();
    if (!Array.isArray(accounts) || accounts.length === 0) {
      console.error('Danh sách tài khoản trống');
      return false;
    }
    
    // Tìm tài khoản cần đặt
    const account = accounts.find(acc => acc && acc.id === accountId);
    if (!account) {
      console.error('Không tìm thấy tài khoản:', accountId);
      return false;
    }
    
    // Đặt làm tài khoản hiện tại
    localStorage.setItem(CURRENT_ACCOUNT_KEY, accountId);
    // Cập nhật key cũ
    try {
      localStorage.setItem('hanet_current_account_id', accountId);
    } catch (e) {
      console.warn('Không thể cập nhật key cũ cho tài khoản hiện tại:', e);
    }
    
    // Cập nhật thông tin người dùng và cấu hình
    if (account.userInfo) {
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(account.userInfo));
    }
    
    if (account.config) {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(account.config));
    }
    
    console.log('Đã chuyển sang tài khoản:', account.name);
    return true;
  } catch (error) {
    console.error('Lỗi khi đặt tài khoản hiện tại:', error);
    return false;
  }
};

/**
 * Xóa tài khoản
 */
export const deleteAccount = (accountId) => {
  console.log('Xóa tài khoản (direct):', accountId);
  
  if (!isStorageAvailable() || !accountId) {
    console.error('Không thể xóa tài khoản');
    return false;
  }
  
  try {
    // Lấy danh sách tài khoản
    let accounts = getAccounts();
    if (!Array.isArray(accounts) || accounts.length === 0) {
      console.error('Danh sách tài khoản trống');
      return false;
    }
    
    // Lọc tài khoản cần xóa
    const oldLength = accounts.length;
    accounts = accounts.filter(acc => acc && acc.id !== accountId);
    
    if (accounts.length === oldLength) {
      console.error('Không tìm thấy tài khoản cần xóa');
      return false;
    }
    
    // Lưu lại danh sách
    const saveResult = saveAccountsList(accounts);
    if (!saveResult) {
      console.error('Không thể lưu danh sách sau khi xóa');
      return false;
    }
    
    // Nếu xóa tài khoản hiện tại
    const currentId = getCurrentAccountId();
    if (currentId === accountId) {
      if (accounts.length > 0) {
        // Chuyển sang tài khoản đầu tiên
        return setCurrentAccount(accounts[0].id);
      } else {
        // Xóa thông tin hiện tại
        localStorage.removeItem(CURRENT_ACCOUNT_KEY);
        localStorage.removeItem('hanet_current_account_id'); // key cũ
        localStorage.removeItem(USER_INFO_KEY);
        localStorage.removeItem(CONFIG_KEY);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Lỗi khi xóa tài khoản:', error);
    return false;
  }
}; 