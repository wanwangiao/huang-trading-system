-- ========================================
-- 智能路線規劃系統 - 資料庫Schema擴展
-- 版本：1.0
-- 日期：2025-08-19
-- ========================================

-- 啟用 PostGIS 地理擴展（如果尚未啟用）
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- 1. 路線群組表 (route_groups)
CREATE TABLE IF NOT EXISTS route_groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  driver_id INTEGER REFERENCES drivers(id),
  status VARCHAR(20) DEFAULT 'planning', -- planning|assigned|in_progress|completed|cancelled
  total_orders INTEGER DEFAULT 0,
  estimated_distance NUMERIC(10,2), -- 公里
  estimated_duration INTEGER, -- 分鐘
  optimized_sequence JSONB, -- 優化後的配送順序 JSON
  center_lat NUMERIC(10,8), -- 群組地理中心點
  center_lng NUMERIC(11,8),
  created_by VARCHAR(50) DEFAULT 'system', -- system|admin
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  assigned_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- 2. 訂單分組關聯表 (order_group_assignments)
CREATE TABLE IF NOT EXISTS order_group_assignments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  route_group_id INTEGER NOT NULL REFERENCES route_groups(id) ON DELETE CASCADE,
  sequence_order INTEGER NOT NULL DEFAULT 1,
  estimated_arrival_time TIMESTAMP,
  actual_arrival_time TIMESTAMP,
  distance_to_next NUMERIC(10,2), -- 到下一個點的距離（公里）
  duration_to_next INTEGER, -- 到下一個點的時間（分鐘）
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(order_id, route_group_id)
);

-- 3. 地理編碼快取表 (geocoding_cache)
CREATE TABLE IF NOT EXISTS geocoding_cache (
  id SERIAL PRIMARY KEY,
  address TEXT UNIQUE NOT NULL,
  lat NUMERIC(10,8) NOT NULL,
  lng NUMERIC(11,8) NOT NULL,
  formatted_address TEXT,
  place_id VARCHAR(255),
  address_components JSONB, -- Google Maps 地址組件
  geometry_type VARCHAR(50), -- 地理類型
  location_type VARCHAR(50), -- 精確度類型
  geocoded_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days'),
  hit_count INTEGER DEFAULT 0, -- 使用次數統計
  last_used_at TIMESTAMP DEFAULT NOW()
);

-- 4. 距離矩陣快取表 (distance_cache)
CREATE TABLE IF NOT EXISTS distance_cache (
  id SERIAL PRIMARY KEY,
  origin_lat NUMERIC(10,8) NOT NULL,
  origin_lng NUMERIC(11,8) NOT NULL,
  destination_lat NUMERIC(10,8) NOT NULL,
  destination_lng NUMERIC(11,8) NOT NULL,
  distance_meters INTEGER NOT NULL, -- 距離（公尺）
  duration_seconds INTEGER NOT NULL, -- 時間（秒）
  traffic_duration_seconds INTEGER, -- 考慮交通的時間
  distance_text VARCHAR(20), -- 格式化距離文字
  duration_text VARCHAR(20), -- 格式化時間文字
  travel_mode VARCHAR(20) DEFAULT 'driving', -- 交通方式
  cached_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days'),
  hit_count INTEGER DEFAULT 0,
  UNIQUE(origin_lat, origin_lng, destination_lat, destination_lng, travel_mode)
);

-- 5. 批次配送記錄表 (batch_deliveries)
CREATE TABLE IF NOT EXISTS batch_deliveries (
  id SERIAL PRIMARY KEY,
  route_group_id INTEGER NOT NULL REFERENCES route_groups(id),
  driver_id INTEGER NOT NULL REFERENCES drivers(id),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  total_distance NUMERIC(10,2), -- 實際配送距離
  total_duration INTEGER, -- 實際配送時間（分鐘）
  planned_distance NUMERIC(10,2), -- 計劃距離
  planned_duration INTEGER, -- 計劃時間
  delivery_efficiency NUMERIC(5,2), -- 效率評分 (0-100)
  fuel_cost NUMERIC(8,2), -- 燃料成本
  orders_delivered INTEGER DEFAULT 0,
  orders_failed INTEGER DEFAULT 0,
  customer_satisfaction NUMERIC(3,2), -- 客戶滿意度平均分
  notes TEXT,
  weather_conditions VARCHAR(50), -- 天氣狀況
  traffic_conditions VARCHAR(50), -- 交通狀況
  created_at TIMESTAMP DEFAULT NOW()
);

