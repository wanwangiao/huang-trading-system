/**
 * 即時通知系統測試腳本
 * 測試SSE連接、訂單狀態更新和外送員位置追蹤功能
 */
const axios = require('axios');

const BASE_URL = 'http://localhost:3002';
const API_URL = `${BASE_URL}/api/notifications`;

class RealtimeNotificationTester {
  constructor() {
    this.testResults = [];
    this.sseConnection = null;
  }

  /**
   * 運行所有測試
   */
  async runAllTests() {
    console.log('🧪 開始測試即時通知系統...\n');
    
    const tests = [
      this.testDatabaseSchema,
      this.testSSEConnection,
      this.testOrderStatusUpdate,
      this.testDriverLocationUpdate,
      this.testNotificationBroadcast,
      this.testMultipleConnections,
      this.testOrderTracking
    ];

    for (const test of tests) {
      try {
        await test.call(this);
        console.log('✅ 測試通過\n');
      } catch (error) {
        console.error('❌ 測試失敗:', error.message, '\n');
        this.testResults.push({
          test: test.name,
          success: false,
          error: error.message
        });
      }
    }

    this.printSummary();
  }

  /**
   * 測試資料庫Schema
   */
  async testDatabaseSchema() {
    console.log('📋 測試資料庫Schema...');
    
    try {
      // 測試即時通知所需的表是否存在
      const response = await axios.post(`${BASE_URL}/api/admin/execute-sql`, {
        sql: `
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
            AND table_name IN (
              'drivers', 
              'order_status_history', 
              'driver_location_history', 
              'order_driver_assignments', 
              'notification_logs'
            )
        `,
        adminPassword: 'admin123'
      });

      const tables = response.data.results || [];
      const expectedTables = ['drivers', 'order_status_history', 'driver_location_history', 'order_driver_assignments', 'notification_logs'];
      
      expectedTables.forEach(table => {
        if (!tables.some(row => row.table_name === table)) {
          throw new Error(`缺少必要的表: ${table}`);
        }
      });

      this.testResults.push({
        test: 'testDatabaseSchema',
        success: true,
        message: '資料庫Schema檢查通過'
      });

    } catch (error) {
      throw new Error(`資料庫Schema檢查失敗: ${error.message}`);
    }
  }

  /**
   * 測試SSE連接
   */
  async testSSEConnection() {
    console.log('🔌 測試SSE連接...');
    
    return new Promise((resolve, reject) => {
      const EventSource = require('eventsource');
      const url = `${API_URL}/stream?userId=test_user&userType=customer`;
      
      this.sseConnection = new EventSource(url);
      let connectionTimeout;

      this.sseConnection.onopen = () => {
        console.log('   SSE連接已建立');
        clearTimeout(connectionTimeout);
        resolve();
      };

      this.sseConnection.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data);
        console.log('   收到連接確認:', data.connectionId);
        this.connectionId = data.connectionId;
      });

      this.sseConnection.onerror = (error) => {
        console.error('   SSE連接錯誤:', error);
        clearTimeout(connectionTimeout);
        reject(new Error('SSE連接失敗'));
      };

