/**
 * 訊息路由服務
 * 處理不同類型訊息的路由、驗證和處理
 */
const { EventEmitter } = require('events');

class MessageRouter extends EventEmitter {
  constructor(webSocketManager, roomManager, databasePool) {
    super();
    
    this.wsManager = webSocketManager;
    this.roomManager = roomManager;
    this.db = databasePool;
    
    // 訊息類型處理器映射
    this.messageHandlers = new Map();
    this.messageValidators = new Map();
    this.messageFilters = new Map();
    
    // 訊息統計
    this.messageStats = {
      total: 0,
      byType: {},
      errors: 0,
      filtered: 0
    };
    
    this.setupMessageHandlers();
    this.setupValidators();
    this.setupFilters();
    
    console.log('📨 訊息路由器已初始化');
  }

  /**
   * 設置訊息處理器
   */
  setupMessageHandlers() {
    // 房間管理訊息
    this.messageHandlers.set('joinRoom', this.handleJoinRoom.bind(this));
    this.messageHandlers.set('leaveRoom', this.handleLeaveRoom.bind(this));
    this.messageHandlers.set('createRoom', this.handleCreateRoom.bind(this));
    
    // 聊天訊息
    this.messageHandlers.set('chatMessage', this.handleChatMessage.bind(this));
    this.messageHandlers.set('privateMessage', this.handlePrivateMessage.bind(this));
    this.messageHandlers.set('roomMessage', this.handleRoomMessage.bind(this));
    
    // 外送相關訊息
    this.messageHandlers.set('deliveryUpdate', this.handleDeliveryUpdate.bind(this));
    this.messageHandlers.set('locationUpdate', this.handleLocationUpdate.bind(this));
    this.messageHandlers.set('orderStatusUpdate', this.handleOrderStatusUpdate.bind(this));
    
    // 系統訊息
    this.messageHandlers.set('systemBroadcast', this.handleSystemBroadcast.bind(this));
    this.messageHandlers.set('adminMessage', this.handleAdminMessage.bind(this));
    
    // 客服訊息
    this.messageHandlers.set('supportRequest', this.handleSupportRequest.bind(this));
    this.messageHandlers.set('supportMessage', this.handleSupportMessage.bind(this));
    
    // 通知訊息
    this.messageHandlers.set('notification', this.handleNotification.bind(this));
    
    console.log(`📨 已註冊 ${this.messageHandlers.size} 個訊息處理器`);
  }

  /**
   * 設置訊息驗證器
   */
  setupValidators() {
    this.messageValidators.set('chatMessage', this.validateChatMessage.bind(this));
    this.messageValidators.set('privateMessage', this.validatePrivateMessage.bind(this));
    this.messageValidators.set('roomMessage', this.validateRoomMessage.bind(this));
    this.messageValidators.set('deliveryUpdate', this.validateDeliveryUpdate.bind(this));
    this.messageValidators.set('locationUpdate', this.validateLocationUpdate.bind(this));
  }

  /**
   * 設置訊息過濾器
   */
  setupFilters() {
    this.messageFilters.set('profanity', this.filterProfanity.bind(this));
    this.messageFilters.set('spam', this.filterSpam.bind(this));
    this.messageFilters.set('length', this.filterLength.bind(this));
  }

