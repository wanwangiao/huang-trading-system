// =====================================
// WebSocket 連接管理服務
// 提供雙向即時通訊、房間管理、訊息廣播功能
// =====================================

const WebSocket = require('ws');
const EventEmitter = require('events');

class WebSocketManager extends EventEmitter {
  constructor(server) {
    super();
    this.wss = new WebSocket.Server({ server });
    this.connections = new Map(); // 存儲所有連接
    this.rooms = new Map(); // 房間管理
    this.userSessions = new Map(); // 用戶會話
    this.setupWebSocketServer();
    
    console.log('🔌 WebSocket 管理器已啟動');
  }

  /**
   * 設定WebSocket伺服器
   */
  setupWebSocketServer() {
    this.wss.on('connection', (ws, req) => {
      const connectionId = this.generateConnectionId();
      ws.connectionId = connectionId;
      ws.isAlive = true;
      ws.joinedRooms = new Set();
      
      // 存儲連接
      this.connections.set(connectionId, ws);
      
      console.log(`🔗 新的WebSocket連接: ${connectionId}`);
      
      // 發送連接確認
      this.sendToConnection(connectionId, {
        type: 'connected',
        connectionId,
        timestamp: new Date().toISOString()
      });

      // 設定訊息處理
      ws.on('message', (data) => {
        this.handleMessage(connectionId, data);
      });

      // 設定Pong回應（心跳檢測）
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // 處理連接關閉
      ws.on('close', () => {
        this.handleDisconnection(connectionId);
      });

      // 處理錯誤
      ws.on('error', (error) => {
        console.error(`WebSocket錯誤 ${connectionId}:`, error);
        this.handleDisconnection(connectionId);
      });
    });

    // 設定心跳檢測
    this.setupHeartbeat();
  }

  /**
   * 處理收到的訊息
   */
  handleMessage(connectionId, data) {
    try {
      const message = JSON.parse(data);
      const ws = this.connections.get(connectionId);
      
      if (!ws) {
        console.warn(`找不到連接: ${connectionId}`);
        return;
      }

      console.log(`📨 收到訊息 [${connectionId}]:`, message.type);

      switch (message.type) {
        case 'auth':
          this.handleAuth(connectionId, message);
          break;
        case 'join_room':
          this.handleJoinRoom(connectionId, message);
          break;
        case 'leave_room':
          this.handleLeaveRoom(connectionId, message);
          break;
        case 'broadcast':
          this.handleBroadcast(connectionId, message);
          break;
        case 'private_message':
          this.handlePrivateMessage(connectionId, message);
          break;
        case 'driver_location':
          this.handleDriverLocation(connectionId, message);
          break;
        case 'ping':
          this.handlePing(connectionId);
          break;
        default:
          console.warn(`未知的訊息類型: ${message.type}`);
      }
    } catch (error) {
      console.error(`處理訊息錯誤 ${connectionId}:`, error);
      this.sendToConnection(connectionId, {
        type: 'error',
        message: '訊息格式錯誤'
      });
    }
  }

  /**
   * 處理身份驗證
   */
  handleAuth(connectionId, message) {
    const { userType, userId, token } = message;
    const ws = this.connections.get(connectionId);
    
    if (!ws) return;

    // 簡單的身份驗證（實際應用中應該驗證token）
    if (userType && userId) {
      ws.userType = userType; // 'admin', 'driver', 'customer'
      ws.userId = userId;
      ws.authenticated = true;
      
      // 記錄用戶會話
      this.userSessions.set(`${userType}_${userId}`, connectionId);
      
      this.sendToConnection(connectionId, {
        type: 'auth_success',
        userType,
        userId
      });
      
      // 自動加入對應的房間
      this.autoJoinRooms(connectionId, userType, userId);
      
      console.log(`✅ 用戶認證成功: ${userType}_${userId}`);
    } else {
      this.sendToConnection(connectionId, {
        type: 'auth_failed',
        message: '認證資訊不完整'
      });
    }
  }

  /**
   * 自動加入房間
   */
  autoJoinRooms(connectionId, userType, userId) {
    switch (userType) {
      case 'admin':
        this.joinRoom(connectionId, 'admin_global');
        this.joinRoom(connectionId, 'system_monitoring');
        break;
      case 'driver':
        this.joinRoom(connectionId, 'drivers_global');
        this.joinRoom(connectionId, `driver_${userId}`);
        break;
      case 'customer':
        this.joinRoom(connectionId, `customer_${userId}`);
        break;
    }
  }

