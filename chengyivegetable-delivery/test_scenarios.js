// 外送員工作台測試場景腳本
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createTestScenarios() {
  console.log('🧪 開始建立測試場景...');
  
  try {
    // 1. 創建待配送訂單 (packed狀態)
    console.log('📦 創建待配送測試訂單...');
    
    const packedOrder = await pool.query(`
      INSERT INTO orders (
        contact_name, contact_phone, address, notes, 
        subtotal, delivery_fee, total_amount, status,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      ) RETURNING id
    `, [
      '王小明', '0912345678', '新北市三峽區大學路1號', 
      '請按電鈴，測試訂單', 160, 50, 210, 'confirmed',
      new Date(), new Date()
    ]);
    
    const packedOrderId = packedOrder.rows[0].id;
    
    // 添加訂單項目
    await pool.query(`
      INSERT INTO order_items (order_id, product_id, name, quantity, unit_price, line_total)
      VALUES ($1, $2, $3, $4, $5, $6), ($1, $7, $8, $9, $10, $11)
    `, [
      packedOrderId, 1, '🥬 有機高麗菜', 2, 80, 160,
      2, '🍅 新鮮番茄', 1, 0, 0
    ]);
    
    console.log(`✅ 已創建待配送訂單 #${packedOrderId} (confirmed狀態)`);
    
    // 2. 創建正在配送訂單 (assigned狀態)
    const assignedOrder = await pool.query(`
      INSERT INTO orders (
        contact_name, contact_phone, address, notes,
        subtotal, delivery_fee, total_amount, status, driver_id,
        assigned_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      ) RETURNING id
    `, [
      '李小華', '0923456789', '新北市三峽區中山路456號', 
      '二樓，測試配送中', 120, 50, 170, 'delivering', 1,
      new Date(), new Date(), new Date()
    ]);
    
    const assignedOrderId = assignedOrder.rows[0].id;
    
    await pool.query(`
      INSERT INTO order_items (order_id, product_id, name, quantity, unit_price, line_total)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      assignedOrderId, 1, '🥬 有機高麗菜', 1, 80, 80,
    ]);
    
    console.log(`✅ 已創建配送中訂單 #${assignedOrderId}`);
    
    // 3. 創建已完成訂單 (delivered狀態)
    const completedOrder = await pool.query(`
      INSERT INTO orders (
        contact_name, contact_phone, address, notes,
        subtotal, delivery_fee, total_amount, status, driver_id,
        assigned_at, delivered_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      ) RETURNING id
    `, [
      '張大同', '0934567890', '新北市三峽區學成路789號',
      '已完成測試訂單', 200, 0, 200, 'delivered', 1,
      new Date(Date.now() - 3600000), new Date(Date.now() - 1800000),
      new Date(), new Date()
    ]);
    
    const completedOrderId = completedOrder.rows[0].id;
    
    await pool.query(`
      INSERT INTO order_items (order_id, product_id, name, quantity, unit_price, line_total)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      completedOrderId, 1, '🥬 有機高麗菜', 2, 80, 160,
    ]);
    
    console.log(`✅ 已創建已完成訂單 #${completedOrderId}`);
    
    // 4. 確保外送員存在
    await pool.query(`
      INSERT INTO drivers (id, name, phone, password_hash, status, total_deliveries)
      VALUES (1, '李大明', '0912345678', 'driver123', 'online', 5)
      ON CONFLICT (id) DO UPDATE SET 
        status = 'online',
        total_deliveries = EXCLUDED.total_deliveries
    `);
    
    console.log('✅ 外送員資料已更新');
    
    console.log('🎉 測試場景建立完成！');
    console.log(`
測試場景摘要:
- 待配送訂單: #${packedOrderId} (王小明)
- 配送中訂單: #${assignedOrderId} (李小華) 
- 已完成訂單: #${completedOrderId} (張大同)
- 外送員: 李大明 (ID: 1)
`);
    
    // 驗證數據
    const verification = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM orders 
      WHERE status IN ('confirmed', 'preparing', 'assigned', 'picked_up', 'delivering', 'delivered')
      GROUP BY status
      ORDER BY status
    `);
    
    console.log('📊 訂單狀態統計:');
    verification.rows.forEach(row => {
      console.log(`  ${row.status}: ${row.count} 筆`);
    });
    
  } catch (error) {
    console.error('❌ 建立測試場景失敗:', error);
  } finally {
    await pool.end();
  }
}

// 如果直接執行此腳本
if (require.main === module) {
  createTestScenarios();
}

module.exports = { createTestScenarios };