-- 6. 路線優化歷史表 (route_optimization_history)
CREATE TABLE IF NOT EXISTS route_optimization_history (
  id SERIAL PRIMARY KEY,
  route_group_id INTEGER REFERENCES route_groups(id),
  algorithm_used VARCHAR(50) NOT NULL, -- kmeans|tsp_2opt|genetic|simulated_annealing
  input_orders JSONB NOT NULL, -- 輸入訂單資料
  output_sequence JSONB NOT NULL, -- 輸出順序
  optimization_time_ms INTEGER, -- 優化耗時（毫秒）
  improvement_percentage NUMERIC(5,2), -- 改善百分比
  distance_before NUMERIC(10,2), -- 優化前距離
  distance_after NUMERIC(10,2), -- 優化後距離
  parameters JSONB, -- 演算法參數
  created_at TIMESTAMP DEFAULT NOW()
);

-- 7. 地理區域定義表 (delivery_zones)
CREATE TABLE IF NOT EXISTS delivery_zones (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  polygon_coordinates JSONB NOT NULL, -- 區域邊界多邊形座標
  center_lat NUMERIC(10,8),
  center_lng NUMERIC(11,8),
  delivery_fee NUMERIC(8,2), -- 該區域配送費
  min_order_amount NUMERIC(8,2), -- 最低訂單金額
  max_delivery_distance NUMERIC(6,2), -- 最大配送距離（公里）
  estimated_delivery_time INTEGER, -- 預估配送時間（分鐘）
  priority_level INTEGER DEFAULT 1, -- 優先級 1-5
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 8. 配送效率統計表 (delivery_efficiency_stats)
CREATE TABLE IF NOT EXISTS delivery_efficiency_stats (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  driver_id INTEGER REFERENCES drivers(id),
  total_deliveries INTEGER DEFAULT 0,
  total_distance NUMERIC(10,2) DEFAULT 0,
  total_duration INTEGER DEFAULT 0,
  average_delivery_time NUMERIC(8,2), -- 平均每單配送時間
  fuel_efficiency NUMERIC(8,2), -- 燃料效率（公里/公升）
  customer_satisfaction NUMERIC(3,2), -- 客戶滿意度
  on_time_delivery_rate NUMERIC(5,2), -- 準時配送率
  route_optimization_score NUMERIC(5,2), -- 路線優化評分
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(date, driver_id)
);

-- ==========================================
-- 建立索引以提升查詢效能
-- ==========================================

-- 路線群組相關索引
CREATE INDEX IF NOT EXISTS idx_route_groups_status ON route_groups(status);
CREATE INDEX IF NOT EXISTS idx_route_groups_driver ON route_groups(driver_id);
CREATE INDEX IF NOT EXISTS idx_route_groups_created ON route_groups(created_at);
CREATE INDEX IF NOT EXISTS idx_route_groups_location ON route_groups(center_lat, center_lng);

-- 訂單分組關聯索引
CREATE INDEX IF NOT EXISTS idx_order_assignments_order ON order_group_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_assignments_group ON order_group_assignments(route_group_id);
CREATE INDEX IF NOT EXISTS idx_order_assignments_sequence ON order_group_assignments(route_group_id, sequence_order);

-- 地理編碼快取索引
CREATE INDEX IF NOT EXISTS idx_geocoding_address ON geocoding_cache(address);
CREATE INDEX IF NOT EXISTS idx_geocoding_location ON geocoding_cache(lat, lng);
CREATE INDEX IF NOT EXISTS idx_geocoding_expires ON geocoding_cache(expires_at);

-- 距離快取索引
CREATE INDEX IF NOT EXISTS idx_distance_origin ON distance_cache(origin_lat, origin_lng);
CREATE INDEX IF NOT EXISTS idx_distance_destination ON distance_cache(destination_lat, destination_lng);
CREATE INDEX IF NOT EXISTS idx_distance_expires ON distance_cache(expires_at);

-- 批次配送記錄索引
CREATE INDEX IF NOT EXISTS idx_batch_deliveries_driver ON batch_deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_batch_deliveries_group ON batch_deliveries(route_group_id);
CREATE INDEX IF NOT EXISTS idx_batch_deliveries_date ON batch_deliveries(DATE(started_at));

-- 配送效率統計索引
CREATE INDEX IF NOT EXISTS idx_efficiency_stats_date ON delivery_efficiency_stats(date);
CREATE INDEX IF NOT EXISTS idx_efficiency_stats_driver ON delivery_efficiency_stats(driver_id);

-- ==========================================
-- 地理空間索引（PostGIS）
-- ==========================================

-- 為訂單表添加地理欄位（如果不存在）
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS location GEOMETRY(POINT, 4326);

-- 更新現有訂單的地理位置
UPDATE orders 
SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326) 
WHERE lat IS NOT NULL AND lng IS NOT NULL AND location IS NULL;

