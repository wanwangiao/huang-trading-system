-- 庫存管理相關資料表
-- 用於管理商品庫存、進貨記錄等

-- 庫存主表
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    current_stock INTEGER DEFAULT 0,
    min_stock_alert INTEGER DEFAULT 10,
    max_stock_capacity INTEGER DEFAULT 1000,
    unit_cost DECIMAL(10, 2) DEFAULT 0,
    supplier_name VARCHAR(200),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id)
);

-- 庫存異動記錄表
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    movement_type VARCHAR(50) NOT NULL, -- 'in', 'out', 'adjustment', 'restock'
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(10, 2),
    reason TEXT,
    operator_name VARCHAR(100),
    reference_order_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 為現有商品建立庫存記錄（如果商品表存在的話）
INSERT INTO inventory (product_id, current_stock, min_stock_alert, max_stock_capacity, unit_cost, supplier_name)
SELECT 
    id, 
    FLOOR(RANDOM() * 50 + 10)::INTEGER as current_stock, -- 隨機庫存 10-59
    10 as min_stock_alert,
    100 as max_stock_capacity,
    CASE 
        WHEN price IS NOT NULL THEN price * 0.6 -- 成本約為售價的60%
        ELSE 20
    END as unit_cost,
    '預設供應商' as supplier_name
FROM products 
WHERE NOT EXISTS (
    SELECT 1 FROM inventory WHERE inventory.product_id = products.id
);

-- 創建索引以提高查詢效能
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_level ON inventory(current_stock, min_stock_alert);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);

-- 創建觸發器自動更新 last_updated
CREATE OR REPLACE FUNCTION update_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_updated_at ON inventory;
CREATE TRIGGER inventory_updated_at
    BEFORE UPDATE ON inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_updated_at();

-- 插入一些示範的庫存異動記錄
INSERT INTO stock_movements (product_id, movement_type, quantity, unit_cost, reason, operator_name) 
SELECT 
    p.id,
    'restock' as movement_type,
    30 as quantity,
    CASE 
        WHEN p.price IS NOT NULL THEN p.price * 0.6
        ELSE 15
    END as unit_cost,
    '初始進貨' as reason,
    '系統管理員' as operator_name
FROM products p
WHERE EXISTS (SELECT 1 FROM inventory WHERE inventory.product_id = p.id)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE inventory IS '商品庫存管理表';
COMMENT ON TABLE stock_movements IS '庫存異動記錄表';