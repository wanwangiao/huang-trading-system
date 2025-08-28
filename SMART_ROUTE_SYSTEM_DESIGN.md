# 智能路線規劃系統 - 技術設計文檔

## 🎯 系統概述

智能路線規劃系統旨在透過地理聚類演算法和路線優化，提升外送效率並降低配送成本。

### 核心特性
- **地理聚類分組**：使用K-means演算法將訂單按地理位置分組
- **路線優化**：基於TSP（旅行商問題）近似演算法優化配送路線
- **視覺化管理**：提供直觀的地圖界面供管理員操作
- **批次配送**：支援外送員同時配送多個相鄰訂單

## 🏗️ 系統架構

```
Frontend (Vue.js + 地圖API)
    ↓
API Gateway (Express.js)
    ↓
智能路線服務 (Node.js + Google Maps API)
    ↓
資料庫 (PostgreSQL + PostGIS)
    ↓
快取層 (Redis)
```

### 主要組件

1. **路線規劃引擎**
   - K-means 地理聚類演算法
   - TSP 最短路徑演算法
   - Google Maps Distance Matrix API 整合

2. **地理資料服務**
   - 地址地理編碼
   - 距離矩陣計算
   - 路線規劃快取

3. **視覺化界面**
   - 訂單地圖顯示
   - 分組顏色標示
   - 拖拉排序功能

## 🗃️ 資料庫架構

### 新增資料表

#### 1. 路線群組表 (route_groups)
```sql
CREATE TABLE route_groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  driver_id INTEGER REFERENCES drivers(id),
  status VARCHAR(20) DEFAULT 'planning', -- planning|assigned|completed
  total_orders INTEGER DEFAULT 0,
  estimated_distance NUMERIC(10,2),
  estimated_duration INTEGER, -- minutes
  optimized_sequence JSONB, -- 優化後的配送順序
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 2. 訂單分組關聯表 (order_group_assignments)
```sql
CREATE TABLE order_group_assignments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  route_group_id INTEGER NOT NULL REFERENCES route_groups(id),
  sequence_order INTEGER, -- 配送順序
  estimated_arrival_time TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 3. 地理快取表 (geocoding_cache)
```sql
CREATE TABLE geocoding_cache (
  id SERIAL PRIMARY KEY,
  address TEXT UNIQUE NOT NULL,
  lat NUMERIC(10,8),
  lng NUMERIC(11,8),
  formatted_address TEXT,
  place_id VARCHAR(255),
  geocoded_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days')
);
```

#### 4. 距離矩陣快取表 (distance_cache)
```sql
CREATE TABLE distance_cache (
  id SERIAL PRIMARY KEY,
  origin_lat NUMERIC(10,8),
  origin_lng NUMERIC(11,8),
  destination_lat NUMERIC(10,8),
  destination_lng NUMERIC(11,8),
  distance_meters INTEGER,
  duration_seconds INTEGER,
  cached_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days')
);
```

#### 5. 批次配送記錄表 (batch_deliveries)
```sql
CREATE TABLE batch_deliveries (
  id SERIAL PRIMARY KEY,
  route_group_id INTEGER REFERENCES route_groups(id),
  driver_id INTEGER REFERENCES drivers(id),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  total_distance NUMERIC(10,2),
  total_duration INTEGER,
  delivery_efficiency NUMERIC(5,2), -- 效率評分
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 🔧 API 設計

### 1. 智能分組 API

#### POST /api/admin/routes/auto-group
**功能**：自動將待配送訂單進行地理聚類分組

```javascript
// Request
{
  "orderIds": [1, 2, 3, 4, 5],
  "maxGroupSize": 8,
  "maxDistanceKm": 5
}

// Response
{
  "success": true,
  "groups": [
    {
      "id": 1,
      "name": "Group A - 三峽區",
      "orders": [1, 3, 5],
      "centerLat": 24.9347,
      "centerLng": 121.3681,
      "estimatedDistance": 12.5,
      "estimatedDuration": 45
    }
  ]
}
```

#### POST /api/admin/routes/optimize-sequence
**功能**：優化特定群組的配送順序

```javascript
// Request
{
  "groupId": 1
}

// Response
{
  "success": true,
  "optimizedSequence": [
    {
      "orderId": 1,
      "sequence": 1,
      "estimatedArrival": "2025-08-19T14:30:00Z"
    }
  ],
  "totalDistance": 12.5,
  "totalDuration": 45
}
```

### 2. 批次操作 API

#### POST /api/admin/routes/assign-batch
**功能**：批次分配路線群組給外送員

```javascript
// Request
{
  "assignments": [
    {
      "groupId": 1,
      "driverId": 2
    }
  ]
}