-- 創建地理空間索引
CREATE INDEX IF NOT EXISTS idx_orders_location_gis ON orders USING GIST (location);

-- 為路線群組添加地理欄位
ALTER TABLE route_groups 
ADD COLUMN IF NOT EXISTS center_location GEOMETRY(POINT, 4326);

-- 創建路線群組地理索引
CREATE INDEX IF NOT EXISTS idx_route_groups_location_gis ON route_groups USING GIST (center_location);

-- ==========================================
-- 建立實用的視圖
-- ==========================================

-- 1. 完整的路線群組資訊視圖
CREATE OR REPLACE VIEW route_group_details AS
SELECT 
    rg.*,
    d.name as driver_name,
    d.phone as driver_phone,
    d.status as driver_status,
    COUNT(oga.order_id) as actual_order_count,
    AVG(o.total) as average_order_value,
    SUM(o.total) as total_order_value,
    STRING_AGG(o.contact_name, ', ' ORDER BY oga.sequence_order) as customer_names
FROM route_groups rg
LEFT JOIN drivers d ON rg.driver_id = d.id
LEFT JOIN order_group_assignments oga ON rg.id = oga.route_group_id
LEFT JOIN orders o ON oga.order_id = o.id
GROUP BY rg.id, d.id, d.name, d.phone, d.status;

-- 2. 配送效率儀表板視圖
CREATE OR REPLACE VIEW delivery_dashboard AS
SELECT 
    d.id as driver_id,
    d.name as driver_name,
    COUNT(bd.id) as total_batches_today,
    COALESCE(SUM(bd.orders_delivered), 0) as orders_delivered_today,
    COALESCE(AVG(bd.delivery_efficiency), 0) as avg_efficiency,
    COALESCE(SUM(bd.total_distance), 0) as total_distance_today,
    COALESCE(AVG(bd.customer_satisfaction), 0) as avg_satisfaction,
    COUNT(rg.id) FILTER (WHERE rg.status = 'assigned') as pending_routes
FROM drivers d
LEFT JOIN batch_deliveries bd ON d.id = bd.driver_id 
    AND DATE(bd.started_at) = CURRENT_DATE
LEFT JOIN route_groups rg ON d.id = rg.driver_id 
    AND rg.status = 'assigned'
WHERE d.status != 'inactive'
GROUP BY d.id, d.name;

-- 3. 訂單地理分佈分析視圖
CREATE OR REPLACE VIEW order_geographic_analysis AS
SELECT 
    DATE(o.created_at) as order_date,
    COUNT(*) as total_orders,
    AVG(ST_X(o.location)) as avg_lng,
    AVG(ST_Y(o.location)) as avg_lat,
    ST_Extent(o.location) as bounding_box,
    COUNT(*) FILTER (WHERE rg.id IS NOT NULL) as grouped_orders,
    COUNT(*) FILTER (WHERE rg.id IS NULL) as ungrouped_orders
FROM orders o
LEFT JOIN order_group_assignments oga ON o.id = oga.order_id
LEFT JOIN route_groups rg ON oga.route_group_id = rg.id
WHERE o.location IS NOT NULL
GROUP BY DATE(o.created_at);

-- ==========================================
-- 建立觸發器和函數
-- ==========================================

