/**
 * 即時通知系統整合腳本
 * 將即時通知功能整合到現有的server.js中
 */
const fs = require('fs');
const path = require('path');

class RealtimeSystemIntegrator {
  constructor() {
    this.serverPath = path.join(__dirname, 'src', 'server.js');
    this.backupPath = path.join(__dirname, 'src', 'server.js.backup');
    this.integrationCode = this.generateIntegrationCode();
  }

  /**
   * 執行整合
   */
  async integrate() {
    try {
      console.log('🔧 開始整合即時通知系統到server.js...');
      
      // 1. 備份原始文件
      await this.backupOriginalFile();
      
      // 2. 讀取現有server.js內容
      const originalContent = await this.readServerFile();
      
      // 3. 生成整合後的內容
      const integratedContent = this.integrateRealtimeSystem(originalContent);
      
      // 4. 寫入整合後的內容
      await this.writeIntegratedFile(integratedContent);
      
      // 5. 創建必要的路由和服務映射
      await this.createServiceMappings();
      
      console.log('✅ 即時通知系統整合完成！');
      console.log('\n📋 整合內容:');
      console.log('  ✓ SSE通知服務');
      console.log('  ✓ 訂單狀態管理');
      console.log('  ✓ 外送員位置追蹤');
      console.log('  ✓ 配送時間預估');
      console.log('  ✓ 即時通知API路由');
      console.log('  ✓ 訂單追蹤頁面路由');
      
      console.log('\n🚀 請重啟服務器以生效新功能');
      
    } catch (error) {
      console.error('❌ 整合失敗:', error);
      await this.restoreBackup();
    }
  }

  /**
   * 備份原始文件
   */
  async backupOriginalFile() {
    if (fs.existsSync(this.serverPath)) {
      fs.copyFileSync(this.serverPath, this.backupPath);
      console.log('💾 已備份原始server.js');
    }
  }

  /**
   * 讀取server.js文件
   */
  async readServerFile() {
    return fs.readFileSync(this.serverPath, 'utf8');
  }

  /**
   * 整合即時通知系統到server.js
   */
  integrateRealtimeSystem(originalContent) {
    // 找到適當的插入點並添加代碼
    let content = originalContent;
    
    // 1. 添加服務導入
    const requireSection = this.findRequireSection(content);
    content = this.insertServiceImports(content, requireSection);
    
    // 2. 添加服務初始化
    const initSection = this.findInitializationSection(content);
    content = this.insertServiceInitialization(content, initSection);
    
    // 3. 添加路由
    const routeSection = this.findRouteSection(content);
    content = this.insertRealtimeRoutes(content, routeSection);
    
    return content;
  }

