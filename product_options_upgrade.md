# 🌽 商品選項功能擴展方案

## 📋 需求分析

### 現有需求
- **水果玉米**需要支援：
  1. 撥皮選項：要撥皮 / 不撥皮
  2. 切片選項：要切片 / 不切片
  
### 擴展性考量
- 其他商品未來可能也需要選項功能
- 系統需要支援多種選項類型
- 選項可能影響價格或僅為加工服務

## 🗄️ 資料庫設計方案

### 1. 商品選項群組表 (product_option_groups)
```sql
CREATE TABLE product_option_groups (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,        -- 選項群組名稱，如「處理方式」
  description TEXT,                  -- 群組說明
  is_required BOOLEAN DEFAULT true,  -- 是否必選
  selection_type VARCHAR(20) DEFAULT 'single', -- single/multiple
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. 商品選項表 (product_options)
```sql
CREATE TABLE product_options (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES product_option_groups(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,        -- 選項名稱，如「要撥皮」
  description TEXT,                  -- 選項說明
  price_modifier NUMERIC(10,2) DEFAULT 0, -- 價格調整（正數加價，負數減價）
  is_default BOOLEAN DEFAULT false,  -- 是否為預設選項
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. 訂單商品選項表 (order_item_options)
```sql
CREATE TABLE order_item_options (
  id SERIAL PRIMARY KEY,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  option_group_id INTEGER NOT NULL REFERENCES product_option_groups(id),
  option_id INTEGER NOT NULL REFERENCES product_options(id),
  option_name VARCHAR(100) NOT NULL, -- 快照選項名稱
  price_modifier NUMERIC(10,2) DEFAULT 0, -- 快照價格調整
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 📊 水果玉米範例資料

### 1. 新增水果玉米商品（如果尚未存在）
```sql
INSERT INTO products (name, price, is_priced_item, unit_hint) 
VALUES ('🌽 水果玉米', 80, false, '每條');
```

### 2. 建立撥皮選項群組
```sql
INSERT INTO product_option_groups (product_id, name, description, is_required, selection_type, sort_order)
SELECT id, '撥皮服務', '是否需要代為撥玉米皮', true, 'single', 1
FROM products WHERE name = '🌽 水果玉米';
```

### 3. 建立撥皮選項
```sql
-- 取得剛建立的群組ID
WITH peel_group AS (
  SELECT pog.id as group_id 
  FROM product_option_groups pog
  JOIN products p ON pog.product_id = p.id
  WHERE p.name = '🌽 水果玉米' AND pog.name = '撥皮服務'
)
INSERT INTO product_options (group_id, name, description, price_modifier, is_default, sort_order)
SELECT group_id, '要撥皮', '代為撥除玉米外皮', 5, false, 1 FROM peel_group
UNION ALL
SELECT group_id, '不撥皮', '保持原狀不處理', 0, true, 2 FROM peel_group;
```

### 4. 建立切片選項群組
```sql
INSERT INTO product_option_groups (product_id, name, description, is_required, selection_type, sort_order)
SELECT id, '切片服務', '是否需要切成片狀', true, 'single', 2
FROM products WHERE name = '🌽 水果玉米';
```

### 5. 建立切片選項
```sql
-- 取得剛建立的群組ID
WITH slice_group AS (
  SELECT pog.id as group_id 
  FROM product_option_groups pog
  JOIN products p ON pog.product_id = p.id
  WHERE p.name = '🌽 水果玉米' AND pog.name = '切片服務'
)
INSERT INTO product_options (group_id, name, description, price_modifier, is_default, sort_order)
SELECT group_id, '要切片', '切成適合食用的片狀', 3, false, 1 FROM slice_group
UNION ALL
SELECT group_id, '不切片', '保持整條狀態', 0, true, 2 FROM slice_group;
```

## 🎨 前端界面設計

### 1. 商品模態框擴展
```html
<!-- 原有的商品資訊 -->
<div class="modal-content">
  <h3>🌽 水果玉米</h3>
  <p class="price">$80 / 每條</p>
  
  <!-- 新增：商品選項區域 -->
  <div class="product-options">
    
    <!-- 撥皮選項群組 -->
    <div class="option-group">
      <h4>撥皮服務 <span class="required">*</span></h4>
      <div class="options-list">
        <label class="option-item">
          <input type="radio" name="peel-service" value="1" data-price="5">
          <span class="option-name">要撥皮</span>
          <span class="price-modifier">+$5</span>
        </label>
        <label class="option-item">
          <input type="radio" name="peel-service" value="2" data-price="0" checked>
          <span class="option-name">不撥皮</span>
          <span class="price-modifier">免費</span>
        </label>
      </div>
    </div>
    
    <!-- 切片選項群組 -->
    <div class="option-group">
      <h4>切片服務 <span class="required">*</span></h4>
      <div class="options-list">
        <label class="option-item">
          <input type="radio" name="slice-service" value="3" data-price="3">
          <span class="option-name">要切片</span>
          <span class="price-modifier">+$3</span>
        </label>
        <label class="option-item">
          <input type="radio" name="slice-service" value="4" data-price="0" checked>
          <span class="option-name">不切片</span>
          <span class="price-modifier">免費</span>
        </label>
      </div>
    </div>
    
    <!-- 動態價格顯示 -->
    <div class="option-summary">
      <div class="base-price">基本價格: $80</div>
      <div class="option-price">加工費用: +$0</div>
      <div class="total-price">小計: $80</div>
    </div>
    
  </div>
  
  <!-- 數量選擇和加入購物車按鈕 -->
  <div class="quantity-section">
    <label>數量:</label>
    <input type="number" value="1" min="1" class="quantity-input">
    <button class="add-to-cart-btn">加入購物車</button>
  </div>
</div>
```

### 2. CSS 樣式
```css
.product-options {
  margin: 20px 0;
  padding: 15px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #f9f9f9;
}

.option-group {
  margin-bottom: 20px;
}

.option-group h4 {
  margin: 0 0 10px 0;
  font-weight: bold;
  color: #333;
}

.required {
  color: #e74c3c;
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;
}

.option-item:hover {
  border-color: #27ae60;
  background: #f0fff4;
}

.option-item input[type="radio"] {
  margin-right: 10px;
}

.option-name {
  flex: 1;
  font-weight: 500;
}

.price-modifier {
  color: #27ae60;
  font-weight: bold;
}

.option-summary {
  margin-top: 15px;
  padding: 10px;
  background: white;
  border-radius: 6px;
  border-left: 4px solid #27ae60;
}

.total-price {
  font-size: 18px;
  font-weight: bold;
  color: #27ae60;
}
```

### 3. JavaScript 邏輯
```javascript
// 商品選項處理
class ProductOptions {
  constructor(productId) {
    this.productId = productId;
    this.basePrice = 0;
    this.optionPrice = 0;
    this.selectedOptions = {};
  }
  
  // 初始化選項
  init() {
    const optionInputs = document.querySelectorAll('.option-item input');
    optionInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        this.updateSelection(e.target);
      });
    });
    
    // 設定基本價格
    this.basePrice = parseFloat(document.querySelector('.base-price').textContent.match(/\d+/)[0]);
    this.updatePriceDisplay();
  }
  
  // 更新選項選擇
  updateSelection(input) {
    const groupName = input.name;
    const optionId = input.value;
    const priceModifier = parseFloat(input.dataset.price);
    
    this.selectedOptions[groupName] = {
      optionId: optionId,
      priceModifier: priceModifier
    };
    
    this.updatePriceDisplay();
  }
  
  // 更新價格顯示
  updatePriceDisplay() {
    this.optionPrice = Object.values(this.selectedOptions)
      .reduce((sum, option) => sum + option.priceModifier, 0);
    
    const totalPrice = this.basePrice + this.optionPrice;
    
    document.querySelector('.option-price').textContent = `加工費用: +$${this.optionPrice}`;
    document.querySelector('.total-price').textContent = `小計: $${totalPrice}`;
  }
  
  // 取得選項摘要
  getOptionsSummary() {
    const summary = [];
    Object.entries(this.selectedOptions).forEach(([groupName, option]) => {
      const optionElement = document.querySelector(`input[name="${groupName}"][value="${option.optionId}"]`);
      const optionName = optionElement.parentElement.querySelector('.option-name').textContent;
      summary.push(optionName);
    });
    return summary.join(', ');
  }
}

