# 即時訂單狀態推播系統使用指南

## 🎉 系統概述

本系統為承億蔬菜外送平台提供完整的即時訂單狀態推播功能，包括：
- ✅ Server-Sent Events (SSE) 即時推播
- 📋 訂單狀態變更通知
- 🚚 外送員位置即時追蹤
- ⏰ 智能配送時間預估
- 📱 多客戶端同步更新

## 🚀 快速開始

### 1. 系統初始化

首先確保資料庫已正確設置：

```bash
# 1. 在 PostgreSQL 中執行資料庫初始化
psql -d your_database -f realtime_notifications_schema.sql

# 2. 重啟服務器
npm start
```

### 2. 訪問功能

系統啟動後，即可使用以下功能：

- **管理員面板**: `http://localhost:3002/admin/dashboard`
- **訂單追蹤頁面**: `http://localhost:3002/order-tracking/{訂單ID}`
- **SSE連接端點**: `http://localhost:3002/api/notifications/stream`

## 📡 核心功能詳解

### 1. 即時通知連接

系統自動建立 SSE 連接，支援：

```javascript
// 前端自動初始化
const notifications = new RealtimeNotificationClient();

// 訂閱訂單更新
notifications.subscribeToOrder(orderId);

// 訂閱外送員位置
notifications.subscribeToDriver(driverId);

// 監聽事件
notifications.on('orderUpdate', (data) => {
  console.log('訂單狀態更新:', data);
});
```

### 2. 訂單狀態管理

支援的訂單狀態流程：
1. **placed** - 訂單成立
2. **confirmed** - 訂單確認
3. **preparing** - 商品準備中
4. **ready** - 商品準備完成
5. **assigned** - 已分配外送員
6. **picked_up** - 外送員已取貨
7. **delivering** - 配送中
8. **delivered** - 已送達
9. **completed** - 訂單完成

### 3. 外送員位置追蹤

系統提供精確的外送員位置追蹤：

```javascript
// 更新外送員位置
const locationData = {
  lat: 24.1477,
  lng: 120.6736,
  accuracy: 10,
  speed: 25,
  orderId: 123
};

// 系統自動廣播位置更新給相關客戶
```

### 4. 智能時間預估

系統根據多個因素計算預計送達時間：
- 📦 商品準備時間
- 🚚 外送員到店時間
- 📍 配送距離和路況
- ⏰ 時段交通狀況
- 🌦️ 天氣影響

## 🔧 API 使用說明

### SSE 連接

```javascript
// 建立連接
GET /api/notifications/stream?userId={用戶ID}&userType={用戶類型}

// 接收事件類型:
- connected: 連接確認
- orderUpdate: 訂單狀態更新
- driverLocation: 外送員位置更新
- systemNotification: 系統通知
- heartbeat: 心跳包
```

### 訂單狀態 API

```bash
# 更新訂單狀態
POST /api/notifications/order/{訂單ID}/status
{
  "status": "confirmed",
  "changedBy": "admin",
  "notes": "訂單已確認"
}

# 分配外送員
POST /api/notifications/order/{訂單ID}/assign-driver
{
  "driverId": 1,
  "assignedBy": "admin"
}

# 獲取訂單狀態歷史
GET /api/notifications/order/{訂單ID}/status-history
```

### 外送員位置 API

```bash
# 更新外送員位置
POST /api/notifications/driver/{外送員ID}/location
{
  "lat": 24.1477,
  "lng": 120.6736,
  "accuracy": 10,
  "speed": 25,
  "orderId": 123
}

# 開始位置追蹤
POST /api/notifications/driver/{外送員ID}/start-tracking
{
  "orderId": 123
}

# 停止位置追蹤
POST /api/notifications/driver/{外送員ID}/stop-tracking

# 獲取附近外送員
GET /api/notifications/nearby-drivers?lat=24.1477&lng=120.6736&radius=5
```

## 📱 前端整合

### 1. 引入即時通知腳本

```html
<!-- 在頁面中引入即時通知客戶端 -->
<script src="/js/realtime-notifications.js"></script>
```

