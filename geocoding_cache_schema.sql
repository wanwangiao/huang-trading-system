-- =====================================
-- 地理編碼快取表結構
-- 用於儲存Google Maps API地理編碼結果，減少API呼叫次數
-- =====================================

-- 建立地理編碼快取表
CREATE TABLE IF NOT EXISTS geocoding_cache (
  id SERIAL PRIMARY KEY,
  address VARCHAR(500) UNIQUE NOT NULL, -- 原始地址（主鍵）
  lat DECIMAL(10, 8) NOT NULL,           -- 緯度
  lng DECIMAL(11, 8) NOT NULL,           -- 經度
  formatted_address TEXT,                -- Google格式化後的地址
  place_id VARCHAR(200),                 -- Google Place ID
  address_components TEXT,               -- 地址組件JSON
  geometry_type VARCHAR(50),             -- 幾何類型
  location_type TEXT,                    -- 位置類型JSON
  hit_count INTEGER DEFAULT 0,           -- 使用次數
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL         -- 過期時間
);

-- 建立索引以提高查詢效能
CREATE INDEX IF NOT EXISTS idx_geocoding_cache_address ON geocoding_cache(address);
CREATE INDEX IF NOT EXISTS idx_geocoding_cache_expires ON geocoding_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_geocoding_cache_location ON geocoding_cache(lat, lng);
CREATE INDEX IF NOT EXISTS idx_geocoding_cache_usage ON geocoding_cache(hit_count DESC);

-- 為orders表添加地理編碼相關欄位（如果不存在）
DO $$ 
BEGIN
    -- 檢查並添加formatted_address欄位
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'formatted_address'
    ) THEN
        ALTER TABLE orders ADD COLUMN formatted_address TEXT;
    END IF;

    -- 檢查並添加geocode_status欄位  
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'geocode_status'
    ) THEN
        ALTER TABLE orders ADD COLUMN geocode_status VARCHAR(20) DEFAULT 'pending';
    END IF;

    -- 檢查並添加geocoded_at欄位
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'geocoded_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN geocoded_at TIMESTAMP;
    END IF;
END $$;

-- 為orders表的地理編碼相關欄位建立索引
CREATE INDEX IF NOT EXISTS idx_orders_geocode_status ON orders(geocode_status);
CREATE INDEX IF NOT EXISTS idx_orders_location ON orders(lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- 建立自動清理過期快取的函數
CREATE OR REPLACE FUNCTION cleanup_expired_geocoding_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM geocoding_cache WHERE expires_at <= NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- 記錄清理日誌
    INSERT INTO system_logs (operation, message, created_at) 
    VALUES ('cache_cleanup', 'Cleaned up ' || deleted_count || ' expired geocoding cache entries', NOW());
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 建立系統日誌表（如果不存在）
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    operation VARCHAR(50) NOT NULL,
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 建立自動更新updated_at的觸發器
CREATE OR REPLACE FUNCTION update_geocoding_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 建立觸發器（如果不存在）
DROP TRIGGER IF EXISTS trigger_update_geocoding_cache_updated_at ON geocoding_cache;
CREATE TRIGGER trigger_update_geocoding_cache_updated_at
    BEFORE UPDATE ON geocoding_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_geocoding_cache_updated_at();

-- 插入一些測試資料（僅在開發環境）
DO $$
BEGIN
    IF (SELECT COUNT(*) FROM geocoding_cache) = 0 THEN
        INSERT INTO geocoding_cache (
            address, lat, lng, formatted_address, place_id, 
            address_components, geometry_type, location_type, expires_at
        ) VALUES 
        (
            '新北市三峽區中山路123號',
            24.9347, 121.3681,
            '237新北市三峽區中山路123號',
            'sample_place_id_1',
            '[]',
            'ROOFTOP',
            '["establishment"]',
            NOW() + INTERVAL '30 days'
        ),
        (
            '台北市大安區忠孝東路四段1號',
            25.0418, 121.5440,
            '106台北市大安區忠孝東路四段1號',
            'sample_place_id_2', 
            '[]',
            'ROOFTOP',
            '["establishment"]',
            NOW() + INTERVAL '30 days'
        );
        
        -- 記錄初始化日誌
        INSERT INTO system_logs (operation, message) 
        VALUES ('cache_init', 'Initialized geocoding cache with sample data');
    END IF;
END $$;

-- 建立定期清理任務的視圖
CREATE OR REPLACE VIEW geocoding_cache_stats AS
SELECT 
    COUNT(*) as total_entries,
    COUNT(*) FILTER (WHERE expires_at > NOW()) as active_entries,
    COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired_entries,
    SUM(hit_count) as total_hits,
    AVG(hit_count) as avg_hits_per_entry,
    MAX(created_at) as newest_entry,
    MIN(created_at) as oldest_entry,
    MAX(last_used_at) as last_usage
FROM geocoding_cache;

COMMENT ON TABLE geocoding_cache IS '地理編碼快取表 - 儲存Google Maps API結果以減少API呼叫';
COMMENT ON COLUMN geocoding_cache.address IS '原始地址，用作唯一鍵';
COMMENT ON COLUMN geocoding_cache.hit_count IS '快取項目被使用的次數';
COMMENT ON COLUMN geocoding_cache.expires_at IS '快取過期時間，預設30天';
COMMENT ON VIEW geocoding_cache_stats IS '地理編碼快取統計視圖';