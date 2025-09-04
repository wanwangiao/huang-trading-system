# Google Maps 整合功能使用指南

## 🎯 功能概述

本系統已完整整合 Google Maps API，提供以下核心功能：

### 🗺️ 核心功能
- **地理編碼服務**: 將地址轉換為GPS座標
- **批量地理編碼**: 一次處理多個地址
- **智能路線規劃**: 使用TSP演算法優化配送路線  
- **Google路線整合**: 使用Google Directions API獲取精確路線
- **地圖視覺化**: 在管理介面顯示訂單位置和路線
- **快取機制**: 減少API呼叫次數，提高效能

## 🚀 快速開始

### 1. 設定 Google Maps API Key

在環境變數中設定你的 Google Maps API Key：

```bash
# .env 文件
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

### 2. 建立地理編碼快取表

執行以下SQL腳本建立必要的資料表：

```bash
psql -d your_database < geocoding_cache_schema.sql
```

### 3. 啟動服務

```bash
npm start
```

## 📍 API 端點

### 地理編碼相關

#### 單個地址地理編碼
```http
POST /api/maps/geocode
Content-Type: application/json

{
  "address": "新北市三峽區中山路123號"
}
```

#### 批量地理編碼
```http
POST /api/maps/batch-geocode
Content-Type: application/json

{
  "orderIds": [1, 2, 3, 4, 5]
}
```

### 路線規劃相關

#### 規劃路線
```http
POST /api/maps/plan-route
Content-Type: application/json

{
  "origin": {"lat": 25.0330, "lng": 121.5654},
  "destination": {"lat": 24.9347, "lng": 121.3681},
  "waypoints": [
    {"lat": 25.0173, "lng": 121.4467},
    {"lat": 24.9939, "lng": 121.4208}
  ]
}
```

#### 智能路線規劃
```http
POST /api/smart-route/plan
Content-Type: application/json

{
  "orderIds": [101, 102, 103, 104],
  "options": {
    "algorithm": "tsp_2opt",
    "useGoogleDirections": true,
    "startPoint": {"lat": 25.0330, "lng": 121.5654}
  }
}
```

### 地圖數據相關

#### 獲取訂單地圖數據
```http
GET /api/maps/orders-map-data?status=paid&dateFrom=2024-01-01&dateTo=2024-12-31
```

#### 距離矩陣計算
```http
POST /api/maps/distance-matrix
Content-Type: application/json

{
  "origins": [{"lat": 25.0330, "lng": 121.5654}],
  "destinations": [{"lat": 24.9347, "lng": 121.3681}]
}
```

## 🎮 管理介面使用

### 地圖管理頁面

訪問 `/admin/map` 來使用地圖管理功能：

1. **訂單篩選**: 根據狀態、日期篩選顯示的訂單
2. **地圖控制**: 重新載入、清除地圖、規劃路線
3. **批量地理編碼**: 為沒有座標的訂單進行地理編碼
4. **路線規劃**: 自動規劃配送路線並顯示在地圖上

### 功能按鈕說明

- **🔄 重新載入**: 重新獲取並顯示訂單數據
- **🗑️ 清除地圖**: 清除所有標記和路線
- **🛣️ 規劃路線**: 為待配送訂單規劃最佳路線
- **📍 批量地理編碼**: 為缺少座標的訂單進行地理編碼

## 🧠 智能路線規劃

### 演算法選擇

系統支援多種路線優化演算法：

1. **nearest_neighbor**: 最近鄰居演算法（快速但不是最優）
2. **tsp_2opt**: 2-opt改善演算法（平衡速度與品質）
3. **genetic**: 遺傳演算法（適合大量訂單）
4. **simulated_annealing**: 模擬退火演算法（全域最佳化）

### 使用建議

- **≤ 10個訂單**: 使用 `tsp_2opt` + Google Directions
- **10-50個訂單**: 使用 `tsp_2opt` 本地優化
- **≥ 50個訂單**: 使用 `genetic` 或 `simulated_annealing`

### 範例程式碼

```javascript
// 使用智能路線服務
const smartRouteService = new SmartRouteService(pool);

const routePlan = await smartRouteService.planSmartRoute(
  [101, 102, 103, 104], // 訂單IDs
  {
    algorithm: 'tsp_2opt',
    useGoogleDirections: true,
    maxWaypoints: 23
  }
);

console.log('路線規劃結果:', routePlan);
```

## 🎨 前端 JavaScript 整合

### 使用 GoogleMapsClient

```javascript
// 載入地圖客戶端
const mapClient = new GoogleMapsClient(googleMapsApiKey);

// 建立地圖
const map = mapClient.createMap('map-container', {
  center: { lat: 25.0330, lng: 121.5654 },
  zoom: 12
});

// 添加訂單標記
mapClient.addOrderMarkers(orders, {
  placed: '#888888',
  paid: '#52c41a',
  delivered: '#237804'
});

// 規劃並顯示路線
const routeResult = await mapClient.planRoute(origin, destination, waypoints);
mapClient.displayRoute(routeResult);
```

### 地址自動完成

```javascript
// 為輸入框添加自動完成
const autocomplete = new AddressAutocomplete(
  document.getElementById('address-input'),
  {
    onPlaceChanged: (result) => {
      console.log('選擇的地址:', result.formatted_address);
      console.log('座標:', result.lat, result.lng);
    }
  }
);
```

## 🧪 測試功能

執行測試腳本來驗證功能：

```bash
node test_google_maps_integration.js
```

測試包括：
- Google Maps Service 功能測試
- Smart Route Service 功能測試
- 整合場景測試
- 錯誤處理測試

## ⚡ 效能優化

### 地理編碼快取

系統自動快取地理編碼結果30天，相同地址不會重複呼叫API：

```sql
-- 查看快取統計
SELECT * FROM geocoding_cache_stats;

-- 手動清理過期快取
SELECT cleanup_expired_geocoding_cache();
```

### API 呼叫限制

- Google Maps API 有每日配額限制
- 批量地理編碼每次最多處理25個地址
- 路線規劃最多支援23個途徑點

### 建議設定

```javascript
// 推薦的服務設定
const options = {
  batchSize: 25,           // 批量處理大小
  delayBetweenBatches: 100, // 批次間延遲(ms)
  cacheExpiry: 30,         // 快取過期天數
  maxWaypoints: 23         // 最大途徑點數
};
```

## 🛠️ 故障排除

### 常見問題

**Q: 地理編碼總是失敗？**
A: 檢查 Google Maps API Key 是否正確設定，並確認已啟用 Geocoding API

**Q: 路線規劃沒有回應？**
A: 確認已啟用 Directions API，檢查請求的座標是否有效

**Q: 地圖顯示空白？**
A: 檢查 Google Maps JavaScript API 是否正確載入

**Q: 批量地理編碼很慢？**
A: 這是正常的，因為有API限制。可以調整批次大小和延遲時間

### 除錯模式

設定環境變數啟用詳細日誌：

```bash
DEBUG=google-maps npm start
```

### 日誌檢查

檢查系統日誌以了解服務狀態：

```sql
SELECT * FROM system_logs 
WHERE operation LIKE '%geocod%' 
ORDER BY created_at DESC 
LIMIT 10;
```

## 📊 監控和統計

### 快取效能監控

```http
GET /api/maps/cache-stats
```

回應範例：
```json
{
  "success": true,
  "data": {
    "totalEntries": 150,
    "activeEntries": 142,
    "expiredEntries": 8,
    "totalHits": 1250,
    "avgHits": 8.33,
    "lastCacheTime": "2024-01-15T10:30:00Z"
  }
}
```

### 路線計劃歷史

```http
GET /api/smart-route/plans?limit=10&status=completed
```

## 🔐 安全考量

1. **API Key 保護**: 絕不在前端暴露伺服器端 API Key
2. **存取控制**: 地理編碼API需要管理員權限
3. **速率限制**: 已實施API速率限制防止濫用
4. **輸入驗證**: 所有地址輸入都經過清理和驗證

## 🚀 未來擴展

系統架構支援以下擴展：

- 即時追蹤功能
- 多車輛路線規劃
- 動態路線調整
- 交通狀況整合
- 配送時間預測

---

## 📞 技術支援

如有問題請參考：
1. 測試腳本執行結果
2. 系統日誌輸出
3. Google Maps API 文檔
4. 本專案的GitHub Issues

**祝您使用愉快！** 🎉