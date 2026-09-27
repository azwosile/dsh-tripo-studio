import {parentOf} from './relations.js'
// 0.3.3 REQ-067: one modelling page. The three role tags decide how a part reaches Tripo:
//  主要（绿，priority=high）→ its own image-to-model task
//  次要（蓝，priority=normal）→ covered by ONE task on the whole split sheet (整张拆件图)
//  基准（红，priority=base）→ its own image-to-model task, used as the proportion reference
// Stored values stay the 0.2.8 priority enum, so state.json v1 and older versions read them unchanged.
export const ROLE_ORDER = ['high', 'normal', 'base']
export const MODEL_ROLES = Object.freeze({
  high: {name: '主要', tone: 'green', color: '绿色', how: '单独建模 · 独立精修', short: '单独 1 个任务'},
  normal: {name: '次要', tone: 'blue', color: '蓝色', how: '随整张拆件图一起建模', short: '共用拆件图任务'},
  base: {name: '基准', tone: 'red', color: '红色', how: '单独建模 · 比例参照', short: '单独 1 个任务'},
})
// 0.3.3 REQ-069: say in words what each paid kind does, so 文生图 and 图生图 can never be confused.
export const KIND_LABEL = Object.freeze({'text-to-image': '文生图 · 只用提示词', 'image-to-image': '图生图 · 以参考图为输入', 'image-to-model': '图生3D', 'model-convert': '格式转换'})
export const roleOf = asset => MODEL_ROLES[asset?.priority] ? asset.priority : 'normal'
export const roleName = priority => MODEL_ROLES[priority]?.name ?? '次要'

/** Human label for a 3D job in lists and relation rows. */
export function jobRoleLabel(job) {
  if (job?.role === 'sheet') return `整张拆件图 · 次要×${job.covers?.length ?? 0}`
  if (job?.role === 'whole') return '整体（旧版）'
  return job?.priority === 'base' ? '基准部件' : job?.priority === 'high' ? '主要部件' : '部件'
}

/** Most frequent parent (crop source / AI extraction input) of the given parts — the natural split sheet. */
export function suggestSheet(parts, images, jobs = []) {
  const byId = new Map(jobs.map(j => [j.id, j])), ids = new Set(images.map(a => a.id)), count = new Map()
  for (const a of parts) { const p = parentOf(a, byId, ids); if (p) count.set(p, (count.get(p) ?? 0) + 1) }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

/**
 * Pure planning step (no network, no writes).
 * Returns what the single "审阅建模" button would prepare.
 */
export function planModelTasks({images, jobs = [], checked = [], sheetAsset = ''}) {
  const byId = new Map(jobs.map(j => [j.id, j])), ids = new Set(images.map(a => a.id))
  const chosen = images.filter(a => checked.includes(a.id))
  const secondaryAll = chosen.filter(a => roleOf(a) === 'normal')
  const explicit = images.some(a => a.id === sheetAsset) ? sheetAsset : ''
  // Inference order: explicit choice → most common crop source of the checked 次要 parts →
  // a checked 次要 image that is itself a source image (the whole illustration was ticked).
  const suggested = explicit ? '' : suggestSheet(secondaryAll, images, jobs) || secondaryAll.find(a => !parentOf(a, byId, ids))?.id || ''
  const sheetId = explicit || suggested
  const sheet = images.find(a => a.id === sheetId) || null
  const secondary = secondaryAll.filter(a => a.id !== sheetId)
  const individual = chosen.filter(a => roleOf(a) !== 'normal' && a.id !== sheetId)
  const foreign = sheet ? secondary.filter(a => parentOf(a, byId, ids) !== sheet.id) : []
  const sheetChecked = Boolean(sheet) && checked.includes(sheet.id)
  const sheetTask = Boolean(sheet) && (secondary.length > 0 || sheetChecked)
  const taskCount = individual.length + (sheetTask ? 1 : 0)
  return {sheet, sheetId, autoSheet: Boolean(suggested) && sheetId === suggested, secondary, individual,
    main: individual.filter(a => roleOf(a) === 'high'), base: individual.filter(a => roleOf(a) === 'base'),
    foreign, missingSheet: secondary.length > 0 && !sheet, sheetChecked, sheetTask, taskCount}
}
