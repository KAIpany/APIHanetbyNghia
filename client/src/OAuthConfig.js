import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './OAuthConfig.css';

// Giữ lại các khóa cho tương thích ngược
const CONFIGS_LIST_KEY = 'hanet_oauth_configs_list';
const ACTIVE_CONFIG_KEY = 'hanet_oauth_active_config';
const CONFIG_PREFIX = 'hanet_oauth_config_';
const STORAGE_KEY = 'hanet_oauth_config';

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
        
        // Nếu có cấu hình, tải cấu hình active từ localStorage (để tương thích ngược)
        if (result.data.length > 0) {
          const currentActive = localStorage.getItem(ACTIVE_CONFIG_KEY);
          
          // Nếu cấu hình active nằm trong danh sách
          if (currentActive && result.data.includes(currentActive)) {
            console.log(`Đang tải cấu hình active: ${currentActive}`);
            loadConfigByName(currentActive);
          }
          // Nếu không thì tải cấu hình đầu tiên trong danh sách
          else if (result.data.length > 0) {
            console.log(`Không tìm thấy cấu hình active, tải cấu hình đầu tiên: ${result.data[0]}`);
            loadConfigByName(result.data[0]);
          }
        } else {
          // Nếu không có cấu hình nào, kiểm tra xem có lưu trong localStorage không
          checkLocalStorage();
        }
      } else {
        // Nếu không lấy được từ MongoDB, kiểm tra localStorage
        checkLocalStorage();
      }
    } catch (error) {
      console.error('Lỗi khi lấy danh sách cấu hình từ MongoDB:', error);
      // Nếu lỗi, thử lấy từ localStorage
      checkLocalStorage();
    }
  };
  
  // Kiểm tra và tải cấu hình từ localStorage (cho tương thích ngược)
  const checkLocalStorage = () => {
    // Lấy danh sách cấu hình từ localStorage
    const configsList = localStorage.getItem(CONFIGS_LIST_KEY);
    let configNames = [];
    
    if (configsList) {
      try {
        configNames = JSON.parse(configsList);
        setSavedConfigs(configNames);
        console.log('Đã tải danh sách cấu hình từ localStorage:', configNames);
        
        // Lấy tên cấu hình đang active
        const currentActive = localStorage.getItem(ACTIVE_CONFIG_KEY);
        
        // Nếu có cấu hình active và nó nằm trong danh sách
        if (currentActive && configNames.includes(currentActive)) {
          console.log(`Đang tải cấu hình active từ localStorage: ${currentActive}`);
          loadConfigFromLocalStorage(currentActive);
        } else {
          // Kiểm tra xem có cấu hình legacy không
          const legacyConfig = localStorage.getItem(STORAGE_KEY);
          if (legacyConfig) {
            try {
              const parsedConfig = JSON.parse(legacyConfig);
              console.log('Đã tải cấu hình legacy từ localStorage:', parsedConfig);
              
              // Cập nhật cấu hình vào state
              setConfig({
                clientId: parsedConfig.clientId || '',
                clientSecret: parsedConfig.clientSecret || '',
                refreshToken: parsedConfig.refreshToken || '',
                baseUrl: parsedConfig.baseUrl || 'https://partner.hanet.ai',
                tokenUrl: parsedConfig.tokenUrl || 'https://oauth.hanet.com/token',
                appName: parsedConfig.appName || '',
                redirectUri: parsedConfig.redirectUri || '',
                userInfoUrl: parsedConfig.userInfoUrl || ''
              });
              
              // Nếu có appName, lưu cấu hình này với tên đó
              if (parsedConfig.appName) {
                setConfigName(parsedConfig.appName);
              }
              
              // Đồng bộ lên MongoDB
              syncToMongoDB(parsedConfig, parsedConfig.appName || 'default');
            } catch (error) {
              console.error('Lỗi khi đọc cấu hình legacy từ localStorage:', error);
            }
          }
        }
      } catch (error) {
        console.error('Lỗi khi đọc danh sách cấu hình từ localStorage:', error);
      }
    }
    
    // Cuối cùng kiểm tra trạng thái xác thực và cập nhật status
    checkAuthStatus().finally(() => {
      setStatus(prevStatus => ({
        ...prevStatus,
        loading: false,
        status: 'loaded'
      }));
    });
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
      // Không thay đổi trạng thái vì chúng ta đã có các cơ chế khác để tải cấu hình
    }
  };

  // Đồng bộ cấu hình từ localStorage lên MongoDB
  const syncToMongoDB = async (configData, name) => {
    try {
      console.log(`Đang đồng bộ cấu hình '${name}' lên MongoDB`);
      
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/oauth/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...configData,
          appName: name
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`Đã đồng bộ cấu hình '${name}' lên MongoDB thành công`);
        return true;
      } else {
        console.error(`Lỗi khi đồng bộ cấu hình '${name}' lên MongoDB:`, result.message);
        return false;
      }
    } catch (error) {
      console.error(`Lỗi khi đồng bộ cấu hình '${name}' lên MongoDB:`, error);
      return false;
    }
  };
  
  // Load cấu hình từ localStorage (cho tương thích ngược)
  const loadConfigFromLocalStorage = (name) => {
    try {
      const savedConfig = localStorage.getItem(CONFIG_PREFIX + name);
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        console.log(`Đã tải cấu hình '${name}' từ localStorage:`, parsedConfig);
        
        // Cập nhật state
        setConfig({
          clientId: parsedConfig.clientId || '',
          clientSecret: parsedConfig.clientSecret || '',
          refreshToken: parsedConfig.refreshToken || '',
          baseUrl: parsedConfig.baseUrl || 'https://partner.hanet.ai',
          tokenUrl: parsedConfig.tokenUrl || 'https://oauth.hanet.com/token',
          appName: parsedConfig.appName || '',
          redirectUri: parsedConfig.redirectUri || '',
          userInfoUrl: parsedConfig.userInfoUrl || ''
        });
        
        setConfigName(name);
        setActiveConfig(name);
        
        // Đồng bộ lên MongoDB
        syncToMongoDB(parsedConfig, name);
        
        // Cập nhật thông báo
        setStatus({
          loading: false,
          message: `Đã tải cấu hình '${name}' từ localStorage`,
          status: 'success',
          error: null
        });
        
        // Cập nhật trạng thái xác thực
        checkAuthStatus();
        
        return true;
      } else {
        console.log(`Không tìm thấy cấu hình '${name}' trong localStorage`);
        return false;
      }
    } catch (error) {
      console.error(`Lỗi khi tải cấu hình '${name}' từ localStorage:`, error);
      return false;
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
        localStorage.setItem(ACTIVE_CONFIG_KEY, name);
        
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
        // Thử lấy từ localStorage nếu không có trên MongoDB
        const loaded = loadConfigFromLocalStorage(name);
        if (!loaded) {
          throw new Error(result.message || `Không thể tải cấu hình '${name}'`);
        }
      }
    } catch (error) {
      console.error(`Lỗi khi tải cấu hình '${name}':`, error);
      
      // Thử lấy từ localStorage nếu server lỗi
      const loaded = loadConfigFromLocalStorage(name);
      if (!loaded) {
        setStatus({
          loading: false,
          message: `Lỗi khi tải cấu hình '${name}'`,
          status: 'error',
          error: error.message
        });
      }
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
        localStorage.setItem(ACTIVE_CONFIG_KEY, configName);
        
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
        
        // Lưu cả vào localStorage để tương thích ngược
        try {
          localStorage.setItem(CONFIG_PREFIX + configName, JSON.stringify(configToSave));
          
          // Cập nhật danh sách cấu hình trong localStorage
          let configsList = [];
          const savedList = localStorage.getItem(CONFIGS_LIST_KEY);
          if (savedList) {
            configsList = JSON.parse(savedList);
          }
          
          // Thêm vào danh sách nếu chưa có
          if (!configsList.includes(configName)) {
            configsList.push(configName);
            localStorage.setItem(CONFIGS_LIST_KEY, JSON.stringify(configsList));
          }
        } catch (localStoreError) {
          console.error('Lỗi khi lưu cấu hình vào localStorage:', localStoreError);
        }
      } else {
        throw new Error(result.message || 'Không thể lưu cấu hình vào MongoDB');
      }
    } catch (error) {
      console.error('Lỗi khi lưu cấu hình:', error);
      
      // Nếu lỗi kết nối tới server, vẫn thử lưu vào localStorage
      try {
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
        
        localStorage.setItem(CONFIG_PREFIX + configName, JSON.stringify(configToSave));
        
        // Cập nhật danh sách cấu hình
        let configsList = [];
        const savedList = localStorage.getItem(CONFIGS_LIST_KEY);
        if (savedList) {
          configsList = JSON.parse(savedList);
        }
        
        // Thêm vào danh sách nếu chưa có
        if (!configsList.includes(configName)) {
          configsList.push(configName);
          localStorage.setItem(CONFIGS_LIST_KEY, JSON.stringify(configsList));
          setSavedConfigs(configsList);
        }
        
        // Đặt làm cấu hình active
        localStorage.setItem(ACTIVE_CONFIG_KEY, configName);
        setActiveConfig(configName);
        
        setStatus({
          loading: false,
          message: 'Lỗi kết nối đến server, đã lưu cấu hình vào localStorage',
          status: 'warning',
          error: error.message
        });
      } catch (localError) {
        setStatus({
          loading: false,
          message: 'Lỗi khi lưu cấu hình',
          status: 'error',
          error: error.message
        });
      }
    }
  };

  // Xóa cấu hình từ MongoDB và localStorage
  const deleteConfig = async (name) => {
    if (!name) return;
    
    try {
      setStatus({
        ...status,
        loading: true,
        message: `Đang xóa cấu hình '${name}'...`
      });
      
      // Xóa từ MongoDB trước
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/oauth/config/${name}`, {
        method: 'DELETE'
      });
      
      // Xóa từ localStorage
      localStorage.removeItem(CONFIG_PREFIX + name);
      
      // Cập nhật danh sách cấu hình trong localStorage
      const configsList = localStorage.getItem(CONFIGS_LIST_KEY);
      if (configsList) {
        try {
          let list = JSON.parse(configsList);
          list = list.filter(config => config !== name);
          localStorage.setItem(CONFIGS_LIST_KEY, JSON.stringify(list));
          setSavedConfigs(list);
          
          // Nếu xóa cấu hình đang active, reset state
          if (name === activeConfig) {
            localStorage.removeItem(ACTIVE_CONFIG_KEY);
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
        } catch (error) {
          console.error('Lỗi khi cập nhật danh sách cấu hình sau khi xóa:', error);
        }
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
    
    // Nếu đang có cấu hình active thì lưu vào cấu hình đó
    if (activeConfig) {
      localStorage.setItem(CONFIG_PREFIX + activeConfig, JSON.stringify(updatedConfig));
    } else if (configName) {
      // Nếu đã nhập tên nhưng chưa lưu, lưu luôn
      localStorage.setItem(CONFIG_PREFIX + configName, JSON.stringify(updatedConfig));
      localStorage.setItem(ACTIVE_CONFIG_KEY, configName);
      setActiveConfig(configName);
      
      // Cập nhật danh sách cấu hình
      let configsList = [];
      try {
        const savedList = localStorage.getItem(CONFIGS_LIST_KEY);
        if (savedList) {
          configsList = JSON.parse(savedList);
        }
      } catch (error) {
        console.error('Lỗi khi đọc danh sách cấu hình:', error);
      }
      
      // Thêm vào danh sách nếu chưa có
      if (!configsList.includes(configName)) {
        configsList.push(configName);
        localStorage.setItem(CONFIGS_LIST_KEY, JSON.stringify(configsList));
        setSavedConfigs(configsList);
      }
    } else {
      // Lưu tạm thời vào localStorage cũ
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedConfig));
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