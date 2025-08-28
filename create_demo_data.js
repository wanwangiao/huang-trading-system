#!/usr/bin/env node

/**
 * 建立展示用完整測試數據
 * 包含不同情境的訂單用於測試各種功能
 */

const { Client } = require('pg');
require('dotenv').config();

async function createConnection() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  await client.connect();
  return client;
}

/**
 * 建立特定情境的訂單
 */
async function createScenarioOrders(client) {
  console.log('🎭 建立特定情境測試訂單...');

  const scenarios = [
    {
      name: '緊急訂單情境',
      orders: [
        {
          contact_name: '緊急客戶-王小明',
          contact_phone: '0987654321',
          address: '台北市信義區信義路五段7號 (101大樓)',
          notes: '緊急訂單，請盡快配送！',
          status: 'confirmed',
          priority: 'high',
          lat: 25.0338,
          lng: 121.5645
        }
      ]
    },
    {
      name: '大量訂單情境',
      orders: [
        {
          contact_name: '餐廳採購-陳老闆',
          contact_phone: '02-87654321',
          address: '台北市大安區忠孝東路四段216巷27弄16號',
          notes: '餐廳用菜，品質要好，數量較大',
          status: 'preparing',
          priority: 'normal',
          lat: 25.0408,
          lng: 121.5492
        }
      ]
    },
    {
      name: '配送中訂單情境',
      orders: [
        {
          contact_name: '追蹤測試-李太太',
          contact_phone: '0965432187',
          address: '新北市板橋區文化路一段266號',
          notes: '下午2點後有人在家',
          status: 'delivering',
          priority: 'normal',
          lat: 25.0150,
          lng: 121.4627
        }
      ]
    },
    {
      name: '問題訂單情境',
      orders: [
        {
          contact_name: '聯絡困難-張先生',
          contact_phone: '0912000000',
          address: '桃園市桃園區中正路1071號',
          notes: '電話常打不通，請多試幾次',
          status: 'ready',
          priority: 'normal',
          lat: 24.9936,
          lng: 121.3010
        }
      ]
    }
  ];

  for (const scenario of scenarios) {
    console.log(`📝 建立${scenario.name}...`);
    
    for (const orderData of scenario.orders) {
      // 建立訂單
      const orderResult = await client.query(`
        INSERT INTO orders (
          contact_name, contact_phone, address, notes, 
          status, created_at, lat, lng, geocoded_at, geocode_status,
          subtotal, delivery_fee, total_amount
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `, [
        orderData.contact_name,
        orderData.contact_phone,
        orderData.address,
        orderData.notes,
        orderData.status,
        new Date(),
        orderData.lat,
        orderData.lng,
        new Date(),
        'success',
        0, // 會在下面更新
        50,
        0  // 會在下面更新
      ]);

      const orderId = orderResult.rows[0].id;

      // 根據情境建立不同的商品組合
      let items = [];
      let subtotal = 0;

      if (scenario.name.includes('緊急')) {
        // 緊急訂單：少量高單價商品
        items = [
          { product_id: 1, name: '🥬 有機高麗菜', quantity: 1, unit_price: 80, line_total: 80 },
          { product_id: 3, name: '🥬 青江菜', quantity: 2, unit_price: 40, line_total: 80 }
        ];
        subtotal = 160;
      } else if (scenario.name.includes('大量')) {
        // 大量訂單：多種商品大量購買
        items = [
          { product_id: 1, name: '🥬 有機高麗菜', quantity: 5, unit_price: 80, line_total: 400 },
          { product_id: 2, name: '🍅 新鮮番茄', quantity: 3, unit_price: 65, line_total: 195, actual_weight: 1.8 },
          { product_id: 3, name: '🥬 青江菜', quantity: 8, unit_price: 40, line_total: 320 },
          { product_id: 5, name: '🥒 小黃瓜', quantity: 4, unit_price: 60, line_total: 240 }
        ];
        subtotal = 1155;
      } else if (scenario.name.includes('配送中')) {
        // 配送中訂單：一般家庭用量
        items = [
          { product_id: 4, name: '🥕 胡蘿蔔', quantity: 1, unit_price: 45, line_total: 45, actual_weight: 0.8 },
          { product_id: 7, name: '🥬 空心菜', quantity: 2, unit_price: 50, line_total: 100 },
          { product_id: 9, name: '🌽 水果玉米', quantity: 3, unit_price: 80, line_total: 240 }
        ];
        subtotal = 385;
      } else {
        // 問題訂單：中等數量
        items = [
          { product_id: 6, name: '🧅 洋蔥', quantity: 2, unit_price: 35, line_total: 70, actual_weight: 1.2 },
          { product_id: 8, name: '🥬 高麗菜', quantity: 1, unit_price: 45, line_total: 45, actual_weight: 1.0 }
        ];
        subtotal = 115;
      }

      // 更新訂單總金額
      const total = subtotal + 50;
      await client.query(`
        UPDATE orders SET subtotal = $1, total_amount = $2 WHERE id = $3
      `, [subtotal, total, orderId]);

      // 插入訂單項目
      for (const item of items) {
        await client.query(`
          INSERT INTO order_items (
            order_id, product_id, name, is_priced_item,
            quantity, unit_price, line_total, actual_weight
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          orderId,
          item.product_id,
          item.name,
          item.actual_weight ? true : false,
          item.quantity,
          item.unit_price,
          item.line_total,
          item.actual_weight || null
        ]);
      }

      console.log(`  ✅ 訂單 #${orderId} (${orderData.contact_name}) - NT$ ${total}`);
    }
  }
}

/**
 * 建立測試外送員數據
 */
async function createTestDrivers(client) {
  console.log('🚚 建立測試外送員數據...');

  // 檢查是否已有drivers表
  const tableExists = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'drivers'
    );
  `);

  if (!tableExists.rows[0].exists) {
    console.log('📋 建立drivers表...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS drivers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL UNIQUE,
        license_plate VARCHAR(20),
        vehicle_type VARCHAR(50),
        status VARCHAR(20) DEFAULT 'available',
        current_lat NUMERIC,
        current_lng NUMERIC,
        last_location_update TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  const testDrivers = [
    { name: '李師傅', phone: '0922111111', license_plate: 'ABC-1234', vehicle_type: 'motorcycle', status: 'available' },
    { name: '王小弟', phone: '0933222222', license_plate: 'DEF-5678', vehicle_type: 'scooter', status: 'busy' },
    { name: '陳大哥', phone: '0944333333', license_plate: 'GHI-9012', vehicle_type: 'motorcycle', status: 'available' }
  ];

  for (const driver of testDrivers) {
    try {
      await client.query(`
        INSERT INTO drivers (name, phone, license_plate, vehicle_type, status)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (phone) DO UPDATE SET
          name = EXCLUDED.name,
          license_plate = EXCLUDED.license_plate,
          vehicle_type = EXCLUDED.vehicle_type,
          status = EXCLUDED.status
      `, [driver.name, driver.phone, driver.license_plate, driver.vehicle_type, driver.status]);
      
      console.log(`  ✅ 外送員: ${driver.name} (${driver.phone})`);
    } catch (error) {
      console.error(`❌ 建立外送員 ${driver.name} 失敗:`, error.message);
    }
  }
}

/**
 * 建立庫存測試數據
 */
async function createInventoryData(client) {
  console.log('📦 建立庫存測試數據...');

  // 獲取商品列表
  const products = await client.query('SELECT id, name FROM products WHERE id <= 9');
  
  for (const product of products.rows) {
    const currentStock = Math.floor(Math.random() * 100) + 10; // 10-109
    const minAlert = 15;
    const maxCapacity = 200;
    const unitCost = Math.floor(Math.random() * 30) + 10; // 10-39

    try {
      await client.query(`
        INSERT INTO inventory (product_id, current_stock, min_stock_alert, max_stock_capacity, unit_cost)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (product_id) DO UPDATE SET
          current_stock = EXCLUDED.current_stock,
          min_stock_alert = EXCLUDED.min_stock_alert,
          max_stock_capacity = EXCLUDED.max_stock_capacity,
          unit_cost = EXCLUDED.unit_cost,
          last_updated = CURRENT_TIMESTAMP
      `, [product.id, currentStock, minAlert, maxCapacity, unitCost]);
      
      console.log(`  ✅ ${product.name}: 庫存 ${currentStock}`);
    } catch (error) {
      console.error(`❌ 建立庫存數據失敗:`, error.message);
    }
  }
}

/**
 * 主執行函數
 */
async function main() {
  const client = await createConnection();

  try {
    console.log('🎯 開始建立完整展示數據...\n');

    // 建立情境訂單
    await createScenarioOrders(client);

    // 建立測試外送員
    await createTestDrivers(client);

    // 建立庫存數據
    await createInventoryData(client);

    // 統計總數
    const orderCount = await client.query('SELECT COUNT(*) FROM orders');
    const driverCount = await client.query('SELECT COUNT(*) FROM drivers');
    const inventoryCount = await client.query('SELECT COUNT(*) FROM inventory');

    console.log('\n🎉 完整展示數據建立完成！');
    console.log('='.repeat(50));
    console.log(`📦 總訂單數: ${orderCount.rows[0].count}`);
    console.log(`🚚 外送員數: ${driverCount.rows[0].count}`);
    console.log(`📋 庫存項目: ${inventoryCount.rows[0].count}`);

    console.log('\n🌐 測試連結:');
    console.log(`📱 前台: http://localhost:3005/`);
    console.log(`⚙️  管理後台: http://localhost:3005/admin`);
    console.log(`🚚 外送員界面: http://localhost:3005/driver`);
    console.log(`🗺️  地圖測試: http://localhost:3005/admin/map`);
    console.log(`🔌 WebSocket測試: http://localhost:3005/websocket-test`);

  } catch (error) {
    console.error('❌ 執行過程中發生錯誤:', error);
  } finally {
    await client.end();
    console.log('\n🔌 資料庫連接已關閉');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { createScenarioOrders, createTestDrivers, createInventoryData };