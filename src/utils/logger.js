// 簡單的日誌記錄工具
const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');

// 確保日誌目錄存在
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const getLogFileName = () => {
  const date = new Date().toISOString().split('T')[0];
  return path.join(logDir, `app-${date}.log`);
};

const formatLogMessage = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
  return `[${timestamp}] ${level.toUpperCase()}: ${message} ${metaStr}\n`;
};

const writeLog = (level, message, meta = {}) => {
  const logMessage = formatLogMessage(level, message, meta);
  const logFile = getLogFileName();
  
  // 寫入檔案（非同步）
  fs.appendFile(logFile, logMessage, (err) => {
    if (err) console.error('Log write error:', err);
  });
  
  // 開發環境也輸出到控制台
  if (process.env.NODE_ENV !== 'production') {
    console.log(logMessage.trim());
  }
};

const logger = {
  info: (message, meta) => writeLog('info', message, meta),
  warn: (message, meta) => writeLog('warn', message, meta),
  error: (message, meta) => writeLog('error', message, meta),
  
  // 特殊用途的日誌
  order: (orderId, action, meta) => writeLog('info', `Order ${orderId}: ${action}`, meta),
  security: (action, ip, meta) => writeLog('warn', `Security: ${action} from ${ip}`, meta),
  performance: (endpoint, duration, meta) => writeLog('info', `Performance: ${endpoint} took ${duration}ms`, meta)
};

module.exports = logger;