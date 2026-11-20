// GLB thô (từ step-to-glb.py) → GLB nhẹ cho web.
//
//   node optimize-glb.mjs <raw.glb> <out.glb>
//
// - đổi mét → mm, Z-up (STEP) → Y-up (three.js), đặt tâm bo mạch về gốc
// - gán lại vật liệu: cascadio để mọi màu metallic = 1, nhìn như gương; ở đây chỉ chân hàn,
//   pad vàng và vỏ kim loại mới là kim loại
// - gộp theo vật liệu, hàn đỉnh, giản lược nhẹ, lượng tử hoá và nén meshopt
import { NodeIO, getBounds } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions'
import { dedup, flatten, join, meshopt, prune, quantize, simplify, weld } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

const [, , input, output] = process.argv
if (!input || !output) {
  console.error('Cách dùng: node optimize-glb.mjs <raw.glb> <out.glb>')
  process.exit(1)
}

await MeshoptEncoder.ready
await MeshoptSimplifier.ready
const io = new NodeIO().registerExtensions([KHRMeshQuantization, EXTMeshoptCompression]).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
})

const doc = await io.read(input)
const root = doc.getRoot()

const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)
for (const m of root.listMaterials()) {
  const [r, g, b] = m.getBaseColorFactor().map(toSrgb)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const grey = max - min < 0.08
  const gold = r > 0.8 && g > 0.5 && b < 0.45 && r - b > 0.4
  const metal = (grey && max > 0.4 && max < 0.95) || gold
  m.setMetallicFactor(metal ? 0.9 : 0)
  m.setRoughnessFactor(metal ? 0.35 : grey && max < 0.3 ? 0.55 : 0.7)
}

// Gom mọi node gốc dưới một node xoay/scale chung
const scene = root.listScenes()[0]
const b = getBounds(scene)
const center = [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2)
const pivot = doc.createNode('board')
const shift = doc.createNode('center').setTranslation(center.map((c) => -c))
for (const child of scene.listChildren()) {
  scene.removeChild(child)
  shift.addChild(child)
}
pivot.addChild(shift)
pivot.setScale([1000, 1000, 1000]).setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2])
scene.addChild(pivot)

await doc.transform(
  dedup(),
  flatten(),
  join({ keepNamed: false }),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.6, error: 0.0003 }),
  prune(),
  quantize({ quantizePosition: 14, quantizeNormal: 10 }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
)
let tris = 0
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3
const out = await io.writeBinary(doc)
await (await import('node:fs/promises')).writeFile(output, out)
const nb = getBounds(scene)
console.log(`${tris.toLocaleString('en')} tam giác, ${root.listMaterials().length} vật liệu`)
console.log('Khung (mm):', nb.min.map((v) => v.toFixed(1)), nb.max.map((v) => v.toFixed(1)))
console.log(`Đã ghi ${output}: ${(out.byteLength / 1024 / 1024).toFixed(2)} MB`)
