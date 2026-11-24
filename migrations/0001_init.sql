-- Lược đồ ban đầu (spec §7.3). Migration chỉ được thêm, không xoá hoặc đổi tên cột.
CREATE TABLE orders (
  code TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  order_type TEXT NOT NULL,
  consult_reasons TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  customer_note TEXT,
  settings TEXT,
  dims TEXT,
  surface_area REAL,
  volume REAL,
  scale REAL,
  estimate TEXT,
  color_id INTEGER,
  color_name TEXT,
  color_hex TEXT,
  file_name TEXT,
  file_size INTEGER,
  file_delivery TEXT,
  file_status TEXT,
  drive_url TEXT,
  fingerprint TEXT,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','paid','printing','shipping','done','cancelled')),
  status_updated_at TEXT NOT NULL
);
CREATE INDEX idx_orders_created_at ON orders (created_at);
CREATE INDEX idx_orders_customer_phone ON orders (customer_phone);

CREATE TABLE order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('received','paid','printing','shipping','done','cancelled')),
  note TEXT,
  created_at TEXT NOT NULL,
  email_sent INTEGER
);
CREATE INDEX idx_order_events_order_code ON order_events (order_code);

CREATE TABLE colors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  hex TEXT NOT NULL,
  sort INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
INSERT INTO colors (id, name, hex, sort, active) VALUES
  (1, 'Đen', '#1f1f1f', 1, 1),
  (2, 'Trắng', '#f2f2f0', 2, 1),
  (3, 'Đỏ', '#c62828', 3, 1),
  (4, 'Nâu', '#6d4c41', 4, 1);

-- Bảng đếm giới hạn tần suất.
CREATE TABLE rate_hits (
  key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX idx_rate_hits_key_at ON rate_hits (key, at);
