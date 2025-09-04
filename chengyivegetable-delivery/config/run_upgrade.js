const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

async function runUpgrade() {
  console.log('🚀 開始執行資料庫升級...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // 讀取SQL腳本
    const sqlScript = fs.readFileSync('./upgrade_today_features.sql', 'utf8');
    
    // 執行SQL腳本
    console.log('📄 執行SQL腳本...');
    const result = await pool.query(sqlScript);
    
    console.log('✅ 資料庫升級完成！');
    console.log('📊 執行結果:', result);
    
    // 驗證新表是否建立成功
    const checkTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('drivers', 'notifications', 'driver_locations', 'order_status_log', 'order_status_definitions')
      ORDER BY table_name
    `);
    
    console.log('🏗️ 新建立的表：');
    checkTables.rows.forEach(row => {
      console.log(`  ✅ ${row.table_name}`);
    });
    
    // 檢查測試外送員是否插入成功
    const checkDrivers = await pool.query('SELECT name, phone, status FROM drivers');
    console.log('👤 外送員列表：');
    checkDrivers.rows.forEach(driver => {
      console.log(`  📱 ${driver.name} (${driver.phone}) - ${driver.status}`);
    });
    
  } catch (error) {
    console.error('❌ 升級失敗:', error.message);
    if (error.message.includes('already exists')) {
      console.log('ℹ️ 部分表格已存在，這是正常現象');
    }
  } finally {
    await pool.end();
  }
}

runUpgrade();