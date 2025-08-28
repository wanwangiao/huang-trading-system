-- =====================================
-- GPS 即時追蹤系統 - 資料庫結構
-- 包含外送員管理、位置追蹤、路線記錄等功能
-- =====================================

-- 1. 外送員資料表
CREATE TABLE IF NOT EXISTS drivers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(100),
    password_hash VARCHAR(255),
    vehicle_type VARCHAR(50) DEFAULT 'scooter', -- scooter, bicycle, car, motorcycle
    license_plate VARCHAR(20),
    rating NUMERIC(3,2) DEFAULT 0.00,
    total_deliveries INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'offline', -- offline, online, busy, delivering
    current_lat NUMERIC(10,7),
    current_lng NUMERIC(10,7),
    last_location_update TIMESTAMP,
    tracking_order_id INTEGER, -- 當前正在追蹤的訂單ID
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 約束條件
    CONSTRAINT drivers_status_check CHECK (status IN ('offline', 'online', 'busy', 'delivering')),
    CONSTRAINT drivers_vehicle_type_check CHECK (vehicle_type IN ('scooter', 'bicycle', 'car', 'motorcycle')),
    CONSTRAINT drivers_rating_check CHECK (rating >= 0 AND rating <= 5)
);

-- 2. 外送員位置歷史記錄表
CREATE TABLE IF NOT EXISTS driver_location_history (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    lat NUMERIC(10,7) NOT NULL,
    lng NUMERIC(10,7) NOT NULL,
    accuracy NUMERIC(8,2), -- GPS精確度（公尺）
    speed NUMERIC(8,2), -- 速度（公里/小時）
    heading NUMERIC(6,2), -- 方向角度（0-360度）
    order_id INTEGER, -- 關聯的訂單ID
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 索引優化
    INDEX idx_driver_location_driver_time (driver_id, recorded_at DESC),
    INDEX idx_driver_location_order (order_id),
    INDEX idx_driver_location_time (recorded_at DESC)
);

-- 3. GPS追蹤會話表
CREATE TABLE IF NOT EXISTS tracking_sessions (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    order_id INTEGER NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active', -- active, completed, cancelled
    total_distance_km NUMERIC(8,3), -- 總行駛距離（公里）
    average_speed_kmh NUMERIC(6,2), -- 平均速度（公里/小時）
    location_points_count INTEGER DEFAULT 0, -- 位置點數量
    
    -- 約束條件
    CONSTRAINT tracking_sessions_status_check CHECK (status IN ('active', 'completed', 'cancelled')),
    
    -- 索引
    INDEX idx_tracking_sessions_driver (driver_id),
    INDEX idx_tracking_sessions_order (order_id),
    INDEX idx_tracking_sessions_active (status) WHERE status = 'active'
);

-- 4. 地理編碼快取表（提升地址解析性能）
CREATE TABLE IF NOT EXISTS geocoding_cache (
    id SERIAL PRIMARY KEY,
    address TEXT NOT NULL UNIQUE,
    lat NUMERIC(10,7) NOT NULL,
    lng NUMERIC(10,7) NOT NULL,
    formatted_address TEXT,
    place_id VARCHAR(255),
    address_components JSONB,
    geometry_type VARCHAR(50),
    location_type JSONB,
    hit_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 索引
    INDEX idx_geocoding_cache_expires (expires_at),
    INDEX idx_geocoding_cache_coords (lat, lng)
);

-- 5. 配送路線表
CREATE TABLE IF NOT EXISTS delivery_routes (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    order_ids INTEGER[] NOT NULL, -- 訂單ID陣列
    start_lat NUMERIC(10,7) NOT NULL,
    start_lng NUMERIC(10,7) NOT NULL,
    waypoints JSONB, -- 途徑點座標 [{lat: x, lng: y}, ...]
    optimized_order INTEGER[], -- 最佳化後的訂單順序
    total_distance_km NUMERIC(8,3),
    estimated_duration_minutes INTEGER,
    actual_duration_minutes INTEGER,
    polyline_data TEXT, -- Google Maps 路線編碼
    status VARCHAR(20) DEFAULT 'planned', -- planned, active, completed, cancelled
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- 約束條件
    CONSTRAINT delivery_routes_status_check CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
    
    -- 索引
    INDEX idx_delivery_routes_driver_status (driver_id, status),
    INDEX idx_delivery_routes_created (created_at DESC)
);

