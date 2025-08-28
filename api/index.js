// Vercel Serverless Function 入口點
const express = require('express');
const path = require('path');

// 創建 Express 應用
const app = express();

// 設定 trust proxy 以支援 Vercel
app.set('trust proxy', true);

// 設定靜態檔案目錄
app.use(express.static(path.join(__dirname, '..', 'public')));

// 設定視圖引擎
app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');

// 基本中間件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 簡單的健康檢查路由
app.get('/', (req, res) => {
  res.render('index', {
    title: '誠意鮮蔬 - 新鮮蔬果宅配服務',
    message: '歡迎來到誠意鮮蔬線上購物平台！'
  });
});

// 404 處理
app.use('*', (req, res) => {
  res.status(404).render('404', {
    title: '頁面未找到'
  });
});

// 錯誤處理
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).render('error', {
    title: '伺服器錯誤',
    error: process.env.NODE_ENV === 'production' ? {} : err
  });
});

// 導出為 Vercel Function
module.exports = app;