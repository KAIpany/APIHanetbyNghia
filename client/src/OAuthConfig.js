import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './OAuthConfig.css';

const OAuthConfig = () => {
  const [config, setConfig] = useState({
    clientId: '',
    clientSecret: '',
    refreshToken: '',
    baseUrl: 'https://partner.hanet.ai',
    tokenUrl: 'https://oauth.hanet.com/token',
    appName: '',
    redirectUri: '',
    userInfoUrl: ''
  });
  const [configName, setConfigName] = useState('');
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [activeConfig, setActiveConfig] = useState('');
  const [status, setStatus] = useState({
    loading: true,
    message: 'Đang tải cấu hình...',
    status: 'loading',
    error: null
  });

  // Lấy danh sách cấu hình và cấu hình đang active khi component mount
  useEffect(() => {
    // Đặt trạng thái đang tải
    setStatus({
      loading: true,
      message: 'Đang tải dữ liệu cấu hình...',
      status: 'loading',
      error: null
    });
    
    // Lấy danh sách cấu hình từ API
    fetchConfigsList();
    
    // Cuối cùng mới fetch cấu hình hiện tại từ server
    fetchConfig();
  }, []);
  
  // Lấy danh sách cấu hình từ MongoDB thông qua API
  const fetchConfigsList = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/oauth/configs`);
      const result = await response.json();
      
      if (result.success && Array.isArray(result.data)) {
        setSavedConfigs(result.data);
        console.log('Đã tải danh sách cấu hình từ MongoDB:', result.data);
        
        // Nếu có cấu hình, tải cấu hình đầu tiên
        if (result.data.length > 0) {
          loadConfigByName(result.data[0]);
        } else {
          // Không có cấu hình nào, kết thúc trạng thái loading
          setStatus({
            loading: false,
            message: 'Không có cấu hình nào được lưu trữ',
            status: 'warning',
            error: null
          });
        }
      } else {
        // Không có cấu hình nào, kết thúc trạng thái loading
        setStatus({
          loading: false,
          message: 'Không thể tải danh sách cấu hình',
          status: 'error',
          error: result.message || 'Lỗi không xác định'
        });
      }
    } catch (error) {
      console.error('Lỗi khi lấy danh sách cấu hình từ MongoDB:', error);
      setStatus({
        loading: false,
        message: 'Lỗi kết nối đến server',
        status: 'error',
        error: error.message
      });
    }
  };

  // Lấy cấu hình hiện tại từ server
  const fetchConfig = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/oauth/config`);
      const result = await response.json();
      
      if (result.success && result.data) {
        setConfig({
          clientId: result.data.clientId || '',
          clientSecret: '',  // Không bao giờ hiển thị secret từ server
          refreshToken: '',  // Không bao giờ hiển thị refresh token từ server
          baseUrl: result.data.baseUrl || 'https://partner.hanet.ai',
          tokenUrl: result.data.tokenUrl || 'https://oauth.hanet.com/token',
          appName: result.data.appName || '',
          redirectUri: result.data.redirectUri || '',
          userInfoUrl: result.data.userInfoUrl || ''
        });
        
        // Nếu có appName, lưu cấu hình này với tên đó
        if (result.data.appName) {
          setConfigName(result.data.appName);
          setActiveConfig(result.data.appName);
        } else if (result.data.username) {
          setConfigName(result.data.username);
          setActiveConfig(result.data.username);
        }
        
        setStatus({
          loading: false,
          message: 'Đã tải cấu hình từ server',
          status: 'loaded',
          error: null
        });
      }
    } catch (error) {
      console.error('Lỗi khi tải cấu hình từ server:', error);
    }
  };

  // Kiểm tra trạng thái xác thực
  const checkAuthStatus = async () => {
    return new Promise(async (resolve, reject) => {
      try {
        // Thêm timeout để tránh hàm bị treo
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 giây timeout
        
        console.log('Đang kiểm tra trạng thái xác thực...');
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/oauth/status`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const result = await response.json();
        
        if (result.success && result.data) {
          console.log('Trạng thái xác thực:', result.data);
          setStatus(prevStatus => ({
            ...prevStatus,
            authStatus: result.data.status,
            authMessage: result.data.message
          }));
          resolve(result.data);
        } else {
          console.error('Lỗi từ API kiểm tra trạng thái:', result);
          reject(new Error(result.message || 'Lỗi không xác định khi kiểm tra trạng thái'));
        }
      } catch (error) {
        console.error("Lỗi kiểm tra trạng thái xác thực:", error);
        setStatus(prevStatus => ({
          ...prevStatus,
          authStatus: 'error',
          authMessage: `Lỗi kiểm tra trạng thái: ${error.message}`
        }));
        reject(error);
      }
    });
  };

  // Load cấu hình theo tên từ MongoDB
  const loadConfigByName = async (name) => {
    if (!name) return;
    
    try {
      setStatus({
        loading: true,
        message: `Đang tải cấu hình '${name}'...`,
        status: 'loading',
        error: null
      });
      
      // Lấy cấu hình từ MongoDB API
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/oauth/config/${name}`);
      
      if (!response.ok) {
        throw new Error(`Không tìm thấy cấu hình '${name}' trong MongoDB`);
      }
      
      const result = await response.json();
      
      if (result.success && result.data) {
        const loadedConfig = result.data;
        console.log(`Đã tải cấu hình '${name}' từ MongoDB:`, loadedConfig);
        
        // Set activeConfig để hiển thị đang active
        setActiveConfig(name);
        
        // Cập nhật cấu hình vào state
        setConfig({
          clientId: loadedConfig.clientId || '',
          clientSecret: '', // Không hiển thị client secret
          refreshToken: '', // Không hiển thị refresh token
          baseUrl: loadedConfig.baseUrl || 'https://partner.hanet.ai',
          tokenUrl: loadedConfig.tokenUrl || 'https://oauth.hanet.com/token',
          appName: loadedConfig.appName || '',
          redirectUri: loadedConfig.redirectUri || '',
          userInfoUrl: loadedConfig.userInfoUrl || ''
        });
        
        // Đặt tên cấu hình
        setConfigName(name);
        
        setStatus({
          loading: false,
          message: `Đã tải cấu hình '${name}' từ MongoDB`,
          status: 'success',
          error: null
        });
        
        // Cập nhật trạng thái xác thực
        checkAuthStatus();
        
        return true;
      } else {
        throw new Error(result.message || `Không thể tải cấu hình '${name}'`);
      }
    } catch (error) {
      console.error(`Lỗi khi tải cấu hình '${name}':`, error);
      
      setStatus({
        loading: false,
        message: `Lỗi khi tải cấu hình '${name}'`,
        status: 'error',
        error: error.message
      });
    }
  };
  
  // Lưu cấu hình mới vào MongoDB
  const saveConfig = async () => {
    if (!configName.trim()) {
      setStatus({
        ...status,
        status: 'error',
        message: 'Vui lòng nhập tên cho cấu hình này',
        error: 'Thiếu tên cấu hình'
      });
      return;
    }
    
    try {
      setStatus({
        ...status,
        loading: true,
        message: 'Đang lưu cấu hình...'
      });

      const configToSave = {
        clientId: config.clientId, 
        clientSecret: config.clientSecret,
        refreshToken: config.refreshToken,
        baseUrl: config.baseUrl,
        tokenUrl: config.tokenUrl,
        appName: config.appName || configName,
        redirectUri: config.redirectUri,
        userInfoUrl: config.userInfoUrl
      };
      
      // Gửi lên MongoDB thông qua API
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/oauth/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...configToSave,
          username: configName
        })
      });

      const result = await response.json();
      
      if (result.success) {
        console.log(`Đã lưu cấu hình '${configName}' vào MongoDB thành công`);
        
        // Đặt làm cấu hình active
        setActiveConfig(configName);
        
        // Cập nhật danh sách cấu hình từ MongoDB
        fetchConfigsList();
        
        // Cập nhật thông báo
        setStatus({
          loading: false,
          message: `Đã lưu cấu hình '${configName}' thành công`,
          status: 'success',
          error: null
        });
        
        // Kiểm tra lại trạng thái xác thực
        checkAuthStatus();
      } else {
        throw new Error(result.message || 'Không thể lưu cấu hình vào MongoDB');
      }
    } catch (error) {
      console.error('Lỗi khi lưu cấu hình:', error);
      
      setStatus({
        loading: false,
        message: 'Lỗi khi lưu cấu hình',
        status: 'error',
        error: error.message
      });
    }
  };

  // Xóa cấu hình từ MongoDB
  const deleteConfig = async (name) => {
    if (!name) return;
    
    try {
      setStatus({
        ...status,
        loading: true,
        message: `Đang xóa cấu hình '${name}'...`
      });
      
      // Xóa từ MongoDB
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/oauth/config/${name}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Không thể xóa cấu hình '${name}'`);
      }
      
      // Nếu xóa cấu hình đang active, reset state
      if (name === activeConfig) {
        setActiveConfig('');
        setConfigName('');
        
        // Reset form
        setConfig({
          clientId: '',
          clientSecret: '',
          refreshToken: '',
          baseUrl: 'https://partner.hanet.ai',
          tokenUrl: 'https://oauth.hanet.com/token',
          appName: '',
          redirectUri: '',
          userInfoUrl: ''
        });
      }
      
      // Cập nhật danh sách cấu hình từ MongoDB
      fetchConfigsList();
      
      setStatus({
        loading: false,
        message: `Đã xóa cấu hình '${name}'`,
        status: 'success',
        error: null
      });
    } catch (error) {
      console.error(`Lỗi khi xóa cấu hình '${name}':`, error);
      setStatus({
        loading: false,
        message: `Lỗi khi xóa cấu hình '${name}'`,
        status: 'error',
        error: error.message
      });
    }
  };

  // Khởi tạo quá trình đăng nhập OAuth
  const initiateOAuth = () => {
    if (!config.clientId) {
      setStatus({
        ...status,
        status: 'error',
        message: 'Vui lòng nhập Client ID trước khi đăng nhập',
        error: 'Thiếu Client ID'
      });
      return;
    }

    // Tạo URL redirect
    const redirectUri = `${window.location.origin}/oauth-callback`;
    
    // Lưu redirectUri vào cấu hình để sử dụng sau này
    const updatedConfig = {
      ...config,
      redirectUri: redirectUri,
      userInfoUrl: `${config.baseUrl}/api/user/info`
    };
    
    // Cập nhật state
    setConfig(updatedConfig);
    
    // Nếu đang có cấu hình active, lưu vào MongoDB
    if (configName) {
      // Lưu cấu hình vào MongoDB
      const configToSave = {
        ...updatedConfig,
        username: configName
      };
      
      fetch(`${process.env.REACT_APP_API_URL}/api/oauth/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(configToSave)
      }).catch(error => {
        console.error('Lỗi khi lưu cấu hình trước khi đăng nhập:', error);
      });
    }
    
    // URL xác thực Hanet OAuth2
    const authUrl = `https://oauth.hanet.com/oauth2/authorize?response_type=code&client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=full`;
    
    // Mở cửa sổ đăng nhập mới
    window.open(authUrl, 'hanetOAuth', 'width=600,height=700');
  };

  const handleChange = (e) => {
    setConfig({
      ...config,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="oauth-config">
      <div className="config-header">
        <h2>Cấu hình Xác thực Hanet API</h2>
        <Link to="/" className="home-button">
          Quay về trang chủ
        </Link>
      </div>
      
      {status.error && (
        <div className="error-message">
          <p>{status.error}</p>
        </div>
      )}
      
      {status.authStatus && (
        <div className={`auth-status ${status.authStatus}`}>
          <p>Trạng thái xác thực: {status.authMessage}</p>
        </div>
      )}
      
      {/* Danh sách cấu hình đã lưu */}
      {savedConfigs.length > 0 && (
        <div className="saved-configs">
          <h3>Cấu hình đã lưu</h3>
          <div className="configs-list">
            {savedConfigs.map(name => (
              <div key={name} className={`config-item ${activeConfig === name ? 'active' : ''}`}>
                <span className="config-name">{name}</span>
                <div className="config-actions">
                  <button 
                    onClick={() => loadConfigByName(name)}
                    className="load-button"
                    disabled={activeConfig === name}
                  >
                    {activeConfig === name ? 'Đang dùng' : 'Chuyển đổi'}
                  </button>
                  <button 
                    onClick={() => deleteConfig(name)}
                    className="delete-button"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="config-form">
        <div className="form-group">
          <label htmlFor="configName">Tên cấu hình:</label>
          <input
            type="text"
            id="configName"
            name="configName"
            value={configName}
            onChange={(e) => setConfigName(e.target.value)}
            placeholder="Nhập tên cho cấu hình này"
          />
          <small>* Tên này dùng để lưu và chọn cấu hình</small>
        </div>
        
        <div className="form-group">
          <label htmlFor="appName">Tên ứng dụng:</label>
          <input
            type="text"
            id="appName"
            name="appName"
            value={config.appName}
            onChange={handleChange}
            placeholder="Nhập tên ứng dụng của bạn"
          />
          <small>* Tên này sẽ được hiển thị khi chọn tài khoản</small>
        </div>
        
        <div className="form-group">
          <label htmlFor="clientId">Client ID:</label>
          <input
            type="text"
            id="clientId"
            name="clientId"
            value={config.clientId}
            onChange={handleChange}
            placeholder="Nhập Client ID của bạn"
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="clientSecret">Client Secret:</label>
          <input
            type="password"
            id="clientSecret"
            name="clientSecret"
            value={config.clientSecret}
            onChange={handleChange}
            placeholder="Nhập Client Secret của bạn"
          />
          <small>* Client Secret sẽ không được hiển thị sau khi lưu</small>
        </div>
        
        <div className="form-group">
          <label htmlFor="refreshToken">Refresh Token:</label>
          <input
            type="password"
            id="refreshToken"
            name="refreshToken"
            value={config.refreshToken}
            onChange={handleChange}
            placeholder="Nhập Refresh Token nếu có"
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="baseUrl">API Base URL:</label>
          <input
            type="text"
            id="baseUrl"
            name="baseUrl"
            value={config.baseUrl}
            onChange={handleChange}
            placeholder="URL cơ sở của API"
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="tokenUrl">Token URL:</label>
          <input
            type="text"
            id="tokenUrl"
            name="tokenUrl"
            value={config.tokenUrl}
            onChange={handleChange}
            placeholder="URL token OAuth"
          />
          <small>* Thông thường là https://oauth.hanet.com/token</small>
        </div>
        
        <div className="button-group">
          <button 
            className="save-button"
            onClick={saveConfig}
            disabled={status.loading || !configName.trim()}
          >
            {status.loading ? 'Đang lưu...' : 'Lưu cấu hình mới'}
          </button>
          
          <button 
            className="oauth-button"
            onClick={initiateOAuth}
            disabled={!config.clientId || status.loading}
          >
            Đăng nhập với Hanet
          </button>
        </div>
      </div>
      
      <div className="oauth-info">
        <h3>Hướng dẫn</h3>
        <ol>
          <li>Nhập <strong>Client ID</strong> và <strong>Client Secret</strong> từ tài khoản Hanet của bạn</li>
          <li>Nhấn <strong>Lưu cấu hình</strong> để lưu thông tin</li>
          <li>Nhấn <strong>Đăng nhập với Hanet</strong> để xác thực</li>
          <li>Sau khi xác thực, hệ thống sẽ tự động lưu trữ token</li>
        </ol>
      </div>
    </div>
  );
};

export default OAuthConfig; 