-- 6. 更新現有orders表格，添加GPS相關欄位
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_id INTEGER REFERENCES drivers(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_time TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS formatted_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC(8,3);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_delivery_time_minutes INTEGER;

-- 7. 創建GPS追蹤相關的資料庫函數

-- 7.1 更新外送員位置的函數
CREATE OR REPLACE FUNCTION update_driver_location(
    p_driver_id INTEGER,
    p_lat NUMERIC(10,7),
    p_lng NUMERIC(10,7),
    p_accuracy NUMERIC(8,2) DEFAULT NULL,
    p_speed NUMERIC(8,2) DEFAULT NULL,
    p_heading NUMERIC(6,2) DEFAULT NULL,
    p_order_id INTEGER DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
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
    INSERT INTO driver_location_history 
        (driver_id, lat, lng, accuracy, speed, heading, order_id)
    VALUES 
        (p_driver_id, p_lat, p_lng, p_accuracy, p_speed, p_heading, p_order_id);
    
    -- 如果位置記錄太多，清理舊資料（保留最近1000條）
    DELETE FROM driver_location_history 
    WHERE driver_id = p_driver_id 
    AND id NOT IN (
        SELECT id FROM driver_location_history 
        WHERE driver_id = p_driver_id 
        ORDER BY recorded_at DESC 
        LIMIT 1000
    );
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$;

-- 7.2 計算兩點間距離的函數（Haversine公式）
CREATE OR REPLACE FUNCTION calculate_distance_km(
    lat1 NUMERIC(10,7),
    lng1 NUMERIC(10,7),
    lat2 NUMERIC(10,7),
    lng2 NUMERIC(10,7)
) RETURNS NUMERIC(8,3)
LANGUAGE plpgsql
AS $$
DECLARE
    R CONSTANT NUMERIC := 6371; -- 地球半徑（公里）
    dLat NUMERIC;
    dLng NUMERIC;
    a NUMERIC;
    c NUMERIC;
BEGIN
    dLat := RADIANS(lat2 - lat1);
    dLng := RADIANS(lng2 - lng1);
    
    a := SIN(dLat/2) * SIN(dLat/2) + 
         COS(RADIANS(lat1)) * COS(RADIANS(lat2)) * 
         SIN(dLng/2) * SIN(dLng/2);
    
    c := 2 * ATAN2(SQRT(a), SQRT(1-a));
    
    RETURN ROUND((R * c)::NUMERIC, 3);
END;
$$;

-- 7.3 獲取附近外送員的函數
CREATE OR REPLACE FUNCTION get_nearby_drivers(
    p_lat NUMERIC(10,7),
    p_lng NUMERIC(10,7),
    p_radius_km NUMERIC(8,3) DEFAULT 5.0,
    p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
    driver_id INTEGER,
    driver_name VARCHAR(100),
    phone VARCHAR(20),
    vehicle_type VARCHAR(50),
    rating NUMERIC(3,2),
    distance_km NUMERIC(8,3),
    last_update_minutes INTEGER
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.name,
        d.phone,
        d.vehicle_type,
        d.rating,
        calculate_distance_km(d.current_lat, d.current_lng, p_lat, p_lng) AS distance_km,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - d.last_location_update))::INTEGER / 60 AS last_update_minutes
    FROM drivers d
    WHERE 
        d.status IN ('online', 'available')
        AND d.current_lat IS NOT NULL 
        AND d.current_lng IS NOT NULL
        AND d.last_location_update > CURRENT_TIMESTAMP - INTERVAL '10 minutes'
        AND calculate_distance_km(d.current_lat, d.current_lng, p_lat, p_lng) <= p_radius_km
    ORDER BY distance_km ASC, d.rating DESC
    LIMIT p_limit;
END;
$$;

-- 8. 創建觸發器自動更新時間戳

-- 8.1 drivers表更新時間戳觸發器
CREATE OR REPLACE FUNCTION update_drivers_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_drivers_timestamp
    BEFORE UPDATE ON drivers
    FOR EACH ROW
    EXECUTE FUNCTION update_drivers_timestamp();

-- 9. 創建有用的視圖

-- 9.1 外送員狀態摘要視圖
CREATE OR REPLACE VIEW driver_status_summary AS
SELECT 
    d.id,
    d.name,
    d.phone,
    d.status,
    d.vehicle_type,
    d.current_lat,
    d.current_lng,
    d.last_location_update,
    d.rating,
    d.total_deliveries,
    o.id AS current_order_id,
    o.contact_name AS current_customer,
    o.address AS delivery_address,
    CASE 
        WHEN d.last_location_update IS NULL THEN NULL
        WHEN d.last_location_update < CURRENT_TIMESTAMP - INTERVAL '5 minutes' THEN 'stale'
        WHEN d.last_location_update < CURRENT_TIMESTAMP - INTERVAL '1 minute' THEN 'old'
        ELSE 'fresh'
    END AS location_freshness
FROM drivers d
LEFT JOIN orders o ON o.driver_id = d.id AND o.status IN ('assigned', 'picked_up', 'delivering');

-- 9.2 即時追蹤摘要視圖
CREATE OR REPLACE VIEW active_tracking_summary AS
SELECT 
    ts.id AS session_id,
    ts.driver_id,
    d.name AS driver_name,
    d.phone AS driver_phone,
    ts.order_id,
    o.contact_name,
    o.contact_phone,
    o.address,
    ts.started_at,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ts.started_at))::INTEGER / 60 AS tracking_minutes,
    ts.location_points_count,
    d.current_lat,
    d.current_lng,
    d.last_location_update
