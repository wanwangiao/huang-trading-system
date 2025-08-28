-- 系統基本資料設定表
-- 用於管理前台各種可配置的參數

CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  setting_type VARCHAR(50) DEFAULT 'string',
  category VARCHAR(50) DEFAULT 'general',
  description TEXT,
  display_name VARCHAR(200),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入預設的系統設定
INSERT INTO system_settings (setting_key, setting_value, setting_type, category, description, display_name) VALUES
-- 🎨 色彩設定
('primary_color', '#2d5a3d', 'color', 'theme', '主要品牌顏色', '主要色彩'),
('accent_color', '#7cb342', 'color', 'theme', '輔助強調顏色', '輔助色彩'),
('background_color', '#ffffff', 'color', 'theme', '背景顏色', '背景色彩'),
('text_primary_color', '#1a1a1a', 'color', 'theme', '主要文字顏色', '主要文字'),
('text_secondary_color', '#666666', 'color', 'theme', '次要文字顏色', '次要文字'),

-- 💰 營業設定
('free_shipping_threshold', '300', 'number', 'business', '免運費門檻金額', '免運門檻'),
('minimum_order_amount', '100', 'number', 'business', '最低訂購金額', '最低訂購'),
('delivery_fee', '50', 'number', 'business', '配送費用', '配送費'),
('service_hours_start', '08:00', 'time', 'business', '服務開始時間', '營業開始'),
('service_hours_end', '20:00', 'time', 'business', '服務結束時間', '營業結束'),

-- 📍 服務範圍
('service_areas', '三峽區,樹林區,鶯歌區,土城區,板橋區', 'text', 'service', '服務區域列表', '服務範圍'),
('delivery_note', '當日新鮮配送，保證品質', 'text', 'service', '配送說明', '配送備註'),

-- 🏪 商店資訊
('store_name', '誠意鮮蔬', 'text', 'store', '商店名稱', '商店名稱'),
('store_slogan', '新鮮 × 健康 × 便利', 'text', 'store', '商店標語', '商店標語'),
('contact_phone', '02-12345678', 'text', 'store', '聯絡電話', '聯絡電話'),
('contact_address', '新北市三峽區復興路100號', 'text', 'store', '商店地址', '商店地址'),

-- 📋 頁面內容
('announcement_title', '🌱 每日新鮮直送', 'text', 'content', '公告標題', '公告標題'),
('announcement_content', '嚴選當季新鮮蔬果，產地直送到府，確保您享用最優質的食材', 'textarea', 'content', '公告內容', '公告內容'),

-- 🎯 功能開關
('show_announcement', 'true', 'boolean', 'features', '是否顯示公告', '顯示公告'),
('enable_line_pay', 'false', 'boolean', 'features', '是否啟用Line Pay', 'Line Pay'),
('enable_discount', 'true', 'boolean', 'features', '是否啟用折扣功能', '折扣功能'),

-- 🎨 進階主題設定
('header_gradient_start', '#2d5a3d', 'color', 'theme_advanced', '頂部漸層開始色', '頂部漸層起始'),
('header_gradient_end', '#1e3d2a', 'color', 'theme_advanced', '頂部漸層結束色', '頂部漸層結束'),
('card_background', '#ffffff', 'color', 'theme_advanced', '卡片背景色', '卡片背景'),
('card_border_color', 'rgba(124, 179, 66, 0.15)', 'color', 'theme_advanced', '卡片邊框色', '卡片邊框'),

-- 📱 移動端設定
('mobile_cart_position', '80', 'number', 'mobile', '購物車距離底部像素', '購物車位置'),
('mobile_header_blur', '20', 'number', 'mobile', '頂部模糊程度', '頂部模糊')

ON CONFLICT (setting_key) DO UPDATE SET 
  setting_value = EXCLUDED.setting_value,
  updated_at = CURRENT_TIMESTAMP;

-- 創建更新時間的觸發器
CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS system_settings_updated_at ON system_settings;
CREATE TRIGGER system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_system_settings_updated_at();

-- 創建索引以提高查詢效能
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
CREATE INDEX IF NOT EXISTS idx_system_settings_active ON system_settings(is_active);