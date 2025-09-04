const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

async function addProducts() {
  console.log('🔧 開始連接資料庫...');
  
  const pool = new Pool({
    host: 'db.siwnqjavjljhicekloss.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: '@Chengyivegetable',
    ssl: { rejectUnauthorized: false }
  });

  try {
    // 測試連線
    await pool.query('SELECT 1');
    console.log('✅ 資料庫連線成功');

    // 1. 新增空心菜
    console.log('📝 新增空心菜...');
    const spinachResult = await pool.query(
      'INSERT INTO products (name, price, is_priced_item, unit_hint) VALUES ($1, $2, $3, $4) RETURNING id',
      ['🥬 空心菜', 50, false, '每把']
    );
    const spinachId = spinachResult.rows[0].id;
    
    await pool.query(
      'INSERT INTO inventory (product_id, current_stock, min_stock_alert, max_stock_capacity, unit_cost, supplier_name) VALUES ($1, $2, $3, $4, $5, $6)',
      [spinachId, 30, 5, 100, 35.0, '新鮮農場']
    );
    
    await pool.query(
      'INSERT INTO stock_movements (product_id, movement_type, quantity, unit_cost, reason, operator_name) VALUES ($1, $2, $3, $4, $5, $6)',
      [spinachId, 'in', 30, 35.0, '新商品初始庫存', '管理員']
    );
    console.log('✅ 空心菜新增完成');

    // 2. 新增高麗菜
    console.log('📝 新增高麗菜...');
    const cabbageResult = await pool.query(
      'INSERT INTO products (name, price, is_priced_item, unit_hint) VALUES ($1, $2, $3, $4) RETURNING id',
      ['🥬 高麗菜', 45, true, '每斤']
    );
    const cabbageId = cabbageResult.rows[0].id;
    
    await pool.query(
      'INSERT INTO inventory (product_id, current_stock, min_stock_alert, max_stock_capacity, unit_cost, supplier_name) VALUES ($1, $2, $3, $4, $5, $6)',
      [cabbageId, 20, 3, 50, 31.5, '有機農場']
    );
    
    await pool.query(
      'INSERT INTO stock_movements (product_id, movement_type, quantity, unit_cost, reason, operator_name) VALUES ($1, $2, $3, $4, $5, $6)',
      [cabbageId, 'in', 20, 31.5, '新商品初始庫存', '管理員']
    );
    console.log('✅ 高麗菜新增完成');

    // 3. 新增水果玉米
    console.log('📝 新增水果玉米...');
    const cornResult = await pool.query(
      'INSERT INTO products (name, price, is_priced_item, unit_hint) VALUES ($1, $2, $3, $4) RETURNING id',
      ['🌽 水果玉米', 80, false, '每條']
    );
    const cornId = cornResult.rows[0].id;
    
    await pool.query(
      'INSERT INTO inventory (product_id, current_stock, min_stock_alert, max_stock_capacity, unit_cost, supplier_name) VALUES ($1, $2, $3, $4, $5, $6)',
      [cornId, 25, 5, 100, 56.0, '玉米專業農場']
    );
    
    await pool.query(
      'INSERT INTO stock_movements (product_id, movement_type, quantity, unit_cost, reason, operator_name) VALUES ($1, $2, $3, $4, $5, $6)',
      [cornId, 'in', 25, 56.0, '新商品初始庫存', '管理員']
    );
    console.log('✅ 水果玉米新增完成');

    // 驗證結果
    console.log('📊 驗證新增結果...');
    const result = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.price,
        p.is_priced_item,
        p.unit_hint,
        i.current_stock,
        i.min_stock_alert,
        i.supplier_name
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE p.name IN ('🥬 空心菜', '🥬 高麗菜', '🌽 水果玉米')
      ORDER BY p.id DESC
    `);

    console.log('📋 新增的商品清單：');
    result.rows.forEach(product => {
      console.log(`- ${product.name}: 價格${product.price}元, 庫存${product.current_stock}, 供應商${product.supplier_name}`);
    });

    console.log('🎉 所有商品新增完成！');

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
  } finally {
    await pool.end();
  }
}

addProducts();