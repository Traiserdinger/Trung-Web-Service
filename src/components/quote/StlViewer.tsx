import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { BedSize } from '../../config/pricingConfig'

export interface StlViewerHandle {
  resetView(): void
}

export interface StlViewerProps {
  positions: Float32Array | null
  color: string
  overflow: boolean
  bed: BedSize
}

const OVERFLOW_COLOR = '#d92d20'

interface Ctx {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial> | null
  material: THREE.MeshPhysicalMaterial
  frame: number
  dirty: boolean
  viewHeight: number
  viewRadius: number
}

/** Tấm bàn in bo góc, mặt trên có lưới mảnh */
function buildBed(bed: BedSize, track: (d: { dispose(): void }) => void): THREE.Group {
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
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xe8ece9, roughness: 0.85 })
  track(plateGeo)
  track(plateMat)
  const plate = new THREE.Mesh(plateGeo, plateMat)
  plate.receiveShadow = true
  g.add(plate)

  const grid = new THREE.GridHelper(bed.x, 18, 0xb9c3be, 0xd3dad6)
  grid.position.y = 0.02
  track(grid.geometry)
  track(grid.material as THREE.Material)
  g.add(grid)

  const volume = new THREE.Box3Helper(
    new THREE.Box3(new THREE.Vector3(-bed.x / 2, 0, -bed.y / 2), new THREE.Vector3(bed.x / 2, bed.z, bed.y / 2)),
    0xc5cec9,
  )
  track(volume.geometry)
  track(volume.material as THREE.Material)
  g.add(volume)
  return g
}

export const StlViewer = forwardRef<StlViewerHandle, StlViewerProps>(function StlViewer(
  { positions, color, overflow, bed },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<Ctx | null>(null)

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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
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
    scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe5e1, 0.45))
    scene.add(buildBed(bed, track))

    const camera = new THREE.PerspectiveCamera(32, 1, 1, 5000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxPolarAngle = Math.PI * 0.49

    const material = new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, clearcoat: 0.15, side: THREE.DoubleSide })
    track(material)
    const bedRadius = Math.max(bed.x, bed.y, bed.z) * 0.75
    const ctx: Ctx = {
      renderer,
      scene,
      camera,
      controls,
      mesh: null,
      material,
      frame: 0,
      dirty: true,
      viewHeight: bed.z / 3,
      viewRadius: bedRadius,
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
      observer.disconnect()
      controls.dispose()
      ctx.mesh?.geometry.dispose()
      for (const d of disposables) d.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      ctxRef.current = null
    }
    // bed cố định theo config; color/positions xử lý ở effect riêng
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bed.x, bed.y, bed.z])

  // Thay geometry khi có file mới.
  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    if (ctx.mesh) {
      ctx.scene.remove(ctx.mesh)
      ctx.mesh.geometry.dispose()
      ctx.mesh = null
    }
    const bedRadius = Math.max(bed.x, bed.y, bed.z) * 0.75
    if (positions && positions.length >= 9) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.computeVertexNormals()
      geometry.computeBoundingSphere()
      geometry.computeBoundingBox()
      ctx.mesh = new THREE.Mesh(geometry, ctx.material)
      ctx.mesh.castShadow = true
      ctx.mesh.receiveShadow = true
      ctx.scene.add(ctx.mesh)
      const sphere = geometry.boundingSphere!
      ctx.viewRadius = Math.max(sphere.radius * 1.5, Math.min(bedRadius, sphere.radius * 5), 22)
      ctx.viewHeight = geometry.boundingBox!.max.y
    } else {
      ctx.viewRadius = bedRadius
      ctx.viewHeight = bed.z / 3
    }
    fitCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions])

  // Chỉ đổi màu, không tạo lại geometry.
  useEffect(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.material.color.set(overflow ? OVERFLOW_COLOR : color)
    ctx.dirty = true
  }, [color, overflow])

  return <div ref={hostRef} className="h-full w-full touch-none" aria-label="Xem trước mô hình 3D trên bàn in" />
})
