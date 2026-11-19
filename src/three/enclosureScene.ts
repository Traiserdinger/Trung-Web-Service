// Cảnh 3D ở hero: vỏ in 3D + PCB + nắp mờ, tách lớp rồi lắp khớp.
// Toàn bộ dựng bằng code (không cần file mô hình). Đơn vị: mm.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

export interface EnclosureScene {
  setExploded(exploded: boolean): void
  dispose(): void
}

export interface EnclosureSceneOptions {
  reducedMotion: boolean
  /** Cho phép kéo xoay (tắt trên màn hình cảm ứng để không chặn cuộn trang) */
  interactive: boolean
  callouts: { port: string; vent: string; standoff: string }
  onFirstAssembled?(): void
}

// ---- Kích thước (mm) ----
const W = 84 // dài vỏ (x)
const D = 58 // sâu vỏ (z)
const R = 7 // bo góc ngoài
const T = 2 // dày vách
const FLOOR = 2
const WALL_TOP = 24
const LID = 2.4
const PCB_W = 76
const PCB_D = 52
const PCB_T = 1.6
const PCB_Y = FLOOR + 4 // đáy PCB nằm trên chân đế cao 4 mm
const PCB_TOP = PCB_Y + PCB_T
const HOLES: [number, number][] = [
  [-34, -22],
  [34, -22],
  [-34, 22],
  [34, 22],
]
const USB_X = -16
const PORT_W = 11
const PORT_Y0 = PCB_TOP - 0.8
const PORT_Y1 = PCB_TOP + 4.4
const MCU: [number, number] = [12, -3] // (x, z)

const EXPLODE_PCB = 24
const EXPLODE_LID = 52

const COLORS = {
  shell: 0xf2f4f2,
  lid: 0xffffff,
  mask: '#0f6b45',
  maskTrace: '#1f8a5c',
  pad: '#d6ad45',
  silk: '#f4f7f5',
  fr4: 0xc9c08f,
}

// ---------- Hình 2D ----------

function roundedRectPath(path: THREE.Path, w: number, d: number, r: number, cx = 0, cy = 0) {
  const x0 = cx - w / 2
  const x1 = cx + w / 2
  const y0 = cy - d / 2
  const y1 = cy + d / 2
  path.moveTo(x0 + r, y0)
  path.lineTo(x1 - r, y0)
  path.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false)
  path.lineTo(x1, y1 - r)
  path.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false)
  path.lineTo(x0 + r, y1)
  path.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false)
  path.lineTo(x0, y0 + r)
  path.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false)
  return path
}

function roundedRect(w: number, d: number, r: number): THREE.Shape {
  return roundedRectPath(new THREE.Shape(), w, d, r) as THREE.Shape
}

function ring(w: number, d: number, r: number, t: number): THREE.Shape {
  const s = roundedRect(w, d, r)
  s.holes.push(roundedRectPath(new THREE.Path(), w - 2 * t, d - 2 * t, r - t))
  return s
}

/** Vòng vách có khe cắt xuyên ở vách trước (shape y = −d/2 ↔ world z = +d/2). */
function slottedRing(w: number, d: number, r: number, t: number, gx0: number, gx1: number): THREE.Shape {
  const ri = r - t
  const hx = w / 2
  const hy = d / 2
  const s = new THREE.Shape()
  s.moveTo(gx1, -hy)
  s.lineTo(hx - r, -hy)
  s.absarc(hx - r, -hy + r, r, -Math.PI / 2, 0, false)
  s.lineTo(hx, hy - r)
  s.absarc(hx - r, hy - r, r, 0, Math.PI / 2, false)
  s.lineTo(-hx + r, hy)
  s.absarc(-hx + r, hy - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(-hx, -hy + r)
  s.absarc(-hx + r, -hy + r, r, Math.PI, Math.PI * 1.5, false)
  s.lineTo(gx0, -hy)
  s.lineTo(gx0, -hy + t)
  s.lineTo(-hx + t + ri, -hy + t)
  s.absarc(-hx + t + ri, -hy + t + ri, ri, Math.PI * 1.5, Math.PI, true)
  s.lineTo(-hx + t, hy - t - ri)
  s.absarc(-hx + t + ri, hy - t - ri, ri, Math.PI, Math.PI / 2, true)
  s.lineTo(hx - t - ri, hy - t)
  s.absarc(hx - t - ri, hy - t - ri, ri, Math.PI / 2, 0, true)
  s.lineTo(hx - t, -hy + t + ri)
  s.absarc(hx - t - ri, -hy + t + ri, ri, 0, -Math.PI / 2, true)
  s.lineTo(gx1, -hy + t)
  s.lineTo(gx1, -hy)
  return s
}

/** Extrude một shape (mặt phẳng XY) thành khối đứng từ y0 tới y1 trong không gian thế giới. */
function extrudeUp(shape: THREE.Shape, y0: number, y1: number, curveSegments = 16): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments })
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0, 0)
  return g
}