  /**
   * 路由訊息到適當的處理器
   * @param {string} connectionId - 連接ID
   * @param {string} userId - 用戶ID
   * @param {string} userType - 用戶類型
   * @param {Object} message - 訊息對象
   */
  async routeMessage(connectionId, userId, userType, message) {
    try {
      this.messageStats.total++;
      
      // 更新訊息類型統計
      if (!this.messageStats.byType[message.type]) {
        this.messageStats.byType[message.type] = 0;
      }
      this.messageStats.byType[message.type]++;

      // 驗證訊息
      const validationResult = await this.validateMessage(message, userId, userType);
      if (!validationResult.isValid) {
        this.sendError(connectionId, 'VALIDATION_ERROR', validationResult.error);
        this.messageStats.errors++;
        return;
      }

      // 過濾訊息
      const filterResult = await this.filterMessage(message, userId, userType);
      if (!filterResult.allowed) {
        this.sendError(connectionId, 'FILTER_BLOCKED', filterResult.reason);
        this.messageStats.filtered++;
        return;
      }

      // 應用過濾器修改（如敏感詞替換）
      if (filterResult.modified) {
        message = filterResult.message;
      }

      // 檢查處理器是否存在
      const handler = this.messageHandlers.get(message.type);
      if (!handler) {
        this.sendError(connectionId, 'UNKNOWN_MESSAGE_TYPE', `未知的訊息類型: ${message.type}`);
        this.messageStats.errors++;
        return;
      }

      // 執行訊息處理器
      await handler(connectionId, userId, userType, message);
      
      // 記錄成功處理的訊息
      this.emit('messageProcessed', {
        connectionId,
        userId,
        userType,
        messageType: message.type,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('訊息路由錯誤:', error);
      this.sendError(connectionId, 'INTERNAL_ERROR', '內部錯誤');
      this.messageStats.errors++;
      
      this.emit('routingError', {
        connectionId,
        userId,
        userType,
        message,
        error: error.message
      });
    }
  }

  /**
   * 驗證訊息
   * @param {Object} message - 訊息對象
   * @param {string} userId - 用戶ID
   * @param {string} userType - 用戶類型
   */
  async validateMessage(message, userId, userType) {
    // 基本格式驗證
    if (!message.type) {
      return { isValid: false, error: '訊息缺少類型' };
    }

    // 檢查是否有特定驗證器
    const validator = this.messageValidators.get(message.type);
    if (validator) {
      return await validator(message, userId, userType);
    }

    return { isValid: true };
  }

  /**
   * 過濾訊息
   * @param {Object} message - 訊息對象
   * @param {string} userId - 用戶ID
   * @param {string} userType - 用戶類型
   */
  async filterMessage(message, userId, userType) {
    let filteredMessage = { ...message };
    let isModified = false;

    // 應用所有過濾器
    for (const [filterName, filter] of this.messageFilters) {
      try {
        const result = await filter(filteredMessage, userId, userType);
        
        if (!result.allowed) {
          return {
            allowed: false,
            reason: result.reason || `被過濾器 ${filterName} 阻止`
          };
        }

        if (result.modified) {
          filteredMessage = result.message;
          isModified = true;
        }
      } catch (error) {
        console.error(`過濾器 ${filterName} 錯誤:`, error);
      }
    }

    return {
      allowed: true,
      modified: isModified,
      message: filteredMessage
    };
  }

  // 訊息處理器實作

  /**
   * 處理加入房間
   */
  async handleJoinRoom(connectionId, userId, userType, message) {
    const { roomId } = message;
    
    try {
      // 檢查房間是否存在，不存在則創建
      let room = this.roomManager.getRoom(roomId);
      if (!room) {
        room = this.roomManager.createRoom(roomId, {
          type: message.roomType || 'general',
          createdBy: userId
        });
      }

      // 加入房間
      const memberInfo = this.roomManager.joinRoom(roomId, userId, {
        userName: message.userName || userId,
        userType,
        avatar: message.avatar
      });

      // 通知WebSocket管理器
      this.wsManager.joinRoom(connectionId, roomId);

      // 發送成功回應
      this.wsManager.sendMessage(connectionId, {
        type: 'joinRoomSuccess',
        roomId,
        roomInfo: room,
        memberInfo
      });

      // 通知房間其他成員
      this.wsManager.broadcastToRoom(roomId, {
        type: 'userJoined',
        roomId,
        userId,
        userType,
        userName: memberInfo.userName,
        timestamp: new Date().toISOString()
      }, connectionId);

    } catch (error) {
      this.sendError(connectionId, 'JOIN_ROOM_FAILED', error.message);
    }
  }

  /**
   * 處理離開房間
   */
  async handleLeaveRoom(connectionId, userId, userType, message) {
    const { roomId } = message;
    
    try {
      // 從房間管理器中移除
      this.roomManager.leaveRoom(roomId, userId);
      
      // 通知WebSocket管理器
      this.wsManager.leaveRoom(connectionId, roomId);

      // 發送成功回應
      this.wsManager.sendMessage(connectionId, {
        type: 'leaveRoomSuccess',
        roomId
      });

      // 通知房間其他成員
      this.wsManager.broadcastToRoom(roomId, {
        type: 'userLeft',
        roomId,
        userId,
        userType,
        timestamp: new Date().toISOString()
      }, connectionId);

    } catch (error) {
      this.sendError(connectionId, 'LEAVE_ROOM_FAILED', error.message);
    }
  }

  /**
   * 處理創建房間
   */
  async handleCreateRoom(connectionId, userId, userType, message) {
    try {
      const room = this.roomManager.createRoom(message.roomId, {
        name: message.roomName,
        type: message.roomType,
        description: message.description,
        maxMembers: message.maxMembers,
        isPrivate: message.isPrivate,
        createdBy: userId,
        metadata: message.metadata
      });

      this.wsManager.sendMessage(connectionId, {
        type: 'createRoomSuccess',
        room
      });

    } catch (error) {
      this.sendError(connectionId, 'CREATE_ROOM_FAILED', error.message);
    }
  }

  /**
   * 處理聊天訊息
   */
  async handleChatMessage(connectionId, userId, userType, message) {
    const { roomId, content, messageType = 'text' } = message;
    
    try {
      // 檢查用戶是否在房間內
      if (!this.roomManager.isUserInRoom(roomId, userId)) {
        throw new Error('用戶不在指定房間內');
      }

      // 檢查用戶權限
      if (!this.roomManager.checkUserPermission(roomId, userId, 'write')) {
        throw new Error('沒有發送訊息的權限');
      }

      // 記錄房間活動
      this.roomManager.recordActivity(roomId, userId, 'message');

      // 構建廣播訊息
      const broadcastMessage = {
        type: 'chatMessage',
        roomId,
        userId,
        userType,
        content,
        messageType,
        timestamp: new Date().toISOString(),
        messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      // 保存訊息到資料庫（如果需要）
      if (this.db) {
        await this.saveChatMessage(broadcastMessage);
      }

      // 廣播到房間
      this.wsManager.broadcastToRoom(roomId, broadcastMessage);

    } catch (error) {
      this.sendError(connectionId, 'CHAT_MESSAGE_FAILED', error.message);
    }
  }

  /**
   * 處理私人訊息
   */
  async handlePrivateMessage(connectionId, userId, userType, message) {
    const { targetUserId, content, messageType = 'text' } = message;
    
    try {
      // 檢查目標用戶是否在線
      if (!this.wsManager.isUserOnline(targetUserId)) {
        throw new Error('目標用戶目前離線');
      }

      const privateMessage = {
        type: 'privateMessage',
        fromUserId: userId,
        fromUserType: userType,
        toUserId: targetUserId,
        content,
        messageType,
        timestamp: new Date().toISOString(),
        messageId: `pm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      // 保存私訊到資料庫
      if (this.db) {
        await this.savePrivateMessage(privateMessage);
      }

      // 發送給目標用戶
      this.wsManager.sendPrivateMessage(targetUserId, privateMessage, connectionId);

    } catch (error) {
      this.sendError(connectionId, 'PRIVATE_MESSAGE_FAILED', error.message);
    }
  }

  /**
   * 處理外送更新
   */
  async handleDeliveryUpdate(connectionId, userId, userType, message) {
    if (userType !== 'driver' && userType !== 'admin') {
      this.sendError(connectionId, 'PERMISSION_DENIED', '只有外送員和管理員可以發送配送更新');
      return;
    }

    const { orderId, status, location, estimatedTime } = message;
    
    try {
      // 更新訂單狀態（如果有資料庫）
      if (this.db && orderId) {
        await this.updateOrderStatus(orderId, status, location, estimatedTime);
      }

      // 廣播到訂單相關房間
      const orderRoomId = `order_${orderId}`;
      this.wsManager.broadcastToRoom(orderRoomId, {
        type: 'deliveryUpdate',
        orderId,
        driverId: userId,
        status,
        location,
        estimatedTime,
        timestamp: new Date().toISOString()
      });

      // 如果有位置資訊，也廣播位置更新
      if (location) {
        this.handleLocationUpdate(connectionId, userId, userType, {
          type: 'locationUpdate',
          orderId,
          location
        });
      }

    } catch (error) {
      this.sendError(connectionId, 'DELIVERY_UPDATE_FAILED', error.message);
    }
  }

  /**
   * 處理位置更新
   */
  async handleLocationUpdate(connectionId, userId, userType, message) {
    if (userType !== 'driver') {
      this.sendError(connectionId, 'PERMISSION_DENIED', '只有外送員可以發送位置更新');
      return;
    }

    const { location, orderId } = message;
    
    try {
      // 更新外送員位置
      if (this.db) {
        await this.updateDriverLocation(userId, location);
      }

      // 廣播位置給相關訂單
      if (orderId) {
        const orderRoomId = `order_${orderId}`;
        this.wsManager.broadcastToRoom(orderRoomId, {
          type: 'driverLocation',
          driverId: userId,
          orderId,
          location,
          timestamp: new Date().toISOString()
        });
      }

      // 廣播給管理員監控面板
      this.wsManager.broadcastMessage({
        type: 'driverLocation',
        driverId: userId,
        location,
        timestamp: new Date().toISOString()
      }, null, { userType: 'admin' });

    } catch (error) {
      this.sendError(connectionId, 'LOCATION_UPDATE_FAILED', error.message);
    }
  }

  /**
   * 處理系統廣播
   */
  async handleSystemBroadcast(connectionId, userId, userType, message) {
    if (userType !== 'admin') {
      this.sendError(connectionId, 'PERMISSION_DENIED', '只有管理員可以發送系統廣播');
      return;
    }

    const { content, targetUserType, priority = 'normal' } = message;
    
    const broadcastMessage = {
      type: 'systemBroadcast',
      content,
      priority,
      fromAdmin: userId,
      timestamp: new Date().toISOString()
    };

    // 根據目標用戶類型廣播
    const filters = targetUserType ? { userType: targetUserType } : {};
    this.wsManager.broadcastMessage(broadcastMessage, connectionId, filters);
  }

  /**
   * 處理客服請求
   */
  async handleSupportRequest(connectionId, userId, userType, message) {
    const { subject, description, urgency = 'normal' } = message;
    
    try {
      // 創建客服房間
      const supportRoom = this.roomManager.createSupportRoom(userId);
      
      // 客戶加入房間
      this.roomManager.joinRoom(supportRoom.id, userId, {
        userName: message.userName || userId,
        userType: 'customer'
      });

      this.wsManager.joinRoom(connectionId, supportRoom.id);

      // 通知可用的客服人員
      this.wsManager.broadcastMessage({
        type: 'supportRequest',
        roomId: supportRoom.id,
        customerId: userId,
        subject,
        description,
        urgency,
        timestamp: new Date().toISOString()
      }, null, { userType: 'agent' });

      // 回應客戶
      this.wsManager.sendMessage(connectionId, {
        type: 'supportRequestCreated',
        roomId: supportRoom.id,
        message: '客服請求已建立，請稍候客服人員回應'
      });

    } catch (error) {
      this.sendError(connectionId, 'SUPPORT_REQUEST_FAILED', error.message);
    }
  }

  // 訊息驗證器

  validateChatMessage(message) {
    if (!message.roomId) {
      return { isValid: false, error: '缺少房間ID' };
    }
    if (!message.content || message.content.trim().length === 0) {
      return { isValid: false, error: '訊息內容不能為空' };
    }
    if (message.content.length > 1000) {
      return { isValid: false, error: '訊息內容過長' };
    }
    return { isValid: true };
  }

  validatePrivateMessage(message) {
    if (!message.targetUserId) {
      return { isValid: false, error: '缺少目標用戶ID' };
    }
    if (!message.content || message.content.trim().length === 0) {
      return { isValid: false, error: '訊息內容不能為空' };
    }
    return { isValid: true };
  }

  validateLocationUpdate(message) {
    if (!message.location || !message.location.lat || !message.location.lng) {
      return { isValid: false, error: '位置資訊不完整' };
    }
    return { isValid: true };
  }

  // 訊息過濾器

  async filterProfanity(message) {
    // 簡單的敏感詞過濾（實際應用中可以使用更複雜的過濾系統）
    const profanityWords = ['垃圾', '白癡', '混蛋']; // 示例敏感詞
    
    if (message.content) {
      let filteredContent = message.content;
      let wasFiltered = false;

      profanityWords.forEach(word => {
        if (filteredContent.includes(word)) {
          filteredContent = filteredContent.replace(new RegExp(word, 'g'), '*'.repeat(word.length));
          wasFiltered = true;
        }
      });

      if (wasFiltered) {
        return {
          allowed: true,
          modified: true,
          message: { ...message, content: filteredContent }
        };
      }
    }

    return { allowed: true, modified: false };
  }

  async filterSpam(message, userId) {
    // 簡單的垃圾訊息檢測
    if (message.content && message.content.length > 500) {
      return { allowed: false, reason: '訊息過長，可能為垃圾訊息' };
    }
    
    return { allowed: true };
  }

  async filterLength(message) {
    if (message.content && message.content.length > 2000) {
      return { allowed: false, reason: '訊息超過長度限制' };
    }
    
    return { allowed: true };
  }

  // 資料庫操作

  async saveChatMessage(message) {
    if (!this.db) return;
    
    try {
      await this.db.query(`
        INSERT INTO chat_messages (room_id, user_id, content, message_type, created_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [message.roomId, message.userId, message.content, message.messageType, new Date()]);
    } catch (error) {
      console.error('保存聊天訊息失敗:', error);
    }
  }

  async savePrivateMessage(message) {
    if (!this.db) return;
    
    try {
      await this.db.query(`
        INSERT INTO private_messages (from_user_id, to_user_id, content, message_type, created_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [message.fromUserId, message.toUserId, message.content, message.messageType, new Date()]);
    } catch (error) {
      console.error('保存私訊失敗:', error);
    }
  }

  async updateOrderStatus(orderId, status, location, estimatedTime) {
    if (!this.db) return;
    
    try {
      await this.db.query(`
        UPDATE orders SET 
          status = $1, 
          updated_at = $2,
          estimated_delivery_time = COALESCE($3, estimated_delivery_time)
        WHERE id = $4
      `, [status, new Date(), estimatedTime, orderId]);
    } catch (error) {
      console.error('更新訂單狀態失敗:', error);
    }
  }

  async updateDriverLocation(driverId, location) {
    if (!this.db) return;
    
    try {
      await this.db.query(`
        UPDATE drivers SET 
          current_lat = $1,
          current_lng = $2,
          last_location_update = $3
        WHERE id = $4
      `, [location.lat, location.lng, new Date(), driverId]);
    } catch (error) {
      console.error('更新外送員位置失敗:', error);
    }
  }

  // 工具方法

  sendError(connectionId, errorCode, message) {
    this.wsManager.sendMessage(connectionId, {
      type: 'error',
      errorCode,
      message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 獲取訊息統計資訊
   */
  getMessageStats() {
    return { ...this.messageStats };
  }

  /**
   * 重置統計資訊
   */
  resetStats() {
    this.messageStats = {
      total: 0,
      byType: {},
      errors: 0,
      filtered: 0
    };
  }
}

module.exports = MessageRouter;