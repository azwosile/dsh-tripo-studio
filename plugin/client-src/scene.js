/**
 * Three.js side of the workbench: viewport lifecycle plus the procedural demo
 * assets. Everything here is local — nothing is fetched, uploaded or billed.
 */
import * as THREE from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js'
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js'
import {STLLoader} from 'three/addons/loaders/STLLoader.js'
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js'
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js'

const material = (color, metalness = 0, roughness = 0.5) =>
  new THREE.MeshStandardMaterial({color, metalness, roughness})

/** Build one procedural demo asset. @returns {THREE.Group} */
export function buildAsset(kind, style = 'stylized', variant = false) {
  const group = new THREE.Group()
  const detail = variant && style === 'lowpoly' ? 10 : 32
  const cream = material(0xe7e3d6, 0.18, 0.35)
  const accent = material(variant ? (style === 'lowpoly' ? 0x84b5a5 : 0xc79970) : 0xe58e4c, 0.2, 0.38)
  const dark = material(0x243740, 0.55, 0.19)
  const rubber = material(0x495355, 0.2, 0.7)

  const mesh = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const o = new THREE.Mesh(geo, mat)
    o.position.set(x, y, z)
    o.scale.set(sx, sy, sz)
    o.castShadow = true
    o.receiveShadow = true
    group.add(o)
    return o
  }
  const ball = (mat, x, y, z, sx, sy, sz) => mesh(new THREE.SphereGeometry(1, detail, 24), mat, x, y, z, sx, sy, sz)

  if (kind === 'plant') {
    mesh(new THREE.CylinderGeometry(0.65, 0.43, 1, detail), accent, 0, 0.5, 0)
    mesh(new THREE.CylinderGeometry(0.59, 0.59, 0.07, detail), rubber, 0, 1, 0)
    const green = material(0x54816b)
    for (let i = 0; i < 10; i += 1) {
      const a = i * 2.4
      const leaf = ball(green, Math.cos(a) * 0.28, 1.4 + i * 0.09, Math.sin(a) * 0.28, 0.18, 0.8, 0.12)
      leaf.rotation.z = Math.cos(a) * 0.7
      leaf.rotation.x = Math.sin(a) * 0.7
    }
    return group
  }
  if (kind === 'gem') {
    const crystal = material(0x9e95c7, 0.4, 0.23)
    mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.22, 8), dark, 0, 0.11, 0)
    for (let i = 0; i < 5; i += 1) {
      const a = i * 2.4
      const shard = mesh(new THREE.OctahedronGeometry(1, 0), crystal, Math.cos(a) * 0.48, 1.1 + (i % 2) * 0.3, Math.sin(a) * 0.48, 0.4, 1.3, 0.4)
      shard.rotation.z = Math.cos(a) * 0.22
    }
    return group
  }

  ball(cream, 0, 1.57, 0, 0.81, 0.85, 0.57)
  mesh(new THREE.CylinderGeometry(0.56, 0.6, 0.16, detail), rubber, 0, 0.97, 0)
  ball(cream, 0, 2.67, 0, 0.98, 0.81, 0.73)
  ball(accent, 0, 2.7, 0.52, 0.8, 0.53, 0.25)
  ball(dark, 0, 2.72, 0.68, 0.7, 0.43, 0.18)
  const eye = material(0x91e1dc, 0.2, 0.2)
  eye.emissive = new THREE.Color(0x4a9b96)
  eye.emissiveIntensity = 0.6
  for (const s of [-1, 1]) {
    ball(eye, s * 0.25, 2.76, 0.839, 0.087, 0.11, 0.032)
    ball(accent, s * 0.96, 1.98, 0, 0.23, 0.24, 0.25)
    const arm = mesh(new THREE.CapsuleGeometry(0.17, 0.43, 6, 18), cream, s * 1.09, 1.56, 0)
    arm.rotation.z = s * 0.16
    ball(rubber, s * 1.17, 1.17, 0.02, 0.21, 0.23, 0.21)
    mesh(new THREE.CapsuleGeometry(0.24, 0.3, 6, 18), cream, s * 0.4, 0.6, 0)
    ball(accent, s * 0.4, 0.22, 0.14, 0.33, 0.24, 0.42)
    ball(rubber, s * 0.4, 0.09, 0.16, 0.34, 0.09, 0.43)
    ball(rubber, s * 0.91, 2.65, 0, 0.17, 0.27, 0.3)
  }
  mesh(new THREE.BoxGeometry(0.57, 0.37, 0.1), accent, 0, 1.65, 0.53)
  mesh(new THREE.BoxGeometry(0.32, 0.12, 0.04), dark, 0, 1.69, 0.601)
  ball(eye, 0.13, 1.53, 0.601, 0.033, 0.033, 0.02)
  mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.32, 12), rubber, 0.45, 3.39, 0)
  ball(accent, 0.45, 3.59, 0, 0.12, 0.12, 0.12)
  mesh(new THREE.BoxGeometry(0.7, 0.75, 0.4), rubber, 0, 1.7, -0.51)
  return group
}

