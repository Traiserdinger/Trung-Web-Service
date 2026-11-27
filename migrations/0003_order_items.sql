-- Nhiều file, nhiều món trên một bàn in (spec §7.8, §10). Chỉ thêm bảng, không đổi cột cũ.
CREATE TABLE order_files (
  order_code TEXT NOT NULL,
  file_no INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('source','plate')),
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('stl','3mf')),
  file_delivery TEXT NOT NULL CHECK (file_delivery IN ('upload','zalo')),
  file_status TEXT NOT NULL CHECK (file_status IN ('pending','saved','zalo')),
  drive_url TEXT,
  PRIMARY KEY (order_code, file_no)
);

CREATE TABLE order_items (
  order_code TEXT NOT NULL,
  item_no INTEGER NOT NULL,
  file_no INTEGER NOT NULL,
  name TEXT NOT NULL,
  dims TEXT NOT NULL,
  volume REAL NOT NULL,
  surface_area REAL NOT NULL,
  scale REAL NOT NULL,
  orient TEXT,
  infill_percent INTEGER NOT NULL,
  wall_loops INTEGER NOT NULL,
  support INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  placements TEXT,
  footprint TEXT,
  PRIMARY KEY (order_code, item_no)
);

-- Mọi đơn cũ thành 1 file nguồn + 1 món.
INSERT INTO order_files
  (order_code, file_no, role, file_name, file_size, file_type, file_delivery, file_status, drive_url)
SELECT code, 1, 'source', COALESCE(file_name, 'model.stl'), COALESCE(file_size, 0), 'stl',
  COALESCE(file_delivery, 'upload'), COALESCE(file_status, 'pending'), drive_url
FROM orders;

INSERT INTO order_items
  (order_code, item_no, file_no, name, dims, volume, surface_area, scale, orient,
   infill_percent, wall_loops, support, quantity, placements, footprint)
SELECT code, 1, 1, COALESCE(file_name, 'model.stl'), COALESCE(dims, 'null'), COALESCE(volume, 0),
  COALESCE(surface_area, 0), COALESCE(scale, 1), NULL,
  COALESCE(CASE WHEN json_valid(settings) THEN json_extract(settings, '$.infillPercent') END, 20),
  COALESCE(CASE WHEN json_valid(settings) THEN json_extract(settings, '$.wallLoops') END, 2),
  COALESCE(CASE WHEN json_valid(settings) THEN json_extract(settings, '$.support') END, 0),
  COALESCE(CASE WHEN json_valid(settings) THEN json_extract(settings, '$.quantity') END, 1),
  NULL, NULL
FROM orders;