  /**
   * 處理加入房間請求
   */
  handleJoinRoom(connectionId, message) {
    const { room } = message;
    const result = this.joinRoom(connectionId, room);
    
    this.sendToConnection(connectionId, {
      type: 'join_room_result',
      room,
      success: result.success,
      message: result.message
    });
  }

  /**
   * 處理離開房間請求
   */
  handleLeaveRoom(connectionId, message) {
    const { room } = message;
    const result = this.leaveRoom(connectionId, room);
    
    this.sendToConnection(connectionId, {
      type: 'leave_room_result',
      room,
      success: result.success,
      message: result.message
    });
  }

  /**
   * 處理廣播訊息
   */
  handleBroadcast(connectionId, message) {
    const { room, content, priority = 'normal' } = message;
    const ws = this.connections.get(connectionId);
    
    if (!ws || !ws.authenticated) {
      this.sendToConnection(connectionId, {
        type: 'error',
        message: '需要身份驗證才能發送廣播'
      });
      return;
    }

    const broadcastMessage = {
      type: 'broadcast_message',
      room,
      content,
      priority,
      sender: {
        userType: ws.userType,
        userId: ws.userId
      },
      timestamp: new Date().toISOString()
    };

    this.broadcastToRoom(room, broadcastMessage, connectionId);
    
    console.log(`📢 廣播訊息到房間 ${room} 來自 ${ws.userType}_${ws.userId}`);
  }

  /**
   * 處理私人訊息
   */
  handlePrivateMessage(connectionId, message) {
    const { targetUserType, targetUserId, content } = message;
    const ws = this.connections.get(connectionId);
    
    if (!ws || !ws.authenticated) {
      this.sendToConnection(connectionId, {
        type: 'error',
        message: '需要身份驗證才能發送私人訊息'
      });
      return;
    }

    const targetConnectionId = this.userSessions.get(`${targetUserType}_${targetUserId}`);
    
    if (targetConnectionId) {
      const privateMessage = {
        type: 'private_message',
        content,
        sender: {
          userType: ws.userType,
          userId: ws.userId
        },
        timestamp: new Date().toISOString()
      };

      this.sendToConnection(targetConnectionId, privateMessage);
      
      // 發送確認給發送者
      this.sendToConnection(connectionId, {
        type: 'message_sent',
        target: `${targetUserType}_${targetUserId}`
      });
      
      console.log(`💬 私人訊息發送: ${ws.userType}_${ws.userId} → ${targetUserType}_${targetUserId}`);
    } else {
      this.sendToConnection(connectionId, {
        type: 'message_failed',
        message: '目標用戶未在線'
      });
    }
  }

  /**
   * 處理外送員位置更新
   */
  handleDriverLocation(connectionId, message) {
    const { lat, lng, accuracy, speed } = message;
    const ws = this.connections.get(connectionId);
    
    if (!ws || ws.userType !== 'driver') {
      this.sendToConnection(connectionId, {
        type: 'error',
        message: '只有外送員可以更新位置'
      });
      return;
    }

    const locationUpdate = {
      type: 'driver_location_update',
      driverId: ws.userId,
      location: { lat, lng, accuracy, speed },
      timestamp: new Date().toISOString()
    };

    // 廣播給管理員
    this.broadcastToRoom('admin_global', locationUpdate);
    
    // 如果外送員有配送任務，也廣播給相關客戶
    this.broadcastDriverLocationToCustomers(ws.userId, locationUpdate);
    
    console.log(`📍 外送員位置更新: driver_${ws.userId}`);
  }

