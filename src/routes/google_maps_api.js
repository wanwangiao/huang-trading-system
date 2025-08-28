// =====================================
// Google Maps API 路由
// 提供地理編碼、路線規劃、訂單位置管理等功能
// =====================================

const express = require('express');
const GoogleMapsService = require('../services/GoogleMapsService');
const router = express.Router();

// 初始化 Google Maps 服務
let googleMapsService = null;

// 設定資料庫連線池（從主應用程式注入）
function setDatabasePool(pool) {
  googleMapsService = new GoogleMapsService(pool);
  console.log('🗺️ Google Maps API 路由已啟動');
}

// 中間件：確保 Google Maps 服務已初始化
function ensureGoogleMapsService(req, res, next) {
  if (!googleMapsService) {
    return res.status(503).json({
      success: false,
      message: 'Google Maps 服務尚未初始化'
    });
  }
  next();
}

// 管理員驗證中間件
function ensureAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({
    success: false,
    message: '需要管理員權限'
  });
}

// =====================================
// API 端點
// =====================================

/**
 * 地理編碼單個地址
 * POST /api/maps/geocode
 */
router.post('/geocode', ensureGoogleMapsService, async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({
        success: false,
        message: '地址參數必填'
      });
    }

    console.log(`📍 地理編碼請求: ${address}`);
    const result = await googleMapsService.geocodeAddress(address);

    if (result.success) {
      res.json({
        success: true,
        data: {
          lat: result.lat,
          lng: result.lng,
          formatted_address: result.formatted_address,
          place_id: result.place_id
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || '地理編碼失敗'
      });
    }

  } catch (error) {
    console.error('地理編碼API錯誤:', error);
    res.status(500).json({
      success: false,
      message: '地理編碼服務錯誤'
    });
  }
});

/**
 * 批量地理編碼訂單
 * POST /api/maps/batch-geocode
 */
router.post('/batch-geocode', ensureAdmin, ensureGoogleMapsService, async (req, res) => {
  try {
    const { orderIds } = req.body;
    
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '訂單ID列表必填且不能為空'
      });
    }

    // 從資料庫獲取訂單資料
    const pool = req.app.locals.pool;
    const query = `
      SELECT id, address 
      FROM orders 
      WHERE id = ANY($1) AND (lat IS NULL OR lng IS NULL)
    `;
    
    const result = await pool.query(query, [orderIds]);
    const orders = result.rows;

    if (orders.length === 0) {
      return res.json({
        success: true,
        message: '沒有需要地理編碼的訂單',
        results: []
      });
    }

    console.log(`🔄 批量地理編碼 ${orders.length} 個訂單`);
    const geocodeResults = await googleMapsService.batchGeocode(orders);

    res.json({
      success: true,
      message: `批量地理編碼完成，處理 ${geocodeResults.length} 個地址`,
      results: geocodeResults,
      stats: {
        total: geocodeResults.length,
        successful: geocodeResults.filter(r => r.success).length,
        failed: geocodeResults.filter(r => !r.success).length
      }
    });

  } catch (error) {
    console.error('批量地理編碼API錯誤:', error);
    res.status(500).json({
      success: false,
      message: '批量地理編碼服務錯誤'
    });
  }
});

/**
 * 路線規劃
 * POST /api/maps/plan-route
 */
router.post('/plan-route', ensureAdmin, ensureGoogleMapsService, async (req, res) => {
  try {
    const { origin, destination, waypoints = [] } = req.body;
    
    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        message: '起點和終點座標必填'
      });
    }

    console.log(`🛣️ 路線規劃請求: ${waypoints.length} 個途徑點`);
    const routeResult = await googleMapsService.planRoute(origin, destination, waypoints);

    if (routeResult.success) {
      res.json({
        success: true,
        data: routeResult
      });
    } else {
      res.status(400).json({
        success: false,
        message: routeResult.error || '路線規劃失敗'
      });
    }

  } catch (error) {
    console.error('路線規劃API錯誤:', error);
    res.status(500).json({
      success: false,
      message: '路線規劃服務錯誤'
    });
  }
});

/**
 * 計算距離矩陣
 * POST /api/maps/distance-matrix
 */
