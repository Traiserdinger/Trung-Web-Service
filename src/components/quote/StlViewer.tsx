import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { BedSize } from '../../config/pricingConfig'
import type { Vec3 } from '../../utils/orientation'
import type { Placement } from '../../utils/plateArrange'

export interface StlViewerHandle {
  resetView(): void
}

export interface ViewerPart {
  id: string
  /** Mesh đã xoay, XZ ở giữa gốc, đáy ở y = 0 */
  positions: Float32Array
  /** Vị trí từng bản trên bàn; null = vẽ một bản ở giữa bàn (đang xếp, hoặc một món không vừa) */
  placements: Placement[] | null
  overflow: boolean
  selected: boolean
}

export interface StlViewerProps {
  parts: ViewerPart[]
  color: string
  bed: BedSize
  /** Bàn in tông tối cho giao diện tối */
  dark?: boolean
  /** Chế độ chọn mặt: rê chuột tô sáng mặt phẳng, bấm để đặt mặt đó xuống bàn */
  pickFace?: boolean
  /** Pháp tuyến hướng ra ngoài của mặt được chọn, trong hệ toạ độ của món (đã bỏ phép xoay trên bàn) */
  onPickFace?: (partId: string, down: Vec3) => void
  onCancelPick?: () => void
  /** Bấm (không kéo) vào một món ngoài chế độ chọn mặt */
  onSelectPart?: (partId: string) => void
}

const BED_THEME = {
  light: { plate: 0xe8ece9, grid1: 0xb9c3be, grid2: 0xd3dad6, volume: 0xc5cec9, ground: 0xdfe5e1 },
  dark: { plate: 0x26322d, grid1: 0x4a5a53, grid2: 0x34423c, volume: 0x46554f, ground: 0x1c2522 },
}

const OVERFLOW_COLOR = '#f59e0b'
const SELECTED_EMISSIVE = 0x1f8f5a

type PartMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>

interface PartEntry {
  positions: Float32Array
  geometry: THREE.BufferGeometry
  material: THREE.MeshPhysicalMaterial
}

/** Toạ độ bàn (mm từ góc bàn, ngược chiều kim đồng hồ nhìn từ trên) sang vị trí / góc xoay của three.js */
function placementTransform(p: Placement, bed: BedSize): { x: number; z: number; rotY: number } {
  return { x: p.x - bed.x / 2, z: -(p.y - bed.y / 2), rotY: (p.rotDeg * Math.PI) / 180 }
}

interface Ctx {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  /** Mọi bản của mọi món đang vẽ */
  group: THREE.Group
  entries: Map<string, PartEntry>
  frame: number
  dirty: boolean
  viewHeight: number
  viewRadius: number
  bed: Bed
  hemi: THREE.HemisphereLight
  highlight: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  /** Tam giác đang được rê chuột tới ở chế độ chọn mặt (-1 = không có) */
  hoverFace: number
  hoverMesh: PartMesh | null
  /** Pháp tuyến trong hệ toạ độ của món */
  hoverNormal: THREE.Vector3
  /** Khoá đặt lại góc nhìn: chỉ đổi khi đổi mesh hoặc chuyển giữa một bản / nhiều bản */
  viewKey: string
}

interface Bed {
  group: THREE.Group
  plateMat: THREE.MeshStandardMaterial
  grid: THREE.GridHelper
  volume: THREE.Box3Helper
}

function makeGrid(bed: BedSize, dark: boolean): THREE.GridHelper {
  const t = dark ? BED_THEME.dark : BED_THEME.light
  const grid = new THREE.GridHelper(bed.x, 18, t.grid1, t.grid2)
  grid.position.y = 0.02
  return grid
}

