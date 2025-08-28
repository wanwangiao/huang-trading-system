const express = require('express');

const app = express();
const port = process.env.PORT || 3000;

// Vercel 代理設定
app.set('trust proxy', true);

// 簡單中間件
app.use(express.json({ limit: '1mb' }));

// 健康檢查
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// LINE Webhook
app.post('/api/line/webhook', (req, res) => {
  console.log('LINE Webhook received');
  res.status(200).json({ status: 'OK', timestamp: Date.now() });
});

// 默認路由
app.get('/', (req, res) => {
  res.status(200).send('LINE Webhook Server Running');
});

// 所有其他路由
app.use('*', (req, res) => {
  res.status(200).json({ 
    message: 'LINE Webhook Server', 
    endpoint: '/api/line/webhook' 
  });
});

// 錯誤處理
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(200).send('OK'); // 強制返回 200
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

module.exports = app;