router.post('/distance-matrix', ensureAdmin, ensureGoogleMapsService, async (req, res) => {
  try {
    const { origins, destinations } = req.body;
    
    if (!Array.isArray(origins) || !Array.isArray(destinations)) {
      return res.status(400).json({
        success: false,
        message: '起點和終點必須是座標陣列'
      });
    }

    console.log(`📏 距離矩陣計算: ${origins.length}x${destinations.length}`);
    const distanceMatrix = await googleMapsService.getDistanceMatrix(origins, destinations);

    res.json({
      success: true,
      data: distanceMatrix
    });

  } catch (error) {
    console.error('距離矩陣API錯誤:', error);
    res.status(500).json({
      success: false,
      message: '距離矩陣計算服務錯誤'
    });
  }
});

/**
 * 獲取訂單地圖數據（用於管理介面地圖顯示）
 * GET /api/maps/orders-map-data
 */
router.get('/orders-map-data', ensureAdmin, async (req, res) => {
  try {
    const { status, dateFrom, dateTo, limit = 100 } = req.query;
    const pool = req.app.locals.pool;
    
    let whereClause = 'WHERE lat IS NOT NULL AND lng IS NOT NULL';
    const params = [];
    let paramIndex = 1;

    // 狀態篩選
    if (status && status !== 'all') {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // 日期篩選
    if (dateFrom) {
      whereClause += ` AND created_at >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      whereClause += ` AND created_at <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    const query = `
      SELECT 
        id, contact_name, contact_phone, address, status,
        total_amount as total, lat, lng, formatted_address,
        created_at, geocoded_at
      FROM orders 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}
    `;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    const orders = result.rows.map(order => ({
      ...order,
      lat: parseFloat(order.lat),
      lng: parseFloat(order.lng),
      total: parseFloat(order.total || 0)
    }));

    res.json({
      success: true,
      data: {
        orders,
        count: orders.length,
        center: calculateMapCenter(orders)
      }
    });

  } catch (error) {
    console.error('獲取訂單地圖數據錯誤:', error);
    res.status(500).json({
      success: false,
      message: '獲取地圖數據失敗'
    });
  }
});

/**
 * 快取統計
 * GET /api/maps/cache-stats
 */
router.get('/cache-stats', ensureAdmin, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    
    const statsQuery = `
      SELECT 
        COUNT(*) as total_entries,
        COUNT(*) FILTER (WHERE expires_at > NOW()) as active_entries,
        COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired_entries,
        SUM(hit_count) as total_hits,
        AVG(hit_count) as avg_hits,
        MAX(created_at) as last_cache_time
      FROM geocoding_cache
    `;

    const result = await pool.query(statsQuery);
    const stats = result.rows[0];

    res.json({
      success: true,
      data: {
        totalEntries: parseInt(stats.total_entries || 0),
        activeEntries: parseInt(stats.active_entries || 0),
        expiredEntries: parseInt(stats.expired_entries || 0),
        totalHits: parseInt(stats.total_hits || 0),
        avgHits: parseFloat(stats.avg_hits || 0).toFixed(2),
        lastCacheTime: stats.last_cache_time
      }
    });

  } catch (error) {
    console.error('獲取快取統計錯誤:', error);
    res.status(500).json({
      success: false,
      message: '獲取快取統計失敗'
    });
  }
});

/**
 * 清理過期快取
 * DELETE /api/maps/cache/cleanup
 */
router.delete('/cache/cleanup', ensureAdmin, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    
    const cleanupQuery = 'DELETE FROM geocoding_cache WHERE expires_at <= NOW()';
    const result = await pool.query(cleanupQuery);

    res.json({
      success: true,
      message: `已清理 ${result.rowCount} 個過期快取項目`
    });

  } catch (error) {
    console.error('清理快取錯誤:', error);
    res.status(500).json({
      success: false,
      message: '清理快取失敗'
    });
  }
});

// =====================================
// 工具函數
// =====================================

/**
 * 計算地圖中心點
 */
function calculateMapCenter(orders) {
  if (orders.length === 0) {
    // 預設台北市中心
    return { lat: 25.0330, lng: 121.5654 };
  }

  const avgLat = orders.reduce((sum, order) => sum + order.lat, 0) / orders.length;
  const avgLng = orders.reduce((sum, order) => sum + order.lng, 0) / orders.length;

  return { lat: avgLat, lng: avgLng };
}

// 導出路由和設置函數
module.exports = {
  router,
  setDatabasePool
};