/** Tấm bàn in bo góc, mặt trên có lưới mảnh */
function buildBed(bed: BedSize, dark: boolean, track: (d: { dispose(): void }) => void): Bed {
  const g = new THREE.Group()
  const shape = new THREE.Shape()
  const w = bed.x + 16
  const d = bed.y + 16
  const r = 10
  shape.moveTo(-w / 2 + r, -d / 2)
  shape.lineTo(w / 2 - r, -d / 2)
  shape.absarc(w / 2 - r, -d / 2 + r, r, -Math.PI / 2, 0, false)
  shape.lineTo(w / 2, d / 2 - r)
  shape.absarc(w / 2 - r, d / 2 - r, r, 0, Math.PI / 2, false)
  shape.lineTo(-w / 2 + r, d / 2)
  shape.absarc(-w / 2 + r, d / 2 - r, r, Math.PI / 2, Math.PI, false)
  shape.lineTo(-w / 2, -d / 2 + r)
  shape.absarc(-w / 2 + r, -d / 2 + r, r, Math.PI, Math.PI * 1.5, false)
  const plateGeo = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: false, curveSegments: 12 })
  plateGeo.rotateX(-Math.PI / 2)
  plateGeo.translate(0, -4, 0)
  const plateMat = new THREE.MeshStandardMaterial({ color: (dark ? BED_THEME.dark : BED_THEME.light).plate, roughness: 0.85 })
  track(plateGeo)
  track(plateMat)
  const plate = new THREE.Mesh(plateGeo, plateMat)
  plate.receiveShadow = true
  g.add(plate)

  const grid = makeGrid(bed, dark)
  g.add(grid)

  const volume = new THREE.Box3Helper(
    new THREE.Box3(new THREE.Vector3(-bed.x / 2, 0, -bed.y / 2), new THREE.Vector3(bed.x / 2, bed.z, bed.y / 2)),
    (dark ? BED_THEME.dark : BED_THEME.light).volume,
  )
  track(volume.geometry)
  track(volume.material as THREE.Material)
  g.add(volume)
  return { group: g, plateMat, grid, volume }
}

/**
 * Tô sáng cả mặt phẳng chứa tam giác `face`: các tam giác cùng pháp tuyến (lệch < ~1°) và cùng
 * mặt phẳng (cách < 0,05 mm). Mesh rất lớn thì chỉ tô đúng tam giác đó cho khỏi giật.
 */
function planarRegion(p: Float32Array, face: number, n: THREE.Vector3): Float32Array {
  const o = face * 9
  const d = n.x * p[o] + n.y * p[o + 1] + n.z * p[o + 2]
  const T = p.length / 9
  if (T > 600_000) return p.slice(o, o + 9)
  const out: number[] = []
  for (let t = 0; t < T; t++) {
    const k = t * 9
    const ux = p[k + 3] - p[k], uy = p[k + 4] - p[k + 1], uz = p[k + 5] - p[k + 2]
    const vx = p[k + 6] - p[k], vy = p[k + 7] - p[k + 1], vz = p[k + 8] - p[k + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len === 0 || Math.abs((nx * n.x + ny * n.y + nz * n.z) / len) < 0.9998) continue
    if (Math.abs(n.x * p[k] + n.y * p[k + 1] + n.z * p[k + 2] - d) > 0.05) continue
    for (let i = 0; i < 9; i++) out.push(p[k + i])
  }
  return new Float32Array(out)
}

const positionsIds = new WeakMap<Float32Array, number>()
let nextPositionsId = 1
/** Số nhận diện cho từng mảng positions, để biết mesh đổi mà không so từng phần tử */
function positionsId(p: Float32Array): number {
  let id = positionsIds.get(p)
  if (!id) {
    id = nextPositionsId++
    positionsIds.set(p, id)
  }
  return id
}

