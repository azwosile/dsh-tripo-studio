import React from 'react'
import * as THREE from 'three'
import {importModel} from './scene.js'

// 0.3.1 REQ-057/058/059: a "3D 参考图" is a still image rendered locally from an
// already-downloaded project model. It never calls the supplier, never uploads and is
// never persisted: the cache lives in memory for this panel session only.
export const THUMB_FORMATS = ['glb', 'gltf', 'fbx', 'obj', 'stl']
export const THUMB_MAX_BYTES = 80 * 1024 ** 2
const SIZE = 320, CACHE_LIMIT = 120
const cache = new Map()
let queue = Promise.resolve(), renderer = null, failedWebgl = false

export const canThumb = asset => asset?.kind === 'model' && THUMB_FORMATS.includes(asset.format || 'glb') && !(asset.size > THUMB_MAX_BYTES)

function getRenderer() {
  if (renderer) return renderer
  if (failedWebgl) return null
  try {
    const canvas = document.createElement('canvas')
    const next = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, preserveDrawingBuffer: true})
    next.setPixelRatio(1)
    next.setSize(SIZE, SIZE, false)
    next.toneMapping = THREE.ACESFilmicToneMapping
    next.toneMappingExposure = 1.15
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); renderer = null })
    renderer = next
    return next
  } catch { failedWebgl = true; return null }
}

function dispose(object) {
  object.traverse(node => {
    node.geometry?.dispose?.()
    for (const m of [node.material].flat().filter(Boolean)) {
      for (const value of Object.values(m)) if (value?.isTexture) value.dispose()
      m.dispose?.()
    }
  })
}

async function render(asset) {
  const gl = getRenderer()
  if (!gl) return null
  const response = await fetch(asset.url, {credentials: 'same-origin'})
  if (!response.ok) throw new Error('无法读取本地模型')
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > THUMB_MAX_BYTES) return null
  const object = await importModel(buffer, `${asset.id}.${asset.format || 'glb'}`)
  const scene = new THREE.Scene()
  try {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8f9999, 2.6))
    const key = new THREE.DirectionalLight(0xfff3dc, 3.2); key.position.set(4, 8, 6); scene.add(key)
    const fill = new THREE.DirectionalLight(0xc2e6fa, 1.6); fill.position.set(-5, 3, -4); scene.add(fill)
    scene.add(object)
    const box = new THREE.Box3().setFromObject(object), sphere = box.getBoundingSphere(new THREE.Sphere())
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000)
    const distance = sphere.radius / Math.sin(THREE.MathUtils.degToRad(15)) * 1.04
    camera.position.copy(sphere.center).add(new THREE.Vector3(0.55, 0.32, 1).normalize().multiplyScalar(distance))
    camera.lookAt(sphere.center)
    gl.setClearColor(0x000000, 0)
    gl.render(scene, camera)
    return gl.domElement.toDataURL('image/png')
  } finally { dispose(object) }
}

/** Queue one render at a time on a shared offscreen renderer; failures resolve to null. */
export function modelThumbnail(asset) {
  if (!canThumb(asset)) return Promise.resolve(null)
  const key = `${asset.id}:${asset.hash || asset.size || ''}`
  if (!cache.has(key)) {
    const job = queue.then(() => render(asset)).catch(() => null)
    queue = job.then(() => undefined)
    cache.set(key, job)
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value)
  }
  return cache.get(key)
}

/** Lazy 3D reference image. Clicking opens the real interactive preview when provided. */
export function ModelThumb({asset, onOpen, className = '', label}) {
  const ref = React.useRef(null), [state, setState] = React.useState({src: null, done: false})
  const name = label || asset?.label || '模型'
  React.useEffect(() => {
    if (!asset) return undefined
    let live = true, observer = null
    setState({src: null, done: false})
    const start = () => modelThumbnail(asset).then(src => { if (live) setState({src, done: true}) })
    if (!canThumb(asset)) setState({src: null, done: true})
    else if (typeof IntersectionObserver === 'function' && ref.current) {
      observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { observer.disconnect(); start() } }, {rootMargin: '200px'})
      observer.observe(ref.current)
    } else start()
    return () => { live = false; observer?.disconnect() }
  }, [asset?.id, asset?.hash, asset?.size])
  const body = state.src
    ? <img src={state.src} alt={`3D 参考图：${name}`} draggable="false"/>
    : <span className="tw-thumb-empty" aria-hidden="true">◇<small>{!state.done ? '生成参考图…' : canThumb(asset) ? '无法渲染' : '此格式无参考图'}</small></span>
  const cls = `tw-model-thumb ${className}`.trim()
  return onOpen
    ? <button ref={ref} type="button" className={cls} data-thumb={state.src ? 'ready' : state.done ? 'none' : 'pending'} aria-label={`3D 参考图：${name}（打开 3D 预览）`} title="本地渲染的 3D 参考图 · 点击打开 3D 预览" onClick={() => onOpen(asset)}>{body}</button>
    : <span ref={ref} className={cls} data-thumb={state.src ? 'ready' : state.done ? 'none' : 'pending'} role="img" aria-label={`3D 参考图：${name}`}>{body}</span>
}