// ---------- Texture vẽ bằng canvas ----------

/** Vân lớp in 3D (0.2 mm) cho bump map của vỏ. UV vách = mm theo chiều cao. */
function layerLinesTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 8
  c.height = 64
  const g = c.getContext('2d')!
  for (let y = 0; y < 64; y++) {
    const v = 128 + 70 * Math.sin((y / 64) * Math.PI * 2)
    g.fillStyle = `rgb(${v},${v},${v})`
    g.fillRect(0, y, 8, 1)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1, 1 / 0.45) // một vân mỗi 0.45 mm
  return tex
}

/** Mặt trên PCB: mặt nạ hàn, đường đồng, pad vàng, chữ silkscreen. */
function pcbTexture(): THREE.CanvasTexture {
  const S = 14 // px / mm
  const cw = PCB_W * S
  const ch = PCB_D * S
  const c = document.createElement('canvas')
  c.width = cw
  c.height = ch
  const g = c.getContext('2d')!
  // world (x, z) → canvas px. Canvas y tăng theo world z (mép trước ở dưới).
  const px = (x: number) => (x + PCB_W / 2) * S
  const pz = (z: number) => (z + PCB_D / 2) * S

  g.fillStyle = COLORS.mask
  g.fillRect(0, 0, cw, ch)

  // Đường đồng dưới mặt nạ
  g.strokeStyle = COLORS.maskTrace
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const trace = (pts: [number, number][], w = 0.35) => {
    g.lineWidth = w * S
    g.beginPath()
    pts.forEach(([x, z], i) => (i === 0 ? g.moveTo(px(x), pz(z)) : g.lineTo(px(x), pz(z))))
    g.stroke()
  }
  for (let i = 0; i < 7; i++) {
    const z = MCU[1] - 4.5 + i * 1.5
    trace([[MCU[0] - 7.5, z], [MCU[0] - 13 - i * 0.8, z], [MCU[0] - 13 - i * 0.8, -20 + i * 0.4], [-30 + i * 2.2, -20 + i * 0.4], [-30 + i * 2.2, -23.5]])
  }
  for (let i = 0; i < 6; i++) {
    const x = MCU[0] - 4 + i * 1.6
    trace([[x, MCU[1] + 7.5], [x, 8 + i], [USB_X + 3 - i * 1.1, 14 + i * 0.6], [USB_X + 3 - i * 1.1, 21]])
  }
  for (let i = 0; i < 6; i++) {
    const z = MCU[1] - 4 + i * 1.6
    trace([[MCU[0] + 7.5, z], [MCU[0] + 12 + i * 0.9, z], [MCU[0] + 12 + i * 0.9, 14 + i], [33, 14 + i]])
  }
  trace([[-36, 0], [36, 0]], 1.2)
  trace([[-36, 3], [-24, 3], [-24, 12], [-6, 12]], 0.8)

  // Vias
  g.fillStyle = COLORS.pad
  for (let i = 0; i < 26; i++) {
    const x = -30 + ((i * 37) % 60)
    const z = -18 + ((i * 23) % 36)
    g.beginPath()
    g.arc(px(x), pz(z), 0.45 * S, 0, Math.PI * 2)
    g.fill()
  }

  // Pad quanh MCU (LQFP)
  g.fillStyle = COLORS.pad
  for (let i = 0; i < 16; i++) {
    const o = -6 + i * 0.8
    g.fillRect(px(MCU[0] + o) - 0.15 * S, pz(MCU[1] - 7.9), 0.3 * S, 1.2 * S)
    g.fillRect(px(MCU[0] + o) - 0.15 * S, pz(MCU[1] + 6.7), 0.3 * S, 1.2 * S)
    g.fillRect(px(MCU[0] - 7.9), pz(MCU[1] + o) - 0.15 * S, 1.2 * S, 0.3 * S)
    g.fillRect(px(MCU[0] + 6.7), pz(MCU[1] + o) - 0.15 * S, 1.2 * S, 0.3 * S)
  }
  // Pad vòng quanh lỗ bắt vít
  for (const [x, z] of HOLES) {
    g.beginPath()
    g.arc(px(x), pz(z), 2.6 * S, 0, Math.PI * 2)
    g.fill()
  }
  // Test point
  for (let i = 0; i < 5; i++) {
    g.beginPath()
    g.arc(px(24 + i * 2.4), pz(-14), 0.7 * S, 0, Math.PI * 2)
    g.fill()
  }

  // Silkscreen
  g.strokeStyle = COLORS.silk
  g.fillStyle = COLORS.silk
  g.lineWidth = 0.18 * S
  g.strokeRect(px(MCU[0] - 8.6), pz(MCU[1] - 8.6), 17.2 * S, 17.2 * S)
  g.strokeRect(px(USB_X - 5.6), pz(18.6), 11.2 * S, 7.6 * S)
  g.strokeRect(px(-34), pz(-25.2), 30 * S, 6 * S)
  g.font = `600 ${2.1 * S}px "Be Vietnam Pro", sans-serif`
  g.fillText('U1', px(MCU[0] - 8.4), pz(MCU[1] - 9.4))
  g.fillText('J1  USB-C', px(USB_X - 5.4), pz(17.8))
  g.fillText('ESC', px(-33.6), pz(-17.4))
  g.font = `700 ${2.8 * S}px "Bricolage Grotesque", sans-serif`
  g.fillText('ĐỨC TRUNG', px(-35), pz(9))
  g.font = `500 ${1.8 * S}px "Be Vietnam Pro", sans-serif`
  g.fillText('REV A  2026', px(-35), pz(12.4))
  g.beginPath()
  g.arc(px(MCU[0] - 5.5), pz(MCU[1] - 5.5), 0.5 * S, 0, Math.PI * 2)
  g.fill()

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  // UV mặt PCB = toạ độ shape (mm) → [0, 1]
  tex.repeat.set(1 / PCB_W, 1 / PCB_D)
  tex.offset.set(0.5, 0.5)
  return tex
}

