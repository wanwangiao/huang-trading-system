# 📱 LINE Bot 設置指南

## 🎯 功能目標
實現客戶透過LINE圖文選單進入購物網站時自動綁定LINE ID，並在訂單完成時自動發送通知。

## 📋 申請步驟

### 1. 建立LINE Developer帳號
1. 前往 [LINE Developers Console](https://developers.line.biz/)
2. 使用您的LINE帳號登入
3. 同意開發者條款

### 2. 建立Provider (供應商)
1. 點擊「Create」→「Provider」
2. 輸入Provider名稱（例如：承億蔬菜外送）
3. 點擊「Create」

### 3. 建立LINE Bot (Messaging API Channel)
1. 在Provider頁面點擊「Create a new channel」
2. 選擇「Messaging API」
3. 填寫以下資訊：
   - **Channel name**: 承億蔬菜外送Bot
   - **Channel description**: 蔬菜外送訂單通知系統
   - **Category**: E-commerce
   - **Subcategory**: Food delivery
   - **Email**: 您的聯絡Email
4. 勾選同意條款，點擊「Create」

### 4. 建立LIFF App (自動綁定用)
1. 在Bot頻道設定頁面，前往「LIFF」分頁
2. 點擊「Add」
3. 填寫以下資訊：
   - **LIFF app name**: 承億蔬菜購物
   - **Size**: Full
   - **Endpoint URL**: `https://你的網域.com/liff-entry`
   - **Scope**: 勾選 `profile` 和 `openid`
4. 點擊「Add」

### 5. 取得重要設定值
完成後您會得到以下重要資訊：

#### Messaging API 設定
- **Channel ID**: `1234567890` (範例)
- **Channel Secret**: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- **Channel Access Token**: 需要點擊「Issue」生成

#### LIFF 設定  
- **LIFF ID**: `1234567890-xxxxxxxx`

## 🔧 環境變數設定

將以下設定加入您的 `.env` 檔案：

```env
# LINE Bot 設定
LINE_CHANNEL_ID=你的Channel_ID
LINE_CHANNEL_SECRET=你的Channel_Secret  
LINE_CHANNEL_ACCESS_TOKEN=你的Access_Token
LINE_LIFF_ID=你的LIFF_ID

# Webhook 設定 (之後設定)
LINE_WEBHOOK_URL=https://你的網域.com/api/line/webhook
```

## 📱 LINE官方帳號設定

### 1. 設定圖文選單
1. 在LINE Developers Console的Bot設定頁面
2. 前往「Messaging API」分頁
3. 找到「LINE Official Account Manager」連結並點擊
4. 設定圖文選單：
   - **標題**: 線上訂購蔬菜
   - **動作**: 連結到 `https://你的網域.com/liff-entry`

### 2. 基本設定
- **自動回覆**: 關閉（避免干擾）
- **加入好友歡迎訊息**: 設定歡迎詞
- **群組聊天**: 關閉（除非需要）

## 🌐 Webhook 設定

### 1. 設定Webhook URL
1. 在Messaging API設定頁面
2. 找到「Webhook settings」
3. 輸入：`https://你的網域.com/api/line/webhook`
4. 點擊「Verify」測試連接
5. 開啟「Use webhook」

### 2. 訊息設定
- **Allow bot to join group chats**: 關閉
- **Auto-reply messages**: 關閉
- **Greeting messages**: 可開啟並設定歡迎訊息

## 📋 檢查清單

完成申請後，請確認您已取得：

- [ ] LINE Channel ID
- [ ] LINE Channel Secret  
- [ ] LINE Channel Access Token
- [ ] LINE LIFF ID
- [ ] 圖文選單已設定並指向LIFF網址
- [ ] Webhook URL已設定並驗證成功

## 🚨 注意事項

1. **開發模式**: 申請初期為開發模式，正式上線前需要通過審查
2. **免費額度**: 免費版本每月有500則訊息限制
3. **網域需求**: LIFF和Webhook都需要HTTPS網域
4. **測試環境**: 建議先在測試環境完成整合再上正式環境

## 📞 需要協助？

如果在申請過程中遇到問題，請提供：
1. 申請到哪個步驟
2. 遇到的具體錯誤訊息
3. 截圖（如有）

我會協助您解決問題並繼續實作整合功能。

---

**下一步**: 完成LINE Bot申請後，我將立即開始實作自動綁定和通知功能！