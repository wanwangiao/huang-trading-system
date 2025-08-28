-- 資料表結構定義

-- 商品表
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC,
  is_priced_item BOOLEAN NOT NULL DEFAULT FALSE,
  unit_hint TEXT
);

-- 使用者表，用於綁定 LINE 帳號
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  line_user_id TEXT,
  line_display_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 訂單表
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  address TEXT NOT NULL,
  notes TEXT,
  invoice TEXT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  delivery_fee NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'placed',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  -- 新增座標欄位與地理資料狀態
  lat NUMERIC,
  lng NUMERIC,
  geocoded_at TIMESTAMP,
  geocode_status TEXT
);

-- 訂單品項表
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  name TEXT NOT NULL,
  is_priced_item BOOLEAN NOT NULL DEFAULT FALSE,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC,
  line_total NUMERIC NOT NULL DEFAULT 0,
  actual_weight NUMERIC
);

-- 庫存管理表
CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  current_stock INTEGER NOT NULL DEFAULT 0,
  min_stock_alert INTEGER DEFAULT 10,
  max_stock_capacity INTEGER DEFAULT 1000,
  unit_cost NUMERIC(10,2),
  supplier_name TEXT,
  supplier_phone TEXT,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 庫存異動記錄表
CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  movement_type VARCHAR(20) NOT NULL, -- 'in'(進貨), 'out'(出貨), 'adjustment'(調整)
  quantity INTEGER NOT NULL,
  unit_cost NUMERIC(10,2),
  reason TEXT,
  reference_order_id INTEGER REFERENCES orders(id),
  operator_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 供應商管理表
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  contact_person VARCHAR(100),
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);