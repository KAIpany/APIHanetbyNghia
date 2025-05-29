// Các khóa localStorage
const ACCOUNTS_KEY = 'hanet_accounts';
const CURRENT_ACCOUNT_KEY = 'hanet_current_account_id';
const USER_INFO_KEY = 'user_info'; 
const CONFIG_KEY = 'hanet_oauth_config';

// Kiểm tra localStorage có hoạt động không
const isLocalStorageAvailable = () => {
  const test = 'test';
  try {
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    console.error('localStorage không khả dụng:', e);
    return false;
  }
};

// Lấy danh sách tài khoản
export const getAccounts = () => {
  if (!isLocalStorageAvailable()) {
    console.error('Không thể lấy danh sách tài khoản vì localStorage không khả dụng');
    return [];
  }

  try {
    const accounts = localStorage.getItem(ACCOUNTS_KEY);
    console.log('Raw accounts data:', accounts);
    return accounts ? JSON.parse(accounts) : [];
  } catch (error) {
    console.error('Lỗi khi lấy danh sách tài khoản:', error);
    return [];
  }
};

// Lấy ID tài khoản hiện tại
export const getCurrentAccountId = () => {
  if (!isLocalStorageAvailable()) {
    console.error('Không thể lấy ID tài khoản hiện tại vì localStorage không khả dụng');
    return null;
  }

  const id = localStorage.getItem(CURRENT_ACCOUNT_KEY);
  console.log('Current account ID:', id);
  return id;
};

// Lấy thông tin tài khoản hiện tại
export const getCurrentAccount = () => {
  const accountId = getCurrentAccountId();
  if (!accountId) {
    console.log('Không có tài khoản hiện tại');
    return null;
  }
  
  const accounts = getAccounts();
  const account = accounts.find(acc => acc.id === accountId);
  console.log('Current account data:', account);
  return account || null;
};

// Lưu danh sách tài khoản an toàn
const saveAccountsList = (accounts) => {
  if (!isLocalStorageAvailable()) {
    console.error('Không thể lưu danh sách tài khoản vì localStorage không khả dụng');
    return false;
  }

  try {
    const accountsJSON = JSON.stringify(accounts);
    console.log('Saving accounts to localStorage:', accountsJSON);
    
    // Thử xóa trước để tránh lỗi quota
    localStorage.removeItem(ACCOUNTS_KEY);
    localStorage.setItem(ACCOUNTS_KEY, accountsJSON);
    
    // Kiểm tra xem đã lưu thành công chưa
    const savedData = localStorage.getItem(ACCOUNTS_KEY);
    if (!savedData) {
      throw new Error('Dữ liệu không được lưu');
    }
    return true;
  } catch (error) {
    console.error('Lỗi khi lưu danh sách tài khoản:', error);
    // Thử lưu lại với dữ liệu tối thiểu khi thất bại
    try {
      const minimalAccounts = accounts.map(acc => ({
        id: acc.id,
        name: acc.name,
        lastUpdated: acc.lastUpdated
      }));
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(minimalAccounts));
      console.log('Đã lưu danh sách tài khoản tối thiểu');
    } catch (e) {
      console.error('Không thể lưu ngay cả dữ liệu tối thiểu:', e);
    }
    return false;
  }
};

// Lưu tài khoản mới
export const saveAccount = (userInfo, oauthConfig) => {
  if (!isLocalStorageAvailable()) {
    console.error('Không thể lưu tài khoản vì localStorage không khả dụng');
    return false;
  }
  
  if (!userInfo || !userInfo.username) {
    console.error('Không thể lưu tài khoản thiếu thông tin');
    return false;
  }
  
  console.log('Saving account with userInfo:', userInfo);
  
  const accountId = userInfo.username;
  const accounts = getAccounts();
  
  // Kiểm tra xem tài khoản đã tồn tại chưa
  const existingIndex = accounts.findIndex(acc => acc.id === accountId);
  
  const accountData = {
    id: accountId,
    name: userInfo.name || userInfo.username,
    email: userInfo.email,
    config: oauthConfig,
    userInfo: userInfo,
    lastUpdated: new Date().toISOString()
  };
  
  if (existingIndex >= 0) {
    // Cập nhật tài khoản hiện có
    accounts[existingIndex] = accountData;
    console.log('Đã cập nhật tài khoản:', accountData);
  } else {
    // Thêm tài khoản mới
    accounts.push(accountData);
    console.log('Đã thêm tài khoản mới:', accountData);
  }
  
  try {
    // Lưu thông tin user hiện tại trước
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));
    // Lưu cấu hình OAuth
    localStorage.setItem(CONFIG_KEY, JSON.stringify(oauthConfig));
    
    // Lưu danh sách tài khoản
    const saveListResult = saveAccountsList(accounts);
    if (!saveListResult) {
      console.warn('Không thể lưu danh sách tài khoản, nhưng đã lưu thông tin người dùng hiện tại');
    }
    
    // Đặt làm tài khoản hiện tại
    localStorage.setItem(CURRENT_ACCOUNT_KEY, accountId);
    console.log('Đã đặt tài khoản hiện tại:', accountId);
    
    return true;
  } catch (error) {
    console.error('Lỗi khi lưu tài khoản:', error);
    return false;
  }
};

// Đặt tài khoản hiện tại
export const setCurrentAccount = (accountId) => {
  if (!isLocalStorageAvailable()) {
    console.error('Không thể đặt tài khoản hiện tại vì localStorage không khả dụng');
    return false;
  }
  
  const accounts = getAccounts();
  const account = accounts.find(acc => acc.id === accountId);
  
  if (!account) {
    console.error('Không tìm thấy tài khoản:', accountId);
    return false;
  }
  
  try {
    // Lưu ID tài khoản hiện tại
    localStorage.setItem(CURRENT_ACCOUNT_KEY, accountId);
    
    // Cập nhật thông tin user_info và cấu hình OAuth hiện tại
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

// Xóa tài khoản
export const deleteAccount = (accountId) => {
  if (!isLocalStorageAvailable()) {
    console.error('Không thể xóa tài khoản vì localStorage không khả dụng');
    return false;
  }
  
  let accounts = getAccounts();
  const initialLength = accounts.length;
  
  accounts = accounts.filter(acc => acc.id !== accountId);
  
  if (accounts.length === initialLength) {
    console.error('Không tìm thấy tài khoản để xóa:', accountId);
    return false;
  }
  
  try {
    // Lưu lại danh sách tài khoản đã cập nhật
    const saveResult = saveAccountsList(accounts);
    if (!saveResult) {
      console.error('Không thể lưu danh sách tài khoản sau khi xóa');
      return false;
    }
    
    // Nếu xóa tài khoản hiện tại, chuyển sang tài khoản đầu tiên (nếu có)
    const currentId = getCurrentAccountId();
    if (currentId === accountId) {
      if (accounts.length > 0) {
        setCurrentAccount(accounts[0].id);
      } else {
        // Xóa thông tin hiện tại nếu không còn tài khoản nào
        localStorage.removeItem(CURRENT_ACCOUNT_KEY);
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