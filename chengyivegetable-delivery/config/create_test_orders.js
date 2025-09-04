#!/usr/bin/env node

/**
 * 建立客戶下單測試數據腳本
 * 生成多樣化的訂單數據用於測試系統功能
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// 載入環境變數
require('dotenv').config();

/**
 * 資料庫連接配置
 */
async function createConnection() {
  let connectionString;
  
  if (process.env.DATABASE_URL) {
    connectionString = process.env.DATABASE_URL;
  } else {
    console.error('❌ 未找到 DATABASE_URL 環境變數');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ 資料庫連接成功');
    return client;
  } catch (error) {
    console.error('❌ 資料庫連接失敗:', error.message);
    throw error;
  }
}

/**
 * 台灣真實地址數據 (包含座標)
 */
const taiwanAddresses = [
  {
    address: '台北市中山區中山北路二段36號',
    lat: 25.0540,
    lng: 121.5203,
    district: '中山區'
  },
  {
    address: '台北市信義區信義路五段7號',
    lat: 25.0338,
    lng: 121.5645,
    district: '信義區'
  },
  {
    address: '台北市大安區敦化南路一段161號',
    lat: 25.0408,
    lng: 121.5492,
    district: '大安區'
  },
  {
    address: '新北市板橋區文化路一段266號',
    lat: 25.0150,
    lng: 121.4627,
    district: '板橋區'
  },
  {
    address: '新北市新莊區中正路199號',
    lat: 25.0377,
    lng: 121.4318,
    district: '新莊區'
  },
  {
    address: '桃園市桃園區中正路1071號',
    lat: 24.9936,
    lng: 121.3010,
    district: '桃園區'
  },
  {
    address: '台中市西屯區台灣大道三段99號',
    lat: 24.1620,
    lng: 120.6437,
    district: '西屯區'
  },
  {
    address: '台中市北區三民路三段100號',
    lat: 24.1555,
    lng: 120.6800,
    district: '北區'
  },
  {
    address: '高雄市左營區博愛二路777號',
    lat: 22.6782,
    lng: 120.2944,
    district: '左營區'
  },
  {
    address: '高雄市三民區建工路583號',
    lat: 22.6515,
    lng: 120.3240,
    district: '三民區'
  },
  {
    address: '台南市中西區中正路126號',
    lat: 22.9908,
    lng: 120.2133,
    district: '中西區'
  },
  {
    address: '台南市東區裕農路250號',
    lat: 22.9858,
    lng: 120.2433,
    district: '東區'
  },
  {
    address: '新竹市東區光復路二段101號',
    lat: 24.8000,
    lng: 120.9716,
    district: '東區'
  },
  {
    address: '彰化縣彰化市中山路二段416號',
    lat: 24.0811,
    lng: 120.5438,
    district: '彰化市'
  },
  {
    address: '嘉義市西區垂楊路243號',
    lat: 23.4736,
    lng: 120.4473,
    district: '西區'
  }
];

/**
 * 客戶資料模板
 */
const customerTemplates = [
  { name: '陳小美', phone: '0912345678' },
  { name: '李大華', phone: '0923456789' },
  { name: '王志明', phone: '0934567890' },
  { name: '林淑芬', phone: '0945678901' },
  { name: '張家豪', phone: '0956789012' },
  { name: '黃雅婷', phone: '0967890123' },
  { name: '劉建國', phone: '0978901234' },
  { name: '吳佩君', phone: '0989012345' },
  { name: '鄭明德', phone: '0901234567' },
  { name: '謝麗華', phone: '0912344321' },
  { name: '蔡志偉', phone: '0923433210' },
  { name: '楊雅惠', phone: '0934522109' },
  { name: '許文龍', phone: '0945611098' },
  { name: '賴美玲', phone: '0956700987' },
  { name: '馬志強', phone: '0967899876' }
];

/**
 * 訂單狀態選項
 */
const orderStatuses = [
  'placed',      // 已下單
  'confirmed',   // 已確認
  'preparing',   // 準備中
  'ready',       // 準備完成
  'delivering',  // 配送中
  'delivered',   // 已送達
  'completed'    // 已完成
];