// Response
{
  "success": true,
  "assignedGroups": 1,
  "message": "批次分配成功"
}
```

## 🧮 演算法實現

### 1. K-means 地理聚類

```javascript
class GeographicKMeans {
  constructor(k, maxIterations = 100) {
    this.k = k;
    this.maxIterations = maxIterations;
  }
  
  cluster(orders) {
    // 1. 初始化聚類中心
    let centroids = this.initializeCentroids(orders);
    
    for (let i = 0; i < this.maxIterations; i++) {
      // 2. 分配訂單到最近的聚類中心
      const clusters = this.assignToNearestCentroid(orders, centroids);
      
      // 3. 重新計算聚類中心
      const newCentroids = this.updateCentroids(clusters);
      
      // 4. 檢查收斂性
      if (this.hasConverged(centroids, newCentroids)) break;
      
      centroids = newCentroids;
    }
    
    return this.formatClusters(centroids, orders);
  }
  
  calculateDistance(point1, point2) {
    // 使用 Haversine 公式計算地理距離
    const R = 6371; // 地球半徑（公里）
    const dLat = this.toRad(point2.lat - point1.lat);
    const dLon = this.toRad(point2.lng - point1.lng);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRad(point1.lat)) * Math.cos(this.toRad(point2.lat)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}
```

### 2. TSP 路線優化

```javascript
class TSPOptimizer {
  constructor() {
    this.distanceCache = new Map();
  }
  
  async optimizeRoute(orders, startPoint) {
    // 1. 建立距離矩陣
    const distanceMatrix = await this.buildDistanceMatrix(orders, startPoint);
    
    // 2. 使用最近鄰居演算法作為初始解
    let route = this.nearestNeighborHeuristic(distanceMatrix);
    
    // 3. 使用 2-opt 改善演算法優化路線
    route = this.twoOptImprovement(route, distanceMatrix);
    
    return this.formatOptimizedRoute(route, orders);
  }
  
  async getDistance(origin, destination) {
    const cacheKey = `${origin.lat},${origin.lng}-${destination.lat},${destination.lng}`;
    
    if (this.distanceCache.has(cacheKey)) {
      return this.distanceCache.get(cacheKey);
    }
    
    // 調用 Google Maps Distance Matrix API
    const result = await this.googleMapsDistance(origin, destination);
    this.distanceCache.set(cacheKey, result);
    
    return result;
  }
}
```

## 🎨 前端界面設計

### 1. 路線規劃管理頁面

```vue
<template>
  <div class="route-planning-page">
    <!-- 控制面板 -->
    <div class="control-panel">
      <h2>智能路線規劃</h2>
      
      <!-- 自動分組按鈕 -->
      <button @click="autoGroup" class="btn-primary">
        自動分組
      </button>
      
      <!-- 分組參數設定 -->
      <div class="group-settings">
        <label>最大群組大小：</label>
        <input v-model="maxGroupSize" type="number" min="1" max="10">
        
        <label>最大配送距離（公里）：</label>
        <input v-model="maxDistance" type="number" min="1" max="20">
      </div>
    </div>
    
    <!-- 地圖顯示 -->
    <div class="map-container">
      <GoogleMap 
        :orders="orders"
        :groups="routeGroups"
        @order-selected="selectOrder"
        @group-modified="updateGroup"
      />
    </div>
    
    <!-- 分組列表 -->
    <div class="groups-panel">
      <div 
        v-for="group in routeGroups" 
        :key="group.id"
        :class="['group-card', `group-${group.id}`]"
      >
        <h3>{{ group.name }}</h3>
        <div class="group-stats">
          <span>訂單數：{{ group.orders.length }}</span>
          <span>預估距離：{{ group.estimatedDistance }}km</span>
          <span>預估時間：{{ group.estimatedDuration }}分鐘</span>
        </div>
        
        <!-- 拖拉排序的訂單列表 -->
        <draggable 
          v-model="group.orders"
          @change="updateOrderSequence(group.id)"
        >
          <div 
            v-for="order in group.orders"
            :key="order.id"
            class="order-item"
          >
            {{ order.contact_name }} - {{ order.address }}
          </div>
        </draggable>
        