export const StlViewer = forwardRef<StlViewerHandle, StlViewerProps>(function StlViewer(
  { parts, color, bed, dark = false, pickFace = false, onPickFace, onCancelPick, onSelectPart },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<Ctx | null>(null)
  // Giá trị mới nhất cho các listener gắn một lần trong effect khởi tạo
  const pickRef = useRef({ pickFace, onPickFace, onCancelPick, onSelectPart })
  useEffect(() => {
    pickRef.current = { pickFace, onPickFace, onCancelPick, onSelectPart }
  })

  const fitCamera = () => {
    const ctx = ctxRef.current
    if (!ctx) return
    const r = ctx.viewRadius
    const targetY = ctx.viewHeight / 2
    ctx.camera.position.set(r * 1.25, targetY + r * 0.95, r * 1.55)
    ctx.camera.near = Math.max(0.1, r / 200)
    ctx.camera.far = r * 40
    ctx.camera.updateProjectionMatrix()
    ctx.controls.target.set(0, targetY, 0)
    ctx.controls.minDistance = r * 0.4
    ctx.controls.maxDistance = r * 8
    ctx.controls.update()
    ctx.dirty = true
  }

  useImperativeHandle(ref, () => ({ resetView: fitCamera }))

  // Khởi tạo scene một lần.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const disposables: { dispose(): void }[] = []
    const track = (d: { dispose(): void }) => disposables.push(d)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.85
    track(env)
    track(pmrem)

    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.position.set(-120, 260, 160)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const sc = sun.shadow.camera
    sc.left = sc.bottom = -140
    sc.right = sc.top = 140
    sc.far = 800
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.6
    scene.add(sun)
    const hemi = new THREE.HemisphereLight(0xffffff, dark ? BED_THEME.dark.ground : BED_THEME.light.ground, 0.45)
    scene.add(hemi)
    const bedObj = buildBed(bed, dark, track)
    scene.add(bedObj.group)

    const highlightMat = new THREE.MeshBasicMaterial({
      color: 0x2bd982,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    track(highlightMat)
    const highlight = new THREE.Mesh(new THREE.BufferGeometry(), highlightMat)
    highlight.visible = false
    highlight.renderOrder = 2
    scene.add(highlight)

    const camera = new THREE.PerspectiveCamera(32, 1, 1, 5000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxPolarAngle = Math.PI * 0.49

    const group = new THREE.Group()
    scene.add(group)
    const bedRadius = Math.max(bed.x, bed.y, bed.z) * 0.75
    const ctx: Ctx = {
      renderer,
      scene,
      camera,
      controls,
      group,
      entries: new Map(),
      frame: 0,
      dirty: true,
      viewHeight: bed.z / 3,
      viewRadius: bedRadius,
      bed: bedObj,
      hemi,
      highlight,
      hoverFace: -1,
      hoverMesh: null,
      hoverNormal: new THREE.Vector3(),
      viewKey: '',
    }
    ctxRef.current = ctx
    controls.addEventListener('change', () => (ctx.dirty = true))

    const resize = () => {
      const w = host.clientWidth || 1
      const h = host.clientHeight || 1
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      ctx.dirty = true
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    fitCamera()

    // Chọn mặt đặt xuống bàn: rê để tô sáng, bấm (không kéo) để chọn
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let downAt: { x: number; y: number } | null = null
    const clearHover = () => {
      if (ctx.hoverFace === -1) return
      ctx.hoverFace = -1
      ctx.hoverMesh = null
      highlight.visible = false
      ctx.dirty = true
    }
    const raycast = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      return raycaster.intersectObjects(ctx.group.children, false)[0]
    }
    const hover = (e: PointerEvent) => {
      if (!pickRef.current.pickFace || ctx.group.children.length === 0) return clearHover()
      const hit = raycast(e)
      if (!hit || hit.faceIndex == null || !hit.face) return clearHover()
      const obj = hit.object as PartMesh
      if (hit.faceIndex === ctx.hoverFace && obj === ctx.hoverMesh) return
      // face.normal ở hệ toạ độ của món. Hướng ra ngoài = phía nhìn thấy được từ camera, so trong
      // hệ thế giới (không phụ thuộc winding của file)
      const n = hit.face.normal.clone()
      const world = n.clone().applyQuaternion(obj.quaternion)
      if (world.dot(raycaster.ray.direction) > 0) n.negate()
      ctx.hoverFace = hit.faceIndex
      ctx.hoverMesh = obj
      ctx.hoverNormal.copy(n)
      const pos = obj.geometry.getAttribute('position').array as Float32Array
      highlight.geometry.dispose()
      highlight.geometry = new THREE.BufferGeometry()
      highlight.geometry.setAttribute('position', new THREE.BufferAttribute(planarRegion(pos, hit.faceIndex, n), 3))
      highlight.position.copy(obj.position)
      highlight.quaternion.copy(obj.quaternion)
      highlight.visible = true
      ctx.dirty = true
    }
    const onDown = (e: PointerEvent) => (downAt = { x: e.clientX, y: e.clientY })
    const onUp = (e: PointerEvent) => {
      const start = downAt
      downAt = null
      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) return
      if (!pickRef.current.pickFace) {
        const id = raycast(e)?.object.userData.partId as string | undefined
        if (id) pickRef.current.onSelectPart?.(id)
        return
      }
      hover(e) // chạm trên màn cảm ứng không có pointermove trước đó
      if (ctx.hoverFace === -1 || !ctx.hoverMesh) return
      const n = ctx.hoverNormal
      const down: Vec3 = [n.x, n.y, n.z]
      const id = ctx.hoverMesh.userData.partId as string
      clearHover()
      pickRef.current.onPickFace?.(id, down)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pickRef.current.pickFace) pickRef.current.onCancelPick?.()
    }
    const el = renderer.domElement
    el.addEventListener('pointermove', hover)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointerleave', clearHover)
    window.addEventListener('keydown', onKey)

    // Chỉ vẽ lại khi có thay đổi (xoay, đổi file, đổi màu) để đỡ tốn pin
    const loop = () => {
      ctx.frame = requestAnimationFrame(loop)
      const moved = controls.update()
      if (moved || ctx.dirty) {
        ctx.dirty = false
        renderer.render(scene, camera)
      }
    }
    loop()

    return () => {
      cancelAnimationFrame(ctx.frame)
      el.removeEventListener('pointermove', hover)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', clearHover)
      window.removeEventListener('keydown', onKey)
      highlight.geometry.dispose()
      ctx.bed.grid.geometry.dispose()
      ;(ctx.bed.grid.material as THREE.Material).dispose()
      observer.disconnect()
      controls.dispose()
      for (const en of ctx.entries.values()) {
        en.geometry.dispose()
        en.material.dispose()
      }
      ctx.entries.clear()
      for (const d of disposables) d.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      ctxRef.current = null
    }
    // bed cố định theo config; color/positions xử lý ở effect riêng
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bed.x, bed.y, bed.z])

  // Dựng lại các bản trên bàn khi đổi món, hướng in, vị trí xếp, món đang chọn hay màu.
  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.hoverFace = -1
    ctx.hoverMesh = null
    ctx.highlight.visible = false
    ctx.group.clear()

    const keep = new Set<string>()
    let instances = 0
    let single: PartEntry | undefined
    for (const part of parts) {
      if (part.positions.length < 9) continue
      keep.add(part.id)
      let en = ctx.entries.get(part.id)
      if (en && en.positions !== part.positions) {
        en.geometry.dispose()
        en.material.dispose()
        en = undefined
      }
      if (!en) {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3))
        geometry.computeVertexNormals()
        geometry.computeBoundingSphere()
        geometry.computeBoundingBox()
        const material = new THREE.MeshPhysicalMaterial({ roughness: 0.5, clearcoat: 0.15, side: THREE.DoubleSide })
        en = { positions: part.positions, geometry, material }
        ctx.entries.set(part.id, en)
      }
      en.material.color.set(part.overflow ? OVERFLOW_COLOR : color)
      en.material.emissive.set(part.selected ? SELECTED_EMISSIVE : 0x000000)
      en.material.emissiveIntensity = part.selected ? 0.35 : 0
      for (const p of part.placements ?? [null]) {
        const mesh: PartMesh = new THREE.Mesh(en.geometry, en.material)
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.userData.partId = part.id
        if (p) {
          const t = placementTransform(p, bed)
          mesh.position.set(t.x, 0, t.z)
          mesh.rotation.y = t.rotY
        }
        ctx.group.add(mesh)
        instances++
        single = en
      }
    }
    for (const [id, en] of ctx.entries) {
      if (keep.has(id)) continue
      en.geometry.dispose()
      en.material.dispose()
      ctx.entries.delete(id)
    }
    ctx.dirty = true

    // Góc nhìn: chỉ đặt lại khi đổi mesh hoặc chuyển giữa một bản / nhiều bản, không phải khi chọn món
    const viewKey = parts.map((p) => `${p.id}:${positionsId(p.positions)}`).join('|') + (instances > 1 ? '*' : '')
    if (viewKey === ctx.viewKey) return
    ctx.viewKey = viewKey
    const bedRadius = Math.max(bed.x, bed.y, bed.z) * 0.75
    if (instances === 1 && single) {
      const sphere = single.geometry.boundingSphere!
      ctx.viewRadius = Math.max(sphere.radius * 1.5, Math.min(bedRadius, sphere.radius * 5), 22)
      ctx.viewHeight = single.geometry.boundingBox!.max.y
    } else if (instances > 1) {
      ctx.viewRadius = bedRadius
      ctx.viewHeight = Math.max(bed.z / 3, ...[...ctx.entries.values()].map((en) => en.geometry.boundingBox!.max.y))
    } else {
      ctx.viewRadius = bedRadius
      ctx.viewHeight = bed.z / 3
    }
    fitCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, color])

  // Đổi tông bàn in theo giao diện sáng/tối
  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const t = dark ? BED_THEME.dark : BED_THEME.light
    ctx.bed.plateMat.color.set(t.plate)
    ;(ctx.bed.volume.material as THREE.LineBasicMaterial).color.set(t.volume)
    ctx.hemi.groundColor.set(t.ground)
    ctx.bed.group.remove(ctx.bed.grid)
    ctx.bed.grid.geometry.dispose()
    ;(ctx.bed.grid.material as THREE.Material).dispose()
    ctx.bed.grid = makeGrid(bed, dark)
    ctx.bed.group.add(ctx.bed.grid)
    ctx.dirty = true
    // bed cố định theo config
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark])

  // Bỏ tô sáng khi thoát chế độ chọn mặt; đổi con trỏ cho biết đang chọn
  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.renderer.domElement.style.cursor = pickFace ? 'crosshair' : ''
    if (!pickFace && ctx.hoverFace !== -1) {
      ctx.hoverFace = -1
      ctx.highlight.visible = false
      ctx.dirty = true
    }
  }, [pickFace])

  return <div ref={hostRef} className="h-full w-full touch-none" aria-label="Xem trước mô hình 3D trên bàn in" />
})