// 初始化商品選項
document.addEventListener('DOMContentLoaded', function() {
  if (document.querySelector('.product-options')) {
    const productOptions = new ProductOptions();
    productOptions.init();
  }
});
```

## 🛒 購物車資料結構更新

### 購物車項目資料結構
```javascript
const cartItem = {
  productId: 123,
  productName: '🌽 水果玉米',
  basePrice: 80,
  quantity: 2,
  selectedOptions: {
    'peel-service': {
      optionId: 1,
      optionName: '要撥皮',
      priceModifier: 5
    },
    'slice-service': {
      optionId: 4,
      optionName: '不切片',
      priceModifier: 0
    }
  },
  totalPrice: 170, // (80 + 5) * 2
  optionsSummary: '要撥皮, 不切片'
};
```

### 購物車顯示更新
```html
<div class="cart-item">
  <div class="item-info">
    <h4>🌽 水果玉米</h4>
    <p class="options-summary">要撥皮, 不切片</p>
    <p class="price">$85 × 2 = $170</p>
  </div>
  <div class="quantity-controls">
    <button class="quantity-btn minus">-</button>
    <span class="quantity">2</span>
    <button class="quantity-btn plus">+</button>
  </div>
</div>
```

## 🔧 後端API更新

### 1. 取得商品選項API
```javascript
// GET /api/products/:id/options
app.get('/api/products/:id/options', async (req, res) => {
  try {
    const productId = req.params.id;
    
    const result = await pool.query(`
      SELECT 
        pog.id as group_id,
        pog.name as group_name,
        pog.description as group_description,
        pog.is_required,
        pog.selection_type,
        po.id as option_id,
        po.name as option_name,
        po.description as option_description,
        po.price_modifier,
        po.is_default
      FROM product_option_groups pog
      LEFT JOIN product_options po ON pog.id = po.group_id
      WHERE pog.product_id = $1 AND po.is_active = true
      ORDER BY pog.sort_order, po.sort_order
    `, [productId]);
    
    // 組織成群組結構
    const groups = {};
    result.rows.forEach(row => {
      if (!groups[row.group_id]) {
        groups[row.group_id] = {
          id: row.group_id,
          name: row.group_name,
          description: row.group_description,
          isRequired: row.is_required,
          selectionType: row.selection_type,
          options: []
        };
      }
      
      if (row.option_id) {
        groups[row.group_id].options.push({
          id: row.option_id,
          name: row.option_name,
          description: row.option_description,
          priceModifier: row.price_modifier,
          isDefault: row.is_default
        });
      }
    });
    
    res.json(Object.values(groups));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 2. 訂單建立API更新
```javascript
// POST /api/orders
app.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 建立訂單
    const orderResult = await client.query(
      'INSERT INTO orders (...) VALUES (...) RETURNING id',
      [...]
    );
    const orderId = orderResult.rows[0].id;
    
    // 建立訂單項目和選項
    for (const item of req.body.items) {
      // 建立訂單項目
      const itemResult = await client.query(
        'INSERT INTO order_items (...) VALUES (...) RETURNING id',
        [...]
      );
      const itemId = itemResult.rows[0].id;
      
      // 建立訂單項目選項
      if (item.selectedOptions) {
        for (const [groupName, option] of Object.entries(item.selectedOptions)) {
          await client.query(
            'INSERT INTO order_item_options (order_item_id, option_group_id, option_id, option_name, price_modifier) VALUES ($1, $2, $3, $4, $5)',
            [itemId, option.groupId, option.optionId, option.optionName, option.priceModifier]
          );
        }
      }
    }
    
    await client.query('COMMIT');
    res.json({ success: true, orderId });
    
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});
```

## 📋 實施步驟

### 階段一：資料庫結構建立
1. 執行資料表建立SQL
2. 新增水果玉米商品資料
3. 建立撥皮和切片選項

### 階段二：後端API開發
1. 開發商品選項查詢API
2. 更新訂單建立API
3. 新增選項管理API

### 階段三：前端界面實作
1. 更新商品模態框
2. 實作選項選擇邏輯
3. 更新購物車顯示

### 階段四：測試與優化
1. 功能測試
2. 用戶體驗優化
3. 效能調整

## 🚀 未來擴展

### 更多選項類型支援
- 時間選項（配送時間）
- 文字輸入選項（特殊要求）
- 檔案上傳選項（參考圖片）

### 智能推薦
- 根據歷史選擇推薦常用組合
- 季節性選項調整
- 庫存狀況影響選項可用性

### 管理後台
- 選項群組管理界面
- 選項價格批量調整
- 選項使用統計分析

---

**💡 這個設計方案提供了完整的商品選項功能，不僅滿足水果玉米的需求，也為未來其他商品的選項擴展奠定了良好的基礎。**