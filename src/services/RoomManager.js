/**
 * 房間管理服務
 * 處理不同類型的即時通訊房間
 */
const { EventEmitter } = require('events');

class RoomManager extends EventEmitter {
  constructor() {
    super();
    
    // 房間資料結構
    this.rooms = new Map(); // Map<roomId, RoomInfo>
    this.userRooms = new Map(); // Map<userId, Set<roomId>>
    this.roomTypes = new Map(); // Map<roomType, Set<roomId>>
    
    // 房間類型定義
    this.ROOM_TYPES = {
      GLOBAL: 'global',           // 全域廣播房間
      ORDER: 'order',             // 訂單相關房間
      DELIVERY: 'delivery',       // 外送配送房間
      CUSTOMER_SERVICE: 'support', // 客服房間
      ADMIN: 'admin',             // 管理員房間
      DRIVER_ZONE: 'driver_zone', // 外送員區域房間
      PRIVATE: 'private'          // 私人聊天房間
    };
    
    console.log('🏠 房間管理器已初始化');
  }

  /**
   * 創建房間
   * @param {string} roomId - 房間ID
   * @param {Object} options - 房間選項
   */
  createRoom(roomId, options = {}) {
    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId);
    }

    const roomInfo = {
      id: roomId,
      name: options.name || roomId,
      type: options.type || this.ROOM_TYPES.GLOBAL,
      description: options.description || '',
      maxMembers: options.maxMembers || 100,
      isPrivate: options.isPrivate || false,
      createdBy: options.createdBy,
      createdAt: new Date(),
      lastActivity: new Date(),
      members: new Map(), // Map<userId, MemberInfo>
      memberCount: 0,
      messageCount: 0,
      metadata: options.metadata || {}
    };

    this.rooms.set(roomId, roomInfo);
    
    // 更新房間類型索引
    if (!this.roomTypes.has(roomInfo.type)) {
      this.roomTypes.set(roomInfo.type, new Set());
    }
    this.roomTypes.get(roomInfo.type).add(roomId);

    console.log(`🏠 創建房間: ${roomId} (類型: ${roomInfo.type})`);
    
    this.emit('roomCreated', roomInfo);
    return roomInfo;
  }

  /**
   * 刪除房間
   * @param {string} roomId - 房間ID
   */
  deleteRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }

    // 從用戶房間索引中移除
    room.members.forEach((memberInfo, userId) => {
      const userRooms = this.userRooms.get(userId);
      if (userRooms) {
        userRooms.delete(roomId);
        if (userRooms.size === 0) {
          this.userRooms.delete(userId);
        }
      }
    });

    // 從房間類型索引中移除
    const roomTypeSet = this.roomTypes.get(room.type);
    if (roomTypeSet) {
      roomTypeSet.delete(roomId);
      if (roomTypeSet.size === 0) {
        this.roomTypes.delete(room.type);
      }
    }

    this.rooms.delete(roomId);
    
    console.log(`🗑️ 刪除房間: ${roomId}`);
    
    this.emit('roomDeleted', { roomId, room });
    return true;
  }

  /**
   * 用戶加入房間
   * @param {string} roomId - 房間ID
   * @param {string} userId - 用戶ID
   * @param {Object} userInfo - 用戶資訊
   */
  joinRoom(roomId, userId, userInfo = {}) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`房間 ${roomId} 不存在`);
    }

    // 檢查房間人數限制
    if (room.memberCount >= room.maxMembers) {
      throw new Error(`房間 ${roomId} 已達人數上限`);
    }

    // 檢查用戶是否已在房間內
    if (room.members.has(userId)) {
      return room.members.get(userId);
    }

    const memberInfo = {
      userId,
      userName: userInfo.userName || userId,
      userType: userInfo.userType || 'user',
      avatar: userInfo.avatar || '',
      joinedAt: new Date(),
      lastActive: new Date(),
      isOnline: true,
      permissions: userInfo.permissions || ['read', 'write'],
      metadata: userInfo.metadata || {}
    };

    // 添加成員
    room.members.set(userId, memberInfo);
    room.memberCount++;
    room.lastActivity = new Date();

    // 更新用戶房間索引
    if (!this.userRooms.has(userId)) {
      this.userRooms.set(userId, new Set());
    }
    this.userRooms.get(userId).add(roomId);

    console.log(`👥 用戶 ${userId} 加入房間 ${roomId}`);
    
    this.emit('userJoinedRoom', { roomId, userId, memberInfo, room });
    return memberInfo;
  }

  /**
   * 用戶離開房間
   * @param {string} roomId - 房間ID
   * @param {string} userId - 用戶ID
   */
  leaveRoom(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room || !room.members.has(userId)) {
      return false;
    }

    const memberInfo = room.members.get(userId);
    
    // 移除成員
    room.members.delete(userId);
    room.memberCount--;
    room.lastActivity = new Date();

    // 更新用戶房間索引
    const userRooms = this.userRooms.get(userId);
    if (userRooms) {
      userRooms.delete(roomId);
      if (userRooms.size === 0) {
        this.userRooms.delete(userId);
      }
    }

    console.log(`👥 用戶 ${userId} 離開房間 ${roomId}`);
    
    this.emit('userLeftRoom', { roomId, userId, memberInfo, room });

    // 如果房間為空且不是系統房間，自動刪除
    if (room.memberCount === 0 && room.type !== this.ROOM_TYPES.GLOBAL) {
      this.deleteRoom(roomId);
    }

    return true;
  }

  /**
   * 更新用戶在線狀態
   * @param {string} userId - 用戶ID
   * @param {boolean} isOnline - 是否在線
   */
  updateUserOnlineStatus(userId, isOnline) {
    const userRooms = this.userRooms.get(userId);
    if (!userRooms) {
      return;
    }

    userRooms.forEach(roomId => {
      const room = this.rooms.get(roomId);
      if (room && room.members.has(userId)) {
        const member = room.members.get(userId);
        member.isOnline = isOnline;
        member.lastActive = new Date();
      }
    });

    this.emit('userOnlineStatusChanged', { userId, isOnline });
  }

  /**
   * 記錄房間活動
   * @param {string} roomId - 房間ID
   * @param {string} userId - 用戶ID
   * @param {string} activity - 活動類型
   */
  recordActivity(roomId, userId, activity) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    room.lastActivity = new Date();
    room.messageCount++;

    if (room.members.has(userId)) {
      room.members.get(userId).lastActive = new Date();
    }

    this.emit('roomActivity', { roomId, userId, activity, room });
  }

  /**
   * 獲取房間資訊
   * @param {string} roomId - 房間ID
   */
  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  /**
   * 獲取用戶所在的房間列表
   * @param {string} userId - 用戶ID
   */
  getUserRooms(userId) {
    const roomIds = this.userRooms.get(userId);
    if (!roomIds) {
      return [];
    }

    const rooms = [];
    roomIds.forEach(roomId => {
      const room = this.rooms.get(roomId);
      if (room) {
        rooms.push({
          ...room,
          userMemberInfo: room.members.get(userId)
        });
      }
    });

    return rooms;
  }

  /**
   * 獲取特定類型的房間列表
   * @param {string} roomType - 房間類型
   */
  getRoomsByType(roomType) {
    const roomIds = this.roomTypes.get(roomType);
    if (!roomIds) {
      return [];
    }

    const rooms = [];
    roomIds.forEach(roomId => {
      const room = this.rooms.get(roomId);
      if (room) {
        rooms.push(room);
      }
    });

    return rooms;
  }

  /**
   * 獲取房間成員列表
   * @param {string} roomId - 房間ID
   * @param {Object} options - 選項
   */
  getRoomMembers(roomId, options = {}) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return [];
    }

    let members = Array.from(room.members.values());

    // 過濾條件
    if (options.onlineOnly) {
      members = members.filter(member => member.isOnline);
    }
    if (options.userType) {
      members = members.filter(member => member.userType === options.userType);
    }

    // 排序
    if (options.sortBy === 'joinedAt') {
      members.sort((a, b) => a.joinedAt - b.joinedAt);
    } else if (options.sortBy === 'lastActive') {
      members.sort((a, b) => b.lastActive - a.lastActive);
    }

    return members;
  }

  /**
   * 檢查用戶是否在房間內
   * @param {string} roomId - 房間ID
   * @param {string} userId - 用戶ID
   */
  isUserInRoom(roomId, userId) {
    const room = this.rooms.get(roomId);
    return room ? room.members.has(userId) : false;
  }

  /**
   * 檢查用戶權限
   * @param {string} roomId - 房間ID
   * @param {string} userId - 用戶ID
   * @param {string} permission - 權限名稱
   */
  checkUserPermission(roomId, userId, permission) {
    const room = this.rooms.get(roomId);
    if (!room || !room.members.has(userId)) {
      return false;
    }

    const member = room.members.get(userId);
    return member.permissions.includes(permission);
  }

  /**
   * 創建訂單房間
   * @param {number} orderId - 訂單ID
   * @param {Object} orderInfo - 訂單資訊
   */
  createOrderRoom(orderId, orderInfo = {}) {
    const roomId = `order_${orderId}`;
    return this.createRoom(roomId, {
      name: `訂單 #${orderId}`,
      type: this.ROOM_TYPES.ORDER,
      description: `訂單 ${orderId} 的即時通訊`,
      maxMembers: 10,
      metadata: {
        orderId,
        customerId: orderInfo.customerId,
        driverId: orderInfo.driverId,
        orderStatus: orderInfo.status
      }
    });
  }

  /**
   * 創建外送員區域房間
   * @param {string} zone - 配送區域
   * @param {Object} zoneInfo - 區域資訊
   */
  createDriverZoneRoom(zone, zoneInfo = {}) {
    const roomId = `driver_zone_${zone}`;
    return this.createRoom(roomId, {
      name: `配送區域: ${zone}`,
      type: this.ROOM_TYPES.DRIVER_ZONE,
      description: `${zone} 區域外送員即時通訊`,
      maxMembers: 50,
      metadata: {
        zone,
        ...zoneInfo
      }
    });
  }

  /**
   * 創建客服房間
   * @param {string} customerId - 客戶ID
   * @param {string} agentId - 客服ID
   */
  createSupportRoom(customerId, agentId = null) {
    const roomId = `support_${customerId}_${Date.now()}`;
    return this.createRoom(roomId, {
      name: `客服諮詢 - ${customerId}`,
      type: this.ROOM_TYPES.CUSTOMER_SERVICE,
      description: '客服即時諮詢',
      maxMembers: 3, // 客戶 + 客服 + 可能的主管
      isPrivate: true,
      metadata: {
        customerId,
        agentId,
        supportType: 'general'
      }
    });
  }

  /**
   * 獲取統計資訊
   */
  getStats() {
    const stats = {
      totalRooms: this.rooms.size,
      totalMembers: 0,
      roomsByType: {},
      activeRooms: 0,
      averageRoomSize: 0
    };

    let totalMembers = 0;
    let totalMessages = 0;
    const now = Date.now();
    const activeThreshold = 5 * 60 * 1000; // 5分鐘內有活動算活躍

    this.rooms.forEach(room => {
      totalMembers += room.memberCount;
      totalMessages += room.messageCount;
      
      // 統計各類型房間數量
      if (!stats.roomsByType[room.type]) {
        stats.roomsByType[room.type] = 0;
      }
      stats.roomsByType[room.type]++;

      // 檢查活躍房間
      if (now - room.lastActivity.getTime() < activeThreshold) {
        stats.activeRooms++;
      }
    });

    stats.totalMembers = totalMembers;
    stats.totalMessages = totalMessages;
    stats.averageRoomSize = this.rooms.size > 0 ? (totalMembers / this.rooms.size).toFixed(2) : 0;

    return stats;
  }

  /**
   * 清理空房間
   */
  cleanupEmptyRooms() {
    const emptyRooms = [];
    const systemRoomTypes = [this.ROOM_TYPES.GLOBAL, this.ROOM_TYPES.ADMIN];

    this.rooms.forEach((room, roomId) => {
      // 不清理系統房間
      if (systemRoomTypes.includes(room.type)) {
        return;
      }

      // 清理空房間或長時間無活動的房間
      const now = Date.now();
      const inactiveThreshold = 24 * 60 * 60 * 1000; // 24小時
      const isInactive = now - room.lastActivity.getTime() > inactiveThreshold;

      if (room.memberCount === 0 || isInactive) {
        emptyRooms.push(roomId);
      }
    });

    emptyRooms.forEach(roomId => {
      this.deleteRoom(roomId);
    });

    if (emptyRooms.length > 0) {
      console.log(`🧹 清理了 ${emptyRooms.length} 個空房間`);
    }

    return emptyRooms.length;
  }

  /**
   * 定期清理任務
   */
  startCleanupTask() {
    // 每小時清理一次空房間
    setInterval(() => {
      this.cleanupEmptyRooms();
    }, 60 * 60 * 1000);

    console.log('🧹 房間清理任務已啟動');
  }
}

module.exports = RoomManager;