-- 1. 自動更新路線群組統計的觸發器函數
CREATE OR REPLACE FUNCTION update_route_group_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- 當訂單加入或離開群組時，更新群組統計
    IF TG_OP = 'INSERT' THEN
        UPDATE route_groups 
        SET 
            total_orders = (SELECT COUNT(*) FROM order_group_assignments WHERE route_group_id = NEW.route_group_id),
            updated_at = NOW()
        WHERE id = NEW.route_group_id;
        
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE route_groups 
        SET 
            total_orders = (SELECT COUNT(*) FROM order_group_assignments WHERE route_group_id = OLD.route_group_id),
            updated_at = NOW()
        WHERE id = OLD.route_group_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 建立觸發器
DROP TRIGGER IF EXISTS trigger_update_route_group_stats ON order_group_assignments;
CREATE TRIGGER trigger_update_route_group_stats
    AFTER INSERT OR DELETE ON order_group_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_route_group_stats();

-- 2. 自動更新訂單地理位置的觸發器函數
CREATE OR REPLACE FUNCTION update_order_location()
RETURNS TRIGGER AS $$
BEGIN
    -- 當經緯度更新時，自動更新地理位置欄位
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.location = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 建立觸發器
DROP TRIGGER IF EXISTS trigger_update_order_location ON orders;
CREATE TRIGGER trigger_update_order_location
    BEFORE INSERT OR UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_order_location();

-- 3. 地理編碼快取清理函數
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
    -- 清理過期的地理編碼快取
    DELETE FROM geocoding_cache WHERE expires_at < NOW();
    
    -- 清理過期的距離快取
    DELETE FROM distance_cache WHERE expires_at < NOW();
    
    -- 記錄清理日誌
    INSERT INTO system_logs (type, message, created_at)
    VALUES ('cache_cleanup', '已清理過期的地理編碼和距離快取', NOW());
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 插入初始資料
-- ==========================================

-- 插入配送區域範例資料
INSERT INTO delivery_zones (name, description, polygon_coordinates, center_lat, center_lng, delivery_fee) VALUES
('三峽區', '新北市三峽區配送範圍', 
 '[{"lat": 24.9200, "lng": 121.3500}, {"lat": 24.9200, "lng": 121.3800}, {"lat": 24.9500, "lng": 121.3800}, {"lat": 24.9500, "lng": 121.3500}]',
 24.9350, 121.3650, 50),
('樹林區', '新北市樹林區配送範圍',
 '[{"lat": 24.9800, "lng": 121.4000}, {"lat": 24.9800, "lng": 121.4300}, {"lat": 25.0100, "lng": 121.4300}, {"lat": 25.0100, "lng": 121.4000}]',
 24.9950, 121.4150, 60)
ON CONFLICT (name) DO NOTHING;

-- 插入路線群組狀態定義
CREATE TABLE IF NOT EXISTS route_status_definitions (
    status_code VARCHAR(20) PRIMARY KEY,
    display_name VARCHAR(50) NOT NULL,
    description TEXT,
    color_code VARCHAR(7),
    icon VARCHAR(50),
    sort_order INTEGER
);

INSERT INTO route_status_definitions (status_code, display_name, description, color_code, icon, sort_order) VALUES
('planning', '規劃中', '正在進行路線規劃和優化', '#3498db', '📋', 1),
('assigned', '已分配', '已分配給外送員但尚未開始', '#f39c12', '👤', 2),
('in_progress', '配送中', '外送員正在執行此路線', '#e67e22', '🚚', 3),
('completed', '已完成', '所有訂單已配送完成', '#2ecc71', '✅', 4),
('cancelled', '已取消', '路線已被取消', '#e74c3c', '❌', 5)
ON CONFLICT (status_code) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    color_code = EXCLUDED.color_code,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order;

-- ==========================================
-- 完成訊息
-- ==========================================
SELECT 
    '🎉 智能路線規劃系統資料庫架構建置完成！' as message,
    '✅ 新增 8 個主要資料表' as feature1,
    '✅ 建立完整索引系統' as feature2,
    '✅ 整合 PostGIS 地理功能' as feature3,
    '✅ 建立實用視圖和觸發器' as feature4,
    '✅ 支援智能分組與路線優化' as feature5;