/**
 * 常見備註
 */
const commonNotes = [
  '請放在一樓大廳',
  '門鈴壞了，請打電話',
  '有管理員可代收',
  '請送到後門',
  '11點後才有人在家',
  '蔬菜要新鮮一點',
  '如果缺貨可以換成類似商品',
  '請包裝仔細一點',
  '需要塑膠袋',
  null, null, null // 有些訂單沒有備註
];

/**
 * 生成隨機日期（過去30天內）
 */
function getRandomDateInPast30Days() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
  const randomTime = thirtyDaysAgo.getTime() + Math.random() * (now.getTime() - thirtyDaysAgo.getTime());
  return new Date(randomTime);
}

/**
 * 生成隨機訂單項目
 */
async function generateOrderItems(client, orderId) {
  // 獲取可用商品
  const productsResult = await client.query('SELECT * FROM products WHERE id <= 9'); // 只用前9個商品，避免亂碼
  const products = productsResult.rows;
  
  if (products.length === 0) {
    console.warn('⚠️ 沒有找到商品數據');
    return { items: [], total: 0 };
  }

  // 隨機選擇1-4個不同商品
  const numItems = Math.floor(Math.random() * 4) + 1;
  const selectedProducts = [];
  const usedProductIds = new Set();

  for (let i = 0; i < numItems; i++) {
    let product;
    do {
      product = products[Math.floor(Math.random() * products.length)];
    } while (usedProductIds.has(product.id) && usedProductIds.size < products.length);
    
    usedProductIds.add(product.id);
    selectedProducts.push(product);
  }

  const items = [];
  let subtotal = 0;

  for (const product of selectedProducts) {
    const quantity = Math.floor(Math.random() * 3) + 1; // 1-3個
    let unitPrice, lineTotal;

    if (product.is_priced_item) {
      // 計價商品，隨機產生單價
      unitPrice = Math.floor(Math.random() * 80) + 20; // 20-99元
      lineTotal = unitPrice * quantity;
    } else {
      // 固定價格商品
      unitPrice = parseFloat(product.price);
      lineTotal = unitPrice * quantity;
    }

    // 對於計價商品，模擬實際重量
    const actualWeight = product.is_priced_item ? (Math.random() * 1.5 + 0.5).toFixed(2) : null;

    items.push({
      product_id: product.id,
      name: product.name,
      is_priced_item: product.is_priced_item,
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
      actual_weight: actualWeight
    });

    subtotal += lineTotal;
  }

  return { items, subtotal };
}

/**
 * 建立測試訂單
 */
async function createTestOrders(client, numOrders = 50) {
  console.log(`🚀 開始建立 ${numOrders} 筆測試訂單...`);

  const createdOrders = [];

  for (let i = 0; i < numOrders; i++) {
    try {
      // 隨機選擇地址和客戶
      const addressData = taiwanAddresses[Math.floor(Math.random() * taiwanAddresses.length)];
      const customer = customerTemplates[Math.floor(Math.random() * customerTemplates.length)];
      const notes = commonNotes[Math.floor(Math.random() * commonNotes.length)];
      const status = orderStatuses[Math.floor(Math.random() * orderStatuses.length)];
      const createdAt = getRandomDateInPast30Days();

      // 生成發票號碼（50%機率）
      const invoice = Math.random() > 0.5 ? `AA${String(Math.floor(Math.random() * 90000000) + 10000000)}` : null;

      // 建立訂單
      const orderResult = await client.query(`
        INSERT INTO orders (
          contact_name, contact_phone, address, notes, invoice, 
          subtotal, delivery_fee, total_amount, status, created_at,
          lat, lng, geocoded_at, geocode_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
      `, [
        customer.name,
        customer.phone,
        addressData.address,
        notes,
        invoice,
        0, // 暫時設為0，後面會更新
        50, // 固定運費50元
        0, // 暫時設為0，後面會更新
        status,
        createdAt,
        addressData.lat,
        addressData.lng,
        createdAt,
        'success'
      ]);

      const orderId = orderResult.rows[0].id;

      // 生成訂單項目
      const { items, subtotal } = await generateOrderItems(client, orderId);
      const total = subtotal + 50; // 加上運費

      // 更新訂單總金額
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
          item.is_priced_item,
          item.quantity,
          item.unit_price,
          item.line_total,
          item.actual_weight
        ]);
      }

      createdOrders.push({
        id: orderId,
        customer: customer.name,
        address: addressData.district,
        total: total,
        status: status,
        created_at: createdAt.toISOString().split('T')[0]
      });

      if ((i + 1) % 10 === 0) {
        console.log(`✅ 已建立 ${i + 1} 筆訂單...`);
      }

    } catch (error) {
      console.error(`❌ 建立第 ${i + 1} 筆訂單時發生錯誤:`, error.message);
    }
  }

  return createdOrders;
}