FROM tracking_sessions ts
JOIN drivers d ON ts.driver_id = d.id
LEFT JOIN orders o ON ts.order_id = o.id
WHERE ts.status = 'active';

-- 10. 插入測試外送員資料
INSERT INTO drivers (name, phone, password_hash, vehicle_type, status) VALUES
('李大明', '0912345678', 'driver123', 'scooter', 'online'),
('王小華', '0923456789', 'driver123', 'motorcycle', 'online'),
('張志偉', '0934567890', 'driver123', 'bicycle', 'offline')
ON CONFLICT (phone) DO NOTHING;

-- 11. 創建性能優化索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_driver_status ON orders(driver_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_drivers_status_location ON drivers(status, last_location_update DESC) WHERE status IN ('online', 'busy', 'delivering');

-- 12. 設置定期清理作業（需要pg_cron擴展）
-- 此部分在production環境中執行，清理過期的位置歷史記錄

-- 清理超過30天的位置歷史記錄
-- SELECT cron.schedule('cleanup-old-locations', '0 2 * * *', 'DELETE FROM driver_location_history WHERE recorded_at < CURRENT_TIMESTAMP - INTERVAL ''30 days'';');

-- 清理過期的地理編碼快取
-- SELECT cron.schedule('cleanup-expired-geocache', '0 3 * * *', 'DELETE FROM geocoding_cache WHERE expires_at < CURRENT_TIMESTAMP;');

-- =====================================
-- GPS追蹤系統資料庫結構設置完成
-- =====================================

-- 執行後請驗證：
-- SELECT COUNT(*) FROM drivers;
-- SELECT COUNT(*) FROM driver_location_history;
-- SELECT * FROM driver_status_summary;

COMMENT ON TABLE drivers IS '外送員基本資料表';
COMMENT ON TABLE driver_location_history IS '外送員位置歷史記錄表，用於GPS追蹤';
COMMENT ON TABLE tracking_sessions IS 'GPS追蹤會話表，記錄每次追蹤的詳細資訊';
COMMENT ON TABLE geocoding_cache IS '地理編碼快取表，提升地址解析性能';
COMMENT ON TABLE delivery_routes IS '配送路線表，記錄優化後的配送路線';

-- 創建成功！GPS即時追蹤系統資料庫已就緒 🚀