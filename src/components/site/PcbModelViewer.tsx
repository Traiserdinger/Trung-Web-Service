import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

interface Props {
  src: string
  label: string
}

/**
 * Xem mô hình mạch (GLB chuyển từ file STEP bằng scripts/assets). Chỉ tải khi component được dựng,
 * và chỉ vẽ lại khi đang xoay để đỡ tốn pin.
 */
export default function PcbModelViewer({ src, label }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    setState('loading')
    setProgress(0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NeutralToneMapping
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.9
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(-40, 80, 60)
    scene.add(key)

    const camera = new THREE.PerspectiveCamera(30, 1, 1, 2000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.autoRotate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    controls.autoRotateSpeed = 0.9
    // người xem tự xoay thì thôi tự quay
    controls.addEventListener('start', () => (controls.autoRotate = false))

    let dirty = true
    controls.addEventListener('change', () => (dirty = true))
    const resize = () => {
      const w = host.clientWidth || 1
      const h = host.clientHeight || 1
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      dirty = true
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    let frame = 0
    const loop = () => {
      frame = requestAnimationFrame(loop)
      const moved = controls.update()
      if (moved || dirty) {
        dirty = false
        renderer.render(scene, camera)
      }
    }

    let model: THREE.Object3D | null = null
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    loader.load(
      src,
      (gltf) => {
        if (disposed) return
        model = gltf.scene
        scene.add(model)
        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        const r = Math.max(size.x, size.z) * 0.5
        camera.position.set(center.x + r * 2.4, center.y + r * 3.1, center.z + r * 3.6)
        camera.near = r / 50
        camera.far = r * 40
        camera.updateProjectionMatrix()
        controls.target.copy(center)
        controls.minDistance = r * 1.6
        controls.maxDistance = r * 8
        controls.update()
        setState('ready')
        loop()
      },
      (e) => {
        if (e.lengthComputable) setProgress(e.loaded / e.total)
      },
      () => !disposed && setState('error'),
    )

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      model?.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.geometry.dispose()
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose()
      })
      env.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [src])

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full cursor-grab touch-none active:cursor-grabbing" role="img" aria-label={label} />
      {state === 'loading' && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex items-center gap-3 rounded-full bg-paper px-4 py-2 text-[14px] font-semibold text-ink ring-1 ring-mist">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-mist border-t-solder" aria-hidden="true" />
            Đang tải mô hình <span className="tnum text-slate">{Math.round(progress * 100)}%</span>
          </div>
        </div>
      )}
      {state === 'error' && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-[14px] text-slate">
          Không tải được mô hình 3D. Thử tải lại trang, hoặc xem ảnh render.
        </div>
      )}
    </div>
  )
}