  /**
   * 生成整合代碼
   */
  generateIntegrationCode() {
    return {
      serviceImports: `
// 即時通知系統服務導入
const SSENotificationService = require('./services/SSENotificationService');
const OrderNotificationService = require('./services/OrderNotificationService');
const DriverLocationService = require('./services/DriverLocationService');
const DeliveryEstimationService = require('./services/DeliveryEstimationService');
const initializeRealtimeRoutes = require('./routes/realtime_api');

// 即時通知服務實例
let sseNotificationService = null;
let orderNotificationService = null;
let driverLocationService = null;
let deliveryEstimationService = null;`,

      serviceInitialization: `
  // 初始化即時通知系統
  try {
    // 1. 創建SSE通知服務
    sseNotificationService = new SSENotificationService();
    console.log('📡 SSE通知服務已初始化');
    
    // 2. 創建訂單通知服務
    orderNotificationService = new OrderNotificationService(pool, sseNotificationService);
    console.log('📋 訂單通知服務已初始化');
    
    // 3. 創建外送員位置服務
    driverLocationService = new DriverLocationService(pool, sseNotificationService);
    console.log('🚚 外送員位置服務已初始化');
    
    // 4. 創建配送時間預估服務
    deliveryEstimationService = new DeliveryEstimationService(pool, null);
    console.log('⏰ 配送時間預估服務已初始化');
    
    // 5. 設置心跳包發送
    setInterval(() => {
      if (sseNotificationService) {
        sseNotificationService.sendHeartbeat();
      }
    }, 30000); // 每30秒發送心跳包
    
    console.log('🎉 即時通知系統已完全初始化');
    
  } catch (error) {
    console.error('❌ 即時通知系統初始化失敗:', error);
  }`,

      routeRegistration: `
// 註冊即時通知API路由
if (sseNotificationService && orderNotificationService && driverLocationService) {
  app.use('/api/notifications', initializeRealtimeRoutes(
    sseNotificationService,
    orderNotificationService,
    driverLocationService
  ));
  console.log('🔗 即時通知API路由已註冊');
}

// 訂單追蹤頁面路由
app.get('/order-tracking/:id', async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.id);
    
    if (isNaN(orderId)) {
      return res.status(400).render('error', { 
        message: '無效的訂單ID' 
      });
    }
    
    // 獲取訂單詳情
    const orderResult = await pool.query(\`
      SELECT o.*, d.name as driver_name, d.phone as driver_phone,
             d.current_lat as driver_lat, d.current_lng as driver_lng
      FROM orders o
      LEFT JOIN drivers d ON o.driver_id = d.id
      WHERE o.id = $1
    \`, [orderId]);
    
    if (orderResult.rows.length === 0) {
      return res.status(404).render('error', { 
        message: '找不到指定的訂單' 
      });
    }
    
    const order = orderResult.rows[0];
    
    // 獲取訂單狀態歷史
    let statusHistory = [];
    if (orderNotificationService) {
      try {
        statusHistory = await orderNotificationService.getOrderStatusHistory(orderId);
      } catch (error) {
        console.error('獲取訂單狀態歷史失敗:', error);
      }
    }
    
    res.render('order_tracking', {
      order,
      statusHistory,
      title: \`訂單追蹤 #\${orderId}\`
    });
    
  } catch (error) {
    console.error('訂單追蹤頁面錯誤:', error);
    next(error);
  }
});

// 獲取訂單狀態API (供前端使用)
app.get('/api/orders/:id/status', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    
    const result = await pool.query(\`
      SELECT o.*, d.name as driver_name, d.phone as driver_phone,
             d.current_lat as driver_lat, d.current_lng as driver_lng
      FROM orders o
      LEFT JOIN drivers d ON o.driver_id = d.id
      WHERE o.id = $1
    \`, [orderId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '訂單不存在' });
    }
    
    const order = result.rows[0];
    
    res.json({
      id: order.id,
      status: order.status,
      estimated_delivery_time: order.estimated_delivery_time,
      driver: order.driver_name ? {
        id: order.driver_id,
        name: order.driver_name,
        phone: order.driver_phone,
        location: order.driver_lat && order.driver_lng ? {
          lat: parseFloat(order.driver_lat),
          lng: parseFloat(order.driver_lng)
        } : null
      } : null
    });
    
  } catch (error) {
    console.error('獲取訂單狀態失敗:', error);
    res.status(500).json({ error: '服務器錯誤' });
  }
});`
    };
  }

