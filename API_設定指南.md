# 🚀 API 設定完整指南

## 📋 目錄
1. [Google Maps API 設定](#google-maps-api-設定)
2. [LINE Bot API 設定](#line-bot-api-設定)
3. [環境變數配置](#環境變數配置)
4. [系統整合測試](#系統整合測試)

---

## 🗺️ Google Maps API 設定

### 步驟 1: 建立 Google Cloud 專案

1. **前往 Google Cloud Console**
   - 網址：https://console.cloud.google.com/
   - 使用您的 Google 帳號登入

2. **建立新專案**
   ```
   點擊 「建立專案」
   專案名稱：誠意鮮蔬配送系統
   專案 ID：chengyivegetable-delivery (系統自動生成)
   ```

3. **啟用計費帳戶**
   - ⚠️ **重要**：Google Maps API 需要綁定信用卡
   - 每月有 $200 免費額度，一般小型業務足夠使用

### 步驟 2: 啟用必要的 API

在 Google Cloud Console 中啟用以下 API：

```bash
📍 Maps JavaScript API          # 用於前端地圖顯示
🛣️ Directions API              # 用於路線規劃
📍 Geocoding API               # 用於地址轉座標
🚗 Distance Matrix API          # 用於計算距離和時間
📱 Places API                  # 用於地址自動完成
```

### 步驟 3: 建立 API 金鑰

1. **前往 APIs & Services > Credentials**
2. **點擊 「+ CREATE CREDENTIALS」 > API key**
3. **複製產生的 API 金鑰**
4. **設定 API 金鑰限制**（推薦）：
   ```
   Application restrictions: HTTP referrers
   Website restrictions: 
   - https://chengyivegetable.onrender.com/*
   - http://localhost:3000/*
   
   API restrictions: 
   - Maps JavaScript API
   - Directions API
   - Geocoding API
   - Distance Matrix API
   - Places API
   ```

### 步驟 4: 整合到系統中

在 `views/admin_dashboard.ejs` 中更新地圖設定：

```html
<!-- 更新這個區塊 -->
<div id="delivery-map" style="height: 400px; background: #f0f0f0; border-radius: 8px;">
  <!-- 原本的佔位符內容會被地圖取代 -->
</div>

<!-- 在頁面底部添加 -->
<script>
  // 初始化 Google Maps
  function initMap() {
    const map = new google.maps.Map(document.getElementById('delivery-map'), {
      zoom: 13,
      center: { lat: 24.9348, lng: 121.3722 }, // 三峽區中心
      styles: [
        // 自訂地圖樣式讓它更符合您的品牌
        {
          "featureType": "all",
          "elementType": "geometry.fill",
          "stylers": [{"color": "#f5f5f5"}]
        }
      ]
    });

    // 添加店家位置標記
    const storeMarker = new google.maps.Marker({
      position: { lat: 24.9348, lng: 121.3722 },
      map: map,
      title: '誠意鮮蔬 - 總店',
      icon: {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
          <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
            <circle cx="15" cy="15" r="12" fill="#2d5a3d"/>
            <text x="15" y="20" text-anchor="middle" fill="white" font-size="16">🍃</text>
          </svg>
        `),
        scaledSize: new google.maps.Size(30, 30)
      }
    });

    // 載入配送員位置
    loadDeliveryDrivers(map);
  }

  // 載入配送員即時位置
  function loadDeliveryDrivers(map) {
    // 這裡會從後端 API 獲取配送員位置
    fetch('/api/admin/drivers-location')
      .then(response => response.json())
      .then(data => {
        data.drivers.forEach(driver => {
          const driverMarker = new google.maps.Marker({
            position: { lat: driver.lat, lng: driver.lng },
            map: map,
            title: `外送員：${driver.name}`,
            icon: {
              url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                <svg width="25" height="25" viewBox="0 0 25 25" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12.5" cy="12.5" r="10" fill="#3498db"/>
                  <text x="12.5" y="17" text-anchor="middle" fill="white" font-size="12">🚛</text>
                </svg>
              `),
              scaledSize: new google.maps.Size(25, 25)
            }
          });
        });
      });
  }
</script>

<!-- Google Maps API Script -->
<script async defer
  src="https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY_HERE&callback=initMap">
</script>
```

---

## 💬 LINE Bot API 設定

### 步驟 1: 建立 LINE 開發者帳號

1. **前往 LINE Developers**
   - 網址：https://developers.line.biz/zh-hant/
   - 使用您的 LINE 帳號登入

2. **建立 Provider**
   ```
   Provider name: 誠意鮮蔬
   ```

3. **建立 Channel**
   ```
   Channel type: Messaging API
   Channel name: 誠意鮮蔬客服機器人
   Channel description: 提供訂單通知與客戶服務
   Category: 食品/飲料
   Subcategory: 蔬果零售
   ```

### 步驟 2: 設定 Webhook

1. **在 Channel 設定頁面找到 「Webhook URL」**
2. **設定 Webhook URL**：
   ```
   https://chengyivegetable.onrender.com/webhook/line
   ```
3. **啟用 「Use webhook」**
4. **啟用 「Allow bot to join group chats」**（如果需要）

### 步驟 3: 取得必要的 Token

從 Channel 設定頁面取得：

```bash
🔑 Channel Secret: [從 Basic settings 取得]
🎫 Channel Access Token: [從 Messaging API 取得，需要先生成]
```

### 步驟 4: 實作 LINE Bot 功能

在 `src/server.js` 中添加 LINE Bot 路由：

```javascript
// LINE Bot Webhook
app.post('/webhook/line', (req, res) => {
  const events = req.body.events;
  
  events.forEach(async (event) => {
    if (event.type === 'message' && event.message.type === 'text') {
      const userMessage = event.message.text;
      const replyToken = event.replyToken;
      
      // 簡單的對話邏輯
      let replyMessage = '您好！歡迎來到誠意鮮蔬 🍃\n\n';
      
      if (userMessage.includes('訂單') || userMessage.includes('查詢')) {
        replyMessage += '請提供您的訂單編號，我們將為您查詢訂單狀態。';
      } else if (userMessage.includes('營業時間')) {
        replyMessage += '營業時間：每日 06:00-13:00（週日公休）';
      } else if (userMessage.includes('配送')) {
        replyMessage += '配送範圍：三峽、北大特區、樹林、鶯歌、土城\n配送時間：14:00-18:00';
      } else {
        replyMessage += '有任何問題都可以撥打客服專線：02-2345-6789';
      }
      
      // 發送回覆
      await replyToLine(replyToken, replyMessage);
    }
  });
  
  res.status(200).send('OK');
});

// LINE 回覆訊息函數
async function replyToLine(replyToken, message) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
  };
  
  const body = {
    replyToken: replyToken,
    messages: [{
      type: 'text',
      text: message
    }]
  };
  
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      console.error('LINE API 錯誤:', await response.text());
    }
  } catch (error) {
    console.error('發送 LINE 訊息失敗:', error);
  }
}

// 發送訂單完成通知給客戶
async function sendOrderCompletionNotice(customerLineId, orderInfo) {
  const message = `🎉 您的訂單已送達！\n\n` +
                 `📋 訂單編號：#${orderInfo.id}\n` +
                 `💰 訂單金額：$${orderInfo.total}\n` +
                 `⭐ 感謝您選擇誠意鮮蔬！\n\n` +
                 `如有任何問題，歡迎聯絡我們 😊`;
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
  };
  
  const body = {
    to: customerLineId,
    messages: [{
      type: 'text',
      text: message
    }]
  };
  
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });
    
    if (response.ok) {
      console.log(`✅ LINE 通知已發送給客戶 ${customerLineId}`);
    } else {
      console.error('LINE API 錯誤:', await response.text());
    }
  } catch (error) {
    console.error('發送 LINE 通知失敗:', error);
  }
}
```

---

## ⚙️ 環境變數配置

在 Render.com 或您的伺服器上設定以下環境變數：

### Render.com 設定方式：
1. 前往 Dashboard > Your Service > Environment
2. 添加以下環境變數：

```bash
# Google Maps API
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

# LINE Bot API
LINE_CHANNEL_SECRET=your_line_channel_secret_here
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token_here

# 資料庫（如果有的話）
DATABASE_URL=your_database_url_here

# 管理員密碼
ADMIN_PASSWORD=shnf830629
```

### 本地開發設定：
建立 `.env` 檔案：

```bash
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
LINE_CHANNEL_SECRET=your_line_channel_secret_here
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token_here
DATABASE_URL=your_local_database_url
ADMIN_PASSWORD=shnf830629
```

---

## 🧪 系統整合測試

### Google Maps API 測試：

1. **基本地圖載入測試**
   ```javascript
   // 在瀏覽器 Console 中執行
   if (typeof google !== 'undefined') {
     console.log('✅ Google Maps API 載入成功');
   } else {
     console.log('❌ Google Maps API 載入失敗');
   }
   ```

2. **地址轉座標測試**
   ```javascript
   const geocoder = new google.maps.Geocoder();
   geocoder.geocode({ 
     address: '新北市三峽區中山路123號' 
   }, (results, status) => {
     if (status === 'OK') {
       console.log('✅ 地址轉換成功:', results[0].geometry.location);
     } else {
       console.log('❌ 地址轉換失敗:', status);
     }
   });
   ```

### LINE Bot API 測試：

1. **Webhook 連線測試**
   - 用 LINE 掃描 QR Code 加入機器人
   - 發送任意訊息測試回覆功能

2. **推播訊息測試**
   ```bash
   # 使用 curl 測試推播
   curl -X POST https://api.line.me/v2/bot/message/push \
   -H 'Content-Type: application/json' \
   -H 'Authorization: Bearer YOUR_CHANNEL_ACCESS_TOKEN' \
   -d '{
     "to": "USER_ID",
     "messages": [{
       "type": "text",
       "text": "測試訊息"
     }]
   }'
   ```

---

## 💰 費用估算

### Google Maps API 費用（每月）：
```
🗺️ Maps JavaScript API:    每1,000次載入 = $7 USD
🛣️ Directions API:         每1,000次請求 = $5 USD  
📍 Geocoding API:          每1,000次請求 = $5 USD

💡 建議每月預算：$50-100 USD（約 NT$1,500-3,000）
💳 免費額度：每月 $200 USD
```

### LINE Bot API 費用：
```
💬 基本功能：免費
📱 推播訊息：每月前1,000則免費，超過每則 NT$0.2

💡 建議每月預算：NT$200-500（小型業務）
```

---

## 🔧 進階功能擴展

### 1. 即時配送追蹤
```javascript
// 配送員位置即時更新
function updateDriverLocation(driverId, lat, lng) {
  // 發送位置到後端
  fetch('/api/driver/update-location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng })
  });
}

// 每30秒更新一次位置
setInterval(() => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(position => {
      updateDriverLocation(
        driverId,
        position.coords.latitude,
        position.coords.longitude
      );
    });
  }
}, 30000);
```

### 2. 智能路線規劃
```javascript
// 使用 Google Directions API 規劃最佳路線
function planOptimalRoute(deliveryAddresses) {
  const directionsService = new google.maps.DirectionsService();
  
  const waypoints = deliveryAddresses.map(address => ({
    location: address,
    stopover: true
  }));
  
  directionsService.route({
    origin: '誠意鮮蔬總店地址',
    destination: '誠意鮮蔬總店地址',
    waypoints: waypoints,
    optimizeWaypoints: true, // 自動優化路線
    travelMode: google.maps.TravelMode.DRIVING
  }, (response, status) => {
    if (status === 'OK') {
      displayRoute(response);
      suggestOptimalOrder(response.routes[0].waypoint_order);
    }
  });
}
```

---

## 📞 技術支援

如果在設定過程中遇到問題：

1. **Google Maps API 問題**：
   - 檢查 API Key 權限設定
   - 確認帳單帳戶已啟用
   - 查看 Console 錯誤訊息

2. **LINE Bot API 問題**：
   - 確認 Webhook URL 可正常訪問
   - 檢查 Channel Secret 和 Access Token
   - 查看 LINE Developers Console 錯誤日誌

3. **聯絡支援**：
   - 您可以隨時詢問技術問題
   - 建議先詳細描述錯誤訊息和重現步驟

---

**🎯 完成這個設定後，您的蔬果外送系統將具備：**
- ✅ 專業的地圖配送管理
- ✅ 即時的客戶通知系統  
- ✅ 智能路線規劃功能
- ✅ 配送員GPS追蹤
- ✅ 自動化客戶服務

**祝您的事業蒸蒸日上！** 🚀🍃