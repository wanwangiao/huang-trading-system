-- 🚀 新資料庫快速設置腳本
-- 在新的Supabase專案中執行此腳本

-- 1. 建立所有必要的資料表
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    phone VARCHAR(20) UNIQUE NOT NULL,
    address TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price NUMERIC(10,2),
    is_priced_item BOOLEAN DEFAULT false,
    unit_hint VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    contact_name VARCHAR(100) NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,
    address TEXT NOT NULL,
    notes TEXT,
    invoice VARCHAR(200),
    subtotal NUMERIC(10,2) DEFAULT 0,
    delivery_fee NUMERIC(10,2) DEFAULT 0,
    total_amount NUMERIC(10,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'placed',
    lat NUMERIC(10,7),
    lng NUMERIC(10,7),
    geocode_status VARCHAR(20),
    geocoded_at TIMESTAMP,
    driver_id INTEGER,
    taken_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    name VARCHAR(100) NOT NULL,
    is_priced_item BOOLEAN DEFAULT false,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10,2),
    line_total NUMERIC(10,2) DEFAULT 0,
    actual_weight NUMERIC(8,3),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    current_stock INTEGER DEFAULT 0,
    min_stock_alert INTEGER DEFAULT 10,
    max_stock_capacity INTEGER DEFAULT 1000,
    unit_cost NUMERIC(10,2) DEFAULT 0,
    supplier_name VARCHAR(100),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    movement_type VARCHAR(20) NOT NULL, -- 'in', 'out', 'adjustment'
    quantity INTEGER NOT NULL,
    unit_cost NUMERIC(10,2) DEFAULT 0,
    reason TEXT,
    operator_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    line_user_id VARCHAR(100),
    line_display_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 建立商品選項相關資料表
CREATE TABLE IF NOT EXISTS product_option_groups (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_required BOOLEAN DEFAULT true,
    selection_type VARCHAR(20) DEFAULT 'single',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_options (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES product_option_groups(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price_modifier NUMERIC(10,2) DEFAULT 0,
    is_default BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_item_options (
    id SERIAL PRIMARY KEY,
    order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    option_group_id INTEGER NOT NULL REFERENCES product_option_groups(id),
    option_id INTEGER NOT NULL REFERENCES product_options(id),
    option_name VARCHAR(100) NOT NULL,
    price_modifier NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 新增基本商品資料
INSERT INTO products (name, price, is_priced_item, unit_hint) VALUES
('🥬 有機高麗菜', 80, false, '每顆'),
('🍅 新鮮番茄', NULL, true, '每公斤'),
('🥬 青江菜', 40, false, '每把'),
('🥕 胡蘿蔔', NULL, true, '每公斤'),
('🥒 小黃瓜', 60, false, '每包'),
('🧅 洋蔥', NULL, true, '每公斤')
ON CONFLICT DO NOTHING;

-- 4. 新增三個新商品
INSERT INTO products (name, price, is_priced_item, unit_hint) VALUES
('🥬 空心菜', 50, false, '每把'),
('🥬 高麗菜', 45, true, '每斤'),
('🌽 水果玉米', 80, false, '每條')
ON CONFLICT DO NOTHING;

-- 5. 為新商品建立庫存記錄
INSERT INTO inventory (product_id, current_stock, min_stock_alert, max_stock_capacity, unit_cost, supplier_name)
SELECT p.id, 
       CASE 
         WHEN p.name = '🥬 空心菜' THEN 30
         WHEN p.name = '🥬 高麗菜' THEN 20  
         WHEN p.name = '🌽 水果玉米' THEN 25
         ELSE 50
       END as stock,
       CASE 
         WHEN p.name = '🥬 高麗菜' THEN 3
         ELSE 5
       END as min_alert,
       100 as max_capacity,
       CASE 
         WHEN p.name = '🥬 空心菜' THEN 35.0
         WHEN p.name = '🥬 高麗菜' THEN 31.5
         WHEN p.name = '🌽 水果玉米' THEN 56.0
         ELSE 25.0
       END as cost,
       CASE 
         WHEN p.name = '🥬 空心菜' THEN '新鮮農場'
         WHEN p.name = '🥬 高麗菜' THEN '有機農場'
         WHEN p.name = '🌽 水果玉米' THEN '玉米專業農場'
         ELSE '預設供應商'
       END as supplier
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM inventory i WHERE i.product_id = p.id);

-- 6. 為水果玉米建立選項群組和選項
DO $$
DECLARE
    corn_id INTEGER;
    peel_group_id INTEGER;
    slice_group_id INTEGER;
BEGIN
    -- 取得水果玉米的ID
    SELECT id INTO corn_id FROM products WHERE name = '🌽 水果玉米';
    
    IF corn_id IS NOT NULL THEN
        -- 建立撥皮選項群組
        INSERT INTO product_option_groups (product_id, name, description, is_required, selection_type, sort_order)
        VALUES (corn_id, '撥皮服務', '是否需要代為撥玉米皮', true, 'single', 1)
        RETURNING id INTO peel_group_id;
        
        -- 建立撥皮選項
        INSERT INTO product_options (group_id, name, description, price_modifier, is_default, sort_order) VALUES
        (peel_group_id, '要撥皮', '代為撥除玉米外皮', 5, false, 1),
        (peel_group_id, '不撥皮', '保持原狀不處理', 0, true, 2);
        
        -- 建立切片選項群組
        INSERT INTO product_option_groups (product_id, name, description, is_required, selection_type, sort_order)
        VALUES (corn_id, '切片服務', '是否需要切成片狀', true, 'single', 2)
        RETURNING id INTO slice_group_id;
        
        -- 建立切片選項
        INSERT INTO product_options (group_id, name, description, price_modifier, is_default, sort_order) VALUES
        (slice_group_id, '要切片', '切成適合食用的片狀', 3, false, 1),
        (slice_group_id, '不切片', '保持整條狀態', 0, true, 2);
    END IF;
END $$;

-- 7. 記錄初始庫存異動
INSERT INTO stock_movements (product_id, movement_type, quantity, unit_cost, reason, operator_name)
SELECT p.id, 'in', i.current_stock, i.unit_cost, '系統初始化', '管理員'
FROM products p
JOIN inventory i ON p.id = i.product_id
WHERE p.name IN ('🥬 空心菜', '🥬 高麗菜', '🌽 水果玉米');

-- 8. 驗證設置
SELECT 
    '✅ 資料庫設置完成！' as status,
    COUNT(*) as total_products
FROM products;

SELECT 
    p.name,
    p.price,
    p.is_priced_item,
    i.current_stock,
    COUNT(pog.id) as option_groups
FROM products p
LEFT JOIN inventory i ON p.id = i.product_id
LEFT JOIN product_option_groups pog ON p.id = pog.product_id
GROUP BY p.id, p.name, p.price, p.is_priced_item, i.current_stock
ORDER BY p.id;