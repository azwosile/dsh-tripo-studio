import {isCurrentSiteJob} from '../shared/site.js'
import {jobInputAssets, MODEL_KINDS} from '../shared/contracts.js'

// 0.3.0 REQ-051 / 0.3.1 REQ-059: pure, read-only derivation of source → part → 3D relations from existing records.
// No new persisted fields: crops use asset.sourceAssetId, AI extractions use job.params.input_asset.
/** Image outputs of a job, used when a later task referenced that job (input_job) instead of an asset. */
export function jobImageOutputs(job, imageIds) {
  return (job?.assetIds ?? []).filter(id => imageIds.has(id))
}
/** Parent of an image: a local crop (sourceAssetId) or an AI extraction (image-to-image job input). */
export function parentOf(asset, jobsById, imageIds) {
  const direct = asset.sourceAssetId
  if (direct && imageIds.has(direct) && direct !== asset.id) return direct
  const job = asset.sourceJobId && jobsById.get(asset.sourceJobId)
  if (job?.kind !== 'image-to-image') return null
  // 0.3.1: an extraction may reference an earlier image task (input_job) rather than an asset.
  const input = job.params?.input_asset || jobImageOutputs(jobsById.get(job.params?.input_job), imageIds)[0]
  return input && imageIds.has(input) && input !== asset.id ? input : null
}

export function buildRelations(images, jobs, assets) {
  const jobsById = new Map(jobs.map(j => [j.id, j])), imageIds = new Set(images.map(a => a.id))
  const parent = new Map(images.map(a => [a.id, parentOf(a, jobsById, imageIds)]))
  // Cycle guard: an asset whose ancestry loops is treated as a root.
  const rootOf = id => { const seen = new Set(); let cur = id; while (parent.get(cur) && !seen.has(cur)) { seen.add(cur); cur = parent.get(cur) } return seen.has(cur) ? id : cur }
  const children = new Map()
  for (const a of images) { const p = parent.get(a.id); if (p && rootOf(a.id) !== a.id) (children.get(p) ?? children.set(p, []).get(p)).push(a) }
  const descendants = (id, depth = 1, seen = new Set([id])) => (children.get(id) ?? []).flatMap(c => seen.has(c.id) ? [] : (seen.add(c.id), [{asset: c, depth, via: c.sourceAssetId === id ? 'crop' : 'ai'}, ...descendants(c.id, depth + 1, seen)]))
  const visible = jobs.filter(j => j.hidden !== true)
  // 0.3.1 REQ-059: a model built from a job output (input_job) is linked to that job's image too.
  const usesImage = (j, id) => jobInputAssets(j).includes(id) || (j.params?.input_job && jobImageOutputs(jobsById.get(j.params.input_job), imageIds).includes(id))
  // 0.3.3 REQ-072: a secondary part is modelled through the split-sheet task that lists it in job.covers.
  const covering = (j, id) => !usesImage(j, id) && Array.isArray(j.covers) && j.covers.includes(id)
  // Discarded drafts never reached Tripo; they only add noise next to real models (0.3.3 REQ-072).
  const modelJobs = id => visible.filter(j => MODEL_KINDS.includes(j.kind) && j.status !== 'discarded' && (usesImage(j, id) || covering(j, id))).map(j => ({
    job: j,
    covered: covering(j, id),
    models: assets.filter(a => a.kind === 'model' && (j.assetIds?.includes(a.id) || a.sourceJobId === j.id)),
    converts: visible.filter(c => c.kind === 'model-convert' && c.params?.input_job === j.id).map(c => ({job: c, models: assets.filter(a => a.kind === 'model' && (c.assetIds?.includes(a.id) || a.sourceJobId === c.id))}))
  }))
  const roots = images.filter(a => rootOf(a.id) === a.id)
  return roots.map(root => ({root, parts: descendants(root.id), modelJobs}))
}

export function jobCounts(jobs) {
  const list = jobs.filter(j => j.hidden !== true && isCurrentSiteJob(j))
  return {
    running: list.filter(j => ['queued', 'running', 'submitting'].includes(j.status)).length,
    failed: list.filter(j => ['failed', 'submission_unknown'].includes(j.status) || j.downloadStatus === 'download_failed').length,
    done: list.filter(j => j.status === 'success').length,
    drafts: list.filter(j => j.status === 'awaiting_approval').length,
  }
}

