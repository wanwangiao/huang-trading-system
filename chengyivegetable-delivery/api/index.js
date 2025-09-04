const express = require('express');
const path = require('path');

const app = express();

// 基本中介軟體設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// 設定 EJS 模板引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// 健康檢查端點
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: '簡化版本運行正常'
  });
});

// 首頁
app.get('/', (req, res) => {
  res.json({
    message: '誠憶鮮蔬外送系統',
    status: '系統運行中',
    timestamp: new Date().toISOString()
  });
});

// 404 處理
app.use((req, res) => {
  res.status(404).json({ error: 'Page not found' });
});

// 錯誤處理
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

module.exports = app;