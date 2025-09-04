/**
 * Server-Sent Events (SSE) 推播通知服務
 * 處理即時訂單狀態更新和外送員位置追蹤
 */
class SSENotificationService {
  constructor() {
    // 儲存所有連接的客戶端
    this.connections = new Map(); // Map<connectionId, { res, userId, userType }>
    this.orderSubscriptions = new Map(); // Map<orderId, Set<connectionId>>
    this.driverSubscriptions = new Map(); // Map<driverId, Set<connectionId>>
    
    this.connectionIdCounter = 0;
  }

  /**
   * 建立SSE連接
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {string} userId - 用戶ID
   * @param {string} userType - 用戶類型 (customer, driver, admin)
   */
  createConnection(req, res, userId, userType = 'customer') {
    const connectionId = `conn_${++this.connectionIdCounter}_${Date.now()}`;
    
    // 設置SSE響應頭
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // 發送連接確認
    this.sendEvent(res, 'connected', {
      connectionId,
      timestamp: new Date().toISOString(),
      message: '即時通知連接已建立'
    });

    // 儲存連接資訊
    this.connections.set(connectionId, {
      res,
      userId,
      userType,
      connectedAt: new Date()
    });

    // 處理客戶端斷線
    req.on('close', () => {
      this.removeConnection(connectionId);
    });

    req.on('error', (err) => {
      console.error('SSE連接錯誤:', err);
      this.removeConnection(connectionId);
    });

    console.log(`🔔 新的SSE連接: ${connectionId} (用戶: ${userId}, 類型: ${userType})`);
    return connectionId;
  }

  /**
   * 移除連接
   * @param {string} connectionId - 連接ID
   */
  removeConnection(connectionId) {
    if (this.connections.has(connectionId)) {
      const connection = this.connections.get(connectionId);
      
      // 從訂單訂閱中移除
      for (const [orderId, connections] of this.orderSubscriptions.entries()) {
        connections.delete(connectionId);
        if (connections.size === 0) {
          this.orderSubscriptions.delete(orderId);
        }
      }

      // 從外送員訂閱中移除
      for (const [driverId, connections] of this.driverSubscriptions.entries()) {
        connections.delete(connectionId);
        if (connections.size === 0) {
          this.driverSubscriptions.delete(driverId);
        }
      }

      this.connections.delete(connectionId);
      console.log(`🔌 SSE連接已斷開: ${connectionId}`);
    }
  }

  /**
   * 訂閱訂單更新
   * @param {string} connectionId - 連接ID
   * @param {number} orderId - 訂單ID
   */
  subscribeToOrder(connectionId, orderId) {
    if (!this.orderSubscriptions.has(orderId)) {
      this.orderSubscriptions.set(orderId, new Set());
    }
    this.orderSubscriptions.get(orderId).add(connectionId);
    console.log(`🔔 連接 ${connectionId} 訂閱訂單 ${orderId}`);
  }

  /**
   * 訂閱外送員更新
   * @param {string} connectionId - 連接ID
   * @param {number} driverId - 外送員ID
   */
  subscribeToDriver(connectionId, driverId) {
    if (!this.driverSubscriptions.has(driverId)) {
      this.driverSubscriptions.set(driverId, new Set());
    }
    this.driverSubscriptions.get(driverId).add(connectionId);
    console.log(`🚚 連接 ${connectionId} 訂閱外送員 ${driverId}`);
  }

  /**
   * 發送事件到特定連接
   * @param {Object} res - Express response object
   * @param {string} event - 事件類型
   * @param {Object} data - 事件資料
   */
  sendEvent(res, event, data) {
    try {
      const eventData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      res.write(eventData);
    } catch (error) {
      console.error('發送SSE事件錯誤:', error);
    }
  }

