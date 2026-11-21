// Ảnh xem trước khi chia sẻ link (LinkedIn, Facebook, Zalo): 1200×627 px.
//
//   node build-og.mjs <render.webp> <out.png>
//
// Nền xanh solder mask tối, tên bên trái, ảnh render mạch bên phải.
import sharp from 'sharp'

const [, , render, output] = process.argv
if (!render || !output) {
  console.error('Cách dùng: node build-og.mjs <render.webp> <out.png>')
  process.exit(1)
}
const W = 1200
const H = 627

const dots = Array.from({ length: Math.ceil(W / 24) * Math.ceil(H / 24) }, (_, i) => {
  const x = (i % Math.ceil(W / 24)) * 24 + 12
  const y = Math.floor(i / Math.ceil(W / 24)) * 24 + 12
  return `<circle cx="${x}" cy="${y}" r="1.1"/>`
}).join('')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="#101815"/>
  <g fill="#e4ebe7" fill-opacity="0.06">${dots}</g>
  <g font-family="Segoe UI, Be Vietnam Pro, Arial, sans-serif">
    <rect x="72" y="96" width="44" height="44" rx="11" fill="#4cc28b"/>
    <rect x="84" y="108" width="20" height="20" rx="3" fill="#1b2420"/>
    <text x="72" y="232" font-size="76" font-weight="700" fill="#e4ebe7" letter-spacing="-2">Đức Trung</text>
    <text x="72" y="292" font-size="34" fill="#9eaca5">Thiết kế mạch và in 3D vỏ hộp</text>
    <text x="72" y="430" font-size="26" fill="#e0b85a">PCB 2–6 lớp, firmware, báo giá in 3D từ file STL</text>
    <text x="72" y="540" font-size="24" fill="#9eaca5">trung-pcb-3d.minhlaductrung.workers.dev</text>
  </g>
</svg>`

const board = await sharp(render).resize({ width: 540, height: 440, fit: 'inside' }).toBuffer()
const meta = await sharp(board).metadata()
await sharp(Buffer.from(svg))
  .composite([{ input: board, left: W - meta.width - 40, top: Math.round((H - meta.height) / 2) }])
  .png({ compressionLevel: 9, palette: false })
  .toFile(output)
console.log(`Đã ghi ${output} (${W}×${H})`)
