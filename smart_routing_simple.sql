-- ==========================================
-- 智能路線規劃系統 - 簡化版Schema
-- 適用於 PostgreSQL (Supabase)
-- ==========================================

-- 啟用PostGIS擴展
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. 路線群組表
CREATE TABLE IF NOT EXISTS route_groups (
    id BIGSERIAL PRIMARY KEY,
    group_name VARCHAR(100) NOT NULL,
    color_code VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    driver_id BIGINT,
    
    -- 路線資訊
    estimated_distance_km DECIMAL(8,2),
    estimated_duration_minutes INTEGER,
    total_orders INTEGER DEFAULT 0,
    
    -- 時間記錄
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- 約束
    CONSTRAINT valid_status CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
    CONSTRAINT valid_color_code CHECK (color_code ~ '^#[0-9A-Fa-f]{6}$')
);

-- 2. 訂單群組關聯表
CREATE TABLE IF NOT EXISTS order_group_assignments (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL,
    group_id BIGINT NOT NULL,
    sequence_order INTEGER NOT NULL DEFAULT 1,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(order_id, group_id),
    FOREIGN KEY (group_id) REFERENCES route_groups(id) ON DELETE CASCADE
);

-- 3. 地理編碼快取表
CREATE TABLE IF NOT EXISTS geocoding_cache (
    id BIGSERIAL PRIMARY KEY,
    address_hash VARCHAR(64) NOT NULL UNIQUE,
    original_address TEXT NOT NULL,
    formatted_address TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    location_point GEOGRAPHY(POINT, 4326),
    geocoding_source VARCHAR(20) DEFAULT 'google_maps',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days'
);

-- 4. 距離快取表
CREATE TABLE IF NOT EXISTS distance_cache (
    id BIGSERIAL PRIMARY KEY,
    origin_hash VARCHAR(64) NOT NULL,
    destination_hash VARCHAR(64) NOT NULL,
    distance_meters INTEGER,
    duration_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days',
    
    UNIQUE(origin_hash, destination_hash)
);

-- 5. 批次配送記錄表
CREATE TABLE IF NOT EXISTS batch_deliveries (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL,
    driver_id BIGINT NOT NULL,
    batch_type VARCHAR(20) DEFAULT 'regular',
    
    -- 配送統計
    total_orders INTEGER NOT NULL,
    completed_orders INTEGER DEFAULT 0,
    total_distance_km DECIMAL(8,2),
    total_duration_minutes INTEGER,
    
    -- 時間記錄
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    FOREIGN KEY (group_id) REFERENCES route_groups(id) ON DELETE CASCADE
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_route_groups_status ON route_groups(status);
CREATE INDEX IF NOT EXISTS idx_route_groups_driver_id ON route_groups(driver_id);
CREATE INDEX IF NOT EXISTS idx_order_group_assignments_order_id ON order_group_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_group_assignments_group_id ON order_group_assignments(group_id);
CREATE INDEX IF NOT EXISTS idx_geocoding_cache_address ON geocoding_cache(address_hash);
CREATE INDEX IF NOT EXISTS idx_distance_cache_lookup ON distance_cache(origin_hash, destination_hash);

-- 建立地理空間索引
CREATE INDEX IF NOT EXISTS idx_geocoding_cache_location ON geocoding_cache USING GIST(location_point);

-- 更新時間觸發器函數
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 為route_groups表建立更新觸發器
CREATE TRIGGER update_route_groups_updated_at 
    BEFORE UPDATE ON route_groups 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 建立有用的視圖
CREATE OR REPLACE VIEW route_group_overview AS
SELECT 
    rg.id,
    rg.group_name,
    rg.color_code,
    rg.status,
    rg.driver_id,
    rg.total_orders,
    rg.estimated_distance_km,
    rg.estimated_duration_minutes,
    COUNT(oga.order_id) as actual_order_count,
    rg.created_at,
    rg.assigned_at
FROM route_groups rg
LEFT JOIN order_group_assignments oga ON rg.id = oga.group_id
GROUP BY rg.id, rg.group_name, rg.color_code, rg.status, rg.driver_id, 
         rg.total_orders, rg.estimated_distance_km, rg.estimated_duration_minutes,
         rg.created_at, rg.assigned_at;

COMMENT ON TABLE route_groups IS '路線群組管理表，支援顏色標示和狀態追蹤';
COMMENT ON TABLE order_group_assignments IS '訂單與路線群組的關聯表，支援拖拉排序';
COMMENT ON TABLE geocoding_cache IS 'Google Maps地理編碼結果快取表';
COMMENT ON TABLE distance_cache IS '距離和時間計算結果快取表';
COMMENT ON TABLE batch_deliveries IS '批次配送記錄和統計表';