# Sub-Agent 系統使用指南

## 概述

Sub-Agent 系統是一個基於代理程式架構的軟體設計模式，將複雜的業務邏輯分解為多個專門化的子代理程式，每個代理程式負責特定的功能領域。

## 系統架構

### 核心組件

1. **AgentManager** - 主控制器，管理所有 Sub-Agent 的生命週期
2. **BaseAgent** - 所有 Sub-Agent 的基礎類別
3. **OrderAgent** - 訂單處理專用代理程式
4. **InventoryAgent** - 庫存管理專用代理程式

### Agent 職責分工

```
AgentSystem
├── AgentManager (主控制器)
│   ├── 生命週期管理
│   ├── 訊息路由
│   ├── 健康監控
│   └── 錯誤處理
├── OrderAgent (訂單處理)
│   ├── 訂單建立
│   ├── 狀態更新
│   ├── 訂單驗證
│   └── 價格計算
└── InventoryAgent (庫存管理)
    ├── 庫存查詢
    ├── 庫存更新
    ├── 預留機制
    └── 補貨提醒
```

## 快速開始

### 1. 系統啟動

Sub-Agent 系統會在伺服器啟動時自動初始化：

```bash
npm start
```

啟動時會看到類似的訊息：
```
🚀 正在初始化 Agent 系統...
📋 創建 OrderAgent...
📦 創建 InventoryAgent...
✅ 已創建 2 個 Sub-Agent
🤖 Agent 系統已啟動
```

### 2. 檢查系統狀態

```bash
curl http://localhost:3000/api/admin/agents/status
```

回應範例：
```json
{
  "success": true,
  "status": "running",
  "agentCount": 2,
  "agents": {
    "OrderAgent": {
      "isActive": true,
      "taskCount": 5,
      "errorCount": 0
    },
    "InventoryAgent": {
      "isActive": true,
      "taskCount": 3,
      "errorCount": 0
    }
  }
}
```

## API 使用

### Agent 管理 API

#### 檢查系統狀態
```http
GET /api/admin/agents/status
```

#### 重啟特定 Agent
```http
POST /api/admin/agents/restart/:agentName
```

#### 健康檢查
```http
POST /api/admin/agents/health-check
```

### OrderAgent API

#### 使用 Agent 建立訂單
```http
POST /api/orders-agent
Content-Type: application/json

{
  "name": "王小明",
  "phone": "0912345678",
  "address": "台北市大安區...",
  "items": [
    {
      "productId": 1,
      "name": "高麗菜",
      "quantity": 2,
      "unit_price": 45,
      "line_total": 90
    }
  ]
}
```

### InventoryAgent API

#### 查詢庫存
```http
# 查詢所有庫存
GET /api/inventory-agent/stock

# 查詢特定商品庫存
GET /api/inventory-agent/stock/1
```

#### 查詢低庫存商品
```http
GET /api/inventory-agent/low-stock
```

#### 商品進貨
```http
POST /api/inventory-agent/restock
Content-Type: application/json

{
  "productId": 1,
  "quantity": 50,
  "unitCost": 35.0,
  "supplierName": "新鮮農場",
  "reason": "定期補貨"
}
```

## Agent 間通訊

### 訊息傳遞機制

Agent 之間透過 AgentManager 進行訊息傳遞：

```javascript
// 在 OrderAgent 中發送訊息給 InventoryAgent
await this.sendMessage('InventoryAgent', {
  type: 'reserve_stock',
  data: { orderId, items }
});
```

### 事件驅動架構

```javascript
// Agent 可以監聽和觸發事件
this.on('order_created', async (data) => {
  console.log('訂單建立事件:', data.orderId);
});

// 觸發事件
this.emit('order_created', { orderId: 1001 });
```

## 系統監控

### 日誌監控

系統會自動記錄以下資訊：
- Agent 啟動/停止狀態
- 任務執行結果
- 錯誤和警報
- 系統健康狀態

### 效能監控

```javascript
// 獲取系統統計
const stats = agentSystem.getSystemStats();
console.log('系統統計:', stats);
```

## 錯誤處理

### 自動錯誤處理

- **錯誤計數**: 每個 Agent 會追蹤錯誤次數
- **自動停止**: 錯誤過多時會自動停止
- **優雅降級**: Agent 系統故障時會回退到原有邏輯

### 手動處理

```javascript
try {
  const result = await agentSystem.executeTask('OrderAgent', 'create_order', data);
} catch (error) {
  console.error('Agent 任務失敗:', error);
  // 實施降級策略
}
```

## 擴展指南

### 新增 Sub-Agent

1. 建立新的 Agent 類別：

```javascript
// src/agents/NotificationAgent.js
const BaseAgent = require('./BaseAgent');

class NotificationAgent extends BaseAgent {
  constructor(agentManager) {
    super('NotificationAgent', agentManager);
  }

  async initialize() {
    // 初始化邏輯
  }

  async processTask(task) {
    // 任務處理邏輯
  }
}

module.exports = NotificationAgent;
```

2. 在 index.js 中註冊：

```javascript
// 在 createAgents 方法中加入
this.agents.notificationAgent = new NotificationAgent(this.agentManager);
this.agentManager.registerAgent(this.agents.notificationAgent);
```

### 新增任務類型

在 Agent 的 `initialize()` 方法中註冊新任務：

```javascript
this.taskHandlers = {
  'send_sms': this.handleSendSms.bind(this),
  'send_email': this.handleSendEmail.bind(this),
  // ... 其他任務
};
```

## 最佳實踐

### 1. 任務設計原則
- 每個任務應該是原子性的
- 避免長時間運行的任務
- 提供適當的錯誤處理

### 2. Agent 通訊
- 使用結構化的訊息格式
- 避免循環依賴
- 實施超時機制

### 3. 資源管理
- 適當關閉資源
- 避免記憶體洩漏
- 監控資源使用

### 4. 測試策略
- 單元測試每個 Agent
- 集成測試 Agent 間通訊
- 負載測試系統性能

## 故障排除

### 常見問題

#### 1. Agent 無法啟動
```bash
# 檢查錯誤日誌
tail -f logs/agent.log

# 重啟特定 Agent
curl -X POST http://localhost:3000/api/admin/agents/restart/OrderAgent
```

#### 2. 訊息傳遞失敗
- 檢查目標 Agent 是否運行
- 驗證訊息格式
- 查看超時設定

#### 3. 效能問題
- 監控任務執行時間
- 檢查資料庫連線狀況
- 分析記憶體使用

### 偵錯工具

```javascript
// 啟用詳細日誌
process.env.DEBUG = 'agent:*';

// 檢查 Agent 狀態
console.log(agentSystem.getSystemStatus());

// 健康檢查
const health = await agentSystem.healthCheck();
console.log(health);
```

## 結論

Sub-Agent 系統提供了一個靈活、可擴展的架構來處理複雜的業務邏輯。透過將功能分解為專門化的代理程式，我們可以：

- 提高系統的模組化程度
- 簡化除錯和維護
- 支援水平擴展
- 提升系統可靠性

隨著業務需求的增長，你可以輕鬆地新增更多的 Sub-Agent 來處理新的功能領域。