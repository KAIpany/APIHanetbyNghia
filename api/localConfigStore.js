const fs = require('fs');
const path = require('path');

// Sử dụng thư mục /tmp trong môi trường production hoặc serverless
// /tmp là thư mục có quyền ghi trong AWS Lambda và các môi trường serverless khác
const CONFIG_DIR = process.env.NODE_ENV === 'production' 
  ? path.join('/tmp', 'oauth-configs') 
  : path.join(__dirname, 'oauth-configs');

if (!fs.existsSync(CONFIG_DIR)) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  } catch (error) {
    console.error(`Không thể tạo thư mục ${CONFIG_DIR}:`, error.message);
  }
}

function getConfigPath(username) {
  return path.join(CONFIG_DIR, `oauth-config-${username}.json`);
}

function saveConfig(username, config) {
  try {
    fs.writeFileSync(getConfigPath(username), JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Lỗi khi lưu cấu hình cho ${username}:`, error.message);
    return false;
  }
}

function loadConfig(username) {
  const filePath = getConfigPath(username);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.error(`Lỗi khi đọc cấu hình từ ${filePath}:`, error.message);
      return null;
    }
  }
  return null;
}

function listAccounts() {
  try {
    return fs.readdirSync(CONFIG_DIR)
      .filter(f => f.startsWith('oauth-config-') && f.endsWith('.json'))
      .map(f => f.replace('oauth-config-', '').replace('.json', ''));
  } catch (error) {
    console.error(`Lỗi khi liệt kê tài khoản từ ${CONFIG_DIR}:`, error.message);
    return [];
  }
}

module.exports = { saveConfig, loadConfig, listAccounts }; 