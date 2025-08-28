const { Pool } = require('pg');
require('dotenv').config();

async function testConnection() {
  console.log('🔧 測試資料庫連線...');
  
  // 方法1: 使用環境變數的完整連線字串
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { 
      rejectUnauthorized: false 
    }
  });

  try {
    console.log('📞 嘗試連接資料庫...');
    const result = await pool.query('SELECT NOW() as current_time, version() as db_version');
    console.log('✅ 資料庫連線成功！');
    console.log('⏰ 當前時間:', result.rows[0].current_time);
    console.log('📊 資料庫版本:', result.rows[0].db_version.substring(0, 50) + '...');
    
    // 測試現有資料表
    console.log('\n📋 檢查現有資料表...');
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('📊 現有資料表:');
    tables.rows.forEach(table => {
      console.log(`  - ${table.table_name}`);
    });
    
    // 檢查商品數量
    const productCount = await pool.query('SELECT COUNT(*) as count FROM products');
    console.log(`\n🥬 商品總數: ${productCount.rows[0].count}`);
    
    // 檢查訂單數量
    const orderCount = await pool.query('SELECT COUNT(*) as count FROM orders');
    console.log(`📦 訂單總數: ${orderCount.rows[0].count}`);
    
    return true;
    
  } catch (error) {
    console.error('❌ 連線失敗:', error.message);
    console.error('🔍 錯誤詳情:', error.code);
    return false;
    
  } finally {
    await pool.end();
  }
}

testConnection().then(success => {
  if (success) {
    console.log('\n🎉 資料庫連線測試完成！可以開始執行商品新增作業。');
  } else {
    console.log('\n⚠️ 資料庫連線失敗，需要檢查網路或憑證設定。');
  }
  process.exit();
});