  /**
   * 廣播訂單狀態更新
   * @param {number} orderId - 訂單ID
   * @param {Object} orderData - 訂單資料
   */
  broadcastOrderUpdate(orderId, orderData) {
    const connections = this.orderSubscriptions.get(orderId);
    if (!connections || connections.size === 0) {
      return;
    }

    const eventData = {
      orderId,
      ...orderData,
      timestamp: new Date().toISOString()
    };

    let successCount = 0;
    const deadConnections = [];

    connections.forEach(connectionId => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        try {
          this.sendEvent(connection.res, 'orderUpdate', eventData);
          successCount++;
        } catch (error) {
          console.error(`發送訂單更新失敗 (${connectionId}):`, error);
          deadConnections.push(connectionId);
        }
      } else {
        deadConnections.push(connectionId);
      }
    });

    // 清理失效連接
    deadConnections.forEach(connectionId => {
      this.removeConnection(connectionId);
    });

    console.log(`📢 訂單 ${orderId} 更新已廣播給 ${successCount} 個連接`);
  }

  /**
   * 廣播外送員位置更新
   * @param {number} driverId - 外送員ID
   * @param {Object} locationData - 位置資料
   */
  broadcastDriverLocation(driverId, locationData) {
    const connections = this.driverSubscriptions.get(driverId);
    if (!connections || connections.size === 0) {
      return;
    }

    const eventData = {
      driverId,
      ...locationData,
      timestamp: new Date().toISOString()
    };

    let successCount = 0;
    const deadConnections = [];

    connections.forEach(connectionId => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        try {
          this.sendEvent(connection.res, 'driverLocation', eventData);
          successCount++;
        } catch (error) {
          console.error(`發送位置更新失敗 (${connectionId}):`, error);
          deadConnections.push(connectionId);
        }
      } else {
        deadConnections.push(connectionId);
      }
    });

    // 清理失效連接
    deadConnections.forEach(connectionId => {
      this.removeConnection(connectionId);
    });

    console.log(`🚚 外送員 ${driverId} 位置更新已廣播給 ${successCount} 個連接`);
  }

  /**
   * 廣播系統通知
   * @param {string} message - 通知訊息
   * @param {string} level - 通知級別 (info, warning, error)
   * @param {Object} filters - 過濾條件
   */
  broadcastSystemNotification(message, level = 'info', filters = {}) {
    const eventData = {
      message,
      level,
      timestamp: new Date().toISOString()
    };

    let successCount = 0;
    const deadConnections = [];

    this.connections.forEach((connection, connectionId) => {
      // 檢查過濾條件
      if (filters.userType && connection.userType !== filters.userType) {
        return;
      }
      if (filters.userId && connection.userId !== filters.userId) {
        return;
      }

      try {
        this.sendEvent(connection.res, 'systemNotification', eventData);
        successCount++;
      } catch (error) {
        console.error(`發送系統通知失敗 (${connectionId}):`, error);
        deadConnections.push(connectionId);
      }
    });

    // 清理失效連接
    deadConnections.forEach(connectionId => {
      this.removeConnection(connectionId);
    });

    console.log(`📢 系統通知已發送給 ${successCount} 個連接`);
  }

  /**
   * 獲取連接統計資訊
   */
  getConnectionStats() {
    const stats = {
      totalConnections: this.connections.size,
      orderSubscriptions: this.orderSubscriptions.size,
      driverSubscriptions: this.driverSubscriptions.size,
      connectionsByType: {}
    };

    this.connections.forEach(connection => {
      const type = connection.userType;
      stats.connectionsByType[type] = (stats.connectionsByType[type] || 0) + 1;
    });

    return stats;
  }

  /**
   * 發送心跳包以保持連接
   */
  sendHeartbeat() {
    const deadConnections = [];

    this.connections.forEach((connection, connectionId) => {
      try {
        this.sendEvent(connection.res, 'heartbeat', { 
          timestamp: new Date().toISOString() 
        });
      } catch (error) {
        deadConnections.push(connectionId);
      }
    });

    deadConnections.forEach(connectionId => {
      this.removeConnection(connectionId);
    });
  }
}

module.exports = SSENotificationService;