  /**
   * 處理Ping
   */
  handlePing(connectionId) {
    this.sendToConnection(connectionId, {
      type: 'pong',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 加入房間
   */
  joinRoom(connectionId, room) {
    const ws = this.connections.get(connectionId);
    
    if (!ws) {
      return { success: false, message: '連接不存在' };
    }

    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }

    this.rooms.get(room).add(connectionId);
    ws.joinedRooms.add(room);
    
    console.log(`🏠 ${connectionId} 加入房間: ${room}`);
    
    return { success: true, message: '成功加入房間' };
  }

  /**
   * 離開房間
   */
  leaveRoom(connectionId, room) {
    const ws = this.connections.get(connectionId);
    
    if (ws) {
      ws.joinedRooms.delete(room);
    }

    if (this.rooms.has(room)) {
      this.rooms.get(room).delete(connectionId);
      
      // 如果房間沒有人了，刪除房間
      if (this.rooms.get(room).size === 0) {
        this.rooms.delete(room);
      }
    }
    
    console.log(`🚪 ${connectionId} 離開房間: ${room}`);
    
    return { success: true, message: '成功離開房間' };
  }

  /**
   * 廣播訊息到房間
   */
  broadcastToRoom(room, message, excludeConnectionId = null) {
    if (!this.rooms.has(room)) {
      console.warn(`房間不存在: ${room}`);
      return;
    }

    const roomConnections = this.rooms.get(room);
    let sentCount = 0;

    roomConnections.forEach(connectionId => {
      if (connectionId !== excludeConnectionId) {
        if (this.sendToConnection(connectionId, message)) {
          sentCount++;
        }
      }
    });

    console.log(`📡 房間廣播 ${room}: ${sentCount} 個連接`);
    return sentCount;
  }

  /**
   * 發送訊息到特定連接
   */
  sendToConnection(connectionId, message) {
    const ws = this.connections.get(connectionId);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error(`發送訊息失敗 ${connectionId}:`, error);
        this.handleDisconnection(connectionId);
        return false;
      }
    }
    
    return false;
  }

  /**
   * 廣播外送員位置給相關客戶
   */
  async broadcastDriverLocationToCustomers(driverId, locationUpdate) {
    try {
      // 這裡應該查詢資料庫找出該外送員正在配送的訂單
      // 然後向相關客戶廣播位置更新
      
      // 暫時的模擬實作
      const customerRoom = `driver_${driverId}_customers`;
      this.broadcastToRoom(customerRoom, locationUpdate);
    } catch (error) {
      console.error('廣播外送員位置錯誤:', error);
    }
  }

  /**
   * 處理連接斷開
   */
  handleDisconnection(connectionId) {
    const ws = this.connections.get(connectionId);
    
    if (ws) {
      // 從所有房間移除
      ws.joinedRooms.forEach(room => {
        this.leaveRoom(connectionId, room);
      });
      
      // 從用戶會話移除
      if (ws.userType && ws.userId) {
        this.userSessions.delete(`${ws.userType}_${ws.userId}`);
      }
    }
    
    // 移除連接
    this.connections.delete(connectionId);
    
    console.log(`❌ WebSocket連接已斷開: ${connectionId}`);
  }

  /**
   * 設定心跳檢測
   */
  setupHeartbeat() {
    setInterval(() => {
      this.connections.forEach((ws, connectionId) => {
        if (!ws.isAlive) {
          console.log(`💔 移除無回應的連接: ${connectionId}`);
          this.handleDisconnection(connectionId);
          return;
        }
        
        ws.isAlive = false;
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, 30000); // 每30秒檢查一次
  }

  /**
   * 生成連接ID
   */
  generateConnectionId() {
    return 'ws_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 獲取連接統計
   */
  getStats() {
    const stats = {
      totalConnections: this.connections.size,
      totalRooms: this.rooms.size,
      totalSessions: this.userSessions.size,
      connectionsByType: {
        admin: 0,
        driver: 0,
        customer: 0,
        anonymous: 0
      },
      roomStats: {}
    };

    // 統計連接類型
    this.connections.forEach(ws => {
      if (ws.userType) {
        stats.connectionsByType[ws.userType]++;
      } else {
        stats.connectionsByType.anonymous++;
      }
    });

    // 統計房間
    this.rooms.forEach((connections, room) => {
      stats.roomStats[room] = connections.size;
    });

    return stats;
  }

  /**
   * 關閉WebSocket伺服器
   */
  close() {
    console.log('🔌 關閉WebSocket伺服器...');
    
    this.connections.forEach((ws, connectionId) => {
      ws.close();
    });
    
    this.wss.close();
    this.removeAllListeners();
  }
}

module.exports = WebSocketManager;