/**
 * 建立測試用戶數據
 */
async function createTestUsers(client) {
  console.log('👤 建立測試用戶數據...');

  const users = [
    { phone: '0912345678', name: '陳小美', line_user_id: 'U1234567890abcdef', line_display_name: '小美' },
    { phone: '0923456789', name: '李大華', line_user_id: 'U2345678901bcdefg', line_display_name: '大華' },
    { phone: '0934567890', name: '王志明', line_user_id: 'U3456789012cdefgh', line_display_name: '志明' },
    { phone: '0945678901', name: '林淑芬', line_user_id: 'U4567890123defghi', line_display_name: '淑芬' },
    { phone: '0956789012', name: '張家豪', line_user_id: null, line_display_name: null }
  ];

  for (const user of users) {
    try {
      await client.query(`
        INSERT INTO users (phone, name, line_user_id, line_display_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (phone) DO UPDATE SET
          name = EXCLUDED.name,
          line_user_id = EXCLUDED.line_user_id,
          line_display_name = EXCLUDED.line_display_name
      `, [user.phone, user.name, user.line_user_id, user.line_display_name]);
    } catch (error) {
      console.error(`❌ 建立用戶 ${user.name} 時發生錯誤:`, error.message);
    }
  }

  console.log('✅ 用戶數據建立完成');
}

/**
 * 主要執行函數
 */
async function main() {
  const client = await createConnection();

  try {
    console.log('🎯 開始建立客戶下單測試數據...\n');

    // 建立測試用戶
    await createTestUsers(client);

    // 建立測試訂單（預設50筆）
    const numOrders = process.argv[2] ? parseInt(process.argv[2]) : 50;
    const createdOrders = await createTestOrders(client, numOrders);

    // 顯示統計資訊
    console.log('\n📊 測試數據建立完成！');
    console.log('='.repeat(50));
    console.log(`📦 總訂單數: ${createdOrders.length}`);
    
    // 按狀態統計
    const statusStats = {};
    createdOrders.forEach(order => {
      statusStats[order.status] = (statusStats[order.status] || 0) + 1;
    });

    console.log('\n📈 訂單狀態分佈:');
    Object.entries(statusStats).forEach(([status, count]) => {
      console.log(`  ${status}: ${count} 筆`);
    });

    // 按地區統計
    const districtStats = {};
    createdOrders.forEach(order => {
      districtStats[order.address] = (districtStats[order.address] || 0) + 1;
    });

    console.log('\n🌏 地區分佈:');
    Object.entries(districtStats).forEach(([district, count]) => {
      console.log(`  ${district}: ${count} 筆`);
    });

    // 總金額統計
    const totalAmount = createdOrders.reduce((sum, order) => sum + order.total, 0);
    console.log(`\n💰 總訂單金額: NT$ ${totalAmount.toLocaleString()}`);
    console.log(`💵 平均訂單金額: NT$ ${Math.round(totalAmount / createdOrders.length)}`);

    console.log('\n🎉 測試數據建立完成！');
    console.log('🌐 可至管理後台查看: http://localhost:3005/admin');

  } catch (error) {
    console.error('❌ 執行過程中發生錯誤:', error);
  } finally {
    await client.end();
    console.log('🔌 資料庫連接已關閉');
  }
}

// 執行主程式
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  createTestOrders,
  createTestUsers,
  taiwanAddresses,
  customerTemplates
};