-- 為商品表添加圖片支援
-- 執行此腳本為products表新增image_url欄位

-- 1. 添加圖片URL欄位到products表
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. 添加圖片上傳時間記錄
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS image_uploaded_at TIMESTAMP;

-- 3. 為現有商品設定預設emoji圖片（臨時方案）
UPDATE products 
SET image_url = CASE 
    WHEN name LIKE '%高麗菜%' THEN '🥬'
    WHEN name LIKE '%番茄%' THEN '🍅'  
    WHEN name LIKE '%胡蘿蔔%' THEN '🥕'
    WHEN name LIKE '%小黃瓜%' THEN '🥒'
    WHEN name LIKE '%洋蔥%' THEN '🧅'
    WHEN name LIKE '%青江菜%' THEN '🥬'
    WHEN name LIKE '%空心菜%' THEN '🥬'
    WHEN name LIKE '%玉米%' THEN '🌽'
    WHEN name LIKE '%馬鈴薯%' THEN '🥔'
    ELSE '🥬'
END
WHERE image_url IS NULL;

-- 4. 驗證更新結果
SELECT 
    id,
    name as 商品名稱,
    image_url as 圖片,
    image_uploaded_at as 上傳時間
FROM products 
ORDER BY id;