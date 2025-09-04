// =====================================
// 安全的 Google Maps API 路由
// 提供受保護的 API 端點和成本控制
// =====================================

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const GoogleMapsProxyService = require('../services/GoogleMapsProxyService');
const GoogleMapsMonitoringService = require('../services/GoogleMapsMonitoringService');
const EnhancedGoogleMapsService = require('../services/EnhancedGoogleMapsService');

let googleMapsProxy;
let monitoringService;
let enhancedService;
let databasePool;

// 設定資料庫連線池
function setDatabasePool(pool) {
  databasePool = pool;
  googleMapsProxy = new GoogleMapsProxyService(pool);
  monitoringService = new GoogleMapsMonitoringService(pool);
  enhancedService = new EnhancedGoogleMapsService(pool);
}

// API 限制中間件
const geocodingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分鐘
  max: 100, // 限制每個IP每15分鐘最多100次請求
  message: {
    success: false,
    error: 'API 請求頻率過高，請稍後再試',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const distanceMatrixLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分鐘
  max: 50, // 限制每個IP每15分鐘最多50次請求（距離矩陣成本較高）
  message: {
    success: false,
    error: '距離矩陣 API 請求頻率過高，請稍後再試',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 成本控制中間件
const costControlMiddleware = async (req, res, next) => {
  try {
    if (!monitoringService || !databasePool) {
      return next();
    }
    
    // 檢查今日成本是否超過限制
    const todayStats = await databasePool.query(`
      SELECT SUM(api_cost) as today_cost
      FROM google_maps_usage_log 
      WHERE created_at >= CURRENT_DATE
    `);
    
    const todayCost = parseFloat(todayStats.rows[0]?.today_cost || 0);
    const dailyLimit = 15.00; // 每日成本限制 $15 USD
    
    if (todayCost >= dailyLimit) {
      return res.status(429).json({
        success: false,
        error: '今日 API 成本已達上限，請明天再試',
        currentCost: todayCost.toFixed(2),
        limit: dailyLimit
      });
    }
    
    // 檢查本月成本是否接近限制
    const monthStats = await databasePool.query(`
      SELECT SUM(api_cost) as month_cost
      FROM google_maps_usage_log 
      WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
    `);
    
    const monthCost = parseFloat(monthStats.rows[0]?.month_cost || 0);
    const monthlyLimit = 180.00; // 每月成本限制 $180 USD
    
    if (monthCost >= monthlyLimit * 0.9) { // 達到90%時警告
      console.warn(`⚠️ 本月 Google Maps API 成本已達 ${(monthCost/monthlyLimit*100).toFixed(1)}%`);
    }
    
    if (monthCost >= monthlyLimit) {
      return res.status(429).json({
        success: false,
        error: '本月 API 成本已達上限',
        currentCost: monthCost.toFixed(2),
        limit: monthlyLimit
      });
    }
    
    next();
    
  } catch (error) {
    console.error('成本控制中間件錯誤:', error);
    next(); // 即使檢查失敗也繼續處理請求
  }
};

// 請求驗證中間件
const validateApiRequest = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const validApiKeys = process.env.INTERNAL_API_KEYS?.split(',') || [];
  
  // 如果設定了內部 API Key，則需要驗證
  if (validApiKeys.length > 0 && !validApiKeys.includes(apiKey)) {
    return res.status(401).json({
      success: false,
      error: '無效的 API Key'
    });
  }
  
  next();
};

// 安全的地理編碼端點
router.post('/geocode', 
  validateApiRequest,
  geocodingLimiter, 
  costControlMiddleware,
  async (req, res) => {
    try {
      if (!enhancedService) {
        return res.status(500).json({
          success: false,
          error: '服務未初始化'
        });
      }
      
      const { address } = req.body;
      
      if (!address) {
        return res.status(400).json({
          success: false,
          error: '缺少必要參數: address'
        });
      }
      
      const result = await enhancedService.enhancedGeocode(address, {
        clientIP: req.ip,
        userAgent: req.get('User-Agent'),
        language: req.body.language || 'zh-TW',
        region: req.body.region || 'tw'
      });
      
      return res.json(result);
      
    } catch (error) {
      console.error('地理編碼端點錯誤:', error);
      return res.status(500).json({
        success: false,
        error: '內部伺服器錯誤'
      });
    }
  }
);

// 批量地理編碼端點
router.post('/batch-geocode',
  validateApiRequest,
  geocodingLimiter,
  costControlMiddleware,
  async (req, res) => {
    try {
      if (!enhancedService) {
        return res.status(500).json({
          success: false,
          error: '服務未初始化'
        });
      }
      
      const { addresses } = req.body;
      
      if (!addresses || !Array.isArray(addresses)) {
        return res.status(400).json({
          success: false,
          error: '缺少必要參數: addresses (array)'
        });
      }
      
      if (addresses.length > 50) {
        return res.status(400).json({
          success: false,
          error: '批量限制: 最多50個地址'
        });
      }
      
      const result = await enhancedService.enhancedBatchGeocode(addresses, {
        clientIP: req.ip,
        userAgent: req.get('User-Agent'),
        batchSize: req.body.batchSize || 25,
        delay: req.body.delay || 200,
        timeout: req.body.timeout || 10000
      });
      
      return res.json(result);
      
    } catch (error) {
      console.error('批量地理編碼端點錯誤:', error);
      return res.status(500).json({
        success: false,
        error: '內部伺服器錯誤'
      });
    }
  }
);

// 安全的距離矩陣端點
router.post('/distance-matrix',
  validateApiRequest,
  distanceMatrixLimiter,
  costControlMiddleware,
  async (req, res) => {
    try {
      if (!googleMapsProxy) {
        return res.status(500).json({
          success: false,
          error: '服務未初始化'
        });
      }
      
      await googleMapsProxy.proxyDistanceMatrix(req, res);
      
    } catch (error) {
      console.error('距離矩陣端點錯誤:', error);
      return res.status(500).json({
        success: false,
        error: '內部伺服器錯誤'
      });
    }
  }
);

// 使用量統計端點（僅限管理員）
router.get('/usage-stats', 
  validateApiRequest,
  async (req, res) => {
    try {
      if (!monitoringService) {
        return res.status(500).json({
          success: false,
          error: '監控服務未初始化'
        });
      }
      
      const stats = await monitoringService.getRealTimeStats();
      return res.json({
        success: true,
        data: stats
      });
      
    } catch (error) {
      console.error('使用量統計端點錯誤:', error);
      return res.status(500).json({
        success: false,
        error: '無法獲取統計資料'
      });
    }
  }
);

// 使用趨勢端點
router.get('/usage-trends',
  validateApiRequest,
  async (req, res) => {
    try {
      if (!monitoringService) {
        return res.status(500).json({
          success: false,
          error: '監控服務未初始化'
        });
      }
      
      const days = parseInt(req.query.days) || 30;
      const trends = await monitoringService.getUsageTrends(days);
      
      return res.json({
        success: true,
        data: trends
      });
      
    } catch (error) {
      console.error('使用趨勢端點錯誤:', error);
      return res.status(500).json({
        success: false,
        error: '無法獲取趨勢資料'
      });
    }
  }
);

// 快取統計端點
router.get('/cache-stats',
  validateApiRequest,
  async (req, res) => {
    try {
      if (!enhancedService || !monitoringService) {
        return res.status(500).json({
          success: false,
          error: '服務未初始化'
        });
      }
      
      const cacheStats = await monitoringService.getCacheStats();
      const runtimeStats = enhancedService.getCacheStatistics();
      
      return res.json({
        success: true,
        data: {
          database: cacheStats,
          runtime: runtimeStats
        }
      });
      
    } catch (error) {
      console.error('快取統計端點錯誤:', error);
      return res.status(500).json({
        success: false,
        error: '無法獲取快取統計'
      });
    }
  }
);

// 成本報告端點
router.get('/cost-report',
  validateApiRequest,
  async (req, res) => {
    try {
      if (!monitoringService) {
        return res.status(500).json({
          success: false,
          error: '監控服務未初始化'
        });
      }
      
      const startDate = req.query.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = req.query.end_date || new Date().toISOString().split('T')[0];
      
      const report = await monitoringService.generateUsageReport(startDate, endDate);
      
      return res.json({
        success: true,
        data: report
      });
      
    } catch (error) {
      console.error('成本報告端點錯誤:', error);
      return res.status(500).json({
        success: false,
        error: '無法生成成本報告'
      });
    }
  }
);

// 健康檢查端點
router.get('/health',
  async (req, res) => {
    try {
      const status = {
        service: 'Google Maps Secure API',
        status: 'operational',
        timestamp: new Date().toISOString(),
        database: databasePool ? 'connected' : 'disconnected',
        services: {
          proxy: !!googleMapsProxy,
          monitoring: !!monitoringService,
          enhanced: !!enhancedService
        }
      };
      
      // 檢查 API Key 是否可用
      if (process.env.GOOGLE_MAPS_API_KEY && 
          process.env.GOOGLE_MAPS_API_KEY !== 'your_google_maps_key_here') {
        status.apiKey = 'configured';
      } else {
        status.apiKey = 'missing';
        status.status = 'degraded';
      }
      
      // 檢查資料庫連線
      if (databasePool) {
        try {
          await databasePool.query('SELECT 1');
          status.database = 'healthy';
        } catch (error) {
          status.database = 'unhealthy';
          status.status = 'degraded';
        }
      }
      
      const httpStatus = status.status === 'operational' ? 200 : 503;
      return res.status(httpStatus).json(status);
      
    } catch (error) {
      console.error('健康檢查錯誤:', error);
      return res.status(500).json({
        service: 'Google Maps Secure API',
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

// 系統管理端點（清理快取）
router.post('/admin/cleanup-cache',
  validateApiRequest,
  async (req, res) => {
    try {
      if (!databasePool) {
        return res.status(500).json({
          success: false,
          error: '資料庫未連接'
        });
      }
      
      const result = await databasePool.query('SELECT cleanup_expired_geocoding_cache()');
      const deletedCount = result.rows[0]?.cleanup_expired_geocoding_cache || 0;
      
      return res.json({
        success: true,
        message: `清理了 ${deletedCount} 個過期快取項目`,
        deletedCount
      });
      
    } catch (error) {
      console.error('清理快取端點錯誤:', error);
      return res.status(500).json({
        success: false,
        error: '清理快取失敗'
      });
    }
  }
);

// 系統管理端點（更新統計）
router.post('/admin/update-stats',
  validateApiRequest,
  async (req, res) => {
    try {
      if (!monitoringService) {
        return res.status(500).json({
          success: false,
          error: '監控服務未初始化'
        });
      }
      
      await monitoringService.updateDailyStats();
      
      return res.json({
        success: true,
        message: '統計資料更新完成'
      });
      
    } catch (error) {
      console.error('更新統計端點錯誤:', error);
      return res.status(500).json({
        success: false,
        error: '更新統計失敗'
      });
    }
  }
);

// 緊急停用端點（當成本超標時）
router.post('/admin/emergency-disable',
  validateApiRequest,
  async (req, res) => {
    try {
      // 設定緊急停用標誌
      process.env.GOOGLE_MAPS_EMERGENCY_DISABLED = 'true';
      
      console.warn('🚨 Google Maps API 已緊急停用');
      
      return res.json({
        success: true,
        message: 'Google Maps API 已緊急停用',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('緊急停用端點錯誤:', error);
      return res.status(500).json({
        success: false,
        error: '緊急停用失敗'
      });
    }
  }
);

// 重新啟用端點
router.post('/admin/re-enable',
  validateApiRequest,
  async (req, res) => {
    try {
      // 移除緊急停用標誌
      delete process.env.GOOGLE_MAPS_EMERGENCY_DISABLED;
      
      console.log('✅ Google Maps API 已重新啟用');
      
      return res.json({
        success: true,
        message: 'Google Maps API 已重新啟用',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('重新啟用端點錯誤:', error);
      return res.status(500).json({
        success: false,
        error: '重新啟用失敗'
      });
    }
  }
);

module.exports = { 
  router,
  setDatabasePool
};