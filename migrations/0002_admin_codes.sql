-- Mã đăng nhập quản trị dùng một lần (spec §9). Chỉ lưu HMAC của mã, không lưu mã thật.
-- expires_at tính bằng giây.
CREATE TABLE admin_codes (
  id INTEGER PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
