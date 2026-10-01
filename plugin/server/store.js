import fs from 'node:fs'
import {jobSite} from '../shared/site.js'
import path from 'node:path'
import {createHash, randomUUID} from 'node:crypto'

export const APP_VERSION = '0.3.5'
export const hash = (value) => createHash('sha256').update(value).digest('hex')
export const uid = () => randomUUID()
export function fail(message, status = 400, code = 'INVALID_REQUEST') { throw Object.assign(new Error(message), {status, code}) }
export function imageInfo(buffer) {
  let mime, width, height
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    mime = 'image/png'; width = buffer.readUInt32BE(16); height = buffer.readUInt32BE(20)
  } else if (buffer.length > 4 && buffer[0] === 255 && buffer[1] === 216) {
    mime = 'image/jpeg'; let pos = 2
    while (pos + 8 < buffer.length) {
      if (buffer[pos] !== 255) break
      const marker = buffer[pos + 1]; pos += 2
      if (marker === 0xD9 || marker === 0xDA) break
      const length = buffer.readUInt16BE(pos)
      if (length < 2 || pos + length > buffer.length) break
      if ([0xC0, 0xC1, 0xC2].includes(marker)) { height = buffer.readUInt16BE(pos + 3); width = buffer.readUInt16BE(pos + 5); break }
      pos += length
    }
  }
  if (!mime || !width || !height) fail('只接受有效 PNG / JPEG 图片')
  if (width < 14 || height < 14 || width * height > 36000000) fail('图片须至少 14×14，且不超过 3600 万像素')
  return {mime, width, height}
}
// Non-GLB assets are only served as downloads / local previews; never unpack archives.
// A conversion is a separate reviewed cloud task, not a hidden post-processing step.
export function modelInfo(buffer, requested) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20 || buffer.length > 150 * 1024 ** 2) fail('模型需为 150 MB 内的有效文件')
  const declared = requested?.toLowerCase()
  if (declared && !['glb','fbx','obj','stl','gltf','usdz','3mf'].includes(declared)) fail('模型格式不受支持')
  let format
  if (buffer.toString('ascii', 0, 4) === 'glTF' && buffer.length >= 20 && buffer.readUInt32LE(4) === 2 && buffer.readUInt32LE(8) === buffer.length) format = 'glb'
  else if (buffer.subarray(0, 23).equals(Buffer.from('Kaydara FBX Binary  \x00\x1a\x00','binary'))) format = 'fbx'
  else if (buffer.subarray(0,4).equals(Buffer.from('PK\x03\x04','binary')) && ['usdz','3mf'].includes(declared)) format = declared
  else if (declared === 'gltf') {
    try {
      const doc=JSON.parse(buffer.toString('utf8'))
      if (doc?.asset?.version !== '2.0' || !Array.isArray(doc.scenes) || [...(doc.buffers||[]),...(doc.images||[])].some(r=>r.uri && !r.uri.startsWith('data:'))) throw Error('non-embedded')
      format = 'gltf'
    } catch { fail('只接受自包含的 glTF 2.0 JSON，不读取外部资源') }
  } else if (declared === 'obj' && /(?:^|\n)v\s+[-+.\deE]+\s+[-+.\deE]+\s+[-+.\deE]+/m.test(buffer.toString('utf8',0,Math.min(buffer.length,100000))) && /(?:^|\n)f\s+\d/m.test(buffer.toString('utf8',0,Math.min(buffer.length,100000)))) format = 'obj'
  else if (declared === 'stl' && (buffer.length >= 84 && 84 + buffer.readUInt32LE(80) * 50 === buffer.length || /^solid[ \t]/.test(buffer.toString('ascii',0,80)) && buffer.includes(Buffer.from('facet normal')))) format = 'stl'
  if (!format || (declared && declared !== format)) fail('模型文件内容与所选格式不符；下载失败未覆盖已有资产')
  return {format, mime: format === 'glb' ? 'model/gltf-binary' : 'application/octet-stream'}
}

