-- Chạy lại phần chuyển đơn cũ của 0003 (chỉ thêm): đơn nào được tạo sau 0003 mà bản Worker cũ ghi
-- không kèm file/món (lúc chuyển đổi giữa hai bản phát hành) sẽ thành 1 file nguồn + 1 món.
-- Đơn đã có dòng thì bỏ qua, nên chạy lại bao nhiêu lần cũng an toàn.
INSERT INTO order_files
  (order_code, file_no, role, file_name, file_size, file_type, file_delivery, file_status, drive_url)
SELECT code, 1, 'source', COALESCE(file_name, 'model.stl'), COALESCE(file_size, 0), 'stl',
  COALESCE(file_delivery, 'upload'), COALESCE(file_status, 'pending'), drive_url
FROM orders
WHERE NOT EXISTS (SELECT 1 FROM order_files f WHERE f.order_code = orders.code);

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
FROM orders
WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_code = orders.code);
