# 🚀 Render 部署指南

您的代碼已成功推送到 GitHub！現在可以部署到 Render 平台。

## 📋 部署步驟

### 1. 註冊 Render 帳號
- 訪問：https://render.com
- 點擊 "Get Started" 註冊帳號
- 可以直接用 GitHub 帳號登入

### 2. 創建新的 Web Service
1. 登入後點擊 "New +"
2. 選擇 "Web Service"
3. 連接 GitHub 帳號（如果還沒連接）
4. 選擇倉庫：`wanwangiao/chengyivegetable-delivery`

### 3. 配置部署設定
Render 會自動偵測到 `render.yaml` 配置文件，但您需要確認：

**基本設定：**
- Name: `chengyivegetable`
- Environment: `Node`
- Build Command: `npm install`
- Start Command: `node src/server.js`
- Auto-Deploy: `Yes`

### 4. 設定環境變數
在 Render 的環境變數區域設定：

```
DATABASE_URL=postgresql://postgres:%40Chengyivegetable@db.siwnqjavjljhicekloss.supabase.co:5432/postgres
ADMIN_PASSWORD=shnf830629
SESSION_SECRET=chengyivegetable-session-secret-2025-secure-key
NODE_ENV=production
PORT=3000
```

**可選設定（可稍後添加）：**
```
GOOGLE_MAPS_API_KEY=（您的Google Maps API金鑰）
LINE_CHANNEL_ID=（您的LINE Channel ID）
LINE_CHANNEL_SECRET=（您的LINE Channel Secret）
LINE_CHANNEL_ACCESS_TOKEN=（您的LINE Access Token）
LINE_REDIRECT_URI=https://您的網域.onrender.com/auth/line/callback
```

### 5. 開始部署
- 點擊 "Create Web Service"
- Render 會開始建置和部署
- 通常需要 5-10 分鐘

### 6. 部署完成
部署成功後，您會得到一個網址，類似：
`https://chengyivegetable.onrender.com`

## 🌐 訪問您的網站

**前台：** https://您的網域.onrender.com
**管理後台：** https://您的網域.onrender.com/admin
**管理密碼：** `shnf830629`

## 🔧 部署後設定

### 如需啟用 Google Maps：
1. 至 Google Cloud Console 申請 Maps API 金鑰
2. 在 Render 環境變數中設定 `GOOGLE_MAPS_API_KEY`

### 如需啟用 LINE 通知：
1. 至 LINE Developers 創建官方帳號
2. 取得相關憑證後在環境變數中設定

## 📞 需要協助？

如果部署過程中遇到問題，請告訴我錯誤訊息，我可以協助排除！

---

🎉 **您的蔬果外送系統即將上線！**