-- 商品類別和排序管理系統

-- 商品類別表
CREATE TABLE IF NOT EXISTS product_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT '🥬',
    color VARCHAR(7) DEFAULT '#27ae60',
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 為products表增加類別和排序欄位 (如果不存在)
DO $$ 
BEGIN
    -- 增加category_id欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'category_id') THEN
        ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES product_categories(id);
    END IF;
    
    -- 增加sort_order欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'products' AND column_name = 'sort_order') THEN
        ALTER TABLE products ADD COLUMN sort_order INTEGER DEFAULT 0;
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'products table does not exist yet';
END $$;

-- 插入預設商品類別
INSERT INTO product_categories (name, display_name, description, icon, color, sort_order) VALUES
('leafy', '葉菜類', '各種葉菜蔬菜，如高麗菜、青江菜、菠菜等', '🥬', '#27ae60', 1),
('fruit', '水果類', '新鮮水果，營養豐富', '🍎', '#e74c3c', 2),
('root', '根莖類', '根莖類蔬菜，如胡蘿蔔、馬鈴薯、白蘿蔔等', '🥕', '#f39c12', 3),
('mushroom', '菇類', '各種新鮮菇類', '🍄', '#8e44ad', 4),
('other', '其他類', '其他蔬菜類商品', '🥗', '#95a5a6', 5)
ON CONFLICT (name) DO UPDATE SET 
    display_name = EXCLUDED.display_name,
    updated_at = CURRENT_TIMESTAMP;

-- 更新現有商品的類別 (基於商品名稱推測)
UPDATE products SET category_id = (
    SELECT id FROM product_categories WHERE name = 
    CASE 
        WHEN products.name ILIKE '%高麗菜%' OR products.name ILIKE '%青江菜%' OR products.name ILIKE '%菠菜%' 
             OR products.name ILIKE '%空心菜%' OR products.name ILIKE '%萵苣%' THEN 'leafy'
        WHEN products.name ILIKE '%胡蘿蔔%' OR products.name ILIKE '%馬鈴薯%' OR products.name ILIKE '%白蘿蔔%' 
             OR products.name ILIKE '%地瓜%' OR products.name ILIKE '%洋蔥%' THEN 'root'
        WHEN products.name ILIKE '%蘋果%' OR products.name ILIKE '%香蕉%' OR products.name ILIKE '%橘子%' 
             OR products.name ILIKE '%水果%' OR products.name ILIKE '%玉米%' THEN 'fruit'
        WHEN products.name ILIKE '%菇%' OR products.name ILIKE '%香菇%' OR products.name ILIKE '%金針菇%' THEN 'mushroom'
        ELSE 'other'
    END
) WHERE category_id IS NULL;

-- 為同類別商品設定排序順序
UPDATE products SET sort_order = subq.row_number 
FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY id) as row_number
    FROM products 
    WHERE sort_order = 0 OR sort_order IS NULL
) subq 
WHERE products.id = subq.id;

-- 創建索引提升查詢效能
CREATE INDEX IF NOT EXISTS idx_products_category_sort ON products(category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_product_categories_sort ON product_categories(sort_order);

-- 創建觸發器自動更新時間戳
CREATE OR REPLACE FUNCTION update_product_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_categories_updated_at ON product_categories;
CREATE TRIGGER product_categories_updated_at
    BEFORE UPDATE ON product_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_product_categories_updated_at();

COMMENT ON TABLE product_categories IS '商品分類管理表';
COMMENT ON COLUMN products.category_id IS '商品所屬分類ID';
COMMENT ON COLUMN products.sort_order IS '商品在分類中的排序位置';