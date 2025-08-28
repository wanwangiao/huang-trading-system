const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

console.log('🚀 開始部署更新...');

async function deployUpdates() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('📞 連接資料庫...');
    await pool.query('SELECT 1');
    console.log('✅ 資料庫連接成功！');

    console.log('\n📋 步驟1: 檢查並創建商品選項相關資料表...');
    
    // 創建商品選項群組表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_option_groups (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_required BOOLEAN DEFAULT true,
        selection_type VARCHAR(20) DEFAULT 'single',
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ 商品選項群組表已創建');

    // 創建商品選項表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_options (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES product_option_groups(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        price_modifier NUMERIC(10,2) DEFAULT 0,
        is_default BOOLEAN DEFAULT false,
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ 商品選項表已創建');

    // 創建訂單商品選項表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_item_options (
        id SERIAL PRIMARY KEY,
        order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
        option_group_id INTEGER NOT NULL REFERENCES product_option_groups(id),
        option_id INTEGER NOT NULL REFERENCES product_options(id),
        option_name VARCHAR(100) NOT NULL,
        price_modifier NUMERIC(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ 訂單商品選項表已創建');

    console.log('\n🥬 步驟2: 新增商品...');

    // 檢查商品是否已存在
    const existingProducts = await pool.query(`
      SELECT name FROM products 
      WHERE name IN ('🥬 空心菜', '🥬 高麗菜', '🌽 水果玉米')
    `);
    
    const existingNames = existingProducts.rows.map(p => p.name);
    console.log('📋 已存在的商品:', existingNames);

    // 1. 新增空心菜
    if (!existingNames.includes('🥬 空心菜')) {
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
    } else {
      console.log('⏭️ 空心菜已存在，跳過');
    }

    // 2. 新增高麗菜  
    if (!existingNames.includes('🥬 高麗菜')) {
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
    } else {
      console.log('⏭️ 高麗菜已存在，跳過');
    }

    // 3. 新增水果玉米
    let cornId;
    if (!existingNames.includes('🌽 水果玉米')) {
      console.log('📝 新增水果玉米...');
      const cornResult = await pool.query(
        'INSERT INTO products (name, price, is_priced_item, unit_hint) VALUES ($1, $2, $3, $4) RETURNING id',
        ['🌽 水果玉米', 80, false, '每條']
      );
      cornId = cornResult.rows[0].id;
      
      await pool.query(
        'INSERT INTO inventory (product_id, current_stock, min_stock_alert, max_stock_capacity, unit_cost, supplier_name) VALUES ($1, $2, $3, $4, $5, $6)',
        [cornId, 25, 5, 100, 56.0, '玉米專業農場']
      );
      
      await pool.query(
        'INSERT INTO stock_movements (product_id, movement_type, quantity, unit_cost, reason, operator_name) VALUES ($1, $2, $3, $4, $5, $6)',
        [cornId, 'in', 25, 56.0, '新商品初始庫存', '管理員']
      );
      console.log('✅ 水果玉米新增完成');
    } else {
      console.log('⏭️ 水果玉米已存在，取得ID...');
      const cornResult = await pool.query('SELECT id FROM products WHERE name = $1', ['🌽 水果玉米']);
      cornId = cornResult.rows[0].id;
    }

    console.log('\n🌽 步驟3: 為水果玉米建立選項...');

    // 檢查是否已有選項群組
    const existingGroups = await pool.query(
      'SELECT id, name FROM product_option_groups WHERE product_id = $1',
      [cornId]
    );

    if (existingGroups.rows.length === 0) {
      // 建立撥皮選項群組
      const peelGroupResult = await pool.query(`
        INSERT INTO product_option_groups (product_id, name, description, is_required, selection_type, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
      `, [cornId, '撥皮服務', '是否需要代為撥玉米皮', true, 'single', 1]);
      
      const peelGroupId = peelGroupResult.rows[0].id;

      // 建立撥皮選項
      await pool.query(`
        INSERT INTO product_options (group_id, name, description, price_modifier, is_default, sort_order)
        VALUES 
        ($1, '要撥皮', '代為撥除玉米外皮', 5, false, 1),
        ($1, '不撥皮', '保持原狀不處理', 0, true, 2)
      `, [peelGroupId]);

      // 建立切片選項群組
      const sliceGroupResult = await pool.query(`
        INSERT INTO product_option_groups (product_id, name, description, is_required, selection_type, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
      `, [cornId, '切片服務', '是否需要切成片狀', true, 'single', 2]);
      
      const sliceGroupId = sliceGroupResult.rows[0].id;

      // 建立切片選項
      await pool.query(`
        INSERT INTO product_options (group_id, name, description, price_modifier, is_default, sort_order)
        VALUES 
        ($1, '要切片', '切成適合食用的片狀', 3, false, 1),
        ($1, '不切片', '保持整條狀態', 0, true, 2)
      `, [sliceGroupId]);

      console.log('✅ 水果玉米選項已建立');
    } else {
      console.log('⏭️ 水果玉米選項已存在，跳過');
    }

    console.log('\n📊 步驟4: 驗證結果...');
    const finalResult = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.price,
        p.is_priced_item,
        p.unit_hint,
        i.current_stock,
        i.min_stock_alert,
        i.supplier_name,
        COUNT(pog.id) as option_groups_count
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      LEFT JOIN product_option_groups pog ON p.id = pog.product_id
      WHERE p.name IN ('🥬 空心菜', '🥬 高麗菜', '🌽 水果玉米')
      GROUP BY p.id, p.name, p.price, p.is_priced_item, p.unit_hint, i.current_stock, i.min_stock_alert, i.supplier_name
      ORDER BY p.id DESC
    `);

    console.log('\n🎉 部署完成！新增商品清單：');
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log('│                        商品清單                                │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    
    finalResult.rows.forEach(product => {
      const priceInfo = product.is_priced_item ? `${product.price}元/斤 (秤重)` : `${product.price}元/${product.unit_hint}`;
      const optionInfo = product.option_groups_count > 0 ? ` (${product.option_groups_count}個選項群組)` : '';
      console.log(`│ ${product.name.padEnd(12)} │ ${priceInfo.padEnd(20)} │ 庫存:${String(product.current_stock).padEnd(3)} │ ${product.supplier_name}${optionInfo}`);
    });
    console.log('└─────────────────────────────────────────────────────────────────┘');

    // 檢查選項詳情
    const optionDetails = await pool.query(`
      SELECT 
        p.name as product_name,
        pog.name as group_name,
        po.name as option_name,
        po.price_modifier
      FROM products p
      JOIN product_option_groups pog ON p.id = pog.product_id
      JOIN product_options po ON pog.id = po.group_id
      WHERE p.name = '🌽 水果玉米'
      ORDER BY pog.sort_order, po.sort_order
    `);

    if (optionDetails.rows.length > 0) {
      console.log('\n🌽 水果玉米選項詳情：');
      optionDetails.rows.forEach(option => {
        const priceInfo = option.price_modifier > 0 ? `+${option.price_modifier}元` : '免費';
        console.log(`  ${option.group_name} → ${option.option_name} (${priceInfo})`);
      });
    }

    console.log('\n✅ 所有更新部署完成！');
    return true;

  } catch (error) {
    console.error('❌ 部署失敗:', error.message);
    console.error('🔍 錯誤詳情:', error);
    return false;
  } finally {
    await pool.end();
  }
}

deployUpdates().then(success => {
  if (success) {
    console.log('\n🎊 部署成功！您現在可以：');
    console.log('1. 訪問 https://chengyivegetable.onrender.com 查看新商品');
    console.log('2. 進入後台 https://chengyivegetable.onrender.com/admin 管理庫存');
    console.log('3. 測試水果玉米的撥皮和切片選項功能');
  } else {
    console.log('\n⚠️ 部署失敗，請檢查錯誤訊息。');
  }
  process.exit();
});