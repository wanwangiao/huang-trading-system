// 測試服務器啟動腳本
process.env.PORT = '8080';  // 設定測試端口

// 啟動主服務器
require('./src/server.js');