/** Bóng tiếp xúc giả dưới vỏ (gradient mềm) */
function contactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128)
  grad.addColorStop(0, 'rgba(27,36,32,0.55)')
  grad.addColorStop(0.55, 'rgba(27,36,32,0.18)')
  grad.addColorStop(1, 'rgba(27,36,32,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

// ---------- Dựng cảnh ----------

export function createEnclosureScene(host: HTMLElement, opts: EnclosureSceneOptions): EnclosureScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.style.display = 'block'
  host.appendChild(renderer.domElement)

  const labelRenderer = new CSS2DRenderer()
  labelRenderer.domElement.style.position = 'absolute'
  labelRenderer.domElement.style.inset = '0'
  labelRenderer.domElement.style.pointerEvents = 'none'
  labelRenderer.domElement.style.overflow = 'visible'
  host.appendChild(labelRenderer.domElement)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTexture
  scene.environmentIntensity = 0.9

  const key = new THREE.DirectionalLight(0xffffff, 1.5)
  key.position.set(-60, 160, 90)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -90
  key.shadow.camera.right = 90
  key.shadow.camera.top = 90
  key.shadow.camera.bottom = -90
  key.shadow.camera.near = 10
  key.shadow.camera.far = 400
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.4
  scene.add(key)
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe5e1, 0.5))

  const disposables: { dispose(): void }[] = [envTexture, pmrem]
  const track = <T extends { dispose(): void }>(x: T) => {
    disposables.push(x)
    return x
  }

  // Sàn nhận bóng
  const ground = new THREE.Mesh(
    track(new THREE.PlaneGeometry(600, 600)),
    track(new THREE.ShadowMaterial({ color: 0x1b2420, opacity: 0.1 })),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)
  const contact = new THREE.Mesh(
    track(new THREE.PlaneGeometry(W * 1.5, D * 1.6)),
    track(new THREE.MeshBasicMaterial({ map: track(contactShadowTexture()), transparent: true, depthWrite: false })),
  )
  contact.rotation.x = -Math.PI / 2
  contact.position.y = 0.05
  scene.add(contact)

  const model = new THREE.Group()
  scene.add(model)

  // ---- Vỏ dưới ----
  const lines = track(layerLinesTexture())
  const shellMat = track(
    new THREE.MeshPhysicalMaterial({
      color: COLORS.shell,
      roughness: 0.72,
      clearcoat: 0.08,
      bumpMap: lines,
      bumpScale: 0.35,
    }),
  )
  const shell = new THREE.Group()
  const shellParts = [
    extrudeUp(roundedRect(W, D, R), 0, FLOOR),
    extrudeUp(ring(W, D, R, T), FLOOR, PORT_Y0),
    extrudeUp(slottedRing(W, D, R, T, USB_X - PORT_W / 2, USB_X + PORT_W / 2), PORT_Y0, PORT_Y1),
    extrudeUp(ring(W, D, R, T), PORT_Y1, WALL_TOP),
  ]
  for (const geo of shellParts) {
    const m = new THREE.Mesh(track(geo), shellMat)
    m.castShadow = true
    m.receiveShadow = true
    shell.add(m)
  }
  // Chân đế dưới lỗ mạch
  const standoffGeo = track(new THREE.CylinderGeometry(2.6, 2.9, PCB_Y - FLOOR, 24))
  for (const [x, z] of HOLES) {
    const s = new THREE.Mesh(standoffGeo, shellMat)
    s.position.set(x, FLOOR + (PCB_Y - FLOOR) / 2, z)
    s.castShadow = true
    s.receiveShadow = true
    shell.add(s)
  }
  model.add(shell)

  // ---- PCB ----
  const pcb = new THREE.Group()
  const boardShape = roundedRect(PCB_W, PCB_D, 3.5)
  for (const [x, z] of HOLES) {
    const h = new THREE.Path()
    h.absarc(x, -z, 1.4, 0, Math.PI * 2, false)
    boardShape.holes.push(h)
  }
  const maskMat = track(
    new THREE.MeshPhysicalMaterial({
      map: track(pcbTexture()),
      roughness: 0.42,
      clearcoat: 0.5,
      clearcoatRoughness: 0.35,
    }),
  )
  const edgeMat = track(new THREE.MeshStandardMaterial({ color: COLORS.fr4, roughness: 0.8 }))
  const board = new THREE.Mesh(track(extrudeUp(boardShape, PCB_Y, PCB_TOP, 24)), [maskMat, edgeMat])
  board.castShadow = true
  board.receiveShadow = true
  pcb.add(board)

  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, z: number, y = PCB_TOP) => {
    const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), mat)
    m.position.set(x, y + h / 2, z)
    m.castShadow = true
    m.receiveShadow = true
    pcb.add(m)
    return m
  }
  const icMat = track(new THREE.MeshStandardMaterial({ color: 0x1c1f1e, roughness: 0.55 }))
  const metalMat = track(new THREE.MeshStandardMaterial({ color: 0xd5d9dc, metalness: 1, roughness: 0.28 }))
  const capMat = track(new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 0.6 }))
  const jstMat = track(new THREE.MeshStandardMaterial({ color: 0xf4f2ea, roughness: 0.5 }))
  const goldMat = track(new THREE.MeshStandardMaterial({ color: 0xd6ad45, metalness: 1, roughness: 0.3 }))
  const ledMat = track(
    new THREE.MeshStandardMaterial({ color: 0x9cffc8, emissive: 0x2bff8f, emissiveIntensity: 1.6, roughness: 0.3 }),
  )

  box(14, 1.4, 14, icMat, MCU[0], MCU[1]) // MCU
  box(5, 1, 5, icMat, -6, -10) // IMU
  box(4, 1.2, 6.5, icMat, 26, 10) // regulator
  box(3.2, 1, 2.5, metalMat, MCU[0] - 11, MCU[1] + 7) // crystal
  // USB-C: thân kim loại bo tròn, nhô ra mép trước
  const usb = new THREE.Mesh(
    track(new THREE.CapsuleGeometry(1.55, 5.8, 6, 16).rotateZ(Math.PI / 2).scale(1, 1, 2.3)),
    metalMat,
  )
  usb.position.set(USB_X, PCB_TOP + 1.6, PCB_D / 2 - 2.6)
  usb.castShadow = true
  pcb.add(usb)
  // Đầu JST màu trắng ở mép sau
  for (let i = 0; i < 3; i++) {
    const j = box(8, 5.5, 5.5, jstMat, -29 + i * 10.5, -PCB_D / 2 + 3.4)
    j.position.y = PCB_TOP + 2.75
  }
  // Tụ, trở rải quanh
  const caps: [number, number][] = [
    [2, -12], [4, -12], [22, -10], [22, -6], [-4, 4], [-2, 4], [28, 2], [30, 2], [-14, -2], [-14, 0], [6, 9], [8, 9],
  ]
  for (const [x, z] of caps) box(1.6, 0.8, 0.9, capMat, x, z)
  box(1.6, 0.6, 0.9, ledMat, USB_X + 9, PCB_D / 2 - 3.5) // LED
  // Vít bắt vào chân đế
  const screwGeo = track(new THREE.CylinderGeometry(2.3, 2.3, 1.3, 24))
  for (const [x, z] of HOLES) {
    const s = new THREE.Mesh(screwGeo, metalMat)
    s.position.set(x, PCB_TOP + 0.65, z)
    s.castShadow = true
    pcb.add(s)
    const slot = new THREE.Mesh(track(new THREE.BoxGeometry(2.6, 0.3, 0.5)), icMat)
    slot.position.set(x, PCB_TOP + 1.32, z)
    pcb.add(slot)
  }
  // Header vàng
  for (let i = 0; i < 6; i++) box(0.64, 4, 0.64, goldMat, 22 + i * 2.54, 20.5)
  box(15.5, 2.5, 2.5, icMat, 22 + 2.54 * 2.5, 20.5)
  model.add(pcb)

  // ---- Nắp mờ (PETG trong) ----
  const lid = new THREE.Group()
  const lidShape = roundedRect(W, D, R)
  for (let i = 0; i < 5; i++) {
    const x = MCU[0] - 8 + i * 4
    const slot = new THREE.Path()
    // khe dọc theo z, đặt ngay trên MCU (shape y = −world z)
    const y0 = -MCU[1] - 8
    const y1 = -MCU[1] + 8
    slot.moveTo(x - 1.1, y0 + 1.1)
    slot.lineTo(x - 1.1, y1 - 1.1)
    slot.absarc(x, y1 - 1.1, 1.1, Math.PI, 0, true)
    slot.lineTo(x + 1.1, y0 + 1.1)
    slot.absarc(x, y0 + 1.1, 1.1, 0, Math.PI, true)
    lidShape.holes.push(slot)
  }
  const lidMat = track(
    new THREE.MeshPhysicalMaterial({
      color: COLORS.lid,
      roughness: 0.14,
      transmission: 1,
      thickness: 1.2,
      ior: 1.5,
      attenuationColor: new THREE.Color(0xdcefe5),
      attenuationDistance: 60,
      specularIntensity: 0.6,
      clearcoat: 0.2,
    }),
  )
  const lidGeo = track(extrudeUp(lidShape, WALL_TOP, WALL_TOP + LID, 20))
  const lidPlate = new THREE.Mesh(lidGeo, lidMat)
  lidPlate.castShadow = true
  lid.add(lidPlate)
  // Viền mảnh kiểu bản vẽ để nắp trong vẫn đọc được hình khối
  const lidEdges = new THREE.LineSegments(
    track(new THREE.EdgesGeometry(lidGeo, 25)),
    track(new THREE.LineBasicMaterial({ color: 0x9fb0a8, transparent: true, opacity: 0.75 })),
  )
  lid.add(lidEdges)
  const lip = new THREE.Mesh(
    track(extrudeUp(ring(W - 2 * T - 0.6, D - 2 * T - 0.6, R - T - 0.3, 1.2), WALL_TOP - 3, WALL_TOP)),
    lidMat,
  )
  lid.add(lip)
  model.add(lid)

  // ---- Chú thích ----
  const makeLabel = (text: string, side: 'left' | 'right') => {
    const el = document.createElement('div')
    el.className = 'callout'
    el.dataset.side = side
    el.style.opacity = '0'
    const span = document.createElement('span')
    span.textContent = text
    el.appendChild(span)
    const obj = new CSS2DObject(el)
    obj.center.set(side === 'left' ? 1 : 0, 0.5)
    return obj
  }
  const portLabel = makeLabel(opts.callouts.port, 'left')
  portLabel.position.set(USB_X, (PORT_Y0 + PORT_Y1) / 2, D / 2 + 0.5)
  shell.add(portLabel)
  const ventLabel = makeLabel(opts.callouts.vent, 'right')
  ventLabel.position.set(MCU[0] + 9, WALL_TOP + LID + 0.2, MCU[1])
  lid.add(ventLabel)
  const standoffLabel = makeLabel(opts.callouts.standoff, 'right')
  standoffLabel.position.set(HOLES[3][0] + 2.4, PCB_TOP + 1.3, HOLES[3][1])
  pcb.add(standoffLabel)
  const labels = [portLabel, ventLabel, standoffLabel]
  const setLabelsVisible = (v: boolean) => labels.forEach((l) => (l.element.style.opacity = v ? '1' : '0'))

  // ---- Camera và điều khiển ----
  const camera = new THREE.PerspectiveCamera(26, 1, 1, 2000)
  const target = new THREE.Vector3(0, 17, 0)
  camera.position.set(140, 112, 196)
  camera.lookAt(target)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.copy(target)
  controls.enableZoom = false
  controls.enablePan = false
  controls.enableDamping = true
  controls.dampingFactor = 0.07
  controls.minPolarAngle = Math.PI * 0.16
  controls.maxPolarAngle = Math.PI * 0.46
  // Không tự xoay: chuyển động duy nhất không do người dùng là khoảnh khắc lắp ráp lúc tải trang.
  controls.enabled = opts.interactive
  if (!opts.interactive) renderer.domElement.style.touchAction = 'pan-y'
  controls.update()

  // ---- Hoạt cảnh tách / lắp ----
  let explode = opts.reducedMotion ? 0 : 1 // 1 = tách, 0 = lắp
  let from = explode
  let to = 0
  let animStart = performance.now() + (opts.reducedMotion ? 0 : 700)
  const DURATION = opts.reducedMotion ? 1 : 1600
  let firstAssembledFired = false
  const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

  // Nâng camera theo độ tách để nắp không bay khỏi khung
  let camLift = 0
  const applyExplode = (e: number) => {
    const lift = 20 * e
    camera.position.y += lift - camLift
    controls.target.y += lift - camLift
    camLift = lift
    // Lắp (e: 1 → 0): PCB vào chỗ trước, nắp đóng sau. Tách thì ngược lại.
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
    const pcbE = clamp01((e - 0.35) / 0.65)
    const lidE = clamp01(e / 0.75)
    pcb.position.y = EXPLODE_PCB * pcbE
    lid.position.y = EXPLODE_LID * lidE
    lid.rotation.z = 0.05 * lidE
  }
  applyExplode(explode)

  const step = (now: number) => {
    if (now >= animStart && explode !== to) {
      const t = Math.min(1, (now - animStart) / DURATION)
      explode = from + (to - from) * easeInOut(t)
      if (t >= 1) explode = to
      applyExplode(explode)
      if (explode === 0 && !firstAssembledFired) {
        firstAssembledFired = true
        setLabelsVisible(true)
        opts.onFirstAssembled?.()
      }
    }
  }
  if (opts.reducedMotion) {
    firstAssembledFired = true
    setLabelsVisible(true)
  }

  // ---- Kích thước, vòng lặp, tạm dừng khi khuất ----
  const resize = () => {
    const w = host.clientWidth || 1
    const h = host.clientHeight || 1
    renderer.setSize(w, h, false)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    labelRenderer.setSize(w, h)
    // Màn hẹp không đủ chỗ cho chú thích dài: ẩn đi thay vì để tràn mép
    labelRenderer.domElement.style.display = w < 560 ? 'none' : ''
    camera.aspect = w / h
    // Màn hẹp: lùi camera để mô hình vừa khung
    const aspect = w / h
    camera.zoom = aspect < 0.9 ? 0.78 : aspect < 1.2 ? 0.98 : 1.14
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(host)
  resize()

  let visible = true
  const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { threshold: 0.01 })
  io.observe(host)

  let frame = 0
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop)
    if (!visible || document.hidden) return
    step(now)
    controls.update()
    renderer.render(scene, camera)
    labelRenderer.render(scene, camera)
  }
  frame = requestAnimationFrame(loop)

  return {
    setExploded(v: boolean) {
      from = explode
      to = v ? 1 : 0
      animStart = performance.now()
    },
    dispose() {
      cancelAnimationFrame(frame)
      ro.disconnect()
      io.disconnect()
      controls.dispose()
      for (const d of disposables) d.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      labelRenderer.domElement.remove()
    },
  }
}