      // 設置超時
      connectionTimeout = setTimeout(() => {
        reject(new Error('SSE連接超時'));
      }, 10000);
    });
  }

  /**
   * 測試訂單狀態更新
   */
  async testOrderStatusUpdate() {
    console.log('📋 測試訂單狀態更新...');
    
    if (!this.connectionId) {
      throw new Error('需要先建立SSE連接');
    }

    // 創建測試訂單
    const testOrder = await this.createTestOrder();
    
    // 訂閱訂單更新
    await axios.post(`${API_URL}/subscribe/order`, {
      connectionId: this.connectionId,
      orderId: testOrder.id
    });

    console.log('   已訂閱訂單更新通知');

    // 監聽訂單更新事件
    const orderUpdatePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('未收到訂單更新通知'));
      }, 15000);

      this.sseConnection.addEventListener('orderUpdate', (event) => {
        const data = JSON.parse(event.data);
        console.log('   收到訂單更新通知:', data.newStatus);
        clearTimeout(timeout);
        resolve(data);
      });
    });

    // 更新訂單狀態
    await axios.post(`${API_URL}/order/${testOrder.id}/status`, {
      status: 'confirmed',
      changedBy: 'test_system',
      notes: '測試狀態更新'
    });

    console.log('   已發送訂單狀態更新');

    // 等待接收通知
    const updateData = await orderUpdatePromise;
    
    if (updateData.orderId !== testOrder.id || updateData.newStatus !== 'confirmed') {
      throw new Error('訂單更新通知資料不正確');
    }

    this.testResults.push({
      test: 'testOrderStatusUpdate',
      success: true,
      message: '訂單狀態更新測試通過'
    });
  }

  /**
   * 測試外送員位置更新
   */
  async testDriverLocationUpdate() {
    console.log('🚚 測試外送員位置更新...');

    // 創建測試外送員
    const testDriver = await this.createTestDriver();
    
    // 訂閱外送員位置更新
    await axios.post(`${API_URL}/subscribe/driver`, {
      connectionId: this.connectionId,
      driverId: testDriver.id
    });

    console.log('   已訂閱外送員位置更新');

    // 監聽位置更新事件
    const locationUpdatePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('未收到位置更新通知'));
      }, 15000);

      this.sseConnection.addEventListener('driverLocation', (event) => {
        const data = JSON.parse(event.data);
        console.log('   收到位置更新通知:', data.lat, data.lng);
        clearTimeout(timeout);
        resolve(data);
      });
    });

    // 更新外送員位置
    const testLocation = {
      lat: 24.1477,
      lng: 120.6736,
      accuracy: 10,
      speed: 25
    };

    await axios.post(`${API_URL}/driver/${testDriver.id}/location`, testLocation);
    console.log('   已發送位置更新');

    // 等待接收通知
    const locationData = await locationUpdatePromise;
    
    if (locationData.driverId !== testDriver.id || 
        Math.abs(locationData.lat - testLocation.lat) > 0.001) {
      throw new Error('位置更新通知資料不正確');
    }

    this.testResults.push({
      test: 'testDriverLocationUpdate',
      success: true,
      message: '外送員位置更新測試通過'
    });
  }

  /**
   * 測試通知廣播
   */
  async testNotificationBroadcast() {
    console.log('📢 測試通知廣播...');

    // 監聽系統通知
    const notificationPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('未收到系統通知'));
      }, 10000);

      this.sseConnection.addEventListener('systemNotification', (event) => {
        const data = JSON.parse(event.data);
        console.log('   收到系統通知:', data.message);
        clearTimeout(timeout);
        resolve(data);
      });
    });

    // 發送測試通知
    await axios.post(`${API_URL}/test-notification`, {
      message: '測試系統廣播通知',
      level: 'info'
    });

    console.log('   已發送測試通知');

    // 等待接收通知
    const notificationData = await notificationPromise;
    
    if (!notificationData.message.includes('測試系統廣播通知')) {
      throw new Error('系統通知內容不正確');
    }

    this.testResults.push({
      test: 'testNotificationBroadcast',
      success: true,
      message: '通知廣播測試通過'
    });
  }

  /**
   * 測試多重連接
   */
  async testMultipleConnections() {
    console.log('🔗 測試多重連接...');

    // 創建第二個SSE連接
    const EventSource = require('eventsource');
    const url2 = `${API_URL}/stream?userId=test_user_2&userType=admin`;
    
    const connection2 = new EventSource(url2);
    let connectionId2;

    const connection2Promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('第二個連接建立失敗'));
      }, 10000);

      connection2.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data);
        connectionId2 = data.connectionId;
        console.log('   第二個連接已建立:', connectionId2);
        clearTimeout(timeout);
        resolve();
      });

      connection2.onerror = (error) => {
        clearTimeout(timeout);
        reject(new Error('第二個連接錯誤'));
      };
    });

    await connection2Promise;

    // 獲取連接統計
    const statsResponse = await axios.get(`${API_URL}/stats`);
    const stats = statsResponse.data.stats;
    
    console.log('   連接統計:', stats);
    
    if (stats.totalConnections < 2) {
      throw new Error('多重連接統計不正確');
    }

    // 關閉第二個連接
    connection2.close();

    this.testResults.push({
      test: 'testMultipleConnections',
      success: true,
      message: '多重連接測試通過'
    });
  }

  /**
   * 測試訂單追蹤功能
   */
  async testOrderTracking() {
    console.log('📍 測試訂單追蹤功能...');

    // 創建完整的訂單追蹤場景
    const testOrder = await this.createTestOrder();
    const testDriver = await this.createTestDriver();

    // 分配外送員
    await axios.post(`${API_URL}/order/${testOrder.id}/assign-driver`, {
      driverId: testDriver.id,
      assignedBy: 'test_system'
    });

    console.log('   已分配外送員');

    // 開始位置追蹤
    await axios.post(`${API_URL}/driver/${testDriver.id}/start-tracking`, {
      orderId: testOrder.id
    });

    console.log('   已開始位置追蹤');

    // 模擬配送過程
    const deliverySteps = [
      { status: 'picked_up', location: { lat: 24.147, lng: 120.673 } },
      { status: 'delivering', location: { lat: 24.148, lng: 120.674 } },
      { status: 'delivered', location: { lat: 24.149, lng: 120.675 } }
    ];

    for (const step of deliverySteps) {
      // 更新位置
      await axios.post(`${API_URL}/driver/${testDriver.id}/location`, {
        ...step.location,
        orderId: testOrder.id,
        speed: 20
      });

      // 更新訂單狀態
      await axios.post(`${API_URL}/order/${testOrder.id}/status`, {
        status: step.status,
        changedBy: 'driver',
        changedById: testDriver.id
      });

      console.log(`   已更新至 ${step.status} 狀態`);
      
      // 等待通知處理
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 停止追蹤
    await axios.post(`${API_URL}/driver/${testDriver.id}/stop-tracking`);
    console.log('   已停止位置追蹤');

    this.testResults.push({
      test: 'testOrderTracking',
      success: true,
      message: '訂單追蹤功能測試通過'
    });
  }

  /**
   * 創建測試訂單
   */
  async createTestOrder() {
    try {
      const response = await axios.post(`${BASE_URL}/api/orders`, {
        contactName: '測試客戶',
        contactPhone: '0912345678',
        address: '台中市西區測試路123號',
        cart: [{ name: '測試商品', quantity: 1, price: 100 }],
        deliveryFee: 50,
        total: 150
      });
      
      return response.data.order || response.data;
    } catch (error) {
      throw new Error(`創建測試訂單失敗: ${error.message}`);
    }
  }

  /**
   * 創建測試外送員
   */
  async createTestDriver() {
    try {
      const response = await axios.post(`${BASE_URL}/api/admin/execute-sql`, {
        sql: `
          INSERT INTO drivers (name, phone, vehicle_type, status)
          VALUES ('測試外送員', '0987654321', 'scooter', 'online')
          RETURNING *
        `,
        adminPassword: 'admin123'
      });
      
      const results = response.data.results || [];
      if (results.length === 0) {
        throw new Error('創建外送員失敗');
      }
      
      return results[0];
    } catch (error) {
      throw new Error(`創建測試外送員失敗: ${error.message}`);
    }
  }

  /**
   * 清理測試資料
   */
  async cleanup() {
    console.log('🧹 清理測試資料...');
    
    try {
      // 關閉SSE連接
      if (this.sseConnection) {
        this.sseConnection.close();
      }

      // 清理測試資料
      await axios.post(`${BASE_URL}/api/admin/execute-sql`, {
        sql: `
          DELETE FROM drivers WHERE name = '測試外送員';
          DELETE FROM orders WHERE contact_name = '測試客戶';
        `,
        adminPassword: 'admin123'
      });
      
      console.log('   測試資料已清理');
    } catch (error) {
      console.error('清理測試資料失敗:', error.message);
    }
  }

  /**
   * 打印測試摘要
   */
  printSummary() {
    console.log('\n📊 測試摘要:');
    console.log('=' * 50);
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    
    console.log(`總測試數: ${totalTests}`);
    console.log(`通過: ${passedTests} ✅`);
    console.log(`失敗: ${failedTests} ❌`);
    console.log(`成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (failedTests > 0) {
      console.log('\n❌ 失敗的測試:');
      this.testResults
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`  - ${r.test}: ${r.error}`);
        });
    }
    
    console.log('\n🎉 測試完成！');
  }
}

// 執行測試
async function runTests() {
  const tester = new RealtimeNotificationTester();
  
  try {
    await tester.runAllTests();
  } catch (error) {
    console.error('測試運行失敗:', error);
  } finally {
    await tester.cleanup();
    process.exit(0);
  }
}

// 如果直接運行此腳本
if (require.main === module) {
  console.log('🚀 啟動即時通知系統測試...\n');
  runTests();
}

module.exports = RealtimeNotificationTester;