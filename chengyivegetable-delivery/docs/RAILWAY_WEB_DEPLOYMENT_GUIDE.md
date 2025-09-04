# 🚂 Railway Web 部署指南 - Huang Trading System

## 📋 準備工作

### 1. 必要文件檢查
確保以下文件存在於根目錄：
- ✅ `railway.toml` - Railway配置文件
- ✅ `Dockerfile` - Docker構建文件  
- ✅ `requirements.txt` - Python依賴
- ✅ `run.py` - 應用程序入口點
- ✅ 所有交易系統核心模組

### 2. 系統架構確認
**Huang Trading System 6-Agent 架構：**
- 📊 Data Collection Agent (數據收集)
- 📈 Technical Analysis Agent (技術分析)  
- 🤖 Machine Learning Agent (機器學習)
- ⚡ Backtesting Agent (回測系統)
- 🛡️ Risk Management Agent (風險管理)
- 🔄 System Integration Agent (系統整合)

## 🌐 Railway Web 部署步驟

### 第一步：訪問 Railway
1. 打開瀏覽器訪問：https://railway.app
2. 點擊 **Sign Up** 或 **Login**
3. 選擇 GitHub 帳號授權登入

### 第二步：創建新項目
1. 點擊 **"New Project"**
2. 選擇 **"Deploy from GitHub repo"**
3. 如果尚未連接 GitHub，點擊 **"Connect GitHub"**
4. 搜索並選擇您的交易系統倉庫

### 第三步：項目配置
1. **項目名稱**: `huang-trading-system`
2. **分支**: 選擇 `main` 或 `master`
3. **根目錄**: 保持空白（除非代碼在子目錄中）

### 第四步：添加數據庫服務
1. 在項目面板中，點擊 **"New"** → **"Database"**
2. 選擇 **"PostgreSQL"**
   - 這將自動創建 `DATABASE_URL` 環境變量
3. 再次點擊 **"New"** → **"Database"**  
4. 選擇 **"Redis"**
   - 這將自動創建 `REDIS_URL` 環境變量

### 第五步：環境變量設置
在項目設定中添加以下環境變量：

```bash
# 基本配置
FLASK_ENV=production
PYTHONUNBUFFERED=1
PORT=8000
MAX_WORKERS=4

# 管理員設定
ADMIN_EMAIL=shnfred555283@gmail.com
ADMIN_PASSWORD=HuangTrading2024!

# 系統功能開關
TRADING_MODE=production
RISK_MANAGEMENT=enabled
ML_PREDICTIONS=enabled
BACKTESTING_ENABLED=true
TECHNICAL_ANALYSIS=enabled

# 緩存設定
ML_MODEL_CACHE=true
ENABLE_REDIS_CACHE=true
```

### 第六步：部署設定
1. Railway 會自動檢測到 `railway.toml` 配置文件
2. 構建過程會使用 Nixpacks 自動構建
3. 健康檢查設置為 `/health` 端點

### 第七步：監控部署
1. 在 **"Deployments"** 標籤查看部署日誌
2. 等待構建和部署完成
3. 部署成功後會獲得一個 `railway.app` 域名

## 🔧 部署後配置

### 1. 域名設置
- Railway 會提供類似: `https://huang-trading-system-production.up.railway.app`
- 可以設置自定義域名（需要 Pro 方案）

### 2. SSL 證書
- Railway 自動提供 Let's Encrypt SSL 證書
- HTTPS 默認啟用

### 3. 數據庫初始化
第一次部署後，需要初始化數據庫：

```python
# 通過管理界面或 API 調用
POST /api/admin/init-database
```

## 📊 系統功能驗證

部署完成後，訪問以下端點進行驗證：

### 核心端點
- **主頁**: `https://your-domain.railway.app/`
- **健康檢查**: `https://your-domain.railway.app/health`  
- **管理面板**: `https://your-domain.railway.app/admin`
- **API 文檔**: `https://your-domain.railway.app/docs`

### 6-Agent 功能測試
1. **數據收集**: `/api/data/collect`
2. **技術分析**: `/api/analysis/technical`
3. **機器學習**: `/api/ml/predict`
4. **回測系統**: `/api/backtest/run`
5. **風險管理**: `/api/risk/assess`
6. **系統狀態**: `/api/system/status`

## 💰 費用估算

### Hobby 方案 (免費)
- ❌ 無法添加多個數據庫
- ❌ 有使用時間限制
- ❌ 不適合生產環境

### Pro 方案 ($5-20/月)
- ✅ PostgreSQL + Redis 支持
- ✅ 自定義域名
- ✅ 無使用時間限制
- ✅ 適合生產環境
- ✅ 24/7 運行

## 🚨 常見問題解決

### 問題 1：構建失敗
**解決方案**：
1. 檢查 `requirements.txt` 是否完整
2. 確認 Python 版本兼容性
3. 查看構建日誌排除依賴問題

### 問題 2：應用無法啟動
**解決方案**：
1. 檢查 `run.py` 文件是否存在
2. 確認端口設置為 `PORT` 環境變量
3. 查看應用日誌確認錯誤

### 問題 3：數據庫連接失敗
**解決方案**：
1. 確認 PostgreSQL 和 Redis 服務已添加
2. 檢查 `DATABASE_URL` 和 `REDIS_URL` 環境變量
3. 驗證數據庫初始化腳本

## ✅ 部署檢查清單

- [ ] GitHub 倉庫已準備
- [ ] Railway 帳號已創建
- [ ] PostgreSQL 數據庫已添加  
- [ ] Redis 緩存已添加
- [ ] 環境變量已設置
- [ ] 應用成功部署
- [ ] 健康檢查通過
- [ ] 所有 6 個 Agent 模組正常運行
- [ ] 管理面板可正常訪問

## 🎯 後續優化

### 1. 監控設置
- 添加 Railway 內建監控
- 設置警報通知

### 2. 備份策略  
- 定期數據庫備份
- 日誌保存策略

### 3. 性能優化
- Redis 緩存優化
- 數據庫查詢優化
- 資源使用監控

---

## 🔗 有用連結
- [Railway 官方文檔](https://docs.railway.app/)
- [Railway 定價](https://railway.app/pricing)
- [Nixpacks 文檔](https://nixpacks.com/docs)

**🎉 完成部署後，您的 Huang Trading System 將在 Railway 上 24/7 運行！**