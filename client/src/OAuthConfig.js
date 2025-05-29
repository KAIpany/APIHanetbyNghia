import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './OAuthConfig.css';

// Lưu trữ danh sách các cấu hình
const CONFIGS_LIST_KEY = 'hanet_oauth_configs_list';
// Lưu trữ cấu hình đang active
const ACTIVE_CONFIG_KEY = 'hanet_oauth_active_config';
// Lưu trữ một cấu hình cụ thể (sẽ có prefix + name)
const CONFIG_PREFIX = 'hanet_oauth_config_';
// Legacy storage key, giữ lại để tương thích ngược
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
    
    // Lấy danh sách cấu hình
    const configsList = localStorage.getItem(CONFIGS_LIST_KEY);
    let configNames = [];
    if (configsList) {
      try {
        configNames = JSON.parse(configsList);
        setSavedConfigs(configNames);
        console.log('Đã tải danh sách cấu hình:', configNames);
      } catch (error) {
        console.error('Lỗi khi đọc danh sách cấu hình từ local storage:', error);
      }
    }
    
    setTimeout(() => {
      // Lấy tên cấu hình đang active
      const currentActive = localStorage.getItem(ACTIVE_CONFIG_KEY);
      
      // Nếu có cấu hình active và nó nằm trong danh sách
      if (currentActive && configNames.includes(currentActive)) {
        console.log(`Đang tải cấu hình active: ${currentActive}`);
        loadConfigByName(currentActive);
      } 
      // Nếu không có cấu hình active nhưng có cấu hình cũ
      else {
        // Kiểm tra xem có cấu hình cũ (legacy) không
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
            
            // Cập nhật cấu hình lên server
            updateServerConfig(parsedConfig).catch(error => {
              console.error('Lỗi khi cập nhật cấu hình legacy lên server:', error);
            });
          } catch (error) {
            console.error('Lỗi khi đọc cấu hình legacy từ local storage:', error);
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
      }
      
      // Cuối cùng mới fetch cấu hình từ server
      fetchConfig();
    }, 500); // Thêm delay nhỏ để đảm bảo component đã render đầy đủ
  }, []);

  // Lấy cấu hình từ server
  const fetchConfig = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/oauth/config`);
      const result = await response.json();
      
      if (result.success && result.data) {
        // Lấy giá trị từ localStorage, ưu tiên dữ liệu này
        const savedConfig = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        
        // Chỉ sử dụng giá trị từ API nếu không có trong localStorage
        const newConfig = {
          // Ưu tiên giá trị từ localStorage, nếu không có mới lấy từ API
          clientId: savedConfig.clientId || result.data.clientId || '',
          clientSecret: savedConfig.clientSecret || '',
          refreshToken: savedConfig.refreshToken || '',
          baseUrl: savedConfig.baseUrl || result.data.baseUrl || 'https://partner.hanet.ai',
          tokenUrl: savedConfig.tokenUrl || result.data.tokenUrl || 'https://oauth.hanet.com/token',
          appName: savedConfig.appName || result.data.appName || '',
          redirectUri: savedConfig.redirectUri || '',
          userInfoUrl: savedConfig.userInfoUrl || ''
        };
        
        console.log('Cấu hình từ localStorage:', savedConfig);
        console.log('Cấu hình sau khi merge với server:', newConfig);
        
        setConfig(newConfig);
        
        setStatus({
          loading: false,
          message: 'Đã tải cấu hình',
          status: 'loaded',
          error: null
        });
      } else {
        throw new Error(result.message || 'Không thể tải cấu hình');
      }
    } catch (error) {
      console.error('Lỗi khi tải cấu hình:', error);
      
      // Nếu không kết nối được server, vẫn tải từ localStorage
      const savedConfig = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (savedConfig.clientId) {
        console.log('Sử dụng cấu hình từ localStorage do không kết nối được server');
        setConfig(savedConfig);
        setStatus({
          loading: false,
          message: 'Đã tải cấu hình từ lưu trữ cục bộ',
          status: 'loaded',
          error: null
        });
      } else {
        setStatus({
          loading: false,
          message: 'Lỗi tải cấu hình',
          status: 'error',
          error: error.message
        });
      }
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

  // Load cấu hình theo tên
  const loadConfigByName = (name) => {
    if (!name) return;
    
    try {
      const savedConfig = localStorage.getItem(CONFIG_PREFIX + name);
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        console.log(`Đã tải cấu hình '${name}' từ localStorage:`, parsedConfig);
        
        // Đặt trạng thái tải trước khi tải cấu hình
        setStatus({
          loading: true,
          message: `Đang tải cấu hình '${name}'...`,
          status: 'loading',
          error: null
        });
        
        // Set activeConfig trước để tránh lỗi khi chuyển đổi
        setActiveConfig(name);
        localStorage.setItem(ACTIVE_CONFIG_KEY, name);
        
        // Cập nhật cấu hình lên server trước, sau đó mới cập nhật UI
        updateServerConfig(parsedConfig).then(() => {
          // Sau khi cập nhật server xong mới cập nhật state
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
          
          // Đặt tên cấu hình để dễ quản lý
          setConfigName(name);
          
          setStatus({
            loading: false,
            message: `Đã tải cấu hình '${name}'`,
            status: 'success',
            error: null
          });
          
          // Cập nhật trạng thái xác thực sau khi đã cập nhật cấu hình
          checkAuthStatus();
        }).catch(error => {
          console.error(`Lỗi khi cập nhật cấu hình '${name}' lên server:`, error);
          setStatus({
            loading: false,
            message: `Đã tải cấu hình '${name}' nhưng không cập nhật được lên server`,
            status: 'warning',
            error: error.message
          });
        });
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
  
  // Cập nhật cấu hình lên server
  const updateServerConfig = async (configData) => {
    // Đảm bảo hàm trả về Promise để có thể xử lý then/catch
    return new Promise(async (resolve, reject) => {
      try {
        // Thêm timeout để đảm bảo có đủ thời gian để cập nhật
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 giây timeout
        
        console.log('Gửi cấu hình lên server:', {
          clientId: configData.clientId,
          hasClientSecret: !!configData.clientSecret,
          hasRefreshToken: !!configData.refreshToken,
          baseUrl: configData.baseUrl,
          tokenUrl: configData.tokenUrl
        });
        
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/oauth/config`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(configData),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const result = await response.json();
        if (result.success) {
          console.log('Đã cập nhật cấu hình lên server thành công');
          resolve(result);
        } else {
          console.error('Server trả về lỗi:', result.message);
          reject(new Error(result.message || 'Lỗi không xác định từ server'));
        }
      } catch (error) {
        console.error('Lỗi khi cập nhật cấu hình lên server:', error);
        reject(error);
      }
    });
  };

  // Lưu cấu hình mới
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
      
      // Lưu cấu hình với tên
      localStorage.setItem(CONFIG_PREFIX + configName, JSON.stringify(configToSave));
      
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
      
      // Đặt làm cấu hình active
      localStorage.setItem(ACTIVE_CONFIG_KEY, configName);
      setActiveConfig(configName);
      
      console.log(`Đã lưu cấu hình '${configName}' vào localStorage:`, configToSave);

      // Sau đó gửi lên server
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/oauth/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(configToSave)
      });

      const result = await response.json();
      
      if (result.success) {
        setStatus({
          loading: false,
          message: `Đã lưu cấu hình '${configName}' thành công`,
          status: 'success',
          error: null
        });
        
        // Kiểm tra lại trạng thái xác thực
        checkAuthStatus();
      } else {
        throw new Error(result.message || 'Không thể lưu cấu hình');
      }
    } catch (error) {
      console.error('Lỗi khi lưu cấu hình:', error);
      setStatus({
        loading: false,
        message: 'Lỗi khi gửi cấu hình lên server, nhưng đã lưu cục bộ',
        status: 'warning',
        error: error.message
      });
    }
  };
  
  // Xóa cấu hình
  const deleteConfig = (name) => {
    if (!name) return;
    
    try {
      // Xóa cấu hình
      localStorage.removeItem(CONFIG_PREFIX + name);
      
      // Cập nhật danh sách
      let configsList = [];
      try {
        const savedList = localStorage.getItem(CONFIGS_LIST_KEY);
        if (savedList) {
          configsList = JSON.parse(savedList);
          configsList = configsList.filter(item => item !== name);
          localStorage.setItem(CONFIGS_LIST_KEY, JSON.stringify(configsList));
          setSavedConfigs(configsList);
        }
      } catch (error) {
        console.error('Lỗi khi cập nhật danh sách cấu hình:', error);
      }
      
      // Nếu xóa cấu hình đang active
      if (activeConfig === name) {
        setActiveConfig('');
        localStorage.removeItem(ACTIVE_CONFIG_KEY);
        
        // Nếu còn cấu hình khác, load cấu hình đầu tiên
        if (configsList.length > 0) {
          loadConfigByName(configsList[0]);
        } else {
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
      }
      
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