/**
 * 即時通知API路由
 * 處理SSE連接、訂閱管理和狀態更新
 */
const express = require('express');
const router = express.Router();

/**
 * 初始化即時通知路由
 * @param {Object} sseService - SSE通知服務實例
 * @param {Object} orderNotificationService - 訂單通知服務實例
 * @param {Object} driverLocationService - 外送員位置服務實例
 */
function initializeRealtimeRoutes(sseService, orderNotificationService, driverLocationService) {
  
  /**
   * 建立SSE連接端點
   */
  router.get('/stream', (req, res) => {
    const userId = req.query.userId || 'anonymous';
    const userType = req.query.userType || 'customer';
    
    try {
      const connectionId = sseService.createConnection(req, res, userId, userType);
      
      // 記錄新連接
      console.log(`📡 新的SSE連接建立: ${connectionId} (${userType}:${userId})`);
      
    } catch (error) {
      console.error('建立SSE連接失敗:', error);
      res.status(500).json({ error: '無法建立即時通知連接' });
    }
  });

  /**
   * 訂閱訂單更新
   */
  router.post('/subscribe/order', (req, res) => {
    try {
      const { connectionId, orderId } = req.body;
      
      if (!connectionId || !orderId) {
        return res.status(400).json({ error: '缺少必要參數' });
      }
      
      sseService.subscribeToOrder(connectionId, parseInt(orderId));
      
      res.json({ 
        success: true, 
        message: `已訂閱訂單 ${orderId} 的更新通知`,
        connectionId,
        orderId 
      });
      
    } catch (error) {
      console.error('訂閱訂單更新失敗:', error);
      res.status(500).json({ error: '訂閱失敗' });
    }
  });

  /**
   * 訂閱外送員位置更新
   */
  router.post('/subscribe/driver', (req, res) => {
    try {
      const { connectionId, driverId } = req.body;
      
      if (!connectionId || !driverId) {
        return res.status(400).json({ error: '缺少必要參數' });
      }
      
      sseService.subscribeToDriver(connectionId, parseInt(driverId));
      
      res.json({ 
        success: true, 
        message: `已訂閱外送員 ${driverId} 的位置更新`,
        connectionId,
        driverId 
      });
      
    } catch (error) {
      console.error('訂閱外送員更新失敗:', error);
      res.status(500).json({ error: '訂閱失敗' });
    }
  });

  /**
   * 手動更新訂單狀態 (管理員/系統使用)
   */
  router.post('/order/:id/status', async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const { status, changedBy = 'admin', notes, estimatedDeliveryTime } = req.body;
      
      if (!status) {
        return res.status(400).json({ error: '缺少訂單狀態' });
      }
      
      const updatedOrder = await orderNotificationService.updateOrderStatus(orderId, status, {
        changedBy,
        notes,
        estimatedDeliveryTime
      });
      
      res.json({
        success: true,
        message: '訂單狀態已更新',
        order: updatedOrder
      });
      
    } catch (error) {
      console.error('更新訂單狀態失敗:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 分配外送員給訂單
   */
  router.post('/order/:id/assign-driver', async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const { driverId, assignedBy = 'admin' } = req.body;
      
      if (!driverId) {
        return res.status(400).json({ error: '缺少外送員ID' });
      }
      
      const result = await orderNotificationService.assignDriverToOrder(orderId, parseInt(driverId), {
        assignedBy
      });
      
      res.json({
        success: true,
        message: '外送員分配成功',
        assignment: result
      });
      
    } catch (error) {
      console.error('分配外送員失敗:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 更新外送員位置
   */
  router.post('/driver/:id/location', async (req, res) => {
    try {
      const driverId = parseInt(req.params.id);
      const locationData = req.body;
      
      if (!locationData.lat || !locationData.lng) {
        return res.status(400).json({ error: '缺少位置座標' });
      }
      
      const result = await driverLocationService.updateDriverLocation(driverId, locationData);
      
      res.json({
        success: true,
        message: '外送員位置已更新',
        location: result
      });
      
    } catch (error) {
      console.error('更新外送員位置失敗:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 開始追蹤外送員位置
   */
  router.post('/driver/:id/start-tracking', async (req, res) => {
    try {
      const driverId = parseInt(req.params.id);
      const { orderId } = req.body;
      
      await driverLocationService.startLocationTracking(driverId, orderId);
      
      res.json({
        success: true,
        message: '外送員位置追蹤已開始',
        driverId,
        orderId
      });
      
    } catch (error) {
      console.error('開始位置追蹤失敗:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 停止追蹤外送員位置
   */
  router.post('/driver/:id/stop-tracking', async (req, res) => {
    try {
      const driverId = parseInt(req.params.id);
      
      await driverLocationService.stopLocationTracking(driverId);
      
      res.json({
        success: true,
        message: '外送員位置追蹤已停止',
        driverId
      });
      
    } catch (error) {
      console.error('停止位置追蹤失敗:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 獲取外送員當前位置
   */
  router.get('/driver/:id/location', async (req, res) => {
    try {
      const driverId = parseInt(req.params.id);
      
      const location = await driverLocationService.getDriverCurrentLocation(driverId);
      
      res.json({
        success: true,
        driver: location
      });
      
    } catch (error) {
      console.error('獲取外送員位置失敗:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 獲取外送員位置歷史
   */
  router.get('/driver/:id/location-history', async (req, res) => {
    try {
      const driverId = parseInt(req.params.id);
      const { orderId, startTime, endTime, limit } = req.query;
      
      const history = await driverLocationService.getDriverLocationHistory(driverId, {
        orderId: orderId ? parseInt(orderId) : null,
        startTime,
        endTime,
        limit: limit ? parseInt(limit) : 50
      });
      
      res.json({
        success: true,
        history
      });
      
    } catch (error) {
      console.error('獲取位置歷史失敗:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 獲取附近可用的外送員
   */
  router.get('/nearby-drivers', async (req, res) => {
    try {
      const { lat, lng, radius } = req.query;
      
      if (!lat || !lng) {
        return res.status(400).json({ error: '缺少位置座標' });
      }
      
      const drivers = await driverLocationService.getNearbyAvailableDrivers(
        parseFloat(lat),
        parseFloat(lng),
        radius ? parseFloat(radius) : 5
      );
      
      res.json({
        success: true,
        drivers
      });
      
    } catch (error) {
      console.error('獲取附近外送員失敗:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 計算配送預估時間
   */
  router.get('/delivery-estimate', async (req, res) => {
    try {
      const { driverId, lat, lng } = req.query;
      
      if (!driverId || !lat || !lng) {
        return res.status(400).json({ error: '缺少必要參數' });
      }
      
      const estimate = await driverLocationService.calculateDeliveryEstimate(
        parseInt(driverId),
        parseFloat(lat),
        parseFloat(lng)
      );
      
      res.json({
        success: true,
        estimate
      });
      
    } catch (error) {
      console.error('計算配送預估失敗:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 獲取訂單狀態歷史
   */
  router.get('/order/:id/status-history', async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      
      const history = await orderNotificationService.getOrderStatusHistory(orderId);
      
      res.json({
        success: true,
        history
      });
      
    } catch (error) {
      console.error('獲取訂單狀態歷史失敗:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 獲取連接統計資訊
   */
  router.get('/stats', (req, res) => {
    try {
      const connectionStats = sseService.getConnectionStats();
      
      res.json({
        success: true,
        stats: connectionStats
      });
      
    } catch (error) {
      console.error('獲取統計資訊失敗:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 發送測試通知 (開發用)
   */
  router.post('/test-notification', (req, res) => {
    try {
      const { type = 'system', message = '測試通知', level = 'info' } = req.body;
      
      sseService.broadcastSystemNotification(message, level);
      
      res.json({
        success: true,
        message: '測試通知已發送'
      });
      
    } catch (error) {
      console.error('發送測試通知失敗:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 取消訂單
   */
  router.post('/order/:id/cancel', async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const { reason = '客戶取消', cancelledBy = 'customer' } = req.body;
      
      await orderNotificationService.cancelOrder(orderId, {
        reason,
        cancelledBy
      });
      
      res.json({
        success: true,
        message: '訂單已取消'
      });
      
    } catch (error) {
      console.error('取消訂單失敗:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 獲取活躍外送員統計
   */
  router.get('/driver-stats', async (req, res) => {
    try {
      const stats = await driverLocationService.getActiveDriversStats();
      
      res.json({
        success: true,
        stats
      });
      
    } catch (error) {
      console.error('獲取外送員統計失敗:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = initializeRealtimeRoutes;