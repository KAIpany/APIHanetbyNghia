const fs = require('fs');
const path = require('path');
const CONFIG_DIR = path.join(__dirname, 'oauth-configs');

if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR);
}

function getConfigPath(username) {
  return path.join(CONFIG_DIR, `oauth-config-${username}.json`);
}

function saveConfig(username, config) {
  fs.writeFileSync(getConfigPath(username), JSON.stringify(config, null, 2), 'utf8');
}

function loadConfig(username) {
  const filePath = getConfigPath(username);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return null;
}

function listAccounts() {
  return fs.readdirSync(CONFIG_DIR)
    .filter(f => f.startsWith('oauth-config-') && f.endsWith('.json'))
    .map(f => f.replace('oauth-config-', '').replace('.json', ''));
}

module.exports = { saveConfig, loadConfig, listAccounts }; 