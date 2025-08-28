# 🔧 Render資料庫連線修復方案

## 問題分析
從Render日誌發現：
1. **IPv6連線問題**：Render試圖用IPv6連接，但失敗
2. **環境變數混合**：同時出現新舊專案的連線嘗試

## 🎯 解決方案

### 方案A：強制使用IPv4連線（推薦）

**更新Render環境變數為：**
```
DATABASE_URL=postgresql://postgres:Chengyivegetable2025%21@db.cywcuzgbuqmxjxwyrrsp.supabase.co:5432/postgres?sslmode=require&connect_timeout=60&application_name=chengyivegetable
```

**重要修改：**
1. `!` 編碼為 `%21`
2. 添加 `sslmode=require`
3. 添加連線超時設定
4. 添加應用程式名稱

### 方案B：使用Supabase連線池

**在Supabase專案中啟用Connection Pooling：**
1. 前往 Supabase Dashboard → Settings → Database
2. 找到 "Connection Pooling" 選項
3. 啟用 "Session" 模式
4. 使用連線池的連線字串

### 方案C：修改Node.js DNS設定

**如果前兩個方案都不行，需要修改程式碼：**

在 server.js 中的資料庫連線配置添加：
```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 60000,
  idleTimeoutMillis: 30000,
  max: 5,
  // 強制使用IPv4
  host: 'db.cywcuzgbuqmxjxwyrrsp.supabase.co',  
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'Chengyivegetable2025!'
});
```

## 🚀 立即行動

### 第一步：更新Render環境變數
```
DATABASE_URL=postgresql://postgres:Chengyivegetable2025%21@db.cywcuzgbuqmxjxwyrrsp.supabase.co:5432/postgres?sslmode=require&connect_timeout=60
```

### 第二步：檢查Render網路設定
1. 確認服務地區設置
2. 檢查是否有網路限制

### 第三步：測試連線
```bash
curl https://chengyivegetable.onrender.com/api/products
```

## 🔍 診斷工具

如果仍有問題，可以在Supabase SQL Editor執行：
```sql
SELECT 
  application_name, 
  client_addr, 
  state, 
  query_start,
  query
FROM pg_stat_activity 
WHERE application_name LIKE '%chengyivegetable%'
ORDER BY query_start DESC;
```

這可以查看是否有連線嘗試到達資料庫。