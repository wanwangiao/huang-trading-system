// =====================================
// WebSocket API 路由
// 提供WebSocket連接統計和管理功能
// =====================================

const express = require('express');
const router = express.Router();

// 存儲WebSocket管理器實例的引用
let webSocketManager = null;

/**
 * 設定WebSocket管理器實例
 */
function setWebSocketManager(manager) {
  webSocketManager = manager;
  console.log('🔌 WebSocket API 路由已連接到管理器');
}

/**
 * 中間件：確保WebSocket管理器已設定
 */
function ensureWebSocketManager(req, res, next) {
  if (!webSocketManager) {
    return res.status(503).json({
      success: false,
      message: 'WebSocket管理器未初始化'
    });
  }
  next();
}

/**
 * 中間件：管理員權限驗證
 */
function ensureAdmin(req, res, next) {
  if (!req.session || !req.session.isAdmin) {
    return res.status(401).json({
      success: false,
      message: '需要管理員權限'
    });
  }
  next();
}

// =====================================
// API 端點
// =====================================

/**
 * 獲取WebSocket連接統計
 * GET /api/websocket/stats
 */
router.get('/stats', ensureAdmin, ensureWebSocketManager, (req, res) => {
  try {
    const stats = webSocketManager.getStats();
    
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('獲取WebSocket統計錯誤:', error);
    res.status(500).json({
      success: false,
      message: '獲取統計失敗'
    });
  }
});

/**
 * 獲取活躍連接列表
 * GET /api/websocket/connections
 */
router.get('/connections', ensureAdmin, ensureWebSocketManager, (req, res) => {
  try {
    const connections = [];
    
    webSocketManager.connections.forEach((ws, connectionId) => {
      connections.push({
        connectionId,
        userType: ws.userType || null,
        userId: ws.userId || null,
        authenticated: ws.authenticated || false,
        joinedRooms: Array.from(ws.joinedRooms || []),
        connectedAt: ws.connectedAt || null
      });
    });
    
    res.json({
      success: true,
      connections,
      total: connections.length
    });
  } catch (error) {
    console.error('獲取連接列表錯誤:', error);
    res.status(500).json({
      success: false,
      message: '獲取連接列表失敗'
    });
  }
});

/**
 * 獲取房間資訊
 * GET /api/websocket/rooms
 */
router.get('/rooms', ensureAdmin, ensureWebSocketManager, (req, res) => {
  try {
    const rooms = {};
    
    webSocketManager.rooms.forEach((connections, roomName) => {
      rooms[roomName] = {
        name: roomName,
        connectionCount: connections.size,
        connections: Array.from(connections)
      };
    });
    
    res.json({
      success: true,
      rooms,
      total: Object.keys(rooms).length
    });
  } catch (error) {
    console.error('獲取房間資訊錯誤:', error);
    res.status(500).json({
      success: false,
      message: '獲取房間資訊失敗'
    });
  }
});

/**
 * 向特定房間發送廣播訊息
 * POST /api/websocket/broadcast
 */
router.post('/broadcast', ensureAdmin, ensureWebSocketManager, (req, res) => {
  try {
    const { room, message, priority = 'normal' } = req.body;
    
    if (!room || !message) {
      return res.status(400).json({
        success: false,
        message: '房間名稱和訊息內容必填'
      });
    }
    
    const broadcastMessage = {
      type: 'admin_broadcast',
      room,
      content: message,
      priority,
      sender: {
        userType: 'admin',
        userId: 'system'
      },
      timestamp: new Date().toISOString()
    };
    
    const sentCount = webSocketManager.broadcastToRoom(room, broadcastMessage);
    
    res.json({
      success: true,
      message: `廣播已發送到房間 ${room}`,
      sentToConnections: sentCount
    });
    
    console.log(`📢 管理員廣播到房間 ${room}: ${message} (${sentCount} 個連接)`);
  } catch (error) {
    console.error('發送廣播錯誤:', error);
    res.status(500).json({
      success: false,
      message: '發送廣播失敗'
    });
  }
});

/**
 * 向特定用戶發送私人訊息
 * POST /api/websocket/private-message
 */
