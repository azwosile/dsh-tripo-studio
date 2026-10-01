// 0.3.3 REQ-071: reference credits from the public tables already shipped in image-models.js / model-pricing.js.
// This is an estimate for the approval dialog, never an account quote; unknown combinations return null.
import {IMAGE_MODEL_INFO} from './image-models.js'
import {modelPriceReference} from './model-pricing.js'

/** 0 = ≤1K, 1 = 2K, 2 = 4K; null when the tier cannot be derived. */
export function imageTier(size, model = '') {
  if (!size || size === 'auto') return String(model).startsWith('chat_image_2') ? 1 : null
  const k = /^(\d+(?:\.\d+)?)K$/i.exec(size)
  if (k) { const n = Number(k[1]); return n <= 1 ? 0 : n <= 3 ? 1 : 2 }
  const m = /^(\d{3,5})x(\d{3,5})$/.exec(size)
  if (m) { const side = Math.max(Number(m[1]), Number(m[2])); return side <= 1536 ? 0 : side <= 2048 ? 1 : 2 }
  return null
}
/** Same table priceText() prints: [≤1K, 2K, 4K] credits per image. */
export function imagePriceRow(model, quality = 'low') {
  const info = IMAGE_MODEL_INFO[model]; if (!info) return null
  const table = quality === 'high' ? [20, 25, 40] : quality === 'xhigh' ? [25, 30, 45] : quality === 'max' ? [30, 50, 50] : info.price
  return info.quality.includes(quality) ? table : info.price
}
export function estimateJobCredits(job) {
  const p = job?.params ?? {}
  if (job?.kind === 'text-to-image' || job?.kind === 'image-to-image') {
    const row = imagePriceRow(p.model, p.quality), tier = imageTier(p.size, p.model)
    return row && tier !== null && Number.isFinite(row[tier]) ? row[tier] : null
  }
  // 0.3.4 REQ-073: official pricing lists 多视图转 3D at the same H-series rates as 图片转 3D (20/30 + add-ons).
  if (job?.kind === 'image-to-model' || job?.kind === 'multiview-to-model') return modelPriceReference(p.model, p.geometry_quality, {texture: p.texture, textureQuality: p.texture_quality, quad: p.quad, smart: p.smart_low_poly})
  if (job?.kind === 'model-convert') return p.quad ? 10 : 5
  // 0.3.5 REQ-076: official /mesh/decimate pricing — v2.0 智能重拓扑 30, v1.0 基础减面 10.
  if (job?.kind === 'mesh-decimate') return p.model === 'v1.0' ? 10 : p.model === 'v2.0' || p.model === undefined ? 30 : null
  return null
}
export function estimateBatch(jobs = []) {
  let total = 0, unknown = 0
  for (const j of jobs) { const v = estimateJobCredits(j); if (v === null) unknown++; else total += v }
  return {total, unknown, count: jobs.length}
}
/** Display helper: at most two decimals, as the official balance schema documents. */
export function formatCredits(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return Number.isFinite(n) ? (Math.round(n * 100) / 100).toLocaleString('zh-CN', {maximumFractionDigits: 2}) : '未知'
}
