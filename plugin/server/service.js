import fs from 'node:fs'
import {DELETABLE_STATUSES} from '../shared/task-policy.js'
import {setVisibility, cleanupRecords} from './task-maintenance.js'
import {validTaskId} from '../shared/task-id.js'
import {promptCap} from '../shared/prompt-policy.js'
import {TRIPO_SITE, TRIPO_API_BASE, isCurrentSiteJob} from '../shared/site.js'

function assertCurrentSite(job) {
  if (!isCurrentSiteJob(job)) fail('此为国际站或其他站点的历史任务，国内站不会提交、查询或重试下载；请到原站控制台处理。已保存的本地资产仍可使用。', 409, 'SITE_CHANGED')
}
const accountFingerprint = key => hash(JSON.stringify({site: TRIPO_SITE, key}))
const CLOUD_TYPES = Object.freeze({text_to_image:'text-to-image', image_to_image:'image-to-image', image_to_model:'image-to-model', convert:'model-convert'})
const cloudType = kind => kind === 'model-convert' ? 'convert' : kind.replaceAll('-','_')
import {CredentialStore, validateKey} from './credentials.js'
import {normalizeJob, IMAGE_MODELS, IMAGE_SIZES, MODEL_VERSIONS} from '../shared/contracts.js'
import {Store, fail, hash, uid, publicJob, APP_VERSION} from './store.js'
import {TripoClient, downloadAsset, redact} from './tripo.js'

