-- 為誠憶鮮蔬系統新增馬鈴薯商品與分級價格選項
-- 功能：小份(約300克/45元) 中份(約600克/90元)

-- 1. 新增馬鈴薯商品
INSERT INTO products (name, price, is_priced_item, unit_hint) 
VALUES ('🥔 新鮮馬鈴薯', 45, false, '每份');

-- 2. 取得馬鈴薯商品ID並建立選項
DO $$
DECLARE
    potato_id INTEGER;
    size_group_id INTEGER;
BEGIN
    -- 取得馬鈴薯商品ID
    SELECT id INTO potato_id FROM products WHERE name = '🥔 新鮮馬鈴薯';
    
    IF potato_id IS NOT NULL THEN
        -- 建立份量選擇群組
        INSERT INTO product_option_groups (product_id, name, description, is_required, selection_type, sort_order)
        VALUES (potato_id, '份量選擇', '選擇馬鈴薯的份量大小', true, 'single', 1)
        RETURNING id INTO size_group_id;
        
        -- 建立份量選項
        INSERT INTO product_options (group_id, name, description, price_modifier, is_default, sort_order) VALUES
        (size_group_id, '小份', '約300克，適合1-2人份', 0, true, 1),
        (size_group_id, '中份', '約600克，適合3-4人份', 45, false, 2);
        
        RAISE NOTICE '✅ 馬鈴薯商品和份量選項建立完成！商品ID: %', potato_id;
    ELSE
        RAISE NOTICE '❌ 找不到馬鈴薯商品';
    END IF;
END $$;

-- 3. 建立馬鈴薯庫存記錄
INSERT INTO inventory (product_id, current_stock, min_stock_alert, max_stock_capacity, unit_cost, supplier_name)
SELECT p.id, 30, 10, 100, 30.0, '在地農場'
FROM products p 
WHERE p.name = '🥔 新鮮馬鈴薯'
ON CONFLICT (product_id) DO NOTHING;

-- 4. 記錄初始庫存異動
INSERT INTO stock_movements (product_id, movement_type, quantity, unit_cost, reason, operator_name)
SELECT p.id, 'in', 30, 30.0, '馬鈴薯商品初始化', '管理員'
FROM products p
WHERE p.name = '🥔 新鮮馬鈴薯';

-- 5. 驗證設定
SELECT 
  p.name as 商品名稱,
  p.price as 基本價格,
  p.unit_hint as 單位,
  pog.name as 選項群組,
  po.name as 選項名稱,
  po.description as 選項說明,
  po.price_modifier as 加價,
  (p.price + po.price_modifier) as 最終價格
FROM products p
LEFT JOIN product_option_groups pog ON p.id = pog.product_id
LEFT JOIN product_options po ON pog.id = po.group_id
WHERE p.name = '🥔 新鮮馬鈴薯'
ORDER BY po.sort_order;