router.post('/private-message', ensureAdmin, ensureWebSocketManager, (req, res) => {
  try {
    const { targetUserType, targetUserId, message } = req.body;
    
    if (!targetUserType || !targetUserId || !message) {
      return res.status(400).json({
        success: false,
        message: '目標用戶類型、用戶ID和訊息內容必填'
      });
    }
    
    const targetConnectionId = webSocketManager.userSessions.get(`${targetUserType}_${targetUserId}`);
    
    if (!targetConnectionId) {
      return res.status(404).json({
        success: false,
        message: '目標用戶未在線'
      });
    }
    
    const privateMessage = {
      type: 'admin_private_message',
      content: message,
      sender: {
        userType: 'admin',
        userId: 'system'
      },
      timestamp: new Date().toISOString()
    };
    
    const sent = webSocketManager.sendToConnection(targetConnectionId, privateMessage);
    
    if (sent) {
      res.json({
        success: true,
        message: `私人訊息已發送給 ${targetUserType}_${targetUserId}`
      });
      
      console.log(`💬 管理員私訊: ${targetUserType}_${targetUserId} - ${message}`);
    } else {
      res.status(500).json({
        success: false,
        message: '發送失敗'
      });
    }
  } catch (error) {
    console.error('發送私人訊息錯誤:', error);
    res.status(500).json({
      success: false,
      message: '發送私人訊息失敗'
    });
  }
});

/**
 * 強制斷開特定連接
 * DELETE /api/websocket/connections/:connectionId
 */
router.delete('/connections/:connectionId', ensureAdmin, ensureWebSocketManager, (req, res) => {
  try {
    const { connectionId } = req.params;
    const ws = webSocketManager.connections.get(connectionId);
    
    if (!ws) {
      return res.status(404).json({
        success: false,
        message: '找不到指定的連接'
      });
    }
    
    // 發送斷開通知
    webSocketManager.sendToConnection(connectionId, {
      type: 'admin_disconnect',
      message: '管理員已斷開您的連接',
      timestamp: new Date().toISOString()
    });
    
    // 強制關閉連接
    ws.close();
    
    res.json({
      success: true,
      message: `連接 ${connectionId} 已被強制斷開`
    });
    
    console.log(`🔌 管理員強制斷開連接: ${connectionId}`);
  } catch (error) {
    console.error('斷開連接錯誤:', error);
    res.status(500).json({
      success: false,
      message: '斷開連接失敗'
    });
  }
});

/**
 * 獲取用戶會話資訊
 * GET /api/websocket/sessions
 */
router.get('/sessions', ensureAdmin, ensureWebSocketManager, (req, res) => {
  try {
    const sessions = {};
    
    webSocketManager.userSessions.forEach((connectionId, userKey) => {
      const [userType, userId] = userKey.split('_');
      if (!sessions[userType]) {
        sessions[userType] = [];
      }
      
      sessions[userType].push({
        userId,
        connectionId,
        userKey
      });
    });
    
    res.json({
      success: true,
      sessions,
      totalSessions: webSocketManager.userSessions.size
    });
  } catch (error) {
    console.error('獲取用戶會話錯誤:', error);
    res.status(500).json({
      success: false,
      message: '獲取用戶會話失敗'
    });
  }
});

/**
 * 清理無效連接
 * POST /api/websocket/cleanup
 */
router.post('/cleanup', ensureAdmin, ensureWebSocketManager, (req, res) => {
  try {
    let cleanedCount = 0;
    
    webSocketManager.connections.forEach((ws, connectionId) => {
      if (ws.readyState !== 1) { // WebSocket.OPEN = 1
        webSocketManager.handleDisconnection(connectionId);
        cleanedCount++;
      }
    });
    
    res.json({
      success: true,
      message: `已清理 ${cleanedCount} 個無效連接`,
      cleanedConnections: cleanedCount
    });
    
    console.log(`🧹 管理員清理了 ${cleanedCount} 個無效連接`);
  } catch (error) {
    console.error('清理連接錯誤:', error);
    res.status(500).json({
      success: false,
      message: '清理連接失敗'
    });
  }
});

/**
 * 獲取外送員位置資訊
 * GET /api/websocket/driver-locations
 */
router.get('/driver-locations', ensureAdmin, ensureWebSocketManager, (req, res) => {
  try {
    const driverLocations = [];
    
    webSocketManager.connections.forEach((ws, connectionId) => {
      if (ws.userType === 'driver' && ws.lastLocation) {
        driverLocations.push({
          driverId: ws.userId,
          connectionId,
          location: ws.lastLocation,
          lastUpdate: ws.lastLocationUpdate
        });
      }
    });
    
    res.json({
      success: true,
      driverLocations,
      total: driverLocations.length
    });
  } catch (error) {
    console.error('獲取外送員位置錯誤:', error);
    res.status(500).json({
      success: false,
      message: '獲取外送員位置失敗'
    });
  }
});

module.exports = {
  router,
  setWebSocketManager
};