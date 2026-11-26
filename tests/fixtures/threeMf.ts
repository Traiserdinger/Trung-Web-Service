// Test-only 3MF builder. Meshes are given as non-indexed triangle soup
// (9 floats per triangle) and written as an indexed <mesh> (3 vertices each).
import { strToU8, zipSync } from 'fflate'

export interface FixtureComponent {
  objectid: number
  transform?: string
  /** Value for p:path, e.g. "/3D/Objects/object_1.model" */
  path?: string
}

export interface FixtureObject {
  id: number
  name?: string
  mesh?: Float32Array
  components?: FixtureComponent[]
}

export interface FixtureBuildItem {
  objectid: number
  transform?: string
}

export function meshXml(positions: Float32Array): string {
  const verts: string[] = []
  const tris: string[] = []
  for (let t = 0; t < positions.length / 9; t++) {
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3
      verts.push(`<vertex x="${positions[o]}" y="${positions[o + 1]}" z="${positions[o + 2]}"/>`)
    }
    tris.push(`<triangle v1="${t * 3}" v2="${t * 3 + 1}" v3="${t * 3 + 2}"/>`)
  }
  return `<mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh>`
}

export function objectsXml(objects: FixtureObject[]): string {
  return objects
    .map((o) => {
      const name = o.name !== undefined ? ` name="${o.name}"` : ''
      const body = o.mesh
        ? meshXml(o.mesh)
        : `<components>${(o.components ?? [])
            .map(
              (c) =>
                `<component${c.path ? ` p:path="${c.path}"` : ''} objectid="${c.objectid}"${
                  c.transform ? ` transform="${c.transform}"` : ''
                }/>`,
            )
            .join('')}</components>`
      return `<object id="${o.id}" type="model"${name}>${body}</object>`
    })
    .join('')
}

export function modelXml(opts: { objects: FixtureObject[]; build?: FixtureBuildItem[]; unit?: string }): string {
  const unit = opts.unit ? ` unit="${opts.unit}"` : ''
  const build = opts.build
    ? `<build>${opts.build
        .map((b) => `<item objectid="${b.objectid}"${b.transform ? ` transform="${b.transform}"` : ''}/>`)
        .join('')}</build>`
    : '<build/>'
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<model${unit} xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" ` +
    `xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"><resources>${objectsXml(opts.objects)}</resources>${build}</model>`
  )
}

export function make3mf(opts: {
  objects: FixtureObject[]
  build: FixtureBuildItem[]
  extraModels?: Record<string, string>
  unit?: string
}): ArrayBuffer {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
    ),
    '3D/3dmodel.model': strToU8(modelXml(opts)),
  }
  for (const [path, xml] of Object.entries(opts.extraModels ?? {})) files[path.replace(/^\//, '')] = strToU8(xml)
  const zipped = zipSync(files)
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer
}
