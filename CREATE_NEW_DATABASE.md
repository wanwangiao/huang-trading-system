# 🚀 建立新資料庫解決方案

## 問題：原Supabase專案已遺失

### 📋 立即行動步驟

#### 1️⃣ 建立新Supabase專案

1. 前往 https://supabase.com/dashboard
2. 點擊 "New Project"
3. 專案設定：
   - 專案名稱：`chengyivegetable-2025`
   - 資料庫密碼：`Chengyivegetable2025!`
   - 地區：選擇亞洲最近節點

#### 2️⃣ 取得新連線資訊

建立完成後，在 Settings → Database 中找到：
```
Host: [新的host].supabase.co
Database: postgres  
Port: 5432
User: postgres
Password: Chengyivegetable2025!
```

#### 3️⃣ 更新環境變數

**本地更新 (.env)：**
```env
DATABASE_URL=postgresql://postgres:Chengyivegetable2025!@[新host].supabase.co:5432/postgres
```

**Render平台更新：**
1. 登入 Render Dashboard
2. 找到 chengyivegetable 服務
3. Environment → 更新 DATABASE_URL

#### 4️⃣ 初始化資料庫

新資料庫建立後，需要執行初始化：

1. 在Supabase SQL Editor中執行：
```sql
-- 執行完整的 schema.sql
-- 然後執行 deploy_updates.js 腳本
```

2. 或使用後台部署功能自動建立所有表格和資料

#### 5️⃣ 驗證連線

執行測試：
```bash
curl https://chengyivegetable.onrender.com/api/products
```

預期結果：`"mode": "database"`

---

## 🔄 備用方案B：使用其他資料庫服務

如果Supabase有問題，可考慮：

### Railway.app
```bash
# 1. 註冊 railway.app
# 2. 建立 PostgreSQL 服務
# 3. 取得連線字串
```

### Neon.tech
```bash
# 1. 註冊 neon.tech
# 2. 建立專案
# 3. 取得連線字串
```

---

## ✅ 檢查清單

- [ ] 建立新Supabase專案
- [ ] 取得新連線字串
- [ ] 更新本地 .env
- [ ] 更新Render環境變數
- [ ] 測試API連線
- [ ] 執行資料庫初始化
- [ ] 部署新商品
- [ ] 驗證完整功能

---

## 🆘 需要協助？

如果遇到任何問題，請提供：
1. 新Supabase專案的host名稱
2. Render環境變數設定畫面截圖
3. API測試結果