  /**
   * 找到require部分
   */
  findRequireSection(content) {
    const lines = content.split('\n');
    let lastRequireIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('require(') && lines[i].includes('=')) {
        lastRequireIndex = i;
      }
    }
    
    return lastRequireIndex + 1;
  }

  /**
   * 插入服務導入
   */
  insertServiceImports(content, insertIndex) {
    const lines = content.split('\n');
    lines.splice(insertIndex, 0, this.integrationCode.serviceImports);
    return lines.join('\n');
  }

  /**
   * 找到初始化部分
   */
  findInitializationSection(content) {
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('SmartRouteService 已初始化') || 
          lines[i].includes('console.log') && lines[i].includes('初始化')) {
        return i + 1;
      }
    }
    
    // 如果找不到，在createDatabasePool後面插入
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('}).catch(console.error)')) {
        return i;
      }
    }
    
    return -1;
  }

  /**
   * 插入服務初始化
   */
  insertServiceInitialization(content, insertIndex) {
    if (insertIndex === -1) return content;
    
    const lines = content.split('\n');
    lines.splice(insertIndex, 0, this.integrationCode.serviceInitialization);
    return lines.join('\n');
  }

  /**
   * 找到路由部分
   */
  findRouteSection(content) {
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('app.use') && lines[i].includes('google-maps-api')) {
        return i + 1;
      }
    }
    
    // 如果找不到，在最後的路由定義後插入
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes('app.get') || lines[i].includes('app.post')) {
        return i + 1;
      }
    }
    
    return -1;
  }

  /**
   * 插入即時通知路由
   */
  insertRealtimeRoutes(content, insertIndex) {
    if (insertIndex === -1) return content;
    
    const lines = content.split('\n');
    lines.splice(insertIndex, 0, this.integrationCode.routeRegistration);
    return lines.join('\n');
  }

  /**
   * 寫入整合後的文件
   */
  async writeIntegratedFile(content) {
    fs.writeFileSync(this.serverPath, content, 'utf8');
    console.log('📝 已更新server.js文件');
  }

  /**
   * 創建服務映射
   */
  async createServiceMappings() {
    // 確保所有必要的文件都存在
    const requiredFiles = [
      'src/services/SSENotificationService.js',
      'src/services/OrderNotificationService.js',
      'src/services/DriverLocationService.js',
      'src/services/DeliveryEstimationService.js',
      'src/routes/realtime_api.js',
      'views/order_tracking.ejs',
      'public/js/realtime-notifications.js'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(__dirname, file);
      if (!fs.existsSync(filePath)) {
        console.warn(`⚠️  文件不存在: ${file}`);
      } else {
        console.log(`✓ 確認文件存在: ${file}`);
      }
    }

    // 更新package.json添加必要的依賴
    await this.updatePackageJson();
  }

  /**
   * 更新package.json
   */
  async updatePackageJson() {
    try {
      const packagePath = path.join(__dirname, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      // 添加新依賴 (如果需要)
      const newDependencies = {
        'eventsource': '^2.0.2' // 用於測試SSE
      };
      
      let updated = false;
      for (const [pkg, version] of Object.entries(newDependencies)) {
        if (!packageJson.dependencies[pkg]) {
          packageJson.dependencies[pkg] = version;
          updated = true;
          console.log(`📦 添加依賴: ${pkg}@${version}`);
        }
      }
      
      if (updated) {
        fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
        console.log('📋 package.json已更新，請運行 npm install');
      }
      
    } catch (error) {
      console.error('更新package.json失敗:', error);
    }
  }

  /**
   * 恢復備份
   */
  async restoreBackup() {
    try {
      if (fs.existsSync(this.backupPath)) {
        fs.copyFileSync(this.backupPath, this.serverPath);
        console.log('🔄 已恢復原始server.js');
      }
    } catch (error) {
      console.error('恢復備份失敗:', error);
    }
  }

  /**
   * 創建資料庫初始化腳本
   */
  async createDatabaseInitScript() {
    const initScript = `
-- 執行此腳本來初始化即時通知系統所需的資料庫結構
-- 請在PostgreSQL中運行此腳本

-- 首先執行即時通知系統的schema
\\i realtime_notifications_schema.sql

-- 插入系統設定
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('store_location', '{"lat": 24.1477, "lng": 120.6736}', '店鋪位置座標'),
('max_delivery_radius', '15', '最大配送半徑(公里)'),
('average_preparation_time', '20', '平均準備時間(分鐘)')
ON CONFLICT (setting_key) DO UPDATE SET 
  setting_value = EXCLUDED.setting_value,
  updated_at = CURRENT_TIMESTAMP;

-- 檢查資料表是否正確創建
SELECT 
  table_name,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name IN ('drivers', 'order_status_history', 'driver_location_history', 
                     'order_driver_assignments', 'notification_logs', 'system_settings')
ORDER BY table_name;

-- 顯示完成訊息
SELECT '即時通知系統資料庫初始化完成！' as status;
    `;

    fs.writeFileSync(
      path.join(__dirname, 'init_realtime_database.sql'),
      initScript.trim()
    );
    
    console.log('📄 已創建資料庫初始化腳本: init_realtime_database.sql');
  }
}

// 執行整合
async function runIntegration() {
  const integrator = new RealtimeSystemIntegrator();
  
  console.log('🚀 即時通知系統整合器');
  console.log('=====================================');
  
  try {
    await integrator.integrate();
    await integrator.createDatabaseInitScript();
    
    console.log('\n✅ 整合完成！');
    console.log('\n📋 後續步驟:');
    console.log('1. 執行: npm install (安裝新依賴)');
    console.log('2. 在資料庫中執行: init_realtime_database.sql');
    console.log('3. 重啟服務器: npm start');
    console.log('4. 測試功能: node test_realtime_notifications.js');
    
  } catch (error) {
    console.error('❌ 整合失敗:', error);
    process.exit(1);
  }
}

// 如果直接運行此腳本
if (require.main === module) {
  runIntegration();
}

module.exports = RealtimeSystemIntegrator;