export class JobService {
  constructor({directory, store, key = process.env.TRIPO_CN_API_KEY ?? '', enabled = process.env.TRIPO_CN_ENABLE_PAID === '1', demoMode = false, credentialStore, clientFactory, client, downloader = downloadAsset, extraHosts = (process.env.TRIPO_ASSET_HOSTS ?? '').split(',').map(s => s.trim()).filter(Boolean)} = {}) {
    this.store = store ?? new Store(directory)
    this.credentialStore = credentialStore ?? new CredentialStore(directory ?? this.store.directory)
    const stored = this.credentialStore.load()
    if (stored) {key = stored.key; enabled = stored.paidEnabled}
    this.credentialSource = stored?.source ?? (key ? 'environment' : 'none')
    this.storageError = Boolean(stored?.storageError)
    this.demoMode = demoMode
    this.clientFactory = clientFactory ?? (nextKey => new TripoClient({key:nextKey}))
    this.client = client ?? this.clientFactory(key)
    this.key = key; this.enabled = enabled && !demoMode; this.downloader = downloader; this.extraHosts = extraHosts
    this.locks = new Set(); this.refreshing = new Map()
  }
  status() {
    return {plugin: 'dsh-tripo-studio', version: APP_VERSION, upgrade: this.store.upgrade ?? null, site: TRIPO_SITE, apiBase: TRIPO_API_BASE, keyConfigured: Boolean(this.key), paidEnabled: this.enabled,
      mode: !this.key ? 'unconfigured' : this.enabled ? 'ready' : 'read-only', imageModels: IMAGE_MODELS, imageSizes: IMAGE_SIZES, modelVersions: MODEL_VERSIONS,
      credentials: {source:this.credentialSource, canPersist:this.credentialStore.canPersist, storageError:this.storageError},
      note: '密钥由本机后端管理，状态不回传密钥；保存不会提交任务，每个收费请求均须单独审批。远程代理访问默认拒绝。'}
  }
  configureCredentials(body) {
    if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!['key','paidEnabled','remember'].includes(k)) || typeof body.paidEnabled!=='boolean' || typeof body.remember!=='boolean') fail('密钥设置参数无效',400,'INVALID_CREDENTIAL_SETTINGS')
    if (this.locks.size || this.refreshing.size) fail('任务操作正在进行，请稍后再更改密钥',409,'CREDENTIAL_BUSY')
    const key = Object.hasOwn(body,'key') ? validateKey(body.key) : this.key
    if (!key) fail('请先输入 API 密钥',400,'NOT_CONFIGURED')
    if (this.demoMode && body.paidEnabled) fail('当前为强制演示模式，无法启用收费',409,'DEMO_MODE')
    const client = this.clientFactory(key)
    if (body.remember) this.credentialStore.save(key,body.paidEnabled)
    this.key = key; this.enabled = body.paidEnabled && !this.demoMode; this.client = client
    this.credentialSource = body.remember ? 'saved' : 'session'; this.storageError = false
    return this.status()
  }
  clearCredentials() {
    if (this.locks.size || this.refreshing.size) fail('任务操作正在进行，请稍后再清除密钥',409,'CREDENTIAL_BUSY')
    const client = this.clientFactory('')
    this.credentialStore.clear()
    this.key = ''; this.enabled = false; this.client = client; this.credentialSource = 'cleared'; this.storageError = false
    return this.status()
  }
  prepare(projectId, {kind, params, label, priority = 'normal', role = 'part'}) {
    this.store.project(projectId)
    if(!['high','base','normal'].includes(priority)||!['whole','part'].includes(role))fail('任务用途或优先级无效')
    if (Object.values(this.store.state.jobs).filter(j => j.projectId === projectId).length >= 500) fail('当前项目任务数已达上限')
    const normalized = normalizeJob(kind, params)
    let inputHash = ''
    if (normalized.input_asset) {
      const a = this.store.asset(projectId, normalized.input_asset)
      if (a.kind !== 'image') fail('此操作需要图像资产')
      if (kind === 'image-to-image' && (a.width / a.height > 3 || a.height / a.width > 3)) fail('图像编辑要求宽高比在 1:3 与 3:1 之间，请先补白裁剪')
      inputHash = a.hash
    }
    if (normalized.input_job) {
      const j = this.store.job(projectId, normalized.input_job)
      assertCurrentSite(j)
      const allowed = kind === 'model-convert' ? ['image-to-model'] : ['text-to-image', 'image-to-image']
      if (j.status !== 'success' || !allowed.includes(j.kind) || !validTaskId(j.taskId)) fail(kind === 'model-convert' ? '转换输入必须是成功的同账户3D任务' : '引用任务必须是成功的图像任务')
      if (j.accountHash !== accountFingerprint(this.key)) fail('引用任务使用了其他凭据；请使用已保存的本地图片重新上传', 409, 'ACCOUNT_CHANGED')
      inputHash = j.taskId
    }
    const accountHash = accountFingerprint(this.key)
    const job = {id: uid(), site: TRIPO_SITE, projectId, kind, priority, role, label: String(label || kind).slice(0, 100), params: normalized,
      inputHash, accountHash, status: 'awaiting_approval', createdAt: new Date().toISOString(), progress: 0, downloadStatus: 'not_started', assetIds: [], costEstimate: null}
    job.approvalHash = hash(JSON.stringify({site: TRIPO_SITE, projectId, kind, params: normalized, inputHash, accountHash, priority, role}))
    this.store.state.jobs[job.id] = job; this.store.save(); return publicJob(job)
  }
  async submit(projectId, id, approvalHash) {
    const job = this.store.job(projectId, id)
    assertCurrentSite(job)
    if (job.approvalHash !== approvalHash) fail('审批与任务参数不一致，请重新准备', 409, 'APPROVAL_MISMATCH')
    if (job.hidden===true) fail('隐藏记录不可提交，请先恢复显示并重新审阅',409)
    if (job.status !== 'awaiting_approval' || this.locks.has(id)) return publicJob(job) // Idempotent local request, never a second upstream POST.
    if (!this.key || !this.enabled) fail('请在连接设置中保存 API 密钥（也可配置 TRIPO_CN_API_KEY）并明确启用收费功能', 503, 'NOT_ENABLED')
    if (job.params.prompt && job.params.prompt.trim().length > promptCap(job.params.model)) fail('草稿提示词超出当前模型长度上限，请缩短后重新准备；未提交',400,'PROMPT_TOO_LONG')
    if (job.accountHash !== accountFingerprint(this.key)) fail('账户已改变，原审批失效，请重新准备', 409, 'ACCOUNT_CHANGED')
    if (job.params.input_asset && hash(fs.readFileSync(this.store.assetPath(this.store.asset(projectId, job.params.input_asset)))) !== job.inputHash) fail('输入文件已改变，原审批失效', 409, 'INPUT_CHANGED')
    this.locks.add(id)
    let paidAttempted = false
    try {
      job.status = 'submitting'; job.approvedAt = new Date().toISOString(); this.store.save()
      const params = {...job.params}
      if (params.input_asset) {
        const a = this.store.asset(projectId, params.input_asset)
        params.input = await this.client.upload(fs.readFileSync(this.store.assetPath(a)), a.mime)
        delete params.input_asset
      }
      if (params.input_job) {
        const inputJob = this.store.job(projectId, params.input_job)
        assertCurrentSite(inputJob)
        const allowed = job.kind === 'model-convert' ? ['image-to-model'] : ['text-to-image', 'image-to-image']
        if (inputJob.accountHash !== accountFingerprint(this.key) || inputJob.status !== 'success' || !allowed.includes(inputJob.kind) || inputJob.taskId !== job.inputHash) fail('引用任务已改变，请重新准备', 409, 'INPUT_CHANGED')
        params.input = inputJob.taskId; delete params.input_job
      }
      // Write ambiguity BEFORE making a paid call: crashes must never replay it.
      job.status = 'submission_unknown'; this.store.save(); paidAttempted = true
      const result = await this.client.create(job.kind, params)
      if (!validTaskId(result?.task_id)) throw new Error('创建响应没有有效 task_id')
      job.taskId = result.task_id; job.status = 'queued'; job.error = null; delete job.errorPhase; delete job.errorDetail; this.store.save()
    } catch (error) {
      job.status = paidAttempted && !error.definitive ? 'submission_unknown' : 'failed'
      job.error = redact(error.message, this.key); job.errorCode = error.code ?? 'SUBMISSION_ERROR'
      // Optional diagnostics: which phase failed and a redacted network category, never raw upstream objects.
      job.errorPhase = paidAttempted ? 'create' : 'before_create'
      if (typeof error.detail === 'string') job.errorDetail = error.detail.slice(0, 40); else delete job.errorDetail
      this.store.save()
    } finally { this.locks.delete(id) }
    return publicJob(job)
  }
  discard(projectId, id) {
    const job = this.store.job(projectId, id)
    if (job.status !== 'awaiting_approval') fail('只能丢弃尚未提交的草稿，不能取消云端任务', 409)
    job.status = 'discarded'; this.store.save(); return publicJob(job)
  }
  track(projectId, id, tracking) {
    const job = this.store.job(projectId, id)
    if (typeof tracking !== 'boolean') fail('tracking 必须为布尔值')
    if (tracking && job.hidden===true) fail('请先恢复列表显示，再恢复跟踪',409)
    if (tracking) assertCurrentSite(job)
    job.tracking = tracking; this.store.save(); return publicJob(job)
  }
  visibility(projectId,id,body) {return setVisibility(this,projectId,id,body)}
  cleanup(projectId,body) {return cleanupRecords(this,projectId,body)}
  deleteAsset(projectId, id, body) {
    if (!body || body.confirm !== true || Object.keys(body).some(k=>k!=='confirm')) fail('删除参考图需要明确确认')
    const a = this.store.asset(projectId, id)
    if (this.refreshing.has(projectId)) fail('任务刷新中，暂不能删除资产', 409)
    if (Object.values(this.store.state.jobs).some(j=>j.params?.input_asset===id || j.assetIds?.includes(id) || j.id===a.sourceJobId))
      fail('此资产仍关联任务；请保留资产，或先处理关联的本地任务记录',409,'ASSET_IN_USE')
    const result=this.store.commitDeletion(projectId,{assetIds:[id]})
    return {deleted:true,id,...result,note:'已删除此本地文件和资产记录；不会修改云端任务。'}
  }
  deleteRecord(projectId, id, body) {
    const job = this.store.job(projectId,id)
    if (!body || body.confirm !== true || Object.keys(body).some(k=>!['confirm','deleteAssets'].includes(k)) || (body.deleteAssets !== undefined && typeof body.deleteAssets !== 'boolean')) fail('删除记录需要明确确认；是否删除资产必须是布尔值')
    if (!DELETABLE_STATUSES.includes(job.status)) fail('未知提交或运行中的任务不能删除记录；可从列表隐藏并保留恢复信息',409)
    if (this.locks.has(id) || this.locks.has(`download:${id}`) || this.refreshing.has(projectId)) fail('任务操作中，暂不能删除',409)
    if (Object.values(this.store.state.jobs).some(j=>j.id!==id && j.params?.input_job===id)) fail('此记录仍被其他任务引用，不能删除',409,'JOB_IN_USE')
    const assetIds = body.deleteAssets ? [...new Set([...(job.assetIds||[]),...Object.values(this.store.state.assets).filter(a=>a.sourceJobId===id).map(a=>a.id)])].filter(a=>this.store.state.assets[a]) : []
    for (const assetId of assetIds) {
      this.store.asset(projectId,assetId)
      if (Object.values(this.store.state.jobs).some(j=>j.id!==id && (j.params?.input_asset===assetId || j.assetIds?.includes(assetId))))
        fail('已有其他任务引用产出资产；不能连同资产删除',409,'ASSET_IN_USE')
    }
    const result=this.store.commitDeletion(projectId,{jobId:id,assetIds})
    return {deleted:true,id,...result,note:body.deleteAssets?'已删除本地记录及其未被其他任务引用的本地产出；云端记录不受影响。':'已删除本地记录，保留现有资产；云端记录不受影响。'}
  }
  // Existing v0.2.9 callers still use this name; semantics now allow success.
  deleteFailed(projectId,id,body) {return this.deleteRecord(projectId,id,body)}
  async importTask(projectId,body) {
    this.store.project(projectId)
    if (!body || body.confirm !== true || Object.keys(body).some(k=>!['taskId','confirm','label'].includes(k)) || !validTaskId(body.taskId) || (body.label !== undefined && (typeof body.label !== 'string' || body.label.length>100))) fail('请核对云端 task_id 和导入确认')
    if (!this.key) fail('需要原国内站账户密钥才能只读查询已有任务',503,'NOT_CONFIGURED')
    if (Object.values(this.store.state.jobs).filter(j=>j.projectId===projectId).length>=500) fail('当前项目任务数已达上限')
    const id=body.taskId,lock=`import:${id.toLowerCase()}`
    if (this.locks.has(lock) || this.refreshing.has(projectId)) fail('任务操作中，请稍后导入',409)
    if (Object.values(this.store.state.jobs).some(j=>j.taskId?.toLowerCase()===id.toLowerCase())) fail('此云端ID已关联本地任务，请使用原记录刷新',409,'TASK_ALREADY_IMPORTED')
    this.locks.add(lock)
    try {
      const result=await this.client.task(id) // GET only. No generation, upload or conversion.
      if (result?.task_id!==id || !Object.hasOwn(CLOUD_TYPES,result?.type) || !['queued','running','success','failed','cancelled'].includes(result?.status)) fail('云任务ID、类型或状态与当前导入范围不符，未关联',409)
      if (Object.values(this.store.state.jobs).some(j=>j.taskId?.toLowerCase()===id.toLowerCase())) fail('云端ID已被其他记录关联',409,'TASK_ALREADY_IMPORTED')
      const kind=CLOUD_TYPES[result.type],label=body.label?.trim()||`手动导入 · ${kind}`
      const job={id:uid(),site:TRIPO_SITE,projectId,kind,label,taskId:id,params:{},inputHash:'',accountHash:accountFingerprint(this.key),
        status:result.status,createdAt:new Date().toISOString(),progress:0,downloadStatus:'not_started',assetIds:[],priority:'normal',role:'part',tracking:true,costEstimate:null,importedAt:new Date().toISOString()}
      this.store.state.jobs[job.id]=job
      this.applyTaskResult(job,result)
      if (job.status==='success') await this.saveOutputs(projectId,job.id)
      return publicJob(job)
    } finally {this.locks.delete(lock)}
  }
  applyTaskResult(job, result) {
    if (!result || typeof result !== 'object' || (result.task_id !== undefined && result.task_id !== job.taskId)) fail('任务响应标识不匹配，未更新本地状态', 502)
    if (result.type !== undefined && result.type !== cloudType(job.kind)) fail('云端任务类型与本地记录不符，未更新本地状态',502)
    if (!['queued','running','success','failed','cancelled'].includes(result.status)) fail('未知云端任务状态，未更新本地状态', 502)
    job.status = result.status
    job.progress = result.status === 'success' ? 100 : Math.min(100,Math.max(0,Number(result.progress)||0))
    job.lastQueryError = null; job.lastRefreshedAt = new Date().toISOString()
    job.error = result.status === 'failed' ? redact(result.error_message || '云端任务失败',this.key) : null
    job.errorCode = result.status === 'failed' ? result.error_code : null
    if (Number.isFinite(result.credits_consumed)) job.creditsConsumed = result.credits_consumed
    if (result.status === 'success') {job.output = result.output ?? {};job.completedAt = result.completed_at ?? new Date().toISOString()}
    this.store.save()
  }
  async recover(projectId, id, body) {
    const job = this.store.job(projectId,id)
    if (job.hidden===true) fail('请先恢复列表显示，再关联恢复',409)
    assertCurrentSite(job)
    if (!body || body.confirm !== true || Object.keys(body).some(k=>!['taskId','confirm'].includes(k)) || !validTaskId(body.taskId)) fail('请核对并确认有效的云端 task_id')
    if (!this.key || job.accountHash !== accountFingerprint(this.key)) fail('请使用创建此任务的原国内站凭据恢复',409,'ACCOUNT_CHANGED')
    if (job.taskId === body.taskId && job.recoveredAt) return publicJob(job)
    if (job.status !== 'submission_unknown' || job.taskId) fail('仅无云端ID的提交未知记录可以关联恢复',409)
    const lock = `recover:${body.taskId.toLowerCase()}`
    if (this.locks.has(id) || this.locks.has(lock) || this.refreshing.has(projectId)) fail('任务操作中，请稍后恢复',409)
    if (Object.values(this.store.state.jobs).some(j=>j.taskId?.toLowerCase()===body.taskId.toLowerCase())) fail('此云端ID已关联其他本地任务，未重复导入',409)
    this.locks.add(id);this.locks.add(lock)
    try {
      const result = await this.client.task(body.taskId) // GET only; no upload or paid create.
      if (result?.task_id !== body.taskId || result?.type !== cloudType(job.kind)) fail('云端ID或任务类型与本地记录不符；未关联，请核对控制台',409)
      if (!['queued','running','success','failed','cancelled'].includes(result.status)) fail('云端状态不能识别，未关联',502)
      if (Object.values(this.store.state.jobs).some(j=>j.id!==id && j.taskId?.toLowerCase()===body.taskId.toLowerCase())) fail('此云端ID已关联其他本地任务，未重复导入',409)
      job.taskId = body.taskId;job.recoveredAt = new Date().toISOString();job.tracking = true
      this.applyTaskResult(job,result)
      if (job.status === 'success') await this.saveOutputs(projectId,id)
      return publicJob(job)
    } finally {this.locks.delete(id);this.locks.delete(lock)}
  }
  async refresh(projectId, {manual=false, jobId} = {}) {
    this.store.project(projectId)
    if (typeof manual !== 'boolean') fail('刷新参数无效')
    if (jobId) {
      const job = this.store.job(projectId,jobId);assertCurrentSite(job)
      if (job.hidden===true) fail('请先恢复列表显示，再刷新任务',409)
      if (!validTaskId(job.taskId)) fail('没有可查询的云端ID，请先关联恢复',409)
      if (this.locks.has(jobId) || this.locks.has(`download:${jobId}`)) fail('任务操作中，请稍后刷新',409)
    }
    if (this.refreshing.has(projectId)) {
      const existing = await this.refreshing.get(projectId)
      if (!manual) return existing
      return this.refresh(projectId,{manual,jobId})
    }
    const work = (async () => {
      for (const job of Object.values(this.store.state.jobs).filter(j => j.projectId === projectId && j.hidden!==true && isCurrentSiteJob(j) && validTaskId(j.taskId) &&
        (jobId ? j.id === jobId : manual ? ['queued','running','failed','cancelled'].includes(j.status) || (j.status === 'success' && j.downloadStatus !== 'downloaded') : j.tracking !== false && ['queued','running'].includes(j.status)))) {
        if (this.locks.has(job.id) || this.locks.has(`download:${job.id}`)) continue
        try {
          if (job.accountHash !== accountFingerprint(this.key)) fail('服务端凭据已改变，已暂停历史任务查询；请核对原账户',409,'ACCOUNT_CHANGED')
          const result = await this.client.task(job.taskId)
          this.applyTaskResult(job,result)
          if (job.status === 'success') await this.saveOutputs(projectId,job.id,{fresh:true})
        } catch (error) {job.lastQueryError = redact(error.message,this.key);this.store.save()}
      }
      return this.store.snapshot(projectId)
    })()
    this.refreshing.set(projectId,work)
    try {return await work} finally {this.refreshing.delete(projectId)}
  }
  async saveOutputs(projectId, id, {fresh=false} = {}) {
    const job = this.store.job(projectId, id)
    if (job.hidden===true) fail('请先恢复列表显示，再保存产出',409)
    if (job.status !== 'success') fail('云任务尚未成功', 409)
    if (job.downloadStatus === 'downloaded' || this.locks.has(`download:${id}`)) return publicJob(job)
    assertCurrentSite(job)
    this.locks.add(`download:${id}`)
    try {
      const retrying = job.downloadStatus === 'download_failed'
      job.downloadStatus = 'downloading'; this.store.save()
      // Requery a completed task on explicit download retry, so an expired CDN
      // signature may be renewed without ever resubmitting generation.
      if (retrying && !fresh && job.taskId && job.accountHash === accountFingerprint(this.key)) {
        const fresh = await this.client.task(job.taskId)
        if (fresh?.task_id && fresh.task_id !== job.taskId) throw new Error('下载重试的任务响应标识不匹配')
        if (fresh?.status !== 'success') throw new Error('下载重试时云任务状态不再为成功，请核查控制台')
        job.output = fresh.output ?? job.output
        this.store.save()
      }
      const kind = ['image-to-model','model-convert'].includes(job.kind) ? 'model' : 'image'
      const existing = Object.values(this.store.state.assets).find(a=>a.projectId === projectId && a.sourceJobId === job.id && a.kind === kind)
      if (existing) {job.assetIds=[existing.id];job.downloadStatus='downloaded';job.downloadError=null;this.store.save();return publicJob(job)}
      const url = job.output?.[kind === 'model' ? 'model_url' : 'generated_image_url']
      if (typeof url !== 'string') throw new Error('云结果缺少预期的输出 URL，需核对实际 API 响应')
      const buffer = await this.downloader(url, (kind === 'model' ? 150 : 20) * 1024 ** 2, {extraHosts: this.extraHosts})
      const asset = this.store.addAsset(projectId, buffer, {kind, label: job.label, sourceJobId: job.id, priority:job.priority??'normal',
        ...(job.kind === 'model-convert' && job.params?.format ? {format:job.params.format} : {})})
      job.assetIds = [asset.id]; job.downloadStatus = 'downloaded'; job.downloadError = null; this.store.save()
    } catch (error) { job.downloadStatus = 'download_failed'; job.downloadError = redact(error.message, this.key); this.store.save() }
    finally { this.locks.delete(`download:${id}`) }
    return publicJob(job)
  }
}