### 2. 初始化和使用

```javascript
// 系統會自動初始化，也可以手動創建
const notifications = window.realtimeNotifications;

// 訂閱訂單更新
await notifications.subscribeToOrder(orderId);

// 監聽訂單狀態變更
notifications.on('orderUpdate', (data) => {
  // 更新頁面顯示
  updateOrderStatus(data);
});

// 監聽外送員位置更新
notifications.on('driverLocation', (data) => {
  // 更新地圖顯示
  updateDriverLocationOnMap(data);
});

// 請求瀏覽器通知權限
await notifications.requestNotificationPermission();
```

### 3. 訂單追蹤頁面

系統提供完整的訂單追蹤頁面：

```bash
# 訪問訂單追蹤頁面
http://localhost:3002/order-tracking/{訂單ID}
```

頁面功能：
- 📋 訂單狀態時間軸
- 🚚 外送員資訊顯示
- 📍 即時位置地圖
- ⏰ 預計送達倒數
- 🔔 即時通知彈窗

## 🧪 系統測試

使用提供的測試腳本驗證系統功能：

```bash
# 運行完整測試
node test_realtime_notifications.js
```

測試項目：
- ✅ 資料庫 Schema 檢查
- ✅ SSE 連接測試
- ✅ 訂單狀態更新測試
- ✅ 外送員位置更新測試
- ✅ 通知廣播測試
- ✅ 多重連接測試
- ✅ 訂單追蹤流程測試

## 🔧 管理員功能

### 1. 連接監控

```bash
# 獲取連接統計
GET /api/notifications/stats

# 回應範例:
{
  "totalConnections": 15,
  "orderSubscriptions": 8,
  "driverSubscriptions": 5,
  "connectionsByType": {
    "customer": 10,
    "admin": 3,
    "driver": 2
  }
}
```

### 2. 系統通知

```bash
# 發送系統通知
POST /api/notifications/test-notification
{
  "message": "系統維護通知",
  "level": "warning"
}
```

### 3. 外送員管理

```bash
# 獲取外送員統計
GET /api/notifications/driver-stats

# 回應範例:
{
  "total_drivers": 10,
  "online_drivers": 6,
  "busy_drivers": 3,
  "delivering_drivers": 1
}
```

## ⚠️ 注意事項

### 1. 瀏覽器支援

- 需要現代瀏覽器支援 Server-Sent Events
- 建議啟用瀏覽器通知功能
- 移動裝置需要保持頁面活躍狀態

### 2. 網路連接

- SSE 連接需要穩定的網路環境
- 系統具備自動重連機制
- 網路中斷時會顯示連接狀態

### 3. 效能考量

- 系統自動清理過期的位置記錄
- 連接數過多時會自動限制
- 建議定期重啟服務以清理記憶體

### 4. 資料安全

- 位置資料已加密傳輸
- 通知內容不包含敏感資訊
- 建議在生產環境配置 HTTPS

## 🔍 故障排除

### 常見問題

1. **SSE 連接失敗**
   - 檢查防火牆設定
   - 確認服務器正常運行
   - 查看瀏覽器控制台錯誤

2. **通知未收到**
   - 確認已正確訂閱
   - 檢查網路連接狀態
   - 查看服務器日誌

3. **位置更新異常**
   - 確認GPS權限已開啟
   - 檢查位置資料格式
   - 驗證外送員ID正確性

### 日誌監控

系統會記錄詳細的操作日誌：

```bash
# 服務器日誌範例
📡 新的SSE連接建立: conn_1_1640995200000 (customer:user123)
📋 訂單 123 狀態已更新: placed -> confirmed
🚚 外送員 1 位置已更新: (24.1477, 120.6736)
📢 訂單 123 更新已廣播給 2 個連接
```

## 📞 技術支援

如遇到問題，請檢查：
1. 服務器日誌檔案
2. 瀏覽器開發者工具
3. 資料庫連接狀態
4. 網路連接狀況

---

🎉 **恭喜！** 即時訂單狀態推播系統已成功整合完成，現在您的外送平台具備了完整的即時通知功能！