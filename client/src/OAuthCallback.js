import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './App.css';

function OAuthCallback() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Kiểm tra xem storage có sẵn và hoạt động không
  const checkStorage = (type = 'localStorage') => {
    const storage = type === 'localStorage' ? window.localStorage : window.sessionStorage;
    try {
      const testKey = `test_${Date.now()}`;
      storage.setItem(testKey, 'test');
      const testValue = storage.getItem(testKey);
      storage.removeItem(testKey);
      console.log(`${type} kiểm tra thành công:`, testValue === 'test');
      return testValue === 'test';
    } catch (error) {
      console.error(`Lỗi khi kiểm tra ${type}:`, error);
      return false;
    }
  };
  
  // Key cho việc lưu trữ
  const ACCOUNTS_KEYS = [
    'hanet_accounts_direct',
    'hanet_accounts_v2',
    'hanet_accounts'
  ];
  
  const CURRENT_ACCOUNT_KEYS = [
    'hanet_current_account_direct',
    'hanet_current_account_id_v2',
    'hanet_current_account_id'
  ];
  
  // Lưu tài khoản mới
  const saveAccount = (userInfo, oauthConfig) => {
    console.log('Đang lưu tài khoản với thông tin:', userInfo);
    
    if (!userInfo || !userInfo.username) {
      console.error('Không thể lưu tài khoản: thiếu thông tin người dùng hoặc username');
      return false;
    }
    
    try {
      // Tạo ID tài khoản kết hợp với appName để đảm bảo không bị trùng
      let accountId = userInfo.username;
      const appName = oauthConfig.appName || '';
      
      // Thêm mã ứng dụng vào ID tài khoản nếu có appName
      if (appName) {
        const appNameSlug = appName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        accountId = `${userInfo.username}_${appNameSlug}`;
      }
      
      console.log('ID tài khoản sẽ sử dụng:', accountId);
      
      // Lưu cấu hình OAuth riêng biệt cho tài khoản này
      // Tạo khóa riêng cho từng ứng dụng
      const oauthConfigKey = appName 
        ? `hanet_oauth_config_${appName.toLowerCase().replace(/[^a-z0-9]/g, '_')}` 
        : 'hanet_oauth_config';
      
      console.log('Lưu cấu hình OAuth vào khóa:', oauthConfigKey);
      localStorage.setItem(oauthConfigKey, JSON.stringify(oauthConfig));
      
      // Lưu khóa cấu hình OAuth vào tài khoản để biết khóa nào thuộc tài khoản nào
      oauthConfig.configKey = oauthConfigKey;
      
      // Khởi tạo tài khoản mới
      const newAccount = {
        id: accountId,
        userInfo: userInfo,
        oauthConfig: oauthConfig,
        appName: appName,
        oauthConfigKey: oauthConfigKey,
        createdAt: new Date().toISOString()
      };
      
      console.log('Tài khoản mới tạo:', newAccount);
      
      // Lấy danh sách tài khoản hiện tại từ localStorage
      let accounts = [];
      try {
        const storedAccounts = localStorage.getItem('hanet_accounts_direct');
        console.log('Dữ liệu tài khoản đã lưu:', storedAccounts);
        
        if (storedAccounts) {
          accounts = JSON.parse(storedAccounts);
          if (!Array.isArray(accounts)) {
            console.warn('Dữ liệu tài khoản không phải mảng, khởi tạo mới:', accounts);
            accounts = [];
          }
        }
      } catch (error) {
        console.error('Lỗi khi đọc danh sách tài khoản:', error);
        accounts = [];
      }
      
      console.log('Danh sách tài khoản trước khi cập nhật:', accounts);
      
      // Kiểm tra xem tài khoản đã tồn tại chưa
      const existingIndex = accounts.findIndex(acc => acc && acc.id === newAccount.id);
      
      if (existingIndex >= 0) {
        // Cập nhật tài khoản đã tồn tại
        console.log('Cập nhật tài khoản tại vị trí:', existingIndex);
        accounts[existingIndex] = {
          ...accounts[existingIndex],
          userInfo: newAccount.userInfo,
          oauthConfig: newAccount.oauthConfig,
          appName: newAccount.appName,
          oauthConfigKey: oauthConfigKey,
          updatedAt: new Date().toISOString()
        };
      } else {
        // Thêm tài khoản mới
        console.log('Thêm tài khoản mới vào danh sách');
        accounts.push(newAccount);
      }
      
      console.log('Danh sách tài khoản sau khi cập nhật:', accounts);
      
      // Lưu vào tất cả các key
      const accountsJSON = JSON.stringify(accounts);
      console.log('Chuỗi JSON để lưu:', accountsJSON);
      
      // Lưu với key chính và key dự phòng
      localStorage.setItem('hanet_accounts_direct', accountsJSON);
      localStorage.setItem('hanet_accounts_v2', accountsJSON);
      localStorage.setItem('hanet_accounts', accountsJSON);
      
      // Lưu ID tài khoản hiện tại
      localStorage.setItem('hanet_current_account_direct', newAccount.id);
      localStorage.setItem('hanet_current_account_id_v2', newAccount.id);
      localStorage.setItem('hanet_current_account_id', newAccount.id);
      
      // Lưu khóa cấu hình OAuth hiện tại
      localStorage.setItem('hanet_current_oauth_config_key', oauthConfigKey);
      
      console.log('Đã lưu danh sách tài khoản và ID hiện tại vào localStorage');
      return true;
    } catch (error) {
      console.error('Lỗi khi lưu tài khoản:', error);
      
      // Thử lại với cách đơn giản hơn
      try {
        // Tạo ID tài khoản với appName nếu có
        let accountId = userInfo.username;
        const appName = oauthConfig.appName || '';
        if (appName) {
          const appNameSlug = appName.toLowerCase().replace(/[^a-z0-9]/g, '_');
          accountId = `${userInfo.username}_${appNameSlug}`;
        }
        
        // Tạo khóa riêng cho cấu hình OAuth
        const oauthConfigKey = appName 
          ? `hanet_oauth_config_${appName.toLowerCase().replace(/[^a-z0-9]/g, '_')}` 
          : 'hanet_oauth_config';
        
        // Lưu cấu hình OAuth vào khóa riêng
        localStorage.setItem(oauthConfigKey, JSON.stringify(oauthConfig));
        
        // Lưu trực tiếp thông tin người dùng
        localStorage.setItem('user_info', JSON.stringify(userInfo));
        
        // Tạo tài khoản đơn giản
        const simpleAccount = {
          id: accountId,
          name: userInfo.name || userInfo.username,
          email: userInfo.email,
          appName: appName,
          oauthConfigKey: oauthConfigKey
        };
        
        // Đọc danh sách tài khoản hiện tại
        let accounts = [];
        const existingAccounts = localStorage.getItem('hanet_accounts');
        if (existingAccounts) {
          try {
            const parsed = JSON.parse(existingAccounts);
            if (Array.isArray(parsed)) {
              accounts = parsed;
            }
          } catch (e) {
            console.error('Lỗi khi đọc danh sách tài khoản:', e);
          }
        }
        
        // Kiểm tra trùng lặp
        const existingIndex = accounts.findIndex(acc => acc && acc.id === simpleAccount.id);
        if (existingIndex >= 0) {
          accounts[existingIndex] = simpleAccount;
        } else {
          accounts.push(simpleAccount);
        }
        
        // Lưu danh sách tài khoản
        localStorage.setItem('hanet_accounts', JSON.stringify(accounts));
        localStorage.setItem('hanet_current_account_id', simpleAccount.id);
        
        // Lưu khóa cấu hình OAuth hiện tại
        localStorage.setItem('hanet_current_oauth_config_key', oauthConfigKey);
        
        console.log('Đã lưu thông tin đơn giản vào localStorage');
        return true;
      } catch (backupError) {
        console.error('Lỗi khi lưu dự phòng:', backupError);
        return false;
      }
    }
  };

  const handleCallback = async () => {
    const queryParams = new URLSearchParams(location.search);
    const code = queryParams.get('code');
    const state = queryParams.get('state');
    const error = queryParams.get('error');
    
    if (error) {
      console.error('Lỗi OAuth:', error);
      setError(`Lỗi xác thực: ${error}`);
      setLoading(false);
      return;
    }
    
    if (!code) {
      console.error('Thiếu mã xác thực');
      setError('Thiếu thông tin xác thực từ máy chủ');
      setLoading(false);
      return;
    }
    
    try {
      console.log('Đang xử lý callback với code:', code);
      
      // Lấy OAuth config từ localStorage
      let oauthConfig;
      try {
        const savedOAuthConfig = localStorage.getItem('hanet_oauth_config');
        if (savedOAuthConfig) {
          oauthConfig = JSON.parse(savedOAuthConfig);
        }
      } catch (error) {
        console.error('Lỗi khi lấy oauth_config từ localStorage:', error);
        
        // Thử lấy từ sessionStorage
        try {
          const sessionOAuthConfig = sessionStorage.getItem('hanet_oauth_config');
          if (sessionOAuthConfig) {
            oauthConfig = JSON.parse(sessionOAuthConfig);
          }
        } catch (e) {
          console.error('Lỗi khi lấy oauth_config từ sessionStorage:', e);
        }
      }
      
      if (!oauthConfig) {
        setError('Không tìm thấy cấu hình xác thực');
        setLoading(false);
        return;
      }
      
      // Thêm redirect_uri vào cấu hình nếu chưa có
      if (!oauthConfig.redirectUri) {
        oauthConfig.redirectUri = `${window.location.origin}/oauth-callback`;
        console.log('Đã thêm redirectUri vào cấu hình:', oauthConfig.redirectUri);
      }
      
      // Thêm URL lấy thông tin người dùng nếu chưa có
      if (!oauthConfig.userInfoUrl) {
        oauthConfig.userInfoUrl = `${oauthConfig.baseUrl}/api/user/info`;
        console.log('Đã thêm userInfoUrl vào cấu hình:', oauthConfig.userInfoUrl);
      }
      
      // Exchange the authorization code for an access token
      const tokenResponse = await axios.post(oauthConfig.tokenUrl, {
        code,
        client_id: oauthConfig.clientId,
        client_secret: oauthConfig.clientSecret,
        redirect_uri: oauthConfig.redirectUri,
        grant_type: 'authorization_code'
      });
      
      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      
      // Lưu token
      const tokenData = {
        access_token,
        refresh_token,
        expires_in,
        expiry_date: new Date().getTime() + expires_in * 1000
      };
      
      // Cập nhật OAuth config với token mới
      oauthConfig.token = tokenData;
      
      // Lưu OAuth config đã cập nhật vào storage
      try {
        localStorage.setItem('hanet_oauth_config', JSON.stringify(oauthConfig));
      } catch (error) {
        console.error('Lỗi khi lưu oauth_config vào localStorage:', error);
        try {
          sessionStorage.setItem('hanet_oauth_config', JSON.stringify(oauthConfig));
        } catch (e) {
          console.error('Lỗi khi lưu oauth_config vào sessionStorage:', e);
        }
      }
      
      // Lấy thông tin người dùng
      const userInfoResponse = await axios.get(oauthConfig.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      });
      
      const userInfo = userInfoResponse.data;
      console.log('Thông tin người dùng:', userInfo);
      
      // Lưu thông tin người dùng vào storage
      try {
        localStorage.setItem('user_info', JSON.stringify(userInfo));
      } catch (error) {
        console.error('Lỗi khi lưu user_info vào localStorage:', error);
        try {
          sessionStorage.setItem('user_info', JSON.stringify(userInfo));
        } catch (e) {
          console.error('Lỗi khi lưu user_info vào sessionStorage:', e);
        }
      }
      
      // Lưu tài khoản
      const saveResult = saveAccount(userInfo, oauthConfig);
      console.log('Kết quả lưu tài khoản:', saveResult);
      
      // Điều hướng về trang chủ
      setLoading(false);
      navigate('/');
    } catch (error) {
      console.error('Lỗi khi xử lý OAuth callback:', error);
      setError(error.message || 'Lỗi không xác định khi xử lý xác thực');
      setLoading(false);
    }
  };

  useEffect(() => {
    handleCallback();
  }, []);

  if (loading) {
  return (
    <div className="oauth-callback-container">
        <div className="loading-indicator">
          <p>Đang xử lý đăng nhập...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="oauth-callback-container">
        <div className="error-message">
          <h2>Lỗi xác thực</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/')}>Quay lại trang chủ</button>
      </div>
    </div>
  );
  }

  return null;
}

export default OAuthCallback; 