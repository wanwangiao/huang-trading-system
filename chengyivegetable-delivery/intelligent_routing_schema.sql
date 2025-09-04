-- ==========================================
-- 智能路線規劃系統 - 資料庫Schema
-- 建立日期: 2025-08-19
-- 資料庫: PostgreSQL (Supabase)
-- 描述: 支援路線群組管理、地理快取、批次配送的完整資料庫架構
-- ==========================================

-- 啟用PostGIS擴展（地理空間功能）
CREATE EXTENSION IF NOT EXISTS postgis;

-- ==========================================
-- 1. 路線群組表 (route_groups)
-- 描述: 管理訂單分組，支援顏色標示和路線規劃
-- ==========================================
CREATE TABLE route_groups (
    id BIGSERIAL PRIMARY KEY,
    group_name VARCHAR(100) NOT NULL, -- 群組名稱
    color_code VARCHAR(7) NOT NULL DEFAULT '#3B82F6', -- 群組顏色 (HEX色碼)
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 狀態: pending/assigned/in_progress/completed/cancelled
    driver_id BIGINT, -- 分配的外送員ID
    
    -- 路線資訊
    estimated_distance_km DECIMAL(8,2), -- 預估總距離(公里)
    estimated_duration_minutes INTEGER, -- 預估總時間(分鐘)
    total_orders INTEGER DEFAULT 0, -- 訂單總數
    
    -- 地理資訊
    start_location GEOGRAPHY(POINT, 4326), -- 起始位置
    start_address TEXT, -- 起始地址
    
    -- 時間記錄
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_at TIMESTAMP WITH TIME ZONE, -- 分配時間
    started_at TIMESTAMP WITH TIME ZONE, -- 開始配送時間
    completed_at TIMESTAMP WITH TIME ZONE, -- 完成時間
    
    -- 額外資訊
    optimization_version VARCHAR(20) DEFAULT 'v1.0', -- 使用的優化演算法版本
    notes TEXT, -- 備註
    
    CONSTRAINT valid_status CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
    CONSTRAINT valid_color_code CHECK (color_code ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT positive_distance CHECK (estimated_distance_km >= 0),
    CONSTRAINT positive_duration CHECK (estimated_duration_minutes >= 0)
);

-- 路線群組表索引
CREATE INDEX idx_route_groups_status ON route_groups(status);
CREATE INDEX idx_route_groups_driver_id ON route_groups(driver_id);
CREATE INDEX idx_route_groups_created_at ON route_groups(created_at);
CREATE INDEX idx_route_groups_start_location ON route_groups USING GIST(start_location);

-- ==========================================
-- 2. 訂單群組關聯表 (order_group_assignments)
-- 描述: 訂單與路線群組的關聯，支援拖拉排序
-- ==========================================
CREATE TABLE order_group_assignments (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL, -- 訂單ID
    group_id BIGINT NOT NULL REFERENCES route_groups(id) ON DELETE CASCADE,
    
    -- 排序資訊
    sequence_order INTEGER NOT NULL, -- 群組內排序序號
    is_priority BOOLEAN DEFAULT FALSE, -- 是否為優先訂單
    
    -- 配送預估
    estimated_arrival_time TIMESTAMP WITH TIME ZONE, -- 預估到達時間
    distance_from_previous_km DECIMAL(8,2), -- 與前一個訂單的距離(公里)
    duration_from_previous_minutes INTEGER, -- 與前一個訂單的時間(分鐘)
    
    -- 狀態追蹤
    assignment_status VARCHAR(20) DEFAULT 'assigned', -- 分配狀態
    delivered_at TIMESTAMP WITH TIME ZONE, -- 實際配送完成時間
    
    -- 時間記錄
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 額外資訊
    delivery_notes TEXT, -- 配送備註
    customer_feedback_rating INTEGER, -- 客戶評分 1-5
    
    CONSTRAINT unique_order_group UNIQUE(order_id, group_id),
    CONSTRAINT valid_assignment_status CHECK (assignment_status IN ('assigned', 'picked_up', 'delivered', 'failed')),
    CONSTRAINT valid_rating CHECK (customer_feedback_rating BETWEEN 1 AND 5),
    CONSTRAINT positive_sequence CHECK (sequence_order > 0)
);

-- 訂單群組關聯表索引
CREATE INDEX idx_order_group_assignments_order_id ON order_group_assignments(order_id);
CREATE INDEX idx_order_group_assignments_group_id ON order_group_assignments(group_id);
CREATE INDEX idx_order_group_assignments_sequence ON order_group_assignments(group_id, sequence_order);
CREATE INDEX idx_order_group_assignments_status ON order_group_assignments(assignment_status);

-- ==========================================
-- 3. 地理編碼快取表 (geocoding_cache)
-- 描述: 快取地址轉經緯度結果，減少Google Maps API調用
-- ==========================================
CREATE TABLE geocoding_cache (
    id BIGSERIAL PRIMARY KEY,
    original_address TEXT NOT NULL, -- 原始地址
    normalized_address TEXT NOT NULL, -- 標準化地址
    
    -- 地理位置
    latitude DECIMAL(10, 8) NOT NULL, -- 緯度
    longitude DECIMAL(11, 8) NOT NULL, -- 經度
    location GEOGRAPHY(POINT, 4326) NOT NULL, -- 地理位置點
    
    -- 地址詳細資訊
    formatted_address TEXT, -- Google返回的格式化地址
    place_id VARCHAR(255), -- Google Place ID
    address_components JSONB, -- 地址組成部分
    
    -- 可信度與品質
    confidence_score DECIMAL(3,2) DEFAULT 1.0, -- 地址可信度 0-1
    geocoding_quality VARCHAR(20) DEFAULT 'high', -- 地理編碼品質
    
    -- 快取管理
    api_provider VARCHAR(20) DEFAULT 'google', -- API提供商
    cache_hit_count INTEGER DEFAULT 0, -- 快取命中次數
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'), -- 快取過期時間
    
    -- 時間記錄
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_address UNIQUE(original_address),
    CONSTRAINT valid_latitude CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT valid_longitude CHECK (longitude BETWEEN -180 AND 180),
    CONSTRAINT valid_confidence CHECK (confidence_score BETWEEN 0 AND 1),
    CONSTRAINT valid_quality CHECK (geocoding_quality IN ('high', 'medium', 'low'))
);

-- 地理編碼快取表索引
CREATE INDEX idx_geocoding_cache_address ON geocoding_cache(original_address);
CREATE INDEX idx_geocoding_cache_location ON geocoding_cache USING GIST(location);
CREATE INDEX idx_geocoding_cache_expires_at ON geocoding_cache(expires_at);
CREATE INDEX idx_geocoding_cache_normalized ON geocoding_cache(normalized_address);

-- ==========================================
-- 4. 距離矩陣快取表 (distance_cache)
-- 描述: 快取點對點距離和時間，優化路線計算效能
-- ==========================================
CREATE TABLE distance_cache (
    id BIGSERIAL PRIMARY KEY,
    
    -- 起點資訊
    origin_address TEXT NOT NULL, -- 起點地址
    origin_lat DECIMAL(10, 8) NOT NULL, -- 起點緯度
    origin_lng DECIMAL(11, 8) NOT NULL, -- 起點經度
    origin_location GEOGRAPHY(POINT, 4326) NOT NULL, -- 起點位置
    
    -- 終點資訊
    destination_address TEXT NOT NULL, -- 終點地址
    destination_lat DECIMAL(10, 8) NOT NULL, -- 終點緯度
    destination_lng DECIMAL(11, 8) NOT NULL, -- 終點經度
    destination_location GEOGRAPHY(POINT, 4326) NOT NULL, -- 終點位置
    
    -- 距離與時間
    distance_meters INTEGER NOT NULL, -- 距離(公尺)
    distance_km DECIMAL(8,2) GENERATED ALWAYS AS (distance_meters / 1000.0) STORED, -- 距離(公里)
    duration_seconds INTEGER NOT NULL, -- 時間(秒)
    duration_minutes INTEGER GENERATED ALWAYS AS (ROUND(duration_seconds / 60.0)) STORED, -- 時間(分鐘)
    
    -- 路線詳情
    travel_mode VARCHAR(20) DEFAULT 'driving', -- 交通方式
    route_polyline TEXT, -- 路線多邊形編碼
    traffic_condition VARCHAR(20) DEFAULT 'normal', -- 交通狀況
    
    -- API與快取資訊
    api_provider VARCHAR(20) DEFAULT 'google', -- API提供商
    api_response JSONB, -- 完整API回應
    cache_hit_count INTEGER DEFAULT 0, -- 快取使用次數
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'), -- 快取過期時間
    
    -- 時間記錄
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_route UNIQUE(origin_lat, origin_lng, destination_lat, destination_lng, travel_mode),
    CONSTRAINT valid_distance CHECK (distance_meters >= 0),
    CONSTRAINT valid_duration CHECK (duration_seconds >= 0),
    CONSTRAINT valid_travel_mode CHECK (travel_mode IN ('driving', 'walking', 'bicycling', 'transit'))
);

-- 距離矩陣快取表索引
CREATE INDEX idx_distance_cache_origin ON distance_cache USING GIST(origin_location);
CREATE INDEX idx_distance_cache_destination ON distance_cache USING GIST(destination_location);
CREATE INDEX idx_distance_cache_expires_at ON distance_cache(expires_at);
CREATE INDEX idx_distance_cache_travel_mode ON distance_cache(travel_mode);
CREATE INDEX idx_distance_cache_composite ON distance_cache(origin_lat, origin_lng, destination_lat, destination_lng);

-- ==========================================
-- 5. 路線優化記錄表 (route_optimizations)
-- 描述: 記錄路線計算和優化演算法的結果與效能
-- ==========================================
CREATE TABLE route_optimizations (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES route_groups(id) ON DELETE CASCADE,
    
    -- 優化演算法資訊
    algorithm_name VARCHAR(50) NOT NULL, -- 演算法名稱
    algorithm_version VARCHAR(20) NOT NULL, -- 演算法版本
    optimization_type VARCHAR(30) DEFAULT 'distance', -- 優化目標: distance/time/mixed
    
    -- 輸入參數
    input_orders JSONB NOT NULL, -- 輸入的訂單列表
    optimization_params JSONB, -- 優化參數設定
    constraints JSONB, -- 約束條件
    
    -- 優化結果
    optimized_sequence JSONB NOT NULL, -- 優化後的訂單序列
    total_distance_km DECIMAL(8,2), -- 總距離(公里)
    total_duration_minutes INTEGER, -- 總時間(分鐘)
    efficiency_score DECIMAL(5,2), -- 效率分數
    
    -- 效能指標
    computation_time_ms INTEGER, -- 計算時間(毫秒)
    api_calls_used INTEGER DEFAULT 0, -- 使用的API調用次數
    cache_hit_rate DECIMAL(5,2), -- 快取命中率
    
    -- 比較與評估
    improvement_over_original DECIMAL(5,2), -- 相比原始順序的改善百分比
    confidence_level DECIMAL(3,2) DEFAULT 0.95, -- 結果可信度
    
    -- 狀態與時間
    status VARCHAR(20) DEFAULT 'completed', -- 優化狀態
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 錯誤處理
    error_message TEXT, -- 錯誤訊息
    retry_count INTEGER DEFAULT 0, -- 重試次數
    
    CONSTRAINT valid_optimization_status CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    CONSTRAINT valid_optimization_type CHECK (optimization_type IN ('distance', 'time', 'mixed', 'cost')),
    CONSTRAINT positive_efficiency CHECK (efficiency_score >= 0)
);

-- 路線優化記錄表索引
CREATE INDEX idx_route_optimizations_group_id ON route_optimizations(group_id);
CREATE INDEX idx_route_optimizations_algorithm ON route_optimizations(algorithm_name, algorithm_version);
CREATE INDEX idx_route_optimizations_created_at ON route_optimizations(created_at);
CREATE INDEX idx_route_optimizations_status ON route_optimizations(status);

-- ==========================================
-- 6. 批次配送表 (batch_deliveries)
-- 描述: 外送員批次配送記錄，用於效率分析和統計
-- ==========================================
CREATE TABLE batch_deliveries (
    id BIGSERIAL PRIMARY KEY,
    driver_id BIGINT NOT NULL, -- 外送員ID
    group_id BIGINT NOT NULL REFERENCES route_groups(id),
    
    -- 批次資訊
    batch_name VARCHAR(100), -- 批次名稱
    delivery_date DATE NOT NULL DEFAULT CURRENT_DATE, -- 配送日期
    shift_type VARCHAR(20) DEFAULT 'regular', -- 班次類型
    
    -- 配送統計
    total_orders INTEGER NOT NULL DEFAULT 0, -- 總訂單數
    successful_deliveries INTEGER DEFAULT 0, -- 成功配送數
    failed_deliveries INTEGER DEFAULT 0, -- 失敗配送數
    
    -- 時間記錄
    scheduled_start_time TIMESTAMP WITH TIME ZONE, -- 預定開始時間
    actual_start_time TIMESTAMP WITH TIME ZONE, -- 實際開始時間
    scheduled_end_time TIMESTAMP WITH TIME ZONE, -- 預定結束時間
    actual_end_time TIMESTAMP WITH TIME ZONE, -- 實際結束時間
    
    -- 距離與時間統計
    planned_distance_km DECIMAL(8,2), -- 計劃距離(公里)
    actual_distance_km DECIMAL(8,2), -- 實際距離(公里)
    planned_duration_minutes INTEGER, -- 計劃時間(分鐘)
    actual_duration_minutes INTEGER, -- 實際時間(分鐘)
    
    -- 效率指標
    efficiency_ratio DECIMAL(5,2), -- 效率比率 (實際/計劃)
    on_time_delivery_rate DECIMAL(5,2), -- 準時配送率
    customer_satisfaction_avg DECIMAL(3,2), -- 平均客戶滿意度
    
    -- 成本與收益
    fuel_cost DECIMAL(8,2), -- 燃料成本
    delivery_fee_total DECIMAL(10,2), -- 配送費總額
    tips_received DECIMAL(8,2), -- 收到小費
    
    -- 狀態與備註
    status VARCHAR(20) DEFAULT 'planned', -- 批次狀態
    completion_notes TEXT, -- 完成備註
    issues_encountered TEXT, -- 遇到的問題
    
    -- 時間戳記
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_batch_status CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
    CONSTRAINT valid_shift_type CHECK (shift_type IN ('regular', 'peak', 'night', 'weekend')),
    CONSTRAINT non_negative_orders CHECK (total_orders >= 0),
    CONSTRAINT valid_delivery_counts CHECK (successful_deliveries + failed_deliveries <= total_orders)
);

-- 批次配送表索引
CREATE INDEX idx_batch_deliveries_driver_id ON batch_deliveries(driver_id);
CREATE INDEX idx_batch_deliveries_group_id ON batch_deliveries(group_id);
CREATE INDEX idx_batch_deliveries_date ON batch_deliveries(delivery_date);
CREATE INDEX idx_batch_deliveries_status ON batch_deliveries(status);
CREATE INDEX idx_batch_deliveries_efficiency ON batch_deliveries(efficiency_ratio);

-- ==========================================
-- 7. 路線群組顏色設定表 (route_group_colors)
-- 描述: 管理可用的群組顏色和顯示設定
-- ==========================================
CREATE TABLE route_group_colors (
    id SERIAL PRIMARY KEY,
    color_name VARCHAR(50) NOT NULL, -- 顏色名稱
    color_code VARCHAR(7) NOT NULL, -- 顏色代碼 (HEX)
    border_color VARCHAR(7), -- 邊框顏色
    text_color VARCHAR(7) DEFAULT '#FFFFFF', -- 文字顏色
    
    -- 顯示設定
    is_active BOOLEAN DEFAULT TRUE, -- 是否啟用
    display_order INTEGER DEFAULT 1, -- 顯示順序
    usage_count INTEGER DEFAULT 0, -- 使用次數
    
    -- 說明
    description TEXT, -- 顏色描述
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_color_name UNIQUE(color_name),
    CONSTRAINT unique_color_code UNIQUE(color_code),
    CONSTRAINT valid_hex_color CHECK (color_code ~ '^#[0-9A-Fa-f]{6}$')
);

-- ==========================================
-- 觸發器函數：自動更新時間戳記
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 應用更新時間觸發器
CREATE TRIGGER update_route_groups_updated_at BEFORE UPDATE ON route_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_order_group_assignments_updated_at BEFORE UPDATE ON order_group_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_batch_deliveries_updated_at BEFORE UPDATE ON batch_deliveries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 實用函數：清理過期快取
-- ==========================================
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- 清理過期的地理編碼快取
    DELETE FROM geocoding_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- 清理過期的距離快取
    DELETE FROM distance_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 實用函數：計算群組效率分數
-- ==========================================
CREATE OR REPLACE FUNCTION calculate_group_efficiency(group_id_param BIGINT)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    efficiency_score DECIMAL(5,2);
    planned_time INTEGER;
    actual_time INTEGER;
    planned_distance DECIMAL(8,2);
    actual_distance DECIMAL(8,2);
BEGIN
    -- 從批次配送表獲取計劃與實際數據
    SELECT 
        bd.planned_duration_minutes,
        bd.actual_duration_minutes,
        bd.planned_distance_km,
        bd.actual_distance_km
    INTO 
        planned_time, actual_time, planned_distance, actual_distance
    FROM batch_deliveries bd
    WHERE bd.group_id = group_id_param
    ORDER BY bd.created_at DESC
    LIMIT 1;
    
    -- 計算效率分數 (實際 vs 計劃的綜合比較)
    IF planned_time > 0 AND planned_distance > 0 THEN
        efficiency_score := ((planned_time::DECIMAL / NULLIF(actual_time, 0)) + 
                            (planned_distance / NULLIF(actual_distance, 0))) / 2 * 100;
    ELSE
        efficiency_score := 0;
    END IF;
    
    RETURN COALESCE(efficiency_score, 0);
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 範例資料插入
-- ==========================================

-- 插入預設顏色配置
INSERT INTO route_group_colors (color_name, color_code, border_color, text_color, display_order) VALUES
('藍色群組', '#3B82F6', '#1E40AF', '#FFFFFF', 1),
('黃色群組', '#EAB308', '#CA8A04', '#000000', 2),
('綠色群組', '#10B981', '#047857', '#FFFFFF', 3),
('紅色群組', '#EF4444', '#DC2626', '#FFFFFF', 4),
('紫色群組', '#8B5CF6', '#7C3AED', '#FFFFFF', 5),
('橙色群組', '#F97316', '#EA580C', '#FFFFFF', 6);

-- 插入範例路線群組
INSERT INTO route_groups (group_name, color_code, status, estimated_distance_km, estimated_duration_minutes, total_orders, start_address) VALUES
('台北市中心區域', '#3B82F6', 'pending', 15.5, 120, 8, '台北市中正區中山南路1號'),
('信義商圈區域', '#EAB308', 'assigned', 12.3, 90, 6, '台北市信義區信義路五段7號'),
('士林夜市區域', '#10B981', 'completed', 18.7, 150, 10, '台北市士林區基河路101號');

-- 插入範例地理編碼快取
INSERT INTO geocoding_cache (original_address, normalized_address, latitude, longitude, location, formatted_address, confidence_score) VALUES
('台北101', '台北市信義區信義路五段7號', 25.0340, 121.5645, ST_SetSRID(ST_MakePoint(121.5645, 25.0340), 4326), '110台北市信義區信義路五段7號', 1.0),
('西門町', '台北市萬華區漢中街', 25.0420, 121.5070, ST_SetSRID(ST_MakePoint(121.5070, 25.0420), 4326), '108台北市萬華區漢中街', 0.95),
('士林夜市', '台北市士林區基河路101號', 25.0880, 121.5240, ST_SetSRID(ST_MakePoint(121.5240, 25.0880), 4326), '111台北市士林區基河路101號', 1.0);

-- ==========================================
-- 查詢視圖：群組配送概覽
-- ==========================================
CREATE VIEW route_group_overview AS
SELECT 
    rg.id,
    rg.group_name,
    rg.color_code,
    rg.status,
    rg.total_orders,
    rg.estimated_distance_km,
    rg.estimated_duration_minutes,
    COUNT(oga.id) as assigned_orders,
    AVG(oga.customer_feedback_rating) as avg_rating,
    rg.created_at,
    bd.actual_distance_km,
    bd.actual_duration_minutes,
    bd.efficiency_ratio
FROM route_groups rg
LEFT JOIN order_group_assignments oga ON rg.id = oga.group_id
LEFT JOIN batch_deliveries bd ON rg.id = bd.group_id
GROUP BY rg.id, bd.actual_distance_km, bd.actual_duration_minutes, bd.efficiency_ratio;

-- ==========================================
-- 查詢視圖：快取使用統計
-- ==========================================
CREATE VIEW cache_usage_stats AS
SELECT 
    'geocoding' as cache_type,
    COUNT(*) as total_entries,
    SUM(cache_hit_count) as total_hits,
    AVG(cache_hit_count) as avg_hits_per_entry,
    COUNT(*) FILTER (WHERE expires_at > NOW()) as valid_entries,
    COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired_entries
FROM geocoding_cache
UNION ALL
SELECT 
    'distance' as cache_type,
    COUNT(*) as total_entries,
    SUM(cache_hit_count) as total_hits,
    AVG(cache_hit_count) as avg_hits_per_entry,
    COUNT(*) FILTER (WHERE expires_at > NOW()) as valid_entries,
    COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired_entries
FROM distance_cache;

-- ==========================================
-- 索引優化建議
-- ==========================================

-- 複合索引用於常見查詢模式
CREATE INDEX idx_route_groups_status_created ON route_groups(status, created_at DESC);
CREATE INDEX idx_batch_deliveries_driver_date ON batch_deliveries(driver_id, delivery_date);
CREATE INDEX idx_order_assignments_group_sequence ON order_group_assignments(group_id, sequence_order, assignment_status);

-- 部分索引用於活躍記錄
CREATE INDEX idx_route_groups_active ON route_groups(id) WHERE status IN ('pending', 'assigned', 'in_progress');
CREATE INDEX idx_geocoding_cache_valid ON geocoding_cache(original_address) WHERE expires_at > NOW();
CREATE INDEX idx_distance_cache_valid ON distance_cache(origin_lat, origin_lng, destination_lat, destination_lng) WHERE expires_at > NOW();

-- ==========================================
-- 權限設定（根據需要調整）
-- ==========================================

-- 為API使用者創建角色（示例）
-- CREATE ROLE routing_api_user;
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO routing_api_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO routing_api_user;

-- ==========================================
-- 結尾註釋
-- ==========================================

-- Schema建立完成！
-- 
-- 主要特色：
-- 1. ✅ 支援路線群組管理和顏色標示
-- 2. ✅ 地理編碼和距離矩陣快取系統
-- 3. ✅ 批次配送記錄和效率分析
-- 4. ✅ 路線優化演算法記錄
-- 5. ✅ 完整的索引策略
-- 6. ✅ 自動化函數和觸發器
-- 7. ✅ 實用的查詢視圖
-- 8. ✅ 範例資料和測試數據
--
-- 使用方式：
-- 1. 執行此SQL檔案建立所有表格
-- 2. 根據實際需求調整權限設定
-- 3. 使用提供的視圖進行資料查詢
-- 4. 定期執行清理函數維護快取
--
-- 注意事項：
-- - 需要PostgreSQL 12+和PostGIS擴展
-- - 建議定期備份和監控查詢效能
-- - 快取表需要定期清理以控制大小