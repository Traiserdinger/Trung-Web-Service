import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
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

const OVERFLOW_COLOR = '#ef4444'

interface Ctx {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null
  material: THREE.MeshStandardMaterial
  frame: number
  /** Bán kính khung nhìn mặc định (mô hình hoặc bàn in, lấy cái lớn hơn) */
  viewHeight: number
  viewRadius: number
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
    ctx.camera.position.set(r * 1.4, targetY + r * 1.1, r * 1.6)
    ctx.camera.near = Math.max(0.1, r / 100)
    ctx.camera.far = r * 20
    ctx.camera.updateProjectionMatrix()
    ctx.controls.target.set(0, targetY, 0)
    ctx.controls.update()
  }

  useImperativeHandle(ref, () => ({ resetView: fitCamera }))

  // Khởi tạo scene một lần.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(150, 250, 120)
    scene.add(sun)

    const grid = new THREE.GridHelper(bed.x, 18, 0x64748b, 0xcbd5e1)
    scene.add(grid)
    const volume = new THREE.Box3Helper(
      new THREE.Box3(new THREE.Vector3(-bed.x / 2, 0, -bed.y / 2), new THREE.Vector3(bed.x / 2, bed.z, bed.y / 2)),
      0x94a3b8,
    )
    scene.add(volume)

    const camera = new THREE.PerspectiveCamera(40, 1, 1, 5000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08

    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 })
    const bedRadius = Math.max(bed.x, bed.y, bed.z) * 0.75
    const ctx: Ctx = {
      renderer,
      scene,
      camera,
      controls,
      mesh: null,
      material,
      frame: 0,
      viewHeight: bed.z / 3,
      viewRadius: bedRadius,
    }
    ctxRef.current = ctx

    const resize = () => {
      const w = host.clientWidth || 1
      const h = host.clientHeight || 1
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    fitCamera()

    const loop = () => {
      ctx.frame = requestAnimationFrame(loop)
      controls.update()
      renderer.render(scene, camera)
    }
    loop()

    return () => {
      cancelAnimationFrame(ctx.frame)
      observer.disconnect()
      controls.dispose()
      ctx.mesh?.geometry.dispose()
      material.dispose()
      grid.geometry.dispose()
      volume.geometry.dispose()
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
      ctx.scene.add(ctx.mesh)
      const sphere = geometry.boundingSphere!
      ctx.viewRadius = Math.max(sphere.radius * 1.6, Math.min(bedRadius, sphere.radius * 6), 20)
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
    ctxRef.current?.material.color.set(overflow ? OVERFLOW_COLOR : color)
  }, [color, overflow])

  return <div ref={hostRef} className="h-full w-full touch-none" aria-label="Xem trước mô hình 3D" />
})
