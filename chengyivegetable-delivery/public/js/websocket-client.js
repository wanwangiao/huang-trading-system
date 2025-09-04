// =====================================
// WebSocket 客戶端管理
// 提供雙向即時通訊功能
// =====================================

class WebSocketClient {
  constructor(options = {}) {
    this.options = {
      autoReconnect: true,
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      pingInterval: 30000,
      ...options
    };
    
    this.ws = null;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.reconnectAttempts = 0;
    this.userInfo = null;
    this.joinedRooms = new Set();
    this.eventHandlers = new Map();
    this.pingTimer = null;
    
    console.log('🔌 WebSocket客戶端已初始化');
  }

  /**
   * 連接到WebSocket伺服器
   */
  connect(url = null) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('⚠️ WebSocket已經連接');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = url || this.getWebSocketUrl();
        console.log(`🔗 連接到WebSocket: ${wsUrl}`);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = (event) => {
          console.log('✅ WebSocket連接成功');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startPing();
          this.emit('connected', event);
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };
        
        this.ws.onclose = (event) => {
          console.log('❌ WebSocket連接關閉:', event.reason);
          this.isConnected = false;
          this.isAuthenticated = false;
          this.stopPing();
          this.emit('disconnected', event);
          
          if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };
        
        this.ws.onerror = (error) => {
          console.error('❌ WebSocket錯誤:', error);
          this.emit('error', error);
          reject(error);
        };
        
      } catch (error) {
        console.error('連接失敗:', error);
        reject(error);
      }
    });
  }

  /**
   * 處理收到的訊息
   */
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      console.log(`📨 收到訊息:`, message.type);
      
      switch (message.type) {
        case 'connected':
          this.handleConnected(message);
          break;
        case 'auth_success':
          this.handleAuthSuccess(message);
          break;
        case 'auth_failed':
          this.handleAuthFailed(message);
          break;
        case 'join_room_result':
          this.handleJoinRoomResult(message);
          break;
        case 'leave_room_result':
          this.handleLeaveRoomResult(message);
          break;
        case 'broadcast_message':
          this.handleBroadcastMessage(message);
          break;
        case 'private_message':
          this.handlePrivateMessage(message);
          break;
        case 'driver_location_update':
          this.handleDriverLocationUpdate(message);
          break;
        case 'pong':
          this.handlePong(message);
          break;
        case 'error':
          this.handleError(message);
          break;
        default:
          console.log('收到未知訊息類型:', message);
          this.emit('message', message);
      }
    } catch (error) {
      console.error('處理訊息錯誤:', error);
    }
  }

  /**
   * 處理連接確認
   */
  handleConnected(message) {
    console.log('🎉 WebSocket連接已確認:', message.connectionId);
    this.emit('connected', message);
  }

  /**
   * 處理認證成功
   */
  handleAuthSuccess(message) {
    console.log('✅ 身份驗證成功:', message.userType, message.userId);
    this.isAuthenticated = true;
    this.userInfo = {
      userType: message.userType,
      userId: message.userId
    };
    this.emit('authenticated', message);
  }

  /**
   * 處理認證失敗
   */
  handleAuthFailed(message) {
    console.error('❌ 身份驗證失敗:', message.message);
    this.emit('auth_failed', message);
  }

  /**
   * 處理加入房間結果
   */
  handleJoinRoomResult(message) {
    if (message.success) {
      this.joinedRooms.add(message.room);
      console.log(`🏠 成功加入房間: ${message.room}`);
    } else {
      console.error(`❌ 加入房間失敗: ${message.room} - ${message.message}`);
    }
    this.emit('join_room_result', message);
  }

  /**
   * 處理離開房間結果
   */
  handleLeaveRoomResult(message) {
    if (message.success) {
      this.joinedRooms.delete(message.room);
      console.log(`🚪 成功離開房間: ${message.room}`);
    }
    this.emit('leave_room_result', message);
  }

  /**
   * 處理廣播訊息
   */
  handleBroadcastMessage(message) {
    console.log(`📢 收到廣播訊息 [${message.room}]:`, message.content);
    this.emit('broadcast_message', message);
    this.emit(`broadcast_${message.room}`, message);
  }

  /**
   * 處理私人訊息
   */
  handlePrivateMessage(message) {
    console.log(`💬 收到私人訊息來自 ${message.sender.userType}_${message.sender.userId}:`, message.content);
    this.emit('private_message', message);
  }

  /**
   * 處理外送員位置更新
   */
  handleDriverLocationUpdate(message) {
    console.log(`📍 外送員位置更新: driver_${message.driverId}`);
    this.emit('driver_location_update', message);
  }

  /**
   * 處理Pong回應
   */
  handlePong(message) {
    // 心跳回應，不需要特別處理
  }

  /**
   * 處理錯誤訊息
   */
  handleError(message) {
    console.error('❌ 伺服器錯誤:', message.message);
    this.emit('server_error', message);
  }

  /**
   * 身份驗證
   */
  authenticate(userType, userId, token = null) {
    if (!this.isConnected) {
      console.error('WebSocket未連接，無法進行身份驗證');
      return false;
    }

    const authMessage = {
      type: 'auth',
      userType,
      userId,
      token
    };

    this.send(authMessage);
    return true;
  }

  /**
   * 加入房間
   */
  joinRoom(room) {
    if (!this.isAuthenticated) {
      console.error('需要先進行身份驗證');
      return false;
    }

    const joinMessage = {
      type: 'join_room',
      room
    };

    this.send(joinMessage);
    return true;
  }

  /**
   * 離開房間
   */
  leaveRoom(room) {
    if (!this.isAuthenticated) {
      console.error('需要先進行身份驗證');
      return false;
    }

    const leaveMessage = {
      type: 'leave_room',
      room
    };

    this.send(leaveMessage);
    return true;
  }

  /**
   * 發送廣播訊息
   */
  broadcast(room, content, priority = 'normal') {
    if (!this.isAuthenticated) {
      console.error('需要先進行身份驗證');
      return false;
    }

    const broadcastMessage = {
      type: 'broadcast',
      room,
      content,
      priority
    };

    this.send(broadcastMessage);
    return true;
  }

  /**
   * 發送私人訊息
   */
  sendPrivateMessage(targetUserType, targetUserId, content) {
    if (!this.isAuthenticated) {
      console.error('需要先進行身份驗證');
      return false;
    }

    const privateMessage = {
      type: 'private_message',
      targetUserType,
      targetUserId,
      content
    };

    this.send(privateMessage);
    return true;
  }

  /**
   * 更新外送員位置
   */
  updateDriverLocation(lat, lng, accuracy = null, speed = null) {
    if (!this.isAuthenticated || this.userInfo.userType !== 'driver') {
      console.error('只有已認證的外送員可以更新位置');
      return false;
    }

    const locationMessage = {
      type: 'driver_location',
      lat,
      lng,
      accuracy,
      speed
    };

    this.send(locationMessage);
    return true;
  }

  /**
   * 發送訊息
   */
  send(message) {
    if (!this.isConnected || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket未連接或狀態異常');
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('發送訊息失敗:', error);
      return false;
    }
  }

  /**
   * 開始心跳檢測
   */
  startPing() {
    this.stopPing(); // 先停止現有的
    
    this.pingTimer = setInterval(() => {
      if (this.isConnected) {
        this.send({ type: 'ping' });
      }
    }, this.options.pingInterval);
  }

  /**
   * 停止心跳檢測
   */
  stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * 排程重新連接
   */
  scheduleReconnect() {
    this.reconnectAttempts++;
    console.log(`⏳ 準備重新連接 (${this.reconnectAttempts}/${this.options.maxReconnectAttempts})...`);
    
    setTimeout(() => {
      this.connect().catch(error => {
        console.error('重新連接失敗:', error);
      });
    }, this.options.reconnectInterval);
  }

  /**
   * 獲取WebSocket URL
   */
  getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}`;
  }

  /**
   * 事件監聽
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * 移除事件監聽
   */
  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * 觸發事件
   */
  emit(event, data) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`事件處理器錯誤 [${event}]:`, error);
        }
      });
    }
  }

  /**
   * 斷開連接
   */
  disconnect() {
    console.log('🔌 主動斷開WebSocket連接');
    this.options.autoReconnect = false; // 停止自動重連
    this.stopPing();
    
    if (this.ws) {
      this.ws.close();
    }
  }

  /**
   * 獲取連接狀態
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      isAuthenticated: this.isAuthenticated,
      userInfo: this.userInfo,
      joinedRooms: Array.from(this.joinedRooms),
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// 全域實例（可選）
window.WebSocketClient = WebSocketClient;

// 如果是在Node.js環境中
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebSocketClient;
}