export class Store {
  constructor(directory, {projectFolders=false, appVersion=APP_VERSION, keepBackups=10} = {}) {
    this.projectFolders=projectFolders
    this.directory = path.resolve(directory)
    this.file = path.join(this.directory, 'state.json')
    fs.mkdirSync(path.join(this.directory, projectFolders?'projects':'files'), {recursive: true})
    const existed = fs.existsSync(this.file), raw = existed ? fs.readFileSync(this.file) : null
    this.state = existed ? JSON.parse(raw.toString('utf8')) : {version: 1, appVersion, projects: {}, assets: {}, jobs: {}}
    if (this.state.version !== 1 || !this.state.projects || !this.state.assets || !this.state.jobs) fail('本地状态格式不支持；原文件未覆盖', 503)
    let changed = false
    this.upgrade = null
    // 0.3.0 REQ-052: a plugin update never rewrites user data before a verbatim copy exists.
    // Unknown fields written by other versions are kept (JSON round-trip, no schema pruning).
    if (existed && this.state.appVersion !== appVersion) {
      const from = typeof this.state.appVersion === 'string' ? this.state.appVersion : 'legacy'
      const backup = this.backupState(raw, from, appVersion, keepBackups)
      this.upgrade = {from, to: appVersion, backup: path.basename(backup), at: new Date().toISOString()}
      this.state.appVersion = appVersion
      this.state.upgradeHistory = [...(Array.isArray(this.state.upgradeHistory) ? this.state.upgradeHistory : []), this.upgrade].slice(-20)
      changed = true
    }
    for (const job of Object.values(this.state.jobs)) {
      if (job.status === 'submitting') { job.status = 'submission_unknown'; job.error = '上次提交期间进程中断，请先在 Tripo 控制台核对；不会自动重发'; changed = true }
      if (job.downloadStatus === 'downloading') { job.downloadStatus = 'download_failed'; changed = true }
    }
    if (changed) this.save()
  }
  // Verbatim, never-overwriting copy under <data>/backups; prunes only its own old copies.
  backupState(raw, from, to, keep = 10) {
    const dir = path.join(this.directory, 'backups')
    if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) fail('备份目录不能为链接；原状态未修改', 503)
    fs.mkdirSync(dir, {recursive: true})
    const safe = v => String(v).replace(/[^0-9A-Za-z.-]/g, '_').slice(0, 40)
    const file = path.join(dir, `state-${safe(from)}-to-${safe(to)}-${new Date().toISOString().replace(/[:.]/g, '-')}-${uid().slice(0, 8)}.json`)
    fs.writeFileSync(file, raw, {flag: 'wx', mode: 0o600})
    const own = fs.readdirSync(dir).filter(n => /^state-.+-to-.+\.json$/.test(n)).sort()
    for (const name of own.slice(0, Math.max(0, own.length - Math.max(1, keep)))) fs.unlinkSync(path.join(dir, name))
    return file
  }
  save() {
    const temp = `${this.file}.${uid()}.tmp`
    try { fs.writeFileSync(temp, `${JSON.stringify(this.state, null, 2)}\n`, {mode: 0o600}); fs.renameSync(temp, this.file) }
    finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
  }
  project(id) { return this.state.projects[id] ?? fail('项目不存在', 404) }
  newProject(name = '未命名角色') {
    if (Object.keys(this.state.projects).length >= 100) fail('项目数量已达本地限制')
    const p = {id: uid(), name: String(name).slice(0, 100), createdAt: new Date().toISOString(), revision: 0, draft: {}}
    if(this.projectFolders)fs.mkdirSync(path.join(this.directory,'projects',p.id,'files'),{recursive:true})
    this.state.projects[p.id] = p; this.save(); return p
  }
  updateProject(id, {revision, draft, name}) {
    const p = this.project(id)
    if (revision !== p.revision) fail('项目已变化，请刷新后重试，未覆盖现有内容', 409, 'STALE_PROJECT')
    if (draft) {
      const allowed = ['prompt', 'model', 'quality', 'size', 'selectedAsset', 'partName', 'partPriority', 'splitModel', 'splitQuality', 'splitSize', 'wholeAsset', 'splitMode', 'editMode', 'editPrompt', 'editModel', 'editSize', 'editQuality', 'modelVersion', 'modelFaceLimit', 'modelGeometry', 'modelTexture', 'modelPbr', 'modelTextureQuality', 'modelQuad', 'modelSmart', 'modelAutoSize', 'modelAutofix', 'modelTextureAlignment', 'modelOrientation', 'modelExportOrientation', 'splitSheetPrompt', 'splitPartPrompt', 'sheetAsset', 'genMode']
      // Keep string keys this version does not know (written by a newer/older plugin) so a round-trip never loses them.
      const foreign = Object.fromEntries(Object.entries(p.draft ?? {}).filter(([k, v]) => !allowed.includes(k) && typeof v === 'string'))
      p.draft = {...foreign, ...Object.fromEntries(Object.entries(draft).filter(([k, v]) => allowed.includes(k) && typeof v === 'string').map(([k, v]) => [k, v.slice(0, 6000)]))}
    }
    if (name !== undefined) p.name = String(name).slice(0, 100)
    p.revision++; this.save(); return p
  }
  asset(projectId, id) {
    const asset = this.state.assets[id]
    if (!asset || asset.projectId !== projectId) fail('图片/资产不属于当前项目', 404)
    return asset
  }
  job(projectId, id) {
    const job = this.state.jobs[id]
    if (!job || job.projectId !== projectId) fail('任务不属于当前项目', 404)
    return job
  }
  assetPath(asset) {
    const ext = asset.kind === 'model' ? (asset.format || 'glb') : asset.mime === 'image/png' ? 'png' : 'jpg'
    if (!['png','jpg','glb','fbx','obj','stl','gltf','usdz','3mf'].includes(ext) || asset.file !== `${asset.id}.${ext}` || !/^[a-f0-9-]{36}$/.test(asset.id)) fail('资产记录路径无效', 500)
    const relative=this.projectFolders?path.join('projects',asset.projectId,'files'):'files'
    if(this.projectFolders&&!/^[a-f0-9-]{36}$/.test(asset.projectId))fail('项目路径无效')
    let folder=this.directory
    for(const segment of relative.split(path.sep)){folder=path.join(folder,segment);if(fs.lstatSync(folder).isSymbolicLink())fail('禁止链接资产目录',403)}
    const file = path.join(folder, asset.file)
    const realDir = fs.realpathSync(folder)
    if (fs.existsSync(file) && path.dirname(fs.realpathSync(file)) !== realDir) fail('禁止访问资产目录以外的文件', 403)
    return file
  }
  addAsset(projectId, buffer, {label = '参考图片', kind = 'image', sourceJobId, sourceAssetId, priority = 'normal', format} = {}) {
    this.project(projectId)
    if (Object.values(this.state.assets).filter(a => a.projectId === projectId).length >= 500) fail('项目资产数量已达上限')
    let info
    if (kind === 'model') {
      info = modelInfo(buffer, format)
    } else {
      if (buffer.length > 20 * 1024 ** 2) fail('图片不能超过 20 MB')
      info = imageInfo(buffer)
    }
    const id = uid(), ext = kind === 'model' ? info.format : info.mime === 'image/png' ? 'png' : 'jpg'
    const a = {id, projectId, label: String(label).slice(0, 100), kind, priority, ...info, size: buffer.length, hash: hash(buffer), file: `${id}.${ext}`, createdAt: new Date().toISOString(), ...(sourceJobId ? {sourceJobId} : {}), ...(kind === 'image' && sourceAssetId ? {sourceAssetId: this.asset(projectId, sourceAssetId).id} : {})}
    fs.writeFileSync(this.assetPath(a), buffer, {flag: 'wx', mode: 0o600})
    this.state.assets[id] = a; this.save(); return a
  }
  // Stage files on the same volume; persist state before unlinking. A state-write
  // failure restores both metadata and original files, never leaving broken refs.
  commitDeletion(projectId, {jobId, jobIds = [], assetIds = []} = {}) {
    const project = this.project(projectId)
    const removedJobs = [...new Set([...(jobId ? [jobId] : []), ...jobIds])]
    for (const id of removedJobs) this.job(projectId,id)
    const assets = [...new Set(assetIds)].map(id => this.asset(projectId, id))
    const paths = assets.map(a => ({file: this.assetPath(a)}))
    for (const {file} of paths) if (!fs.lstatSync(file).isFile()) fail('只允许删除普通资产文件', 403)
    const backup = structuredClone(this.state), staged = []
    try {
      for (const {file} of paths) {
        const tmp = `${file}.${uid()}.pending-delete`
        fs.renameSync(file, tmp); staged.push({file, tmp})
      }
      for (const a of assets) delete this.state.assets[a.id]
      for (const id of removedJobs) {
        delete this.state.jobs[id]
        for (const a of Object.values(this.state.assets)) if (a.sourceJobId === id) delete a.sourceJobId
      }
      if (assets.some(a => [project.draft?.selectedAsset, project.draft?.wholeAsset, project.draft?.sheetAsset].includes(a.id))) {
        for (const key of ['selectedAsset', 'wholeAsset', 'sheetAsset']) if (assets.some(a=>a.id===project.draft?.[key])) project.draft[key] = ''
        project.revision++
      }
      this.save()
    } catch (error) {
      this.state = backup
      for (const {file, tmp} of staged.reverse()) if (fs.existsSync(tmp)) fs.renameSync(tmp, file)
      throw error
    }
    for (const {tmp} of staged) fs.unlinkSync(tmp)
    return {removedAssetIds: assets.map(a => a.id)}
  }
  // 0.2.12: local display name only. File, hash, approvals and cloud tasks are untouched.
  setLabel(projectId,id,label) {
    if(typeof label!=='string')fail('图片名称无效')
    const clean=label.replace(/[\u0000-\u001f\u007f]/g,'').trim()
    if(!clean||clean.length>100)fail('图片名称须为 1–100 个字符')
    const a=this.asset(projectId,id);a.label=clean;this.save();return this.snapshot(projectId)
  }
  setPriority(projectId,id,priority) {
    if(!['high','base','normal'].includes(priority))fail('优先级无效')
    const a=this.asset(projectId,id);a.priority=priority;this.save();return this.snapshot(projectId)
  }
  snapshot(projectId) {
    const p = this.project(projectId)
    return {...p,
      assets: Object.values(this.state.assets).filter(a => a.projectId === projectId).map(({file, ...a}) => ({...a, url: `/dsh-tripo-studio/assets/${a.id}?project=${projectId}`})),
      jobs: Object.values(this.state.jobs).filter(j => j.projectId === projectId).map(publicJob),
    }
  }
}
export function publicJob(job) {
  const {accountHash, output, ...safe} = job // Signed CDN URLs and credential fingerprints never leave the server.
  return {...safe, site: jobSite(job)}
}