/** Dispose geometries, materials and textures of a detached object tree. */
function release(object) {
  object.traverse((node) => {
    if (!node.isMesh) return
    node.geometry?.dispose()
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    for (const m of materials) {
      for (const value of Object.values(m)) if (value?.isTexture) value.dispose()
      m.dispose()
    }
  })
}

/**
 * Create the WebGL viewport bound to a container element.
 * @returns controller with model control, camera helpers and disposal.
 */
export function createViewport(container, {background = '#eeeeea', exposure = 1.2, onContextLost} = {}) {
  const renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true})
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = exposure
  container.prepend(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(background)
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
  camera.position.set(5, 3.5, 7)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 1.6, 0)
  controls.enableDamping = true
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.7
  controls.minDistance = 3
  controls.maxDistance = 18

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f9999, 2.8))
  const key = new THREE.DirectionalLight(0xfff3dc, 4)
  key.position.set(4, 8, 5)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.left = -6
  key.shadow.camera.right = 6
  key.shadow.camera.top = 6
  key.shadow.camera.bottom = -6
  key.shadow.normalBias = 0.04
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xc2e6fa, 2)
  fill.position.set(-5, 4, -3)
  scene.add(fill)

  const stage = new THREE.Mesh(
    new THREE.CylinderGeometry(2.35, 2.45, 0.16, 80),
    new THREE.MeshStandardMaterial({color: 0xdadbd5, roughness: 0.85})
  )
  stage.position.y = -0.1
  stage.receiveShadow = true
  scene.add(stage)
  const grid = new THREE.GridHelper(40, 80, 0xc8ccc7, 0xd9dcd6)
  grid.position.y = -0.2
  scene.add(grid)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.ShadowMaterial({opacity: 0.14}))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.19
  floor.receiveShadow = true
  scene.add(floor)

  let model = null
  const observer = new ResizeObserver(() => {
    const width = container.clientWidth || 1
    const height = container.clientHeight || 1
    renderer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  })
  observer.observe(container)
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1)
  const lost = (event) => { event.preventDefault(); renderer.setAnimationLoop(null); onContextLost?.() }
  renderer.domElement.addEventListener('webglcontextlost', lost)
  renderer.setAnimationLoop(() => {
    if (document.hidden || !container.clientWidth || !container.clientHeight) return
    controls.update()
    renderer.render(scene, camera)
  })

  return {
    setModel(object) {
      if (model) {
        scene.remove(model)
        release(model)
      }
      model = object
      scene.add(object)
      object.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = true
          n.receiveShadow = true
        }
      })
      this.reset()
    },
    /** @returns {{triangles:number, materials:number, size:[number,number,number]}} */
    stats() {
      let triangles = 0
      const materials = new Set()
      model?.traverse((n) => {
        if (!n.isMesh) return
        const index = n.geometry.index
        triangles += (index ? index.count : n.geometry.attributes.position?.count || 0) / 3
        for (const m of Array.isArray(n.material) ? n.material : [n.material]) materials.add(m)
      })
      const box = new THREE.Box3().setFromObject(model ?? new THREE.Object3D())
      const size = model ? box.getSize(new THREE.Vector3()) : new THREE.Vector3()
      return {triangles: Math.round(triangles), materials: materials.size, size: [size.x, size.y, size.z]}
    },
    reset() {
      camera.position.set(5, 3.5, 7)
      controls.target.set(0, 1.6, 0)
      controls.update()
    },
    setWireframe(on) {
      model?.traverse((n) => {
        if (!n.isMesh) return
        for (const m of Array.isArray(n.material) ? n.material : [n.material]) m.wireframe = on
      })
    },
    setAutoRotate(on) {
      controls.autoRotate = on
    },
    setGridVisible(on) {
      grid.visible = on
    },
    setBackground(color) {
      scene.background = new THREE.Color(color)
    },
    setExposure(value) {
      renderer.toneMappingExposure = value
    },
    screenshot(onDone) {
      renderer.domElement.toBlob((blob) => {
        if (blob) onDone(blob)
      })
    },
    dispose() {
      observer.disconnect()
      renderer.setAnimationLoop(null)
      release(scene)
      grid.geometry.dispose()
      grid.material.dispose()
      key.shadow.map?.dispose()
      renderer.domElement.removeEventListener('webglcontextlost', lost)
      controls.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }
}

