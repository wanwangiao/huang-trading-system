// 智能路線系統資料庫初始化腳本
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

// 資料庫連線配置
const pool = new Pool({
  connectionString: "postgresql://postgres.cywcuzgbuqmxjxwyrrsp:@chengyivegetable@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres",
  ssl: { rejectUnauthorized: false }
});

async function setupSmartRouting() {
  console.log('🚀 開始設置智能路線規劃系統...');
  
  try {
    // 讀取簡化版Schema檔案
    const schemaPath = path.join(__dirname, 'smart_routing_simple.sql');
    const schemaSQL = await fs.readFile(schemaPath, 'utf8');
    
    console.log('📂 成功讀取Schema檔案');
    
    // 執行Schema建立
    await pool.query(schemaSQL);
    console.log('✅ 智能路線資料庫Schema建立成功！');
    
    // 檢查建立的表格
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'route%' 
      OR table_name LIKE '%cache%'
      ORDER BY table_name;
    `);
    
    console.log('📊 已建立的智能路線表格:');
    tablesResult.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });
    
    console.log('🎉 智能路線規劃系統資料庫設置完成！');
    
  } catch (error) {
    console.error('❌ 設置失敗:', error.message);
    console.error('詳細錯誤:', error);
  } finally {
    await pool.end();
  }
}

// 執行設置
setupSmartRouting();