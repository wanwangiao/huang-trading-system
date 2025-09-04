-- ================================
-- 2025-08-19 功能升級 SQL 腳本
-- 實現：外送員系統、訂單狀態追蹤、即時通知
-- ================================

-- 1. 建立外送員資料表
CREATE TABLE IF NOT EXISTS drivers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'offline', -- offline|online|busy|unavailable
  current_lat NUMERIC,
  current_lng NUMERIC,
  total_deliveries INTEGER DEFAULT 0,
  rating NUMERIC(3,2) DEFAULT 5.0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. 增強訂單表 - 新增外送員和狀態追蹤欄位
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS driver_id INTEGER REFERENCES drivers(id),
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS estimated_delivery_time TIMESTAMP,
ADD COLUMN IF NOT EXISTS delivery_notes TEXT,
ADD COLUMN IF NOT EXISTS customer_rating INTEGER CHECK (customer_rating >= 1 AND customer_rating <= 5);

-- 3. 建立通知記錄表
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL, -- order_status|driver_assigned|delivery_completed|etc
  recipient_type VARCHAR(20) NOT NULL, -- customer|driver|admin
  recipient_id VARCHAR(100) NOT NULL, -- line_user_id or driver_id
  title VARCHAR(200),
  message TEXT NOT NULL,
  order_id INTEGER REFERENCES orders(id),
  status VARCHAR(20) DEFAULT 'pending', -- pending|sent|failed|read
  sent_at TIMESTAMP,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. 建立外送員位置記錄表（用於路線追蹤）
CREATE TABLE IF NOT EXISTS driver_locations (
  id SERIAL PRIMARY KEY,
  driver_id INTEGER NOT NULL REFERENCES drivers(id),
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  accuracy NUMERIC,
  recorded_at TIMESTAMP DEFAULT NOW()
);

-- 5. 建立訂單狀態變更記錄表
CREATE TABLE IF NOT EXISTS order_status_log (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  old_status VARCHAR(20),
  new_status VARCHAR(20) NOT NULL,
  changed_by VARCHAR(50), -- system|admin|driver|customer
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 6. 插入測試外送員資料
INSERT INTO drivers (name, phone, password_hash, status) VALUES 
('李大明', '0912345678', '$2b$10$example_hash_driver123', 'online'),
('王小華', '0923456789', '$2b$10$example_hash_driver456', 'offline'),
('陳美麗', '0934567890', '$2b$10$example_hash_driver789', 'online')
ON CONFLICT (phone) DO NOTHING;

-- 7. 建立索引以提升查詢效能
CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_id ON driver_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_order_status_log_order_id ON order_status_log(order_id);

-- 8. 建立觸發器：訂單狀態變更時自動記錄
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO order_status_log (order_id, old_status, new_status, changed_by, notes)
        VALUES (NEW.id, OLD.status, NEW.status, 'system', 
                CASE 
                    WHEN NEW.status = 'assigned' THEN '系統自動分配外送員'
                    WHEN NEW.status = 'picked_up' THEN '外送員已取貨'
                    WHEN NEW.status = 'delivering' THEN '配送中'
                    WHEN NEW.status = 'delivered' THEN '配送完成'
                    WHEN NEW.status = 'cancelled' THEN '訂單取消'
                    ELSE '狀態更新'
                END);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 建立觸發器
DROP TRIGGER IF EXISTS trigger_log_order_status_change ON orders;
CREATE TRIGGER trigger_log_order_status_change
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION log_order_status_change();

-- 9. 建立函數：自動分配最近的可用外送員
CREATE OR REPLACE FUNCTION assign_nearest_driver(order_lat NUMERIC, order_lng NUMERIC)
RETURNS INTEGER AS $$
DECLARE
    selected_driver_id INTEGER;
BEGIN
    -- 尋找最近的在線外送員
    SELECT d.id INTO selected_driver_id
    FROM drivers d
    WHERE d.status = 'online'
    ORDER BY 
        CASE 
            WHEN d.current_lat IS NOT NULL AND d.current_lng IS NOT NULL THEN
                SQRT(POWER(d.current_lat - order_lat, 2) + POWER(d.current_lng - order_lng, 2))
            ELSE 999999
        END
    LIMIT 1;
    
    -- 如果找到外送員，更新其狀態為忙碌
    IF selected_driver_id IS NOT NULL THEN
        UPDATE drivers 
        SET status = 'busy' 
        WHERE id = selected_driver_id;
    END IF;
    
    RETURN selected_driver_id;
END;
$$ LANGUAGE plpgsql;

-- 10. 建立視圖：完整的訂單詳情（包含外送員資訊）
CREATE OR REPLACE VIEW order_details_with_driver AS
SELECT 
    o.*,
    d.name as driver_name,
    d.phone as driver_phone,
    d.current_lat as driver_lat,
    d.current_lng as driver_lng,
    d.status as driver_status,
    u.line_user_id as customer_line_id,
    u.line_display_name as customer_display_name
FROM orders o
LEFT JOIN drivers d ON o.driver_id = d.id
LEFT JOIN users u ON o.contact_phone = u.phone;

-- 11. 建立視圖：外送員工作台
CREATE OR REPLACE VIEW driver_dashboard AS
SELECT 
    d.id as driver_id,
    d.name as driver_name,
    d.status as driver_status,
    COUNT(o.id) as active_orders,
    MAX(o.created_at) as latest_order_time
FROM drivers d
LEFT JOIN orders o ON d.id = o.driver_id AND o.status IN ('assigned', 'picked_up', 'delivering')
GROUP BY d.id, d.name, d.status;

-- 12. 插入訂單狀態定義（用於前端顯示）
CREATE TABLE IF NOT EXISTS order_status_definitions (
    status_code VARCHAR(20) PRIMARY KEY,
    display_name VARCHAR(50) NOT NULL,
    description TEXT,
    color_code VARCHAR(7), -- hex color
    icon VARCHAR(50),
    sort_order INTEGER
);

INSERT INTO order_status_definitions (status_code, display_name, description, color_code, icon, sort_order) VALUES
('placed', '已下單', '客戶已完成下單，等待確認', '#3498db', '📝', 1),
('confirmed', '已確認', '商店已確認訂單，準備配送', '#f39c12', '✅', 2),
('assigned', '已分配', '已分配外送員', '#9b59b6', '👤', 3),
('preparing', '準備中', '商品準備中', '#e67e22', '🔧', 4),
('picked_up', '已取貨', '外送員已取貨', '#2ecc71', '📦', 5),
('delivering', '配送中', '外送員配送中', '#27ae60', '🚚', 6),
('delivered', '已送達', '配送完成', '#16a085', '🎉', 7),
('cancelled', '已取消', '訂單已取消', '#e74c3c', '❌', 8)
ON CONFLICT (status_code) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    color_code = EXCLUDED.color_code,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order;

-- 13. 更新現有訂單的地理編碼狀態
UPDATE orders 
SET geocode_status = 'pending' 
WHERE lat IS NULL OR lng IS NULL;

-- 完成訊息
SELECT '🎉 資料庫升級完成！新增功能：' as message,
       '✅ 外送員管理系統' as feature1,
       '✅ 訂單狀態追蹤' as feature2,
       '✅ 即時通知系統' as feature3,
       '✅ 地理位置追蹤' as feature4;