// Ảnh layer mạch → mặt nạ alpha (WebP) cùng khung, để web tô màu theo theme bằng CSS mask.
//
//   node build-layers.mjs <thư mục nguồn> <thư mục đích>
//
// Thư mục nguồn cần:
//   revb/  TOP, SOLID_TOP_GND, SIGNAL, POWER, SOLID_BOTTOM_GND, BOTTOM (.png, plot từ Allegro)
//          3d_iso_top, 3d_iso_bottom (.png, render nền trắng)
//   reva/  Gerber Altium: Copper_Signal_Top/_1/_2/_Bot, Profile (.gbr), drill.TXT
//          pcb_3d_top.png, pcb_top.jpg
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { read, plot, renderLayers, stringifySvg } from '@tracespace/core'

const [, , SRC, OUT] = process.argv
if (!SRC || !OUT) {
  console.error('Cách dùng: node build-layers.mjs <nguồn> <đích>')
  process.exit(1)
}
const SIZE = 1000
await mkdir(OUT, { recursive: true })

/** Ghi mặt nạ: kênh màu đen, alpha = độ phủ đồng */
async function writeMask(alpha, w, h, file) {
  const rgba = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) rgba[i * 4 + 3] = alpha[i]
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .resize(SIZE, SIZE, { fit: 'fill' })
    .webp({ quality: 82, alphaQuality: 70, effort: 6 })
    .toFile(path.join(OUT, file))
  console.log('  ', file)
}

// ---------- Rev B: plot màu của Allegro ----------
const isOutline = (r, g, b) => r > 100 && r < 165 && g > 140 && g < 190 && b > 75 && b < 135 && g - r > 15
async function revbLayer(name, file) {
  const { data, info } = await sharp(path.join(SRC, 'revb', `${name}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  // Khung = viền bo mạch (nét xanh lá mảnh), bỏ dấu gốc toạ độ ở góc trái dưới
  let x0 = W, y0 = H, x1 = 0, y1 = 0
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3
      if (x < 90 && y > H - 110) continue
      if (isOutline(data[o], data[o + 1], data[o + 2])) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const alpha = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = ((y + y0) * W + (x + x0)) * 3
      const r = data[o], g = data[o + 1], b = data[o + 2]
      if (isOutline(r, g, b)) continue
      const ink = 255 - Math.min(r, g, b) // nền trắng = 0, vùng phủ đồng ≈ 100, đường mạch/pad ≈ 165
      const a = Math.min(1, Math.max(0, (ink - 12) / 150)) ** 1.6
      alpha[y * w + x] = Math.round(a * 255)
    }
  console.log(`Rev B ${name}: khung ${w}×${h}px`)
  await writeMask(alpha, w, h, file)
}

/** Render nền trắng → nền trong suốt (loang từ mép ảnh, không ăn vào lỗ bắt vít bên trong) */
async function cutout(src, file, width) {
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  const bg = new Uint8Array(W * H)
  const stack = []
  const near = (i) => data[i * 3] > 238 && data[i * 3 + 1] > 238 && data[i * 3 + 2] > 238
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x)
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1)
  while (stack.length) {
    const i = stack.pop()
    if (bg[i] || !near(i)) continue
    bg[i] = 1
    const x = i % W
    if (x > 0) stack.push(i - 1)
    if (x < W - 1) stack.push(i + 1)
    if (i >= W) stack.push(i - W)
    if (i < W * (H - 1)) stack.push(i + W)
  }
  const rgba = Buffer.alloc(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4] = data[i * 3]
    rgba[i * 4 + 1] = data[i * 3 + 1]
    rgba[i * 4 + 2] = data[i * 3 + 2]
    rgba[i * 4 + 3] = bg[i] ? 0 : 255
  }
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .trim({ threshold: 0 })
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 84, alphaQuality: 90, effort: 6 })
    .toFile(path.join(OUT, file))
  console.log('  ', file)
}

const REVB = [
  ['TOP', 'revb-l1-top.webp'],
  ['SOLID_TOP_GND', 'revb-l2-gnd.webp'],
  ['SIGNAL', 'revb-l3-signal.webp'],
  ['POWER', 'revb-l4-power.webp'],
  ['SOLID_BOTTOM_GND', 'revb-l5-gnd.webp'],
  ['BOTTOM', 'revb-l6-bottom.webp'],
]
for (const [name, file] of REVB) await revbLayer(name, file)
await cutout(path.join(SRC, 'revb', '3d_iso_top.png'), 'revb-iso-top.webp', 1200)
await cutout(path.join(SRC, 'revb', '3d_iso_bottom.png'), 'revb-iso-bottom.webp', 1200)

// ---------- Rev A: Gerber Altium ----------
const gerber = (n) => path.join(SRC, 'reva', `${n}.gbr`)
const REVA = [
  ['Copper_Signal_Top', 'reva-l1-top.webp'],
  ['Copper_Signal_1', 'reva-l2-inner1.webp'],
  ['Copper_Signal_2', 'reva-l3-inner2.webp'],
  ['Copper_Signal_Bot', 'reva-l4-bottom.webp'],
]
const files = [...REVA.map(([n]) => gerber(n)), gerber('Profile'), path.join(SRC, 'reva', 'drill.TXT')]
const rendered = renderLayers(plot(await read(files)))
const [, , vw, vh] = rendered.boardShapeRender.viewBox
console.log(`Rev A: bo mạch ${(vw / 1).toFixed(2)} × ${(vh / 1).toFixed(2)} (đơn vị file)`)
const svgOf = (filename) => {
  const layer = rendered.layers.find((l) => path.basename(l.filename) === path.basename(filename))
  if (!layer) throw new Error(`Không thấy layer ${filename}`)
  return stringifySvg(rendered.rendersById[layer.id]).replaceAll('currentColor', '#000')
}
const raster = async (svg) => {
  const { data, info } = await sharp(Buffer.from(svg), { density: 600 })
    .resize(SIZE, SIZE, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const a = new Uint8Array(info.width * info.height)
  for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3]
  return a
}
const drill = await raster(svgOf('drill.TXT'))
for (const [name, file] of REVA) {
  const a = await raster(svgOf(`${name}.gbr`))
  // khoét lỗ khoan cho giống mạch thật; đồng Rev A là lớp đặc nên hạ alpha cho cân với Rev B
  for (let i = 0; i < a.length; i++) a[i] = Math.round(a[i] * (1 - drill[i] / 255) * 0.62)
  await writeMask(a, SIZE, SIZE, file)
}
await cutout(path.join(SRC, 'reva', 'pcb_3d_top.png'), 'reva-render-top.webp', 1200)
await sharp(path.join(SRC, 'reva', 'pcb_top.jpg')).resize({ width: 700 }).webp({ quality: 80 }).toFile(path.join(OUT, 'reva-photo-top.webp'))
console.log('Xong.')
