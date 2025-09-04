-- 為訂單表添加付款方式欄位
-- 執行此腳本為orders表新增payment_method欄位

-- 1. 添加付款方式欄位到orders表
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20);

-- 2. 為現有訂單設定預設付款方式
UPDATE orders 
SET payment_method = 'cash'
WHERE payment_method IS NULL;

-- 3. 驗證更新結果
SELECT 
    id,
    contact_name as 客戶姓名,
    payment_method as 付款方式,
    total_amount as 訂單金額,
    status as 訂單狀態,
    created_at as 訂單時間
FROM orders 
ORDER BY id DESC
LIMIT 5;