/**
 * Parse a self-contained GLB buffer, normalize its scale into the stage and
 * return a wrapper group. External resource references are rejected.
 * @returns {Promise<THREE.Group>}
 */
const secureManager=()=>{
  const manager=new THREE.LoadingManager()
  manager.setURLModifier(url=>{
    // Never let an imported model load network/local sidecar textures or code.
    if(!url.startsWith('data:')&&!url.startsWith('blob:'))throw new Error('仅预览自包含模型，已拒绝外部资源引用')
    return url
  })
  return manager
}
const centered=(object)=>{
  const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3())
  if(!Number.isFinite(size.x+size.y+size.z)||Math.max(size.x,size.y,size.z)<0.0001)throw new Error('模型缺少可预览的有效几何体')
  const center=box.getCenter(new THREE.Vector3()),scale=3.5/Math.max(size.x,size.y,size.z)
  const wrapper=new THREE.Group()
  object.position.sub(center);wrapper.add(object);wrapper.scale.setScalar(scale);wrapper.position.y=size.y*scale/2
  return wrapper
}
export async function importGlb(buffer) {
  return centered((await new GLTFLoader(secureManager()).parseAsync(buffer,'')).scene)
}
/** Preview only; never upload a local file or rewrite original topology. */
export async function importModel(buffer,name) {
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength>150*1024**2||buffer.byteLength<20)throw new Error('模型需为 150 MB 内有效文件')
  const ext=String(name||'').split('.').pop().toLowerCase()
  if(ext==='glb')return importGlb(buffer)
  if(ext==='gltf'){
    const doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer))
    if(doc?.asset?.version!=='2.0'||[...(doc.buffers||[]),...(doc.images||[])].some(a=>a.uri&&!a.uri.startsWith('data:')))throw new Error('仅预览自包含 GLTF 2.0；请用官方转换输出完整文件或在DCC打开')
    return centered((await new GLTFLoader(secureManager()).parseAsync(JSON.stringify(doc),'')).scene)
  }
  if(ext==='fbx')return centered(new FBXLoader(secureManager()).parse(buffer,''))
  if(ext==='obj')return centered(new OBJLoader().parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer)))
  if(ext==='stl'){
    const mesh=new THREE.Mesh(new STLLoader().parse(buffer),new THREE.MeshStandardMaterial({color:0xb8c4cb,side:THREE.DoubleSide}))
    if(!mesh.geometry.attributes.normal)mesh.geometry.computeVertexNormals()
    return centered(mesh)
  }
  throw new Error('当前仅可预览 GLB、自包含 GLTF、FBX、OBJ、STL；USDZ/3MF 可下载后用对应软件打开')
}

/** Export a model tree without baking the viewport's wireframe into geometry. */
export async function exportGlb(object, binary = true) {
  const copy = cloneSkeleton(object)
  const materials = new Map()
  copy.traverse((node) => {
    if (!node.isMesh) return
    const cloneMaterial = (material) => {
      if (!materials.has(material)) {
        const cloned = material.clone()
        cloned.wireframe = false
        materials.set(material, cloned)
      }
      return materials.get(material)
    }
    node.material = Array.isArray(node.material) ? node.material.map(cloneMaterial) : cloneMaterial(node.material)
  })
  try {
    const result = await new GLTFExporter().parseAsync(copy, {binary})
    return new Blob([result], {type: binary ? 'model/gltf-binary' : 'model/gltf+json'})
  } finally {
    // Geometry and textures are shared with the live preview; do not dispose them.
    for (const material of materials.values()) material.dispose()
  }
}

/** Trigger a browser download for a blob. */
export function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
