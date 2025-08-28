// API 速率限制中間件
const rateLimit = require('express-rate-limit');

// Vercel 環境配置
const isProduction = process.env.NODE_ENV === 'production';
const isVercel = process.env.VERCEL === '1';

// 基礎配置，適用於不同環境
const baseConfig = {
  standardHeaders: true,
  legacyHeaders: false,
  // 開發環境跳過限制
  skip: () => !isProduction,
  // 安全的 IP 提取策略
  keyGenerator: (req) => {
    // 優先使用 X-Forwarded-For (代理環境)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    // 其次使用 req.ip
    if (req.ip) {
      return req.ip;
    }
    // 最後使用連接地址
    return req.connection?.remoteAddress || 'unknown';
  }
};

// 一般API限制
const apiLimiter = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000, // 15分鐘
  max: 100, // 每個IP最多100次請求
  message: {
    success: false,
    message: '請求過於頻繁，請稍後再試'
  },
});

// 訂單提交限制（更嚴格）
const orderLimiter = rateLimit({
  ...baseConfig,
  windowMs: 5 * 60 * 1000, // 5分鐘
  max: 3, // 每個IP最多3個訂單
  message: {
    success: false,
    message: '訂單提交過於頻繁，請5分鐘後再試'
  },
});

// 登入嘗試限制（開發期間放寬）
const loginLimiter = rateLimit({
  ...baseConfig,
  windowMs: 5 * 60 * 1000, // 5分鐘
  max: 20, // 每個IP最多20次登入嘗試
  message: '登入嘗試過於頻繁，請稍後再試',
});

module.exports = {
  apiLimiter,
  orderLimiter,
  loginLimiter
};