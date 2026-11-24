import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Bản dựng riêng cho UI quản trị: root là admin/, xuất ra dist-admin (không lẫn vào dist/).
export default defineConfig({
  root: 'admin',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../dist-admin', emptyOutDir: true },
})
