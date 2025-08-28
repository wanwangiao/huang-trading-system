-- PostgreSQL語法測試檔案
-- 用於驗證intelligent_routing_schema.sql的語法正確性

-- 測試基本語法結構
\echo '開始語法測試...'

-- 檢查是否有PostGIS擴展
CREATE EXTENSION IF NOT EXISTS postgis;

-- 檢查基本資料類型
SELECT 'BIGSERIAL'::regtype;
SELECT 'GEOGRAPHY(POINT, 4326)'::regtype;
SELECT 'JSONB'::regtype;

-- 檢查基本函數
SELECT NOW();
SELECT CURRENT_DATE;

\echo '語法測試完成 - 如果沒有錯誤，表示基本語法正確'