import React, { useState, useEffect, useCallback, useRef } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import apiService from "./apiService";
import OAuthConfig from "./OAuthConfig";
import OAuthCallback from "./OAuthCallback";
import { getAccounts, getCurrentAccount, setCurrentAccount, deleteAccount } from "./directAccountManager";
import "./App.css";

// Thêm một trang Debug để xem thông tin localStorage
const DebugPage = () => {
  const [storageItems, setStorageItems] = useState({});
  const [cookiesInfo, setCookiesInfo] = useState('');
  const [browserInfo, setBrowserInfo] = useState('');
  const [accountsInfo, setAccountsInfo] = useState(null);
  
  useEffect(() => {
    // Lấy tất cả các mục từ localStorage
    const items = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        try {
          const value = localStorage.getItem(key);
          items[key] = {
            raw: value,
            parsed: JSON.parse(value)
          };
        } catch (e) {
          items[key] = {
            raw: localStorage.getItem(key),
            error: 'Không thể parse JSON'
          };
        }
      }
    } catch (e) {
      console.error('Lỗi khi lấy từ localStorage:', e);
      items['localStorage_error'] = {
        raw: e.toString(),
        error: 'Không thể truy cập localStorage'
      };
    }
    setStorageItems(items);
    
    // Phân tích thông tin tài khoản
    try {
      const oldAccounts = localStorage.getItem('hanet_accounts');
      const newAccounts = localStorage.getItem('hanet_accounts_v2');
      const oldCurrentId = localStorage.getItem('hanet_current_account_id');
      const newCurrentId = localStorage.getItem('hanet_current_account_id_v2');
      
      setAccountsInfo({
        oldAccounts: oldAccounts ? JSON.parse(oldAccounts) : null,
        newAccounts: newAccounts ? JSON.parse(newAccounts) : null,
        oldCurrentId,
        newCurrentId
      });
    } catch (e) {
      console.error('Lỗi khi phân tích thông tin tài khoản:', e);
    }
    
    // Lấy thông tin cookies
    setCookiesInfo(document.cookie || 'Không có cookies');
    
    // Lấy thông tin trình duyệt
    const info = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled,
      localStorage: typeof localStorage !== 'undefined',
      origin: window.location.origin,
      href: window.location.href
    };
    setBrowserInfo(JSON.stringify(info, null, 2));
  }, []);
  
  const clearAllStorage = () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa tất cả dữ liệu localStorage?')) {
      try {
        localStorage.clear();
        window.location.reload();
      } catch (e) {
        alert('Lỗi khi xóa localStorage: ' + e.toString());
      }
    }
  };
  
  const clearAllCookies = () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa tất cả cookies?')) {
      try {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
          const cookie = cookies[i];
          const eqPos = cookie.indexOf('=');
          const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
          document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
        }
        alert('Đã xóa tất cả cookies');
        window.location.reload();
      } catch (e) {
        alert('Lỗi khi xóa cookies: ' + e.toString());
      }
    }
  };
  
  const removeItem = (key) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa "${key}"?`)) {
      try {
        localStorage.removeItem(key);
        window.location.reload();
      } catch (e) {
        alert('Lỗi khi xóa item: ' + e.toString());
      }
    }
  };
  
  const testLocalStorage = () => {
    try {
      const testKey = '_test_' + Date.now();
      localStorage.setItem(testKey, 'test');
      const value = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);
      alert('Kiểm tra localStorage: ' + (value === 'test' ? 'THÀNH CÔNG' : 'THẤT BẠI'));
    } catch (e) {
      alert('Lỗi khi kiểm tra localStorage: ' + e.toString());
    }
  };
  
  const migrateAccounts = () => {
    try {
      // Di chuyển từ key cũ sang key mới
      const oldAccounts = localStorage.getItem('hanet_accounts');
      if (oldAccounts) {
        localStorage.setItem('hanet_accounts_v2', oldAccounts);
        
        const oldCurrentId = localStorage.getItem('hanet_current_account_id');
        if (oldCurrentId) {
          localStorage.setItem('hanet_current_account_id_v2', oldCurrentId);
        }
        
        alert('Đã di chuyển dữ liệu tài khoản từ key cũ sang key mới');
        window.location.reload();
      } else {
        alert('Không có dữ liệu tài khoản ở key cũ để di chuyển');
      }
    } catch (e) {
      alert('Lỗi khi di chuyển dữ liệu: ' + e.toString());
    }
  };
  
  return (
    <div className="debug-container">
      <div className="debug-header">
        <h1>Trang Debug</h1>
        <div className="debug-actions">
          <Link to="/" className="back-button">Quay lại ứng dụng</Link>
          <button onClick={clearAllStorage} className="clear-button">Xóa tất cả localStorage</button>
          <button onClick={clearAllCookies} className="clear-button danger">Xóa tất cả cookies</button>
          <button onClick={testLocalStorage} className="test-button">Kiểm tra localStorage</button>
          <button onClick={migrateAccounts} className="migrate-button">Di chuyển tài khoản</button>
        </div>
      </div>
      
      {accountsInfo && (
        <div className="debug-section accounts-summary">
          <h2>Thông tin tài khoản</h2>
          <div className="accounts-info">
            <div className="account-column">
              <h3>Key cũ (hanet_accounts)</h3>
              {accountsInfo.oldAccounts ? (
                <>
                  <p>Số lượng: {accountsInfo.oldAccounts.length}</p>
                  <p>ID hiện tại: {accountsInfo.oldCurrentId || 'Không có'}</p>
                  <pre className="accounts-data">{JSON.stringify(accountsInfo.oldAccounts, null, 2)}</pre>
                </>
              ) : (
                <p>Không có dữ liệu</p>
              )}
            </div>
            <div className="account-column">
              <h3>Key mới (hanet_accounts_v2)</h3>
              {accountsInfo.newAccounts ? (
                <>
                  <p>Số lượng: {accountsInfo.newAccounts.length}</p>
                  <p>ID hiện tại: {accountsInfo.newCurrentId || 'Không có'}</p>
                  <pre className="accounts-data">{JSON.stringify(accountsInfo.newAccounts, null, 2)}</pre>
                </>
              ) : (
                <p>Không có dữ liệu</p>
              )}
            </div>
          </div>
        </div>
      )}
      
      <div className="debug-section">
        <h2>Thông tin trình duyệt</h2>
        <pre className="info-value">{browserInfo}</pre>
      </div>
      
      <div className="debug-section">
        <h2>Cookies</h2>
        <pre className="info-value">{cookiesInfo}</pre>
      </div>
      
      <div className="debug-section">
        <h2>Nội dung localStorage</h2>
        {Object.keys(storageItems).length === 0 ? (
          <div className="no-items">Không có dữ liệu</div>
        ) : (
          Object.keys(storageItems).map(key => (
            <div key={key} className="storage-item">
              <div className="item-header">
                <h3>{key}</h3>
                <button onClick={() => removeItem(key)} className="remove-button">Xóa</button>
              </div>
              <h4>Giá trị gốc:</h4>
              <pre className="item-value">{storageItems[key].raw}</pre>
              
              {storageItems[key].error ? (
                <p className="parse-error">{storageItems[key].error}</p>
              ) : (
                <>
                  <h4>Giá trị đã parse:</h4>
                  <pre className="item-value">{JSON.stringify(storageItems[key].parsed, null, 2)}</pre>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const CheckInApp = () => {
  // State declarations
  const [formData, setFormData] = useState({
    placeId: "",
    deviceId: "",
    fromDateTime: "",
    toDateTime: "",
  });

  const [places, setPlaces] = useState([]);
  const [devices, setDevices] = useState([]);
  const [isPlacesLoading, setIsPlacesLoading] = useState(false);
  const [isDevicesLoading, setIsDevicesLoading] = useState(false);
  const [placeError, setPlaceError] = useState(null);
  const [deviceError, setDeviceError] = useState(null);
  const [authStatus, setAuthStatus] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [resultsData, setResultsData] = useState(null);
  const [queryString, setQueryString] = useState(null);
  const [oauthConfigs, setOauthConfigs] = useState([]);
  const [activeOauthConfig, setActiveOauthConfig] = useState('');
  
  const accountMenuRef = useRef(null);

  useEffect(() => {
    checkAuthStatus();
    loadOAuthConfigs();
    loadUserInfo();
    fetchPlaces();
  }, []);

  // Đóng menu tài khoản khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setShowAccountMenu(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Kiểm tra trạng thái xác thực
  const checkAuthStatus = async (forceRefresh = false) => {
    try {
      // Lấy khóa cấu hình OAuth hiện tại
      const currentOAuthConfigKey = localStorage.getItem('hanet_current_oauth_config_key') || 'hanet_oauth_config';
      console.log('Khóa cấu hình OAuth hiện tại:', currentOAuthConfigKey);
      
      // Sử dụng apiService để kiểm tra trạng thái
      const authResult = await apiService.checkAuthStatus(forceRefresh);
      
      if (authResult) {
        setAuthStatus(authResult.status);
        
        // Nếu không được xác thực và yêu cầu làm mới, thử làm mới
        if (authResult.status !== 'authenticated' && forceRefresh) {
          console.log('Thử tự động làm mới xác thực...');
          const refreshed = await apiService.refreshAuthentication();
          if (refreshed) {
            // Nếu làm mới thành công, cập nhật trạng thái
            console.log('Làm mới xác thực thành công');
            setAuthStatus('authenticated');
          } else {
            console.log('Làm mới xác thực không thành công');
          }
        }
      }
    } catch (error) {
      console.error("Lỗi kiểm tra trạng thái xác thực:", error);
    }
  };

  // Thêm timer để kiểm tra trạng thái xác thực định kỳ
  useEffect(() => {
    // Kiểm tra lần đầu và thử làm mới nếu cần
    checkAuthStatus(true);
    
    // Kiểm tra định kỳ mỗi 2 phút
    const interval = setInterval(() => {
      checkAuthStatus(true);
    }, 2 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Lưu ID tài khoản hiện tại vào storage
  const saveCurrentAccountId = (accountId) => {
    const CURRENT_ACCOUNT_KEYS = [
      'hanet_current_account_direct',
      'hanet_current_account_id_v2',
      'hanet_current_account_id'
    ];
    
    // Lưu vào cả localStorage và sessionStorage
    try {
      // Lưu vào localStorage trước
      for (const key of CURRENT_ACCOUNT_KEYS) {
        localStorage.setItem(key, accountId);
      }
      console.log('Đã lưu ID tài khoản hiện tại vào localStorage:', accountId);
      return true;
    } catch (error) {
      console.error('Lỗi khi lưu vào localStorage:', error);
      
      // Thử lưu vào sessionStorage nếu localStorage thất bại
      try {
        for (const key of CURRENT_ACCOUNT_KEYS) {
          sessionStorage.setItem(key, accountId);
        }
        console.log('Đã lưu ID tài khoản hiện tại vào sessionStorage:', accountId);
        return true;
      } catch (error) {
        console.error('Lỗi khi lưu vào sessionStorage:', error);
        return false;
      }
    }
  };

  // Load OAuth configs from localStorage
  const loadOAuthConfigs = () => {
    try {
      const CONFIGS_LIST_KEY = 'hanet_oauth_configs_list';
      const ACTIVE_CONFIG_KEY = 'hanet_oauth_active_config';
      const CONFIG_PREFIX = 'hanet_oauth_config_';
      
      // Get list of configs
      const configsList = localStorage.getItem(CONFIGS_LIST_KEY);
      let configNames = [];
      if (configsList) {
        try {
          configNames = JSON.parse(configsList);
          console.log('Đã tải danh sách cấu hình OAuth:', configNames);
          
          // Get active config
          const activeConfig = localStorage.getItem(ACTIVE_CONFIG_KEY) || '';
          setActiveOauthConfig(activeConfig);
          
          // Set configs to state
          setOauthConfigs(configNames);
        } catch (error) {
          console.error('Lỗi khi đọc danh sách cấu hình OAuth từ local storage:', error);
        }
      }
    } catch (error) {
      console.error('Lỗi khi tải cấu hình OAuth:', error);
    }
  };
  
  // Handle OAuth config selection
  const handleOAuthConfigSelect = (configName) => {
    try {
      const CONFIG_PREFIX = 'hanet_oauth_config_';
      const ACTIVE_CONFIG_KEY = 'hanet_oauth_active_config';
      
      console.log(`Chuyển sang cấu hình OAuth: ${configName}`);
      
      // Set as active config
      localStorage.setItem(ACTIVE_CONFIG_KEY, configName);
      setActiveOauthConfig(configName);
      
      // Load the config data
      const savedConfig = localStorage.getItem(CONFIG_PREFIX + configName);
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        
        // Set the OAuth config to localStorage for compatibility
        localStorage.setItem('hanet_oauth_config', JSON.stringify(parsedConfig));
        
        // Update the server with this config
        fetch(`${process.env.REACT_APP_API_URL}/api/oauth/config`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(parsedConfig)
        }).then(response => {
          console.log('Đã cập nhật cấu hình lên server');
          
          // Check auth status
          checkAuthStatus();
          
          // Close menu
          setShowAccountMenu(false);
          
          // Reload to apply changes
          window.location.reload();
        }).catch(error => {
          console.error('Lỗi khi cập nhật cấu hình lên server:', error);
          alert('Đã chuyển đổi cấu hình nhưng không cập nhật được lên server');
          
          // Still close menu and reload
          setShowAccountMenu(false);
          window.location.reload();
        });
      }
    } catch (error) {
      console.error('Lỗi khi chuyển đổi cấu hình OAuth:', error);
      alert('Không thể chuyển đổi cấu hình: ' + error.message);
    }
  };

  // Xử lý khi chọn tài khoản
  const handleAccountSelect = (account) => {
    console.log('Chọn tài khoản:', account);
    
    try {
      // Lưu thông tin người dùng
      if (account.userInfo) {
        console.log('Lưu thông tin người dùng:', account.userInfo);
        localStorage.setItem('user_info', JSON.stringify(account.userInfo));
        setUserInfo(account.userInfo);
      }
      
      // Sử dụng khóa cấu hình OAuth của tài khoản nếu có
      if (account.oauthConfigKey) {
        console.log('Sử dụng khóa cấu hình OAuth:', account.oauthConfigKey);
        localStorage.setItem('hanet_current_oauth_config_key', account.oauthConfigKey);
      } else if (account.oauthConfig) {
        // Tài khoản cũ chưa có oauthConfigKey, tạo khóa mới và lưu riêng
        const appName = account.appName || '';
        const oauthConfigKey = appName 
          ? `hanet_oauth_config_${appName.toLowerCase().replace(/[^a-z0-9]/g, '_')}` 
          : 'hanet_oauth_config';
        
        console.log('Tạo khóa cấu hình OAuth mới:', oauthConfigKey);
        localStorage.setItem(oauthConfigKey, JSON.stringify(account.oauthConfig));
        localStorage.setItem('hanet_current_oauth_config_key', oauthConfigKey);
        
        // Cập nhật tài khoản trong danh sách
        const updatedAccount = {
          ...account,
          oauthConfigKey: oauthConfigKey
        };
        
        const accountsList = [...accounts];
        const accountIndex = accountsList.findIndex(acc => acc.id === account.id);
        if (accountIndex >= 0) {
          accountsList[accountIndex] = updatedAccount;
          
          // Lưu danh sách tài khoản đã cập nhật
          const accountsJSON = JSON.stringify(accountsList);
          localStorage.setItem('hanet_accounts_direct', accountsJSON);
          localStorage.setItem('hanet_accounts_v2', accountsJSON);
          localStorage.setItem('hanet_accounts', accountsJSON);
          
          console.log('Đã cập nhật danh sách tài khoản với khóa OAuth mới');
        }
      }
      
      // Lưu ID tài khoản hiện tại
      console.log('Đặt tài khoản hiện tại:', account.id);
      localStorage.setItem('hanet_current_account_direct', account.id);
      localStorage.setItem('hanet_current_account_id_v2', account.id);
      localStorage.setItem('hanet_current_account_id', account.id);
      
      // Đóng menu tài khoản
      setShowAccountMenu(false);
      
      // Chuyển hướng để làm mới trang
      window.location.reload();
    } catch (error) {
      console.error('Lỗi khi chuyển đổi tài khoản:', error);
      alert('Không thể chuyển đổi tài khoản: ' + error.message);
    }
  };

  // Xử lý xóa tài khoản
  const handleDeleteAccount = (accountId) => {
    console.log('Xóa tài khoản:', accountId);
    
    try {
      // Lấy danh sách tài khoản từ localStorage
      const rawAccounts = localStorage.getItem('hanet_accounts_direct') || 
                         localStorage.getItem('hanet_accounts_v2') || 
                         localStorage.getItem('hanet_accounts');
      
      if (!rawAccounts) {
        console.error('Không tìm thấy danh sách tài khoản');
        return;
      }
      
      let accounts = JSON.parse(rawAccounts);
      if (!Array.isArray(accounts)) {
        console.error('Dữ liệu tài khoản không phải mảng:', accounts);
        accounts = [];
      }
      
      // Lọc bỏ tài khoản cần xóa
      const updatedAccounts = accounts.filter(acc => acc && acc.id !== accountId);
      console.log('Danh sách tài khoản sau khi xóa:', updatedAccounts);
      
      // Cập nhật state
      setAccounts(updatedAccounts);
      
      // Lưu danh sách tài khoản đã cập nhật
      const accountsJSON = JSON.stringify(updatedAccounts);
      localStorage.setItem('hanet_accounts_direct', accountsJSON);
      localStorage.setItem('hanet_accounts_v2', accountsJSON);
      localStorage.setItem('hanet_accounts', accountsJSON);
      
      // Kiểm tra nếu đang xóa tài khoản hiện tại
      const currentId = localStorage.getItem('hanet_current_account_direct') || 
                       localStorage.getItem('hanet_current_account_id_v2') || 
                       localStorage.getItem('hanet_current_account_id');
      
      if (currentId === accountId) {
        console.log('Đang xóa tài khoản hiện tại');
        
        // Nếu còn tài khoản khác, chuyển sang tài khoản đó
        if (updatedAccounts.length > 0) {
          console.log('Chuyển sang tài khoản khác:', updatedAccounts[0]);
          handleAccountSelect(updatedAccounts[0]);
        } else {
          // Không còn tài khoản nào, xóa thông tin người dùng
          console.log('Không còn tài khoản nào, xóa thông tin người dùng');
          localStorage.removeItem('user_info');
          localStorage.removeItem('hanet_current_account_direct');
          localStorage.removeItem('hanet_current_account_id_v2');
          localStorage.removeItem('hanet_current_account_id');
          
          setUserInfo(null);
          window.location.reload();
        }
      }
    } catch (error) {
      console.error('Lỗi khi xóa tài khoản:', error);
      alert('Không thể xóa tài khoản: ' + error.message);
    }
  };

  // Load places
  const fetchPlaces = useCallback(async () => {
    setIsPlacesLoading(true);
    setPlaceError(null);
    try {
      console.log('Fetching places...');
      const places = await apiService.getPlaces();
      console.log('Received places:', places);
      
      if (Array.isArray(places)) {
        setPlaces(places);
      } else {
        console.error('Invalid places data:', places);
        throw new Error("Dữ liệu địa điểm trả về không hợp lệ");
      }
    } catch (err) {
      console.error('Error fetching places:', err);
      setPlaceError(err.message || "Lỗi khi tải địa điểm.");
      setPlaces([]);
    } finally {
      setIsPlacesLoading(false);
    }
  }, []);

  // Device management
  const fetchDevices = useCallback(async (selectedPlaceId) => {
    if (!selectedPlaceId) {
      setDevices([]);
      setDeviceError(null);
      return;
    }
    
    setIsDevicesLoading(true);
    setDeviceError(null);
    try {
      const deviceResponse = await apiService.getDevices(selectedPlaceId);
      
      if (deviceResponse.success && Array.isArray(deviceResponse.data)) {
        const sortedDevices = [...deviceResponse.data].sort((a, b) => 
          (a.deviceName || '').localeCompare(b.deviceName || '')
        );
        setDevices(sortedDevices);
      } else {
        throw new Error(deviceResponse.message || 'Dữ liệu thiết bị không hợp lệ');
      }
    } catch (err) {
      console.error('Error fetching devices:', err);
      setDeviceError(err.message);
      setDevices([]);
      
      if (err.message.includes('xác thực')) {
        try {
          const refreshed = await apiService.refreshAuthentication();
          if (refreshed) {
            const retryResponse = await apiService.getDevices(selectedPlaceId);
            if (retryResponse.success && Array.isArray(retryResponse.data)) {
              const sortedDevices = [...retryResponse.data].sort((a, b) => 
                (a.deviceName || '').localeCompare(b.deviceName || '')
              );
              setDevices(sortedDevices);
              setDeviceError(null);
            }
          }
        } catch (refreshError) {
          setDeviceError('Không thể làm mới xác thực: ' + refreshError.message);
        }
      }
    } finally {
      setIsDevicesLoading(false);
    }
  }, []);

  // Load devices when place changes
  useEffect(() => {
    if (formData.placeId) {
      fetchDevices(formData.placeId);
    } else {
      setDevices([]);
      setDeviceError(null);
    }
  }, [formData.placeId, fetchDevices]);

  // Handle place selection
  const handlePlaceChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      deviceId: "" // Reset device selection
    }));
    
    // Reset device-related states
    setDevices([]);
    setDeviceError(null);
    
    // Load devices if a place is selected
    if (value) {
      fetchDevices(value);
    }
  }, [fetchDevices]);

  // Handle device selection
  const handleDeviceChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);
    setResultsData(null);
    setQueryString(null);
    
    const {
      placeId,
      deviceId,
      fromDateTime,
      toDateTime,
    } = formData;

    if (!placeId) {
      setSubmitError("Vui lòng chọn địa điểm.");
      setIsSubmitting(false);
      return;
    }

    if (!fromDateTime || !toDateTime) {
      setSubmitError("Vui lòng chọn thời gian bắt đầu và kết thúc.");
      setIsSubmitting(false);
      return;
    }

    const fromDate = new Date(fromDateTime);
    const toDate = new Date(toDateTime);

    if (fromDate > toDate) {
      setSubmitError("Thời gian bắt đầu không được lớn hơn thời gian kết thúc.");
      setIsSubmitting(false);
      return;
    }

    try {
      const fromTimestamp = fromDate.getTime();
      const toTimestamp = toDate.getTime();

      let queryParams = `placeId=${placeId}&dateFrom=${fromTimestamp}&dateTo=${toTimestamp}`;
      if (deviceId) {
        queryParams += `&devices=${deviceId}`;
      }
      setQueryString(queryParams);

      // Sử dụng apiService để lấy dữ liệu check-in với tự động làm mới xác thực
      const result = await apiService.getCheckins(placeId, fromDateTime, toDateTime, deviceId);

      if (Array.isArray(result)) {
        if (result.length === 0) {
          setSuccessMessage("Không có dữ liệu check-in trong khoảng thời gian đã chọn.");
        } else {
          setSuccessMessage(
            `Đã tìm thấy ${result.length} bản ghi check-in.`
          );
        }
        setResultsData(result);
      } else {
        throw new Error("Dữ liệu check-in trả về không hợp lệ.");
      }
    } catch (err) {
      // Kiểm tra nếu lỗi liên quan đến xác thực
      if (err.message && err.message.includes('xác thực')) {
        setSubmitError(`Lỗi xác thực: ${err.message}. Hệ thống đã thử tự động làm mới token nhưng không thành công. Vui lòng vào trang cấu hình API để xác thực lại.`);
      } else {
        setSubmitError(err.message || "Lỗi khi tải dữ liệu check-in.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Tạo tài khoản từ cấu hình OAuth (khi không có user_info)
  const createAccountFromOAuthConfig = () => {
    console.log('Thử tạo tài khoản từ cấu hình OAuth');
    
    try {
      // Lấy khóa cấu hình OAuth hiện tại
      const currentOAuthConfigKey = localStorage.getItem('hanet_current_oauth_config_key') || 'hanet_oauth_config';
      
      // Lấy cấu hình OAuth
      const oauthConfigRaw = localStorage.getItem(currentOAuthConfigKey);
      if (!oauthConfigRaw) {
        console.error('Không có cấu hình OAuth để tạo tài khoản');
        return false;
      }
      
      const oauthConfig = JSON.parse(oauthConfigRaw);
      console.log('Đã đọc cấu hình OAuth:', oauthConfig);
      
      // Lấy tên ứng dụng
      const appName = oauthConfig.appName || '';
      
      // Tạo ID tài khoản từ thông tin có sẵn
      let accountId = 'hanet_user_' + new Date().getTime();
      // Thêm tên ứng dụng vào ID nếu có
      if (appName) {
        const appNameSlug = appName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        accountId = `hanet_user_${appNameSlug}_${new Date().getTime()}`;
      }
      
      // Tạo khóa cấu hình OAuth cho tài khoản này
      const oauthConfigKey = appName 
        ? `hanet_oauth_config_${appName.toLowerCase().replace(/[^a-z0-9]/g, '_')}` 
        : 'hanet_oauth_config';
      
      // Tạo tài khoản mới
      const newAccount = {
        id: accountId,
        name: appName || 'Người dùng Hanet',
        appName: appName,
        oauthConfigKey: oauthConfigKey,
        createdAt: new Date().toISOString(),
        oauthConfig: oauthConfig
      };
      
      console.log('Tạo tài khoản mới:', newAccount);
      
      // Lấy danh sách tài khoản hiện tại
      let accounts = [];
      const rawAccounts = localStorage.getItem('hanet_accounts_direct') || 
                         localStorage.getItem('hanet_accounts_v2') || 
                         localStorage.getItem('hanet_accounts');
      
      if (rawAccounts) {
        try {
          accounts = JSON.parse(rawAccounts);
          if (!Array.isArray(accounts)) {
            console.log('Dữ liệu tài khoản không phải mảng, khởi tạo mới');
            accounts = [];
          }
        } catch (e) {
          console.error('Lỗi khi phân tích dữ liệu tài khoản:', e);
          accounts = [];
        }
      }
      
      // Thêm tài khoản mới
      accounts.push(newAccount);
      
      // Lưu danh sách tài khoản
      const accountsJSON = JSON.stringify(accounts);
      localStorage.setItem('hanet_accounts_direct', accountsJSON);
      localStorage.setItem('hanet_accounts_v2', accountsJSON);
      localStorage.setItem('hanet_accounts', accountsJSON);
      
      // Lưu ID tài khoản hiện tại
      localStorage.setItem('hanet_current_account_direct', accountId);
      localStorage.setItem('hanet_current_account_id_v2', accountId);
      localStorage.setItem('hanet_current_account_id', accountId);
      
      // Lưu khóa cấu hình OAuth hiện tại
      localStorage.setItem('hanet_current_oauth_config_key', oauthConfigKey);
      
      // Tạo user_info đơn giản
      const simpleUserInfo = {
        username: accountId,
        name: appName || 'Người dùng Hanet'
      };
      
      // Lưu user_info
      localStorage.setItem('user_info', JSON.stringify(simpleUserInfo));
      
      // Cập nhật state
      setUserInfo(simpleUserInfo);
      setAccounts(accounts);
      
      console.log('Đã hoàn thành việc tạo tài khoản từ cấu hình OAuth');
      return true;
    } catch (error) {
      console.error('Lỗi khi tạo tài khoản từ cấu hình OAuth:', error);
      return false;
    }
  };

  // Tạo tài khoản từ thông tin người dùng hiện tại
  const createAccountFromUserInfo = () => {
    console.log('Tạo tài khoản từ thông tin người dùng hiện tại');
    
    try {
      // Lấy thông tin người dùng
      const userInfoRaw = localStorage.getItem('user_info');
      if (!userInfoRaw) {
        console.log('Không có thông tin người dùng để tạo tài khoản');
        return false;
      }
      
      const userInfo = JSON.parse(userInfoRaw);
      console.log('Đã đọc thông tin người dùng:', userInfo);
      
      if (!userInfo || !userInfo.username) {
        console.log('Thông tin người dùng không hợp lệ');
        return false;
      }
      
      // Lấy khóa cấu hình OAuth hiện tại và cấu hình
      const currentOAuthConfigKey = localStorage.getItem('hanet_current_oauth_config_key') || 'hanet_oauth_config';
      const oauthConfigRaw = localStorage.getItem(currentOAuthConfigKey);
      const oauthConfig = oauthConfigRaw ? JSON.parse(oauthConfigRaw) : null;
      console.log('Đã đọc cấu hình OAuth từ khóa:', currentOAuthConfigKey, oauthConfig);
      
      // Lấy tên ứng dụng
      const appName = oauthConfig ? oauthConfig.appName || '' : '';
      
      // Tạo ID tài khoản 
      let accountId = userInfo.username;
      // Thêm tên ứng dụng vào ID nếu có
      if (appName) {
        const appNameSlug = appName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        accountId = `${userInfo.username}_${appNameSlug}`;
      }
      
      // Tạo khóa cấu hình OAuth cho tài khoản này
      const oauthConfigKey = appName 
        ? `hanet_oauth_config_${appName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
        : currentOAuthConfigKey;
      
      // Tạo tài khoản mới
      const newAccount = {
        id: accountId,
        name: userInfo.name || userInfo.username,
        userInfo: userInfo,
        oauthConfig: oauthConfig,
        appName: appName,
        oauthConfigKey: oauthConfigKey,
        createdAt: new Date().toISOString()
      };
      
      console.log('Tài khoản mới:', newAccount);
      
      // Lấy danh sách tài khoản hiện tại
      let accounts = [];
      const rawAccounts = localStorage.getItem('hanet_accounts_direct') || 
                         localStorage.getItem('hanet_accounts_v2') || 
                         localStorage.getItem('hanet_accounts');
      
      if (rawAccounts) {
        try {
          accounts = JSON.parse(rawAccounts);
          if (!Array.isArray(accounts)) {
            console.log('Dữ liệu tài khoản không phải mảng, khởi tạo mới');
            accounts = [];
          }
        } catch (e) {
          console.error('Lỗi khi phân tích dữ liệu tài khoản:', e);
          accounts = [];
        }
      }
      
      // Kiểm tra xem tài khoản đã tồn tại chưa
      const existingIndex = accounts.findIndex(acc => acc && acc.id === newAccount.id);
      
      if (existingIndex >= 0) {
        console.log('Cập nhật tài khoản đã tồn tại');
        accounts[existingIndex] = {
          ...accounts[existingIndex],
          userInfo: newAccount.userInfo,
          oauthConfig: newAccount.oauthConfig,
          appName: newAccount.appName,
          oauthConfigKey: oauthConfigKey,
          updatedAt: new Date().toISOString()
        };
      } else {
        console.log('Thêm tài khoản mới');
        accounts.push(newAccount);
      }
      
      // Lưu danh sách tài khoản
      const accountsJSON = JSON.stringify(accounts);
      localStorage.setItem('hanet_accounts_direct', accountsJSON);
      localStorage.setItem('hanet_accounts_v2', accountsJSON);
      localStorage.setItem('hanet_accounts', accountsJSON);
      
      // Lưu ID tài khoản hiện tại
      localStorage.setItem('hanet_current_account_direct', newAccount.id);
      localStorage.setItem('hanet_current_account_id_v2', newAccount.id);
      localStorage.setItem('hanet_current_account_id', newAccount.id);
      
      // Lưu khóa cấu hình OAuth hiện tại
      localStorage.setItem('hanet_current_oauth_config_key', oauthConfigKey);
      
      // Cập nhật state
      setAccounts(accounts);
      
      console.log('Đã hoàn thành việc tạo tài khoản');
      return true;
    } catch (error) {
      console.error('Lỗi khi tạo tài khoản từ thông tin người dùng:', error);
      return false;
    }
  };
  
  // Thử tạo tài khoản từ cả hai phương thức
  const tryCreateAccount = () => {
    // Thử tạo từ thông tin người dùng trước
    if (createAccountFromUserInfo()) {
      return true;
    }
    
    // Nếu không có thông tin người dùng, thử tạo từ cấu hình OAuth
    return createAccountFromOAuthConfig();
  };

  // Load user information from localStorage
  const loadUserInfo = useCallback(() => {
    const savedUserInfo = localStorage.getItem('user_info');
    console.log('Loading user info from localStorage:', savedUserInfo);
    
    if (savedUserInfo) {
      try {
        const parsedUserInfo = JSON.parse(savedUserInfo);
        setUserInfo(parsedUserInfo);
      } catch (error) {
        console.error('Error parsing user info:', error);
      }
    }
  }, []);

  // Handle form input changes
  const handleChange = useCallback((event) => {
    const { name, value } = event.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
    
    // Reset error states when input changes
    setSubmitError(null);
    setSuccessMessage(null);
    setResultsData(null);
  }, []);

  // Create manual account function
  const createManualAccount = useCallback(() => {
    try {
      // Close account menu
      setShowAccountMenu(false);
      
      // Get account name from user
      const accountName = prompt('Nhập tên tài khoản:');
      if (!accountName) return;
      
      // Get app name from OAuth config if available
      let appName = '';
      try {
        const currentOAuthConfigKey = localStorage.getItem('hanet_current_oauth_config_key') || 'hanet_oauth_config';
        const oauthConfig = JSON.parse(localStorage.getItem(currentOAuthConfigKey) || '{}');
        appName = oauthConfig.appName || '';
      } catch (e) {
        console.error('Error reading OAuth config:', e);
      }
      
      // Create account ID
      const accountId = appName 
        ? `manual_user_${appName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`
        : `manual_user_${Date.now()}`;
      
      // Create OAuth config key
      const oauthConfigKey = appName 
        ? `hanet_oauth_config_${appName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
        : 'hanet_oauth_config';
      
      // Create new account object
      const newAccount = {
        id: accountId,
        name: accountName,
        appName: appName,
        oauthConfigKey: oauthConfigKey,
        createdAt: new Date().toISOString()
      };
      
      // Update accounts list
      const updatedAccounts = [...accounts, newAccount];
      setAccounts(updatedAccounts);
      
      // Save to localStorage
      localStorage.setItem('hanet_accounts_direct', JSON.stringify(updatedAccounts));
      localStorage.setItem('hanet_accounts_v2', JSON.stringify(updatedAccounts));
      localStorage.setItem('hanet_accounts', JSON.stringify(updatedAccounts));
      
      // Ask user if they want to switch to new account
      if (window.confirm(`Đã tạo tài khoản "${accountName}". Bạn có muốn chuyển sang tài khoản này không?`)) {
        const simpleUserInfo = {
          username: accountId,
          name: accountName
        };
        
        localStorage.setItem('user_info', JSON.stringify(simpleUserInfo));
        localStorage.setItem('hanet_current_account_direct', accountId);
        localStorage.setItem('hanet_current_account_id_v2', accountId);
        localStorage.setItem('hanet_current_account_id', accountId);
        localStorage.setItem('hanet_current_oauth_config_key', oauthConfigKey);
        
        setUserInfo(simpleUserInfo);
        window.location.reload();
      }
      
      return true;
    } catch (error) {
      console.error('Error creating manual account:', error);
      alert('Không thể tạo tài khoản: ' + error.message);
      return false;
    }
  }, [accounts]);

  const renderAccountMenu = () => {
    if (!showAccountMenu) return null;

    return (
      <div className="account-menu" ref={accountMenuRef}>
        <div className="account-menu-header">
          <h3>Tài khoản</h3>
          <button 
            className="refresh-button"
            onClick={(e) => {
              e.stopPropagation();
              tryCreateAccount();
            }}
            title="Làm mới tài khoản"
          >
            🔄
          </button>
        </div>
        
        <div className="account-menu-list">
          {accounts && accounts.length > 0 ? (
            accounts.map((account) => (
              <div 
                key={account.id} 
                className="account-item"
                onClick={() => handleAccountSelect(account)}
              >
                <div className="account-info">
                  <div className="account-name">
                    {account.name || 
                     (account.userInfo && account.userInfo.name) || 
                     (account.userInfo && account.userInfo.username) || 
                     account.id || 'Người dùng'}
                    
                    {account.appName && (
                      <span className="app-name-badge">
                        {account.appName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="no-accounts">
              <p>Không có tài khoản nào</p>
              <button
                className="create-account-button"
                onClick={(e) => {
                  e.stopPropagation();
                  tryCreateAccount();
                }}
              >
                Tạo tài khoản mới
              </button>
            </div>
          )}
        </div>

        <div className="account-menu-footer">
          <div className="menu-actions">
            <Link to="/config" className="config-link">
              Cấu hình API
            </Link>
            <Link to="/debug" className="debug-link">
              Debug
            </Link>
          </div>
          
          <div className="add-account-section">
            <button 
              className="create-manual-account-button"
              onClick={(e) => {
                e.stopPropagation();
                createManualAccount();
              }}
            >
              + Tạo tài khoản thủ công
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderMainApp = () => (
    <main className="app-container">
      <nav className="app-nav">
        <div className="user-info">
          {userInfo ? (
            <>
              <button 
                className="account-button" 
                onClick={() => setShowAccountMenu(!showAccountMenu)}
                ref={accountMenuRef}
              >
                <span>{userInfo.name || userInfo.username}</span>
                <span className="dropdown-arrow">▼</span>
              </button>
              {showAccountMenu && renderAccountMenu()}
            </>
          ) : (
            <span>Chưa đăng nhập</span>
          )}
        </div>
        <Link to="/debug" className="debug-button">
          Debug
        </Link>
        <Link to="/config" className="config-button">
          Cấu hình API
        </Link>
      </nav>

      {authStatus !== 'authenticated' ? (
        <div className="auth-message">
          <h2>Yêu cầu xác thực</h2>
          <p>Bạn cần cấu hình và xác thực với Hanet API trước khi sử dụng ứng dụng.</p>
          <Link to="/config" className="auth-button">
            Tiến hành cấu hình
          </Link>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="query-form">
            {/* Place selection */}
            <div className="form-group">
              <label htmlFor="placeId" className="form-label required">
                Địa điểm:
              </label>
              <select
                id="placeId"
                name="placeId"
                value={formData.placeId}
                onChange={handlePlaceChange}
                className={isPlacesLoading ? "select-loading" : ""}
                required
                disabled={isPlacesLoading}
              >
                <option value="">
                  {isPlacesLoading ? "Đang tải địa điểm..." : "-- Chọn địa điểm --"}
                </option>
                {places.map((place) => (
                  <option key={place.id || place.placeID} value={place.id || place.placeID}>
                    {place.name || place.placeName || "Unnamed"} (ID: {place.id || place.placeID})
                  </option>
                ))}
              </select>
              {placeError && <p className="error-message">{placeError}</p>}
            </div>

            {/* Device selection */}
            <div className="form-group">
              <label htmlFor="deviceId" className="form-label">
                Thiết bị (Tùy chọn):
              </label>
              <select
                id="deviceId"
                name="deviceId"
                value={formData.deviceId}
                onChange={handleDeviceChange}
                disabled={!formData.placeId || isDevicesLoading}
                className={!formData.placeId || isDevicesLoading ? "select-disabled" : ""}
              >
                <option value="">
                  {!formData.placeId
                    ? "-- Chọn địa điểm trước --"
                    : isDevicesLoading
                    ? "Đang tải thiết bị..."
                    : "-- Chọn thiết bị (để lọc) --"}
                </option>
                {devices.map((device) => (
                  <option key={device.deviceID} value={device.deviceID}>
                    {device.deviceName} (ID: {device.deviceID})
                  </option>
                ))}
              </select>
              {deviceError && <p className="error-message">{deviceError}</p>}
            </div>

            {/* --- Khu vực chọn thời gian --- */}
            <div className="time-range-container">
              <p className="section-title">Khoảng thời gian</p>
              <div className="time-range-grid">
                {/* Input From */}
                <div className="form-group">
                  <label htmlFor="fromDateTime" className="form-label required">
                    Từ:
                  </label>
                  <input
                    type="datetime-local"
                    id="fromDateTime"
                    name="fromDateTime"
                    value={formData.fromDateTime}
                    onChange={handleChange}
                  />
                </div>
                {/* Input To */}
                <div className="form-group">
                  <label htmlFor="toDateTime" className="form-label required">
                    Đến:
                  </label>
                  <input
                    type="datetime-local"
                    id="toDateTime"
                    name="toDateTime"
                    value={formData.toDateTime}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>

            {/* --- Input Tóm tắt --- */}
            <div className="form-group">
              <label htmlFor="summaryInput" className="form-label-sm">
                Thông tin truy vấn:
              </label>
              <input
                type="text"
                id="summaryInput"
                readOnly
                value={`${process.env.REACT_APP_API_URL}/api/checkins?${queryString || ""}`}
                className="summary-input"
              />
            </div>

            {/* --- Thông báo Lỗi/Thành công Submit --- */}
            {submitError && (
              <div className="alert-error" role="alert">
                <span className="alert-label">Lỗi: </span>
                {submitError}
              </div>
            )}
            {successMessage && resultsData === null && (
              <div className="alert-info" role="status">
                <span>{successMessage}</span>
              </div>
            )}

            {/* --- Nút Submit --- */}
            <button
              type="submit"
              className={
                isSubmitting || isPlacesLoading
                  ? "submit-btn disabled"
                  : "submit-btn"
              }
              disabled={isSubmitting || isPlacesLoading}
            >
              {isSubmitting ? "Đang tìm kiếm..." : "Tìm kiếm Check-in"}
            </button>
          </form>

          {/* Hiển thị kết quả check-in tách riêng và căn giữa */}
          {resultsData && Array.isArray(resultsData) && resultsData.length > 0 && (
            <div className="checkin-results-center">
              <div className="results-section">
                <h3>Kết quả check-in:</h3>
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>STT</th>
                      {Object.keys(resultsData[0]).map((key) => (
                        <th key={key}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resultsData.map((item, idx) => (
                      <tr key={item.id || item._id || idx}>
                        <td>{idx + 1}</td>
                        {Object.keys(resultsData[0]).map((key) => (
                          <td key={key}>{String(item[key] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Nếu muốn xem JSON thô */}
                <details>
                  <summary>Xem dữ liệu thô (JSON)</summary>
                  <pre style={{maxHeight: 300, overflow: 'auto', background: '#f7f7f7', padding: 8}}>{JSON.stringify(resultsData, null, 2)}</pre>
                </details>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );

  // Render the whole app
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={renderMainApp()} />
        <Route path="/config" element={<OAuthConfig />} />
        <Route path="/oauth-callback" element={<OAuthCallback />} />
        <Route path="/debug" element={<DebugPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default CheckInApp;
