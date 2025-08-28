# chengyivegetable 蔬果外送系統（資料庫版）

這個專案為蔬果外送網站的資料庫版本，使用 **Node.js + Express** 搭配 **PostgreSQL** (以 Supabase 為例) 作為後端儲存，並支援免登入下單、計價商品、後台訂單編輯等功能。

## 專案結構

- `src/server.js`：主要伺服器程式碼
- `views/`：EJS 模板
- `public/`：靜態資源 (CSS)
- `schema.sql`：資料表結構建立 SQL
- `seed.sql`：初始商品資料
- `.env.sample`：環境變數範例
- `views/`：EJS 模板，包含前台、後台及地圖頁面
- `Dockerfile`、`docker-compose.yml`：容器化部署配置

## 快速開始

### 1. 安裝依賴

```sh
npm install
```

### 2. 建立資料庫

假設使用 Supabase，登入後建立一個新專案。進入 Database → SQL Editor，執行 `schema.sql` 創建表，再執行 `seed.sql` 匯入初始商品。

### 3. 設定環境變數

複製 `.env.sample` 為 `.env`，並依照你的環境修改：

- `DATABASE_URL`：PostgreSQL 連線字串。**若密碼中包含 `@` 請將它編碼為 `%40`**。
- `ADMIN_PASSWORD`：後台登入密碼。
- `PORT`：伺服器監聽埠。
- `GOOGLE_MAPS_API_KEY`：Google Maps API 金鑰，用於地理編碼與地圖顯示。
- `LINE_CHANNEL_ID`、`LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_REDIRECT_URI`：LINE 官方帳號與 Login 相關設定，用於讓顧客綁定 LINE 以接收通知。請至 LINE Developers 後台建立 Messaging API Channel 並取得相關憑證，`LINE_REDIRECT_URI` 需填入你的服務回呼網址，例如 `https://yourdomain.com/auth/line/callback`。

此外，若啟用 LINE 登入與訊息通知，請填入：

- `LINE_CHANNEL_ID`：LINE Login 與 Messaging API 的 Channel ID。
- `LINE_CHANNEL_SECRET`：LINE Login 的 Channel Secret。
- `LINE_CHANNEL_ACCESS_TOKEN`：Messaging API 長期存取權杖，用於推播訊息。
- `LINE_REDIRECT_URI`：LINE Login 的 callback URL（例如 `https://yourdomain.com/auth/line/callback`）。

若啟用 Google Maps 地圖功能，請填入：

- `GOOGLE_MAPS_API_KEY`：Google Maps JavaScript API 與 Geocoding API 的金鑰。

### 4. 執行應用

```sh
npm start
```

瀏覽器打開 `http://localhost:3000` 即可使用前台；後台由 `/admin` 進入，輸入 `ADMIN_PASSWORD` 即可管理訂單與商品。

### 5. 部署到 Render

1. 將此專案推送至 GitHub。
2. 在 Render 上建立一個 Web Service，來源連接你的 GitHub 存庫。
3. 選擇 Node 環境，設定 Start command 為 `node src/server.js`。
4. 在 Render 的環境變數設定頁面新增：
   - `DATABASE_URL`：連線字串。
   - `ADMIN_PASSWORD`：管理密碼。
   - `PORT`：3000（或其他）。
   - `GOOGLE_MAPS_API_KEY`：Google Maps API 金鑰。
   - `LINE_CHANNEL_ID`、`LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_REDIRECT_URI`：LINE 設定。
5. 點 Deploy。完成後 Render 會產生一個 URL，例如 `https://chengyivegetable.onrender.com`，即為你的前台網址。

### 6. 部署至 VPS (Docker 版)

若你想在自有伺服器佈署，提供 `Dockerfile` 與 `docker-compose.yml`：

```sh
docker-compose up -d
```

這會啟動一個 Postgres 容器以及 Node 應用容器。記得在 `docker-compose.yml` 裡配置環境變數。

## 注意事項

1. 本專案為最小可用版本，不包含進階會員系統、折扣機制等，可日後擴充。
2. 為安全起見，部署到公網時請配合 Nginx 或 Render 提供的 HTTPS 功能。
3. 行內編輯訂單金額時，系統會自動重新計算小計、運費與總計並將狀態改為 `quoted`。
4. 地圖功能需要正確的 Google Maps API 金鑰才能顯示。LINE 綁定與通知則需要先在 LINE Developers 後台設定並取得憑證。