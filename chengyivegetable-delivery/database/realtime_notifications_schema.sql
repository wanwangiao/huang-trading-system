-- 即時通知系統資料庫擴展
-- 新增支援訂單狀態追蹤和外送員位置管理

-- 外送員管理表
CREATE TABLE IF NOT EXISTS drivers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL UNIQUE,
  email VARCHAR(100),
  license_number VARCHAR(50),
  vehicle_type VARCHAR(50) DEFAULT 'scooter', -- scooter, bicycle, car
  status VARCHAR(20) DEFAULT 'offline', -- online, offline, busy, unavailable
  current_lat NUMERIC(10, 8),
  current_lng NUMERIC(11, 8),
  last_location_update TIMESTAMP,
  rating NUMERIC(3, 2) DEFAULT 5.0,
  total_orders INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 訂單狀態歷史表
CREATE TABLE IF NOT EXISTS order_status_history (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  old_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  changed_by VARCHAR(100), -- 變更者 (系統/管理員/外送員)
  changed_by_id INTEGER, -- 變更者ID
  notes TEXT,
  estimated_delivery_time TIMESTAMP,
  actual_delivery_time TIMESTAMP,
  location_lat NUMERIC(10, 8),
  location_lng NUMERIC(11, 8),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 外送員位置歷史表
CREATE TABLE IF NOT EXISTS driver_location_history (
  id SERIAL PRIMARY KEY,
  driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  lat NUMERIC(10, 8) NOT NULL,
  lng NUMERIC(11, 8) NOT NULL,
  accuracy NUMERIC(5, 2), -- GPS精度(公尺)
  speed NUMERIC(5, 2), -- 速度(km/h)
  heading NUMERIC(5, 2), -- 方向角度
  order_id INTEGER REFERENCES orders(id), -- 關聯的訂單ID
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 訂單外送員分配表
CREATE TABLE IF NOT EXISTS order_driver_assignments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP,
  started_delivery_at TIMESTAMP,
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  cancellation_reason TEXT,
  estimated_pickup_time TIMESTAMP,
  actual_pickup_time TIMESTAMP,
  estimated_delivery_time TIMESTAMP,
  actual_delivery_time TIMESTAMP,
  status VARCHAR(50) DEFAULT 'assigned', -- assigned, accepted, picked_up, delivering, completed, cancelled
  UNIQUE(order_id, driver_id, assigned_at)
);

-- 即時通知記錄表
CREATE TABLE IF NOT EXISTS notification_logs (
  id SERIAL PRIMARY KEY,
  notification_type VARCHAR(50) NOT NULL, -- order_update, driver_location, system_notification
  target_type VARCHAR(50) NOT NULL, -- customer, driver, admin, all
  target_id VARCHAR(100), -- 目標用戶ID
  order_id INTEGER REFERENCES orders(id),
  driver_id INTEGER REFERENCES drivers(id),
  title VARCHAR(200),
  message TEXT NOT NULL,
  data JSONB, -- 額外的通知資料
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivery_status VARCHAR(20) DEFAULT 'sent', -- sent, delivered, failed
  delivery_attempts INTEGER DEFAULT 1
);

-- 更新現有的orders表，增加更多狀態欄位
DO $$
BEGIN
  -- 檢查並新增欄位
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'driver_id') THEN
    ALTER TABLE orders ADD COLUMN driver_id INTEGER REFERENCES drivers(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'estimated_pickup_time') THEN
    ALTER TABLE orders ADD COLUMN estimated_pickup_time TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'actual_pickup_time') THEN
    ALTER TABLE orders ADD COLUMN actual_pickup_time TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'estimated_delivery_time') THEN
    ALTER TABLE orders ADD COLUMN estimated_delivery_time TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'actual_delivery_time') THEN
    ALTER TABLE orders ADD COLUMN actual_delivery_time TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'priority') THEN
    ALTER TABLE orders ADD COLUMN priority INTEGER DEFAULT 1; -- 1=低, 2=中, 3=高
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'customer_notes') THEN
    ALTER TABLE orders ADD COLUMN customer_notes TEXT; -- 客戶備註
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'driver_notes') THEN
    ALTER TABLE orders ADD COLUMN driver_notes TEXT; -- 外送員備註
  END IF;
END
$$;

-- 建立索引以提高查詢效能
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_location ON drivers(current_lat, current_lng);
CREATE INDEX IF NOT EXISTS idx_drivers_last_update ON drivers(last_location_update);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_created_at ON order_status_history(created_at);

