-- 初始化庫存資料
-- 為所有現有商品建立庫存記錄

-- 確保inventory表存在
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    current_stock INTEGER DEFAULT 0,
    min_stock_alert INTEGER DEFAULT 10,
    max_stock_capacity INTEGER DEFAULT 1000,
    unit_cost DECIMAL(10,2) DEFAULT 0.00,
    supplier_name VARCHAR(255),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id)
);

-- 插入初始庫存資料（如果不存在）
INSERT INTO inventory (product_id, current_stock, min_stock_alert, max_stock_capacity, unit_cost, supplier_name, last_updated)
SELECT 
    p.id,
    CASE 
        WHEN p.name LIKE '%高麗菜%' THEN 45
        WHEN p.name LIKE '%番茄%' THEN 25  
        WHEN p.name LIKE '%青江菜%' THEN 30
        WHEN p.name LIKE '%胡蘿蔔%' THEN 20
        WHEN p.name LIKE '%小黃瓜%' THEN 18
        WHEN p.name LIKE '%洋蔥%' THEN 35
        WHEN p.name LIKE '%空心菜%' THEN 22
        WHEN p.name LIKE '%水果玉米%' THEN 40
        WHEN p.name LIKE '%葡萄%' THEN 15
        WHEN p.name LIKE '%蘋果%' THEN 28
        WHEN p.name LIKE '%香蕉%' THEN 50
        ELSE 25
    END as current_stock,
    CASE 
        WHEN p.name LIKE '%番茄%' THEN 15
        WHEN p.name LIKE '%胡蘿蔔%' THEN 12  
        WHEN p.name LIKE '%葡萄%' THEN 8
        ELSE 10
    END as min_stock_alert,
    CASE 
        WHEN p.name LIKE '%香蕉%' THEN 200
        WHEN p.name LIKE '%水果玉米%' THEN 150
        ELSE 100
    END as max_stock_capacity,
    CASE 
        WHEN p.price IS NOT NULL THEN p.price * 0.7
        ELSE 15.00
    END as unit_cost,
    CASE 
        WHEN p.name LIKE '%高麗菜%' THEN '新鮮農場'
        WHEN p.name LIKE '%番茄%' THEN '陽光果園'
        WHEN p.name LIKE '%青江菜%' THEN '綠野農場'  
        WHEN p.name LIKE '%胡蘿蔔%' THEN '有機農場'
        WHEN p.name LIKE '%小黃瓜%' THEN '綠色農場'
        WHEN p.name LIKE '%洋蔥%' THEN '陽光農場'
        WHEN p.name LIKE '%空心菜%' THEN '綠野農場'
        WHEN p.name LIKE '%水果玉米%' THEN '甜玉米農場'
        WHEN p.name LIKE '%葡萄%' THEN '果園直送'
        WHEN p.name LIKE '%蘋果%' THEN '山區果園'
        WHEN p.name LIKE '%香蕉%' THEN '南部蕉園'
        ELSE '誠意供應商'
    END as supplier_name,
    CURRENT_TIMESTAMP
FROM products p
WHERE p.id NOT IN (SELECT product_id FROM inventory WHERE product_id IS NOT NULL);

-- 更新統計
SELECT 
    COUNT(*) as total_products,
    COUNT(i.id) as products_with_inventory,
    COALESCE(SUM(i.current_stock), 0) as total_stock
FROM products p 
LEFT JOIN inventory i ON p.id = i.product_id;