        <!-- 分配外送員 -->
        <select 
          v-model="group.driverId"
          @change="assignDriver(group.id)"
        >
          <option value="">選擇外送員</option>
          <option 
            v-for="driver in availableDrivers"
            :key="driver.id"
            :value="driver.id"
          >
            {{ driver.name }}
          </option>
        </select>
      </div>
    </div>
  </div>
</template>
```

### 2. 地圖組件設計

```javascript
// GoogleMap.vue
export default {
  props: ['orders', 'groups'],
  data() {
    return {
      map: null,
      markers: [],
      groupColors: ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6']
    }
  },
  
  mounted() {
    this.initializeMap();
    this.displayOrders();
    this.displayRoutes();
  },
  
  methods: {
    displayOrders() {
      this.orders.forEach((order, index) => {
        const marker = new google.maps.Marker({
          position: { lat: order.lat, lng: order.lng },
          map: this.map,
          title: order.contact_name,
          icon: this.getOrderIcon(order)
        });
        
        this.markers.push(marker);
      });
    },
    
    getOrderIcon(order) {
      const groupIndex = this.findOrderGroup(order.id);
      return {
        url: '/images/markers/order-marker.png',
        scaledSize: new google.maps.Size(30, 30),
        fillColor: this.groupColors[groupIndex % this.groupColors.length]
      };
    },
    
    displayRoutes() {
      this.groups.forEach((group, index) => {
        if (group.optimizedSequence) {
          this.drawOptimizedRoute(group, this.groupColors[index]);
        }
      });
    }
  }
}
```

## 📈 效能優化策略

### 1. 資料庫優化
```sql
-- 地理空間索引
CREATE INDEX idx_orders_location ON orders USING GIST (ST_MakePoint(lng, lat));

-- 複合索引優化查詢
CREATE INDEX idx_orders_status_created ON orders(status, created_at);
CREATE INDEX idx_route_groups_status ON route_groups(status);
```

### 2. 快取策略
```javascript
class RouteOptimizationService {
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
  }
  
  async getCachedRoute(orderIds) {
    const cacheKey = `route:${orderIds.sort().join(',')}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    return null;
  }
  
  async cacheRoute(orderIds, route) {
    const cacheKey = `route:${orderIds.sort().join(',')}`;
    await this.redis.setex(cacheKey, 3600, JSON.stringify(route)); // 1小時快取
  }
}
```

### 3. API 效能優化
```javascript
// 批量地理編碼
async function batchGeocode(addresses) {
  const batchSize = 25; // Google Maps API 限制
  const results = [];
  
  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(address => this.geocodeAddress(address))
    );
    results.push(...batchResults);
  }
  
  return results;
}
```

## 🧪 測試策略

### 1. 單元測試
```javascript
describe('GeographicKMeans', () => {
  test('should cluster orders by geographic proximity', () => {
    const orders = [
      { id: 1, lat: 24.9347, lng: 121.3681 },
      { id: 2, lat: 24.9350, lng: 121.3685 },
      { id: 3, lat: 25.0347, lng: 121.4681 }
    ];
    
    const kmeans = new GeographicKMeans(2);
    const clusters = kmeans.cluster(orders);
    
    expect(clusters).toHaveLength(2);
    expect(clusters[0].orders).toHaveLength(2);
  });
});
```

### 2. 整合測試
```javascript
describe('Route Optimization API', () => {
  test('should optimize route for multiple orders', async () => {
    const response = await request(app)
      .post('/api/admin/routes/optimize-sequence')
      .send({ groupId: 1 });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.optimizedSequence).toBeDefined();
  });
});
```

## 📊 監控與分析

### 1. 效率指標
- 平均每單配送距離
- 外送員工作時間利用率
- 客戶滿意度評分
- 燃料成本節省比例

### 2. 報表功能
```sql
-- 配送效率報表
SELECT 
  d.name as driver_name,
  COUNT(bd.id) as total_batches,
  AVG(bd.delivery_efficiency) as avg_efficiency,
  SUM(bd.total_distance) as total_distance,
  AVG(bd.total_duration) as avg_duration
FROM batch_deliveries bd
JOIN drivers d ON bd.driver_id = d.id
WHERE bd.created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY d.id, d.name
ORDER BY avg_efficiency DESC;
```

## 🚀 部署與監控

### 1. Docker 容器化
```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
```

### 2. 環境變數
```bash
# Google Maps API
GOOGLE_MAPS_API_KEY=your_api_key_here

# Redis 快取
REDIS_URL=redis://localhost:6379

# 路線優化參數
MAX_ORDERS_PER_GROUP=8
MAX_DISTANCE_KM=5
OPTIMIZATION_ALGORITHM=tsp_2opt
```

這個設計文檔提供了完整的智能路線規劃系統架構，包含演算法實現、資料庫設計、API規格和前端界面設計。系統將大幅提升配送效率並提供優秀的用戶體驗。