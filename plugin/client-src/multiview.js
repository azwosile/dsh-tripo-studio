import {MULTIVIEW_VIEWS} from '../shared/contracts.js'
// 0.3.4 REQ-073: 多视图生成模型 (POST /generation/multiview-to-model). One paid task per review; the views are local
// image assets uploaded through the free /files endpoint at submit time, never before approval.
export const VIEW_HINTS = Object.freeze({front: /front|正面|前视/i, left: /left|左/i, back: /back|背面|背视|后视|后面/i, right: /right|右/i})
/** Guess slots from asset names such as 「头发_front」「头发 左侧」. Each image is used once; pure, no network. */
export function guessViews(images) {
  const out = {}, used = new Set()
  for (const v of MULTIVIEW_VIEWS) {
    const a = images.find(x => VIEW_HINTS[v].test(String(x.label || '')) && !used.has(x.id))
    if (a) { out[v] = a.id; used.add(a.id) }
  }
  return out
}
/** Blockers mirror the server contract (front required, ≥2 images, distinct); warnings follow the docs' advice. */
export function multiviewIssues(views, images) {
  const ids = MULTIVIEW_VIEWS.map(v => views[v]).filter(Boolean), blockers = [], warnings = []
  if (!views.front) blockers.push('缺少正面图（必填）')
  if (ids.length < 2) blockers.push('至少需要 2 张图：正面 + 左侧/背面/右侧之一')
  if (new Set(ids).size !== ids.length) blockers.push('同一张图不能用于多个视角')
  const picked = ids.map(id => images.find(a => a.id === id)).filter(Boolean)
  const small = picked.filter(a => Math.min(a.width || 0, a.height || 0) < 256)
  if (small.length) warnings.push(`官方建议每张至少 256×256，以下图片偏小：${small.map(a => a.label).join('、')}`)
  const ratios = picked.map(a => (a.width || 1) / (a.height || 1))
  if (ratios.length > 1 && Math.max(...ratios) / Math.min(...ratios) > 1.6) warnings.push('各视角图片宽高比差异较大：建议统一裁成同尺寸方图、物体等高居中，避免比例不一致。')
  return {blockers, warnings}
}
