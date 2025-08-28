/**
 * 即時通知客戶端JavaScript
 * 處理Server-Sent Events連接和即時更新
 */
class RealtimeNotificationClient {
  constructor(options = {}) {
    this.options = {
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      ...options
    };
    
    this.eventSource = null;
    this.connectionId = null;
    this.reconnectAttempts = 0;
    this.isConnected = false;
    this.subscriptions = new Map();
    this.heartbeatTimer = null;
    
    // 事件監聽器
    this.eventListeners = {
      connected: [],
      disconnected: [],
      orderUpdate: [],
      driverLocation: [],
      systemNotification: [],
      error: []
    };

    this.init();
  }

  /**
   * 初始化連接
   */
  init() {
    this.connect();
    this.setupHeartbeat();
  }

  /**
   * 建立SSE連接
   */
  connect() {
    try {
      const url = new URL('/api/notifications/stream', window.location.origin);
      url.searchParams.append('userId', this.getUserId());
      url.searchParams.append('userType', this.getUserType());

      this.eventSource = new EventSource(url.toString());
      
      this.eventSource.onopen = (event) => {
        console.log('🔔 即時通知連接已建立');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connected', { timestamp: new Date().toISOString() });
      };

      this.eventSource.onerror = (event) => {
        console.error('❌ 即時通知連接錯誤:', event);
        this.isConnected = false;
        this.emit('error', { error: '連接錯誤', event });
        
        if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
          setTimeout(() => {
            this.reconnectAttempts++;
            console.log(`🔄 嘗試重連接 (${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`);
            this.connect();
          }, this.options.reconnectInterval);
        }
      };

      // 監聽不同類型的事件
      this.eventSource.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data);
        this.connectionId = data.connectionId;
        console.log('✅ 連接確認:', data);
      });

      this.eventSource.addEventListener('orderUpdate', (event) => {
        const data = JSON.parse(event.data);
        console.log('📋 訂單更新:', data);
        this.emit('orderUpdate', data);
        this.showOrderNotification(data);
      });

      this.eventSource.addEventListener('driverLocation', (event) => {
        const data = JSON.parse(event.data);
        console.log('🚚 外送員位置更新:', data);
        this.emit('driverLocation', data);
        this.updateDriverLocationOnMap(data);
      });

      this.eventSource.addEventListener('systemNotification', (event) => {
        const data = JSON.parse(event.data);
        console.log('🔔 系統通知:', data);
        this.emit('systemNotification', data);
        this.showSystemNotification(data);
      });

      this.eventSource.addEventListener('heartbeat', (event) => {
        // 心跳包，保持連接活躍
        this.lastHeartbeat = new Date();
      });

    } catch (error) {
      console.error('建立SSE連接失敗:', error);
      this.emit('error', { error: '連接失敗', details: error.message });
    }
  }

  /**
   * 斷開連接
   */
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    this.isConnected = false;
    this.emit('disconnected', { timestamp: new Date().toISOString() });
    console.log('🔌 即時通知連接已斷開');
  }

  /**
   * 訂閱訂單更新
   * @param {number} orderId - 訂單ID
   */
  async subscribeToOrder(orderId) {
    try {
      const response = await fetch('/api/notifications/subscribe/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          connectionId: this.connectionId,
          orderId: orderId
        })
      });

      if (response.ok) {
        this.subscriptions.set(`order_${orderId}`, true);
        console.log(`🔔 已訂閱訂單 ${orderId} 的更新通知`);
        return true;
      } else {
        throw new Error('訂閱失敗');
      }
    } catch (error) {
      console.error('訂閱訂單更新失敗:', error);
      return false;
    }
  }

  /**
   * 訂閱外送員位置更新
   * @param {number} driverId - 外送員ID
   */
  async subscribeToDriver(driverId) {
    try {
      const response = await fetch('/api/notifications/subscribe/driver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          connectionId: this.connectionId,
          driverId: driverId
        })
      });

      if (response.ok) {
        this.subscriptions.set(`driver_${driverId}`, true);
        console.log(`🚚 已訂閱外送員 ${driverId} 的位置更新`);
        return true;
      } else {
        throw new Error('訂閱失敗');
      }
    } catch (error) {
      console.error('訂閱外送員更新失敗:', error);
      return false;
    }
  }

  /**
   * 顯示訂單通知
   * @param {Object} data - 訂單更新資料
   */
  showOrderNotification(data) {
    const notification = this.createNotification({
      title: data.title || '訂單更新',
      message: data.message,
      icon: data.icon || '📋',
      type: 'order',
      data: data
    });

    // 更新頁面上的訂單狀態
    this.updateOrderStatusOnPage(data);
  }

  /**
   * 顯示系統通知
   * @param {Object} data - 系統通知資料
   */
  showSystemNotification(data) {
    const notification = this.createNotification({
      title: '系統通知',
      message: data.message,
      icon: '🔔',
      type: data.level || 'info',
      data: data
    });
  }

  /**
   * 創建通知元素
   * @param {Object} options - 通知選項
   */
  createNotification(options) {
    const {
      title,
      message,
      icon = '🔔',
      type = 'info',
      duration = 5000,
      data = {}
    } = options;

    // 檢查是否支援瀏覽器通知
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: message,
        icon: '/favicon.ico',
        tag: `notification-${Date.now()}`,
        requireInteraction: type === 'error'
      });
    }

    // 創建頁面內通知
    const notificationElement = document.createElement('div');
    notificationElement.className = `notification notification-${type}`;
    notificationElement.innerHTML = `
      <div class="notification-content">
        <span class="notification-icon">${icon}</span>
        <div class="notification-text">
          <div class="notification-title">${title}</div>
          <div class="notification-message">${message}</div>
        </div>
        <button class="notification-close">&times;</button>
      </div>
    `;

    // 添加點擊關閉功能
    const closeBtn = notificationElement.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
      this.removeNotification(notificationElement);
    });

    // 添加到通知容器
    let container = document.getElementById('notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-container';
      container.className = 'notification-container';
      document.body.appendChild(container);
    }

    container.appendChild(notificationElement);

    // 自動移除通知
    if (duration > 0) {
      setTimeout(() => {
        this.removeNotification(notificationElement);
      }, duration);
    }

    return notificationElement;
  }

  /**
   * 移除通知
   * @param {HTMLElement} notificationElement - 通知元素
   */
  removeNotification(notificationElement) {
    if (notificationElement && notificationElement.parentNode) {
      notificationElement.classList.add('notification-fade-out');
      setTimeout(() => {
        if (notificationElement.parentNode) {
          notificationElement.parentNode.removeChild(notificationElement);
        }
      }, 300);
    }
  }

  /**
   * 更新頁面上的訂單狀態
   * @param {Object} orderData - 訂單資料
   */
  updateOrderStatusOnPage(orderData) {
    const orderId = orderData.orderId;
    
    // 更新訂單狀態文字
    const statusElements = document.querySelectorAll(`[data-order-status="${orderId}"]`);
    statusElements.forEach(element => {
      element.textContent = orderData.statusMessage || orderData.newStatus;
      element.className = `order-status status-${orderData.newStatus}`;
    });

    // 更新預計送達時間
    if (orderData.estimatedDeliveryTime) {
      const timeElements = document.querySelectorAll(`[data-order-delivery-time="${orderId}"]`);
      timeElements.forEach(element => {
        const deliveryTime = new Date(orderData.estimatedDeliveryTime);
        element.textContent = `預計送達: ${deliveryTime.toLocaleString()}`;
      });
    }

    // 更新外送員資訊
    if (orderData.driverInfo) {
      const driverElements = document.querySelectorAll(`[data-order-driver="${orderId}"]`);
      driverElements.forEach(element => {
        element.innerHTML = `
          <strong>外送員:</strong> ${orderData.driverInfo.name}<br>
          <strong>電話:</strong> ${orderData.driverInfo.phone}
        `;
      });
    }
  }

  /**
   * 更新地圖上的外送員位置
   * @param {Object} locationData - 位置資料
   */
  updateDriverLocationOnMap(locationData) {
    // 如果頁面有地圖實例，更新外送員標記
    if (window.orderTrackingMap && window.orderTrackingMap.updateDriverLocation) {
      window.orderTrackingMap.updateDriverLocation(locationData);
    }

    // 觸發自定義事件，讓其他組件可以監聽
    const event = new CustomEvent('driverLocationUpdate', {
      detail: locationData
    });
    document.dispatchEvent(event);
  }

  /**
   * 設置心跳檢查
   */
  setupHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.lastHeartbeat) {
        const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat.getTime();
        
        // 如果超過2分鐘沒有收到心跳包，嘗試重連
        if (timeSinceLastHeartbeat > 120000) {
          console.warn('⚠️ 連接可能已斷開，嘗試重連');
          this.disconnect();
          this.connect();
        }
      }
    }, this.options.heartbeatInterval);
  }

  /**
   * 添加事件監聽器
   * @param {string} event - 事件名稱
   * @param {Function} callback - 回調函數
   */
  on(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].push(callback);
    }
  }

  /**
   * 移除事件監聽器
   * @param {string} event - 事件名稱
   * @param {Function} callback - 回調函數
   */
  off(event, callback) {
    if (this.eventListeners[event]) {
      const index = this.eventListeners[event].indexOf(callback);
      if (index > -1) {
        this.eventListeners[event].splice(index, 1);
      }
    }
  }

  /**
   * 觸發事件
   * @param {string} event - 事件名稱
   * @param {Object} data - 事件資料
   */
  emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`事件處理器錯誤 (${event}):`, error);
        }
      });
    }
  }

  /**
   * 獲取用戶ID
   */
  getUserId() {
    // 從URL參數、localStorage或其他來源獲取用戶ID
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('userId') || 
           localStorage.getItem('userId') || 
           'anonymous';
  }

  /**
   * 獲取用戶類型
   */
  getUserType() {
    // 根據頁面路徑判斷用戶類型
    const path = window.location.pathname;
    if (path.includes('/admin')) {
      return 'admin';
    } else if (path.includes('/driver')) {
      return 'driver';
    }
    return 'customer';
  }

  /**
   * 請求瀏覽器通知權限
   */
  async requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      console.log('通知權限:', permission);
      return permission === 'granted';
    }
    return Notification.permission === 'granted';
  }

  /**
   * 獲取連接狀態
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      connectionId: this.connectionId,
      reconnectAttempts: this.reconnectAttempts,
      subscriptions: Object.fromEntries(this.subscriptions),
      lastHeartbeat: this.lastHeartbeat
    };
  }
}

// 全域實例
window.RealtimeNotificationClient = RealtimeNotificationClient;

// 自動初始化
document.addEventListener('DOMContentLoaded', function() {
  window.realtimeNotifications = new RealtimeNotificationClient();
  
  // 請求通知權限
  window.realtimeNotifications.requestNotificationPermission();
  
  console.log('📱 即時通知系統已初始化');
});