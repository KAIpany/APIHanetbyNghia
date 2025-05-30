import React, { useState, useEffect } from 'react';
import { getAccounts, getCurrentAccount, setCurrentAccount, deleteAccount } from './directAccountManager';
import './MultiAccountManager.css';

const API_URL = process.env.REACT_APP_API_URL || '';

const MultiAccountManager = ({ onAccountChange }) => {
  const [accounts, setAccounts] = useState([]);
  const [currentAccount, setCurrentAccountState] = useState(null);
  const [tokenStatus, setTokenStatus] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Tải danh sách tài khoản
  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = () => {
    const accountsList = getAccounts();
    setAccounts(accountsList || []);
    const current = getCurrentAccount();
    setCurrentAccountState(current);
    
    // Kiểm tra trạng thái token cho tất cả tài khoản
    if (accountsList && accountsList.length > 0) {
      checkAllTokensStatus(accountsList);
    }
  };

  // Kiểm tra trạng thái token cho tất cả tài khoản
  const checkAllTokensStatus = async (accountsList) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Tạo danh sách tên tài khoản
      const accountNames = accountsList.map(acc => acc.id);
      
      // Gọi API để kiểm tra tokens
      const response = await fetch(`${API_URL}/api/multi-account?accounts=${accountNames.join(',')}&action=tokens`);
      const result = await response.json();
      
      if (result.success && result.data) {
        setTokenStatus(result.data);
      } else {
        setError(result.message || 'Không thể lấy thông tin token');
      }
    } catch (err) {
      console.error('Lỗi khi kiểm tra trạng thái token:', err);
      setError('Lỗi kết nối: ' + (err.message || 'Không thể kết nối đến server'));
    } finally {
      setIsLoading(false);
    }
  };

  // Xử lý chọn tài khoản
  const handleSelectAccount = async (accountId) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Cập nhật trạng thái hiện tại
      setCurrentAccount(accountId);
      
      // Gọi API để chuyển đổi tài khoản trên server
      const response = await fetch(`${API_URL}/api/account/${accountId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Cập nhật UI
        const current = getCurrentAccount();
        setCurrentAccountState(current);
        
        // Thông báo thay đổi tài khoản
        if (onAccountChange) {
          onAccountChange(current);
        }
        
        // Tải lại trạng thái token
        checkAllTokensStatus(accounts);
      } else {
        setError(result.message || 'Không thể chuyển đổi tài khoản');
      }
    } catch (err) {
      console.error('Lỗi khi chọn tài khoản:', err);
      setError('Lỗi kết nối: ' + (err.message || 'Không thể kết nối đến server'));
    } finally {
      setIsLoading(false);
    }
  };

  // Xử lý xóa tài khoản
  const handleDeleteAccount = async (accountId) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa tài khoản ${accountId}?`)) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Xóa tài khoản
      const deleted = deleteAccount(accountId);
      
      if (deleted) {
        // Gọi API để xóa tài khoản trên server
        await fetch(`${API_URL}/api/account/${accountId}`, {
          method: 'DELETE'
        });
        
        // Tải lại danh sách tài khoản
        loadAccounts();
      } else {
        setError('Không thể xóa tài khoản');
      }
    } catch (err) {
      console.error('Lỗi khi xóa tài khoản:', err);
      setError('Lỗi: ' + (err.message || 'Không thể xóa tài khoản'));
    } finally {
      setIsLoading(false);
    }
  };

  // Làm mới token cho tài khoản
  const handleRefreshToken = async (accountId) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Gọi API để làm mới token
      const response = await fetch(`${API_URL}/api/oauth/refresh/${accountId}`, {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Tải lại trạng thái token
        checkAllTokensStatus(accounts);
      } else {
        setError(result.message || 'Không thể làm mới token');
      }
    } catch (err) {
      console.error('Lỗi khi làm mới token:', err);
      setError('Lỗi kết nối: ' + (err.message || 'Không thể kết nối đến server'));
    } finally {
      setIsLoading(false);
    }
  };

  // Xử lý làm mới tất cả token
  const handleRefreshAllTokens = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn làm mới token cho tất cả tài khoản?')) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Gọi API để làm mới tất cả token
      const response = await fetch(`${API_URL}/api/oauth/refresh-all`, {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Tải lại trạng thái token
        checkAllTokensStatus(accounts);
      } else {
        setError(result.message || 'Không thể làm mới tất cả token');
      }
    } catch (err) {
      console.error('Lỗi khi làm mới tất cả token:', err);
      setError('Lỗi kết nối: ' + (err.message || 'Không thể kết nối đến server'));
    } finally {
      setIsLoading(false);
    }
  };

  // Hiển thị trạng thái token
  const renderTokenStatus = (accountId) => {
    if (!tokenStatus || !tokenStatus[accountId]) {
      return <span className="token-status unknown">Chưa kiểm tra</span>;
    }
    
    const status = tokenStatus[accountId];
    
    if (status.error) {
      return <span className="token-status error">Lỗi: {status.error}</span>;
    }
    
    if (status.valid) {
      return (
        <span className="token-status valid">
          Hợp lệ
          {status.expiresIn && (
            <span className="expires-in"> (Hết hạn sau: {Math.floor(status.expiresIn / 60)} phút)</span>
          )}
        </span>
      );
    }
    
    return <span className="token-status invalid">Không hợp lệ</span>;
  };

  return (
    <div className="multi-account-manager">
      <div className="account-header">
        <h2>Quản lý tài khoản</h2>
        <button 
          className="refresh-all-btn"
          onClick={handleRefreshAllTokens}
          disabled={isLoading || !accounts.length}
        >
          Làm mới tất cả token
        </button>
        <button 
          className="check-all-btn"
          onClick={() => checkAllTokensStatus(accounts)}
          disabled={isLoading || !accounts.length}
        >
          Kiểm tra trạng thái
        </button>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      {isLoading && <div className="loading">Đang xử lý...</div>}
      
      <div className="accounts-list">
        {accounts.length === 0 ? (
          <div className="no-accounts">Không có tài khoản nào. Vui lòng thêm tài khoản mới.</div>
        ) : (
          accounts.map(account => (
            <div 
              key={account.id} 
              className={`account-item ${currentAccount && currentAccount.id === account.id ? 'active' : ''}`}
            >
              <div className="account-info">
                <div className="account-name">
                  {account.name || account.id}
                  {currentAccount && currentAccount.id === account.id && (
                    <span className="current-marker"> (Hiện tại)</span>
                  )}
                </div>
                <div className="account-email">{account.email || 'Không có email'}</div>
                <div className="token-info">
                  {renderTokenStatus(account.id)}
                </div>
              </div>
              <div className="account-actions">
                <button 
                  className="select-btn"
                  onClick={() => handleSelectAccount(account.id)}
                  disabled={isLoading || (currentAccount && currentAccount.id === account.id)}
                >
                  Chọn
                </button>
                <button 
                  className="refresh-btn"
                  onClick={() => handleRefreshToken(account.id)}
                  disabled={isLoading}
                >
                  Làm mới token
                </button>
                <button 
                  className="delete-btn"
                  onClick={() => handleDeleteAccount(account.id)}
                  disabled={isLoading}
                >
                  Xóa
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MultiAccountManager;
