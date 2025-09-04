-- 新增商品並建立庫存記錄
-- 執行這個腳本來新增空心菜、高麗菜和水果玉米

-- 1. 新增空心菜（固定價格 1把50元）
INSERT INTO products (name, price, is_priced_item, unit_hint) 
VALUES ('🥬 空心菜', 50, false, '每把');

-- 取得剛才新增的空心菜 product_id
WITH new_product AS (
  SELECT id FROM products WHERE name = '🥬 空心菜' ORDER BY id DESC LIMIT 1
)
INSERT INTO inventory (product_id, current_stock, min_stock_alert, max_stock_capacity, unit_cost, supplier_name)
SELECT id, 30, 5, 100, 35.0, '新鮮農場' FROM new_product;

-- 記錄空心菜初始庫存
WITH new_product AS (
  SELECT id FROM products WHERE name = '🥬 空心菜' ORDER BY id DESC LIMIT 1
)
INSERT INTO stock_movements (product_id, movement_type, quantity, unit_cost, reason, operator_name)
SELECT id, 'in', 30, 35.0, '新商品初始庫存', '管理員' FROM new_product;

-- 2. 新增高麗菜（秤重計價 1斤45元）
INSERT INTO products (name, price, is_priced_item, unit_hint) 
VALUES ('🥬 高麗菜', 45, true, '每斤');

-- 取得剛才新增的高麗菜 product_id
WITH new_product AS (
  SELECT id FROM products WHERE name = '🥬 高麗菜' ORDER BY id DESC LIMIT 1
)
INSERT INTO inventory (product_id, current_stock, min_stock_alert, max_stock_capacity, unit_cost, supplier_name)
SELECT id, 20, 3, 50, 31.5, '有機農場' FROM new_product;

-- 記錄高麗菜初始庫存
WITH new_product AS (
  SELECT id FROM products WHERE name = '🥬 高麗菜' ORDER BY id DESC LIMIT 1
)
INSERT INTO stock_movements (product_id, movement_type, quantity, unit_cost, reason, operator_name)
SELECT id, 'in', 20, 31.5, '新商品初始庫存', '管理員' FROM new_product;

-- 3. 新增水果玉米（固定價格 1條80元，先不加選項）
INSERT INTO products (name, price, is_priced_item, unit_hint) 
VALUES ('🌽 水果玉米', 80, false, '每條');

-- 取得剛才新增的水果玉米 product_id
WITH new_product AS (
  SELECT id FROM products WHERE name = '🌽 水果玉米' ORDER BY id DESC LIMIT 1
)
INSERT INTO inventory (product_id, current_stock, min_stock_alert, max_stock_capacity, unit_cost, supplier_name)
SELECT id, 25, 5, 100, 56.0, '玉米專業農場' FROM new_product;

-- 記錄水果玉米初始庫存
WITH new_product AS (
  SELECT id FROM products WHERE name = '🌽 水果玉米' ORDER BY id DESC LIMIT 1
)
INSERT INTO stock_movements (product_id, movement_type, quantity, unit_cost, reason, operator_name)
SELECT id, 'in', 25, 56.0, '新商品初始庫存', '管理員' FROM new_product;

-- 驗證新增結果
SELECT 
  p.id,
  p.name,
  p.price,
  p.is_priced_item,
  p.unit_hint,
  i.current_stock,
  i.min_stock_alert,
  i.supplier_name
FROM products p
LEFT JOIN inventory i ON p.id = i.product_id
WHERE p.name IN ('🥬 空心菜', '🥬 高麗菜', '🌽 水果玉米')
ORDER BY p.id DESC;