CREATE INDEX IF NOT EXISTS idx_driver_location_history_driver_id ON driver_location_history(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_location_history_recorded_at ON driver_location_history(recorded_at);
CREATE INDEX IF NOT EXISTS idx_driver_location_history_order_id ON driver_location_history(order_id);

CREATE INDEX IF NOT EXISTS idx_order_assignments_order_id ON order_driver_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_assignments_driver_id ON order_driver_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_order_assignments_status ON order_driver_assignments(status);

CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_logs_target ON notification_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_sent_at ON notification_logs(sent_at);

CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_estimated_delivery ON orders(estimated_delivery_time);

-- 建立觸發器函數以自動記錄狀態變更
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- 當訂單狀態變更時，自動記錄到歷史表
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO order_status_history (
      order_id, 
      old_status, 
      new_status, 
      changed_by,
      estimated_delivery_time,
      actual_delivery_time
    ) VALUES (
      NEW.id, 
      OLD.status, 
      NEW.status, 
      'system',
      NEW.estimated_delivery_time,
      NEW.actual_delivery_time
    );
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

-- 建立函數以更新外送員位置
CREATE OR REPLACE FUNCTION update_driver_location(
  p_driver_id INTEGER,
  p_lat NUMERIC,
  p_lng NUMERIC,
  p_accuracy NUMERIC DEFAULT NULL,
  p_speed NUMERIC DEFAULT NULL,
  p_heading NUMERIC DEFAULT NULL,
  p_order_id INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  -- 更新外送員當前位置
  UPDATE drivers 
  SET 
    current_lat = p_lat,
    current_lng = p_lng,
    last_location_update = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_driver_id;
  
  -- 記錄位置歷史
  INSERT INTO driver_location_history (
    driver_id, lat, lng, accuracy, speed, heading, order_id
  ) VALUES (
    p_driver_id, p_lat, p_lng, p_accuracy, p_speed, p_heading, p_order_id
  );
END;
$$ LANGUAGE plpgsql;

-- 建立函數以計算預計送達時間
CREATE OR REPLACE FUNCTION calculate_estimated_delivery_time(
  p_order_id INTEGER,
  p_driver_id INTEGER DEFAULT NULL
)
RETURNS TIMESTAMP AS $$
DECLARE
  base_time INTERVAL := INTERVAL '30 minutes'; -- 基礎配送時間
  order_lat NUMERIC;
  order_lng NUMERIC;
  driver_lat NUMERIC;
  driver_lng NUMERIC;
  distance_km NUMERIC;
  additional_time INTERVAL;
BEGIN
  -- 獲取訂單位置
  SELECT lat, lng INTO order_lat, order_lng
  FROM orders WHERE id = p_order_id;
  
  -- 如果有指定外送員，計算從外送員當前位置的距離
  IF p_driver_id IS NOT NULL THEN
    SELECT current_lat, current_lng INTO driver_lat, driver_lng
    FROM drivers WHERE id = p_driver_id;
    
    -- 簡單的距離計算 (實際應用中應使用更精確的地理計算)
    IF driver_lat IS NOT NULL AND driver_lng IS NOT NULL 
       AND order_lat IS NOT NULL AND order_lng IS NOT NULL THEN
      distance_km := SQRT(
        POWER((order_lat - driver_lat) * 111.0, 2) + 
        POWER((order_lng - driver_lng) * 111.0 * COS(RADIANS(order_lat)), 2)
      );
      
      -- 根據距離調整時間 (假設平均速度 20km/h)
      additional_time := (distance_km / 20.0) * INTERVAL '1 hour';
      base_time := base_time + additional_time;
    END IF;
  END IF;
  
  RETURN CURRENT_TIMESTAMP + base_time;
END;
$$ LANGUAGE plpgsql;

-- 插入測試外送員資料
INSERT INTO drivers (name, phone, email, vehicle_type, status) VALUES 
('張小明', '0912345678', 'ming@example.com', 'scooter', 'online'),
('李小華', '0923456789', 'hua@example.com', 'bicycle', 'online'),
('王小強', '0934567890', 'qiang@example.com', 'scooter', 'offline')
ON CONFLICT (phone) DO NOTHING;

-- 建立系統設定表用於通知配置
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入通知相關設定
INSERT INTO system_settings (setting_key, setting_value, description) VALUES 
('notification_enabled', 'true', '是否啟用即時通知'),
('heartbeat_interval', '30', '心跳包發送間隔(秒)'),
('location_update_interval', '10', '位置更新間隔(秒)'),
('max_connections_per_user', '5', '每個用戶最大連接數')
ON CONFLICT (setting_key) DO UPDATE SET 
  setting_value = EXCLUDED.setting_value,
  updated_at = CURRENT_TIMESTAMP;