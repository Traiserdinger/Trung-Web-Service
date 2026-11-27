import { strToU8, zipSync } from 'fflate'
import type { BedSize } from '../config/pricingConfig'
import type { Placement } from './plateArrange'

export interface PlatePart {
  itemNo: number
  name: string
  /** Displayed mesh, Y-up (three.js), XZ centred at 0, minY 0. */
  positions: Float32Array
  placements: Placement[]
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
  '</Types>'

const RELS =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>' +
  '</Relationships>'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
}

const num = (n: number) => String(Math.round(n * 1e6) / 1e6)

function meshXml(positions: Float32Array): string {
  const index = new Map<string, number>()
  const verts: string[] = []
  const tris: string[] = []
  const tri: number[] = [0, 0, 0]
  for (let i = 0; i < positions.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      // Y-up (X, Y, Z) -> Z-up (X, -Z, Y)
      const x = positions[i + k * 3]
      const y = -positions[i + k * 3 + 2]
      const z = positions[i + k * 3 + 1]
      const key = `${x},${y},${z}`
      let id = index.get(key)
      if (id === undefined) {
        id = verts.length
        index.set(key, id)
        verts.push(`<vertex x="${num(x)}" y="${num(y)}" z="${num(z)}"/>`)
      }
      tri[k] = id
    }
    if (tri[0] === tri[1] || tri[1] === tri[2] || tri[0] === tri[2]) continue
    tris.push(`<triangle v1="${tri[0]}" v2="${tri[1]}" v3="${tri[2]}"/>`)
  }
  return `<mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh>`
}

/** Plate file: each part is one object, each placement one build item (transform: row-vector 3MF convention). */
export function buildPlate3mf(parts: PlatePart[], _bed: BedSize): Uint8Array {
  const objects: string[] = []
  const items: string[] = []
  parts.forEach((part, idx) => {
    const id = idx + 1
    objects.push(
      `<object id="${id}" name="${esc(`${part.itemNo} - ${part.name}`)}" type="model">${meshXml(part.positions)}</object>`,
    )
    for (const p of part.placements) {
      const t = (p.rotDeg * Math.PI) / 180
      const c = Math.cos(t)
      const s = Math.sin(t)
      const m = [c, s, 0, -s, c, 0, 0, 0, 1, p.x, p.y, 0].map(num).join(' ')
      items.push(`<item objectid="${id}" transform="${m}"/>`)
    }
  })
  const model =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">' +
    `<resources>${objects.join('')}</resources><build>${items.join('')}</build></model>`
  return zipSync(
    {
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      '_rels/.rels': strToU8(RELS),
      '3D/3dmodel.model': strToU8(model),
    },
    { level: 6 },
  )
}
