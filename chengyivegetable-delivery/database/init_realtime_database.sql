-- 執行此腳本來初始化即時通知系統所需的資料庫結構
-- 請在PostgreSQL中運行此腳本

-- 首先執行即時通知系統的schema
\i realtime_notifications_schema.sql

-- 插入系統設定
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('store_location', '{"lat": 24.1477, "lng": 120.6736}', '店鋪位置座標'),
('max_delivery_radius', '15', '最大配送半徑(公里)'),
('average_preparation_time', '20', '平均準備時間(分鐘)')
ON CONFLICT (setting_key) DO UPDATE SET 
  setting_value = EXCLUDED.setting_value,
  updated_at = CURRENT_TIMESTAMP;

-- 檢查資料表是否正確創建
SELECT 
  table_name,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name IN ('drivers', 'order_status_history', 'driver_location_history', 
                     'order_driver_assignments', 'notification_logs', 'system_settings')
ORDER BY table_name;

-- 顯示完成訊息
SELECT '即時通知系統資料庫初始化完成！' as status;