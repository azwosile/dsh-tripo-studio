import React from 'react'
import {RenameButton} from './image-card.jsx'
import {CLEANUP_STATUSES,requiresRetention} from '../shared/task-policy.js'
import {isCurrentSiteJob} from '../shared/site.js'
import {validTaskId} from '../shared/task-id.js'
import {IMAGE_MODEL_INFO} from '../shared/image-models.js'
import {ModelThumb} from './model-thumb.jsx'
import {KIND_LABEL,jobRoleLabel,looksModerated,MODERATION_HINT} from './model-roles.js'
import {MULTIVIEW_VIEWS,MULTIVIEW_LABELS} from '../shared/contracts.js'
export const STATUS = {awaiting_approval:'等待审批',submitting:'提交中',submission_unknown:'提交结果未知 · 禁止自动重发',queued:'排队中',running:'生成中',success:'云端成功',failed:'失败',cancelled:'云端已取消',discarded:'草稿已丢弃'}
const previewable=a=>a.kind==='model'&&['glb','fbx','obj','stl','gltf'].includes(a.format||'glb')
export function TaskList({jobs,assets,busy,onAction,onPreview,onImage,onZoom,onCleanup,onRename}) {
  const [cleanup,setCleanup]=React.useState(null)
  const visible=jobs.filter(j=>j.hidden!==true),hidden=jobs.filter(j=>j.hidden===true)
  const candidates=visible.filter(j=>CLEANUP_STATUSES.includes(j.status))
  return <div className="tw-jobs">
    <div className="tw-actions"><button disabled={busy||!candidates.length} onClick={()=>setCleanup(candidates.map(j=>({id:j.id,label:j.label})))}>一键删除失败/丢弃任务（{candidates.length}）</button></div>
    {cleanup&&<section className="tw-delete-confirm" aria-label="批量删除确认"><h3>确认清理这 {cleanup.length} 条失败/丢弃记录？</h3><p>只删除本机任务记录，保留全部资产，不取消云端任务。状态变化、忙碌或被其他保留任务引用的记录会跳过并报告。</p><ul>{cleanup.map(j=><li key={j.id}>{j.label}</li>)}</ul><button disabled={busy} onClick={()=>{const ids=cleanup.map(j=>j.id);setCleanup(null);onCleanup(ids)}}>确认批量删除本地记录</button><button disabled={busy} onClick={()=>setCleanup(null)}>取消清理</button></section>}
    {[...visible].reverse().map(job=><TaskCard key={job.id} {...{job,jobs,assets,busy,onAction,onPreview,onImage,onZoom,onRename}}/>)}
    {visible.length===0&&<p className="tw-placeholder">当前列表没有任务。</p>}
    {hidden.length>0&&<details className="tw-hidden-jobs"><summary>已移除任务 · 恢复记录（{hidden.length}）</summary><p>隐藏不等于取消云端；资产、ID和查重依据仍在，计入本地任务容量。恢复显示不会查询云端、恢复跟踪或重新提交。</p>{hidden.map(j=><div className="tw-hidden-job" key={j.id} data-hidden-job-id={j.id}><strong>{j.label}</strong><small>{STATUS[j.status]||j.status} · {j.taskId||'无云端ID，仍需核对控制台'}</small><button disabled={busy} onClick={()=>onAction(j,'visibility',{confirm:true,hidden:false})}>恢复到任务列表</button></div>)}</details>}
  </div>
}
function TaskCard({job:j,jobs,assets,busy,onAction,onPreview,onImage,onZoom,onRename}) {
  const [taskId,setTaskId]=React.useState(''),[confirmed,setConfirmed]=React.useState(false)
  const [remove,setRemove]=React.useState(false),[deleteAssets,setDeleteAssets]=React.useState(false)
  const current=isCurrentSiteJob(j),outputs=assets.filter(a=>j.assetIds?.includes(a.id)||a.sourceJobId===j.id)
  const model=j.kind==='model-convert'?`独立格式转换 → ${j.params?.format||'未知'}${j.params?.export_orientation?` · 前向 ${j.params.export_orientation}`:''}`:j.kind==='mesh-decimate'?`独立重拓扑 · ${j.params?.model==='v1.0'?'v1.0 基础减面':'v2.0 智能重拓扑'} · ${j.params?.face_limit?`${j.params.face_limit} 面`:'面数自适应'}${j.params?.quad?' · 四边面':''}`:IMAGE_MODEL_INFO[j.params?.model]?.label||j.params?.model||'历史记录未保存'
  const retain=requiresRetention(j,jobs)
  // 0.3.1 REQ-058: finished 3D tasks show input image → locally rendered 3D reference image.
  const is3d=['image-to-model','multiview-to-model','model-convert','mesh-decimate'].includes(j.kind),srcJob=j.kind==='model-convert'||j.kind==='mesh-decimate'?jobs.find(x=>x.id===j.params?.input_job):j
  const inputImage=is3d?assets.find(a=>a.kind==='image'&&a.id===(srcJob?.params?.input_asset||srcJob?.params?.views?.front)):null
  const modelOut=outputs.find(a=>previewable(a))||outputs.find(a=>a.kind==='model')
  const removeLabel=retain?'从列表移除':`删除${({success:'成功',failed:'失败',discarded:'丢弃',cancelled:'取消',awaiting_approval:'草稿'})[j.status]||''}记录`
  return <article className="tw-job" data-job-id={j.id}>
    <header><strong>{j.label}</strong><span className={j.status==='submission_unknown'?'tw-danger':''}>{STATUS[j.status]||j.status}</span></header>
    <small className="tw-job-model">模型：{model}</small>
    <small>{current?'国内站':'国际站 / 其他站历史'} · <b className={`tw-kind-tag kind-${j.kind}`}>{KIND_LABEL[j.kind]||j.kind}{j.kind==='image-to-model'?` · ${jobRoleLabel(j)}`:j.kind==='multiview-to-model'?` · ${MULTIVIEW_VIEWS.filter(v=>j.params?.views?.[v]).map(v=>MULTIVIEW_LABELS[v]).join('/')}`:''}</b> · {j.kind} · {j.taskId||'无云端 task_id'} · {j.progress}%{j.importedAt?' · 手动查询导入':''}</small>
    {!current&&<p className="tw-note">历史任务已隔离：不会向国内站提交、查询或重试下载。请到原站控制台处理；已下载资产可继续本地使用。</p>}
    <p>本地资产：{({not_started:'未开始',downloading:'下载中',downloaded:'已保存',download_failed:'下载失败，可重试'})[j.downloadStatus]||'未开始'} / 实际积分：{j.creditsConsumed??'未返回'}{j.creditsSource==='usage'?'（来自用量记录）':''}</p>
    {j.lastRefreshedAt&&<small>最近查询：{new Date(j.lastRefreshedAt).toLocaleString()}</small>}
    {[...new Set([j.error,j.lastQueryError,j.downloadError].filter(Boolean))].map((message,i)=><p className="tw-danger" key={i}>{message}</p>)}
    {['failed','submission_unknown'].includes(j.status)&&looksModerated(j.error)&&<p className="tw-note tw-moderation-hint" data-hint="moderation">{MODERATION_HINT}</p>}
    {j.errorPhase&&<p className="tw-note" data-error-phase={j.errorPhase}>{j.errorPhase==='before_create'?'失败阶段：上传参考图（尚未发起收费生成，可重新准备后再次提交）':'失败阶段：提交收费任务（结果可能未知，请先按任务 ID 恢复/核对，勿直接重提）'}{j.errorDetail?` · 原因：${j.errorDetail}`:''}</p>}
    {j.kind==='image-to-image'&&(()=>{const inp=assets.find(a=>a.kind==='image'&&a.id===j.params?.input_asset);return inp?<button type="button" className="tw-job-input" aria-label={`放大图生图输入图：${inp.label}`} onClick={()=>onZoom(inp)}><img src={inp.url} alt={inp.label}/><small>图生图输入：{inp.label}</small></button>:null})()}
    {is3d&&j.status==='success'&&<div className="tw-job-ref" role="group" aria-label={`3D 参考图：${j.label}`}>
      {inputImage&&<><button type="button" className="tw-job-ref-input" aria-label={`放大建模输入图：${inputImage.label}`} onClick={()=>onZoom(inputImage)}><img src={inputImage.url} alt={inputImage.label}/><small>输入图</small></button><span className="tw-job-ref-arrow" aria-hidden="true">→</span></>}
      {modelOut?<ModelThumb asset={modelOut} label={modelOut.label} onOpen={previewable(modelOut)?onPreview:null}/>:<span className="tw-model-thumb" data-thumb="none"><span className="tw-thumb-empty">◇<small>{j.downloadStatus==='download_failed'?'下载失败 · 重试保存后显示':'模型保存到本机后显示'}</small></span></span>}
    </div>}
    <div className="tw-task-outputs">{outputs.map(a=><div key={a.id} className="tw-task-output">
      {a.kind==='image'?<><span className="tw-output-wrap"><button className="tw-output-image" aria-label={`放大图片：${a.label}`} onClick={()=>onZoom(a)}><img src={a.url} alt={a.label}/></button><RenameButton asset={a} busy={busy} onRename={onRename}/></span><button disabled={busy} onClick={()=>onImage(a)}>使用此图片</button></>:<><strong>◇ {a.label} · {(a.format||'glb').toUpperCase()}</strong>{previewable(a)?<button onClick={()=>onPreview?.(a)}>3D 预览</button>:<small>此格式请下载并用对应3D软件打开</small>}</>}
      <a href={`${a.url}&download=1`} download>下载{a.kind==='model'?'模型':'图片'}</a>
    </div>)}</div>
    <div className="tw-actions">
      {j.status==='awaiting_approval'&&<button disabled={busy} onClick={()=>onAction(j,'discard',{})}>丢弃草稿</button>}
      {current&&validTaskId(j.taskId)&&!['awaiting_approval','submitting','discarded'].includes(j.status)&&<button disabled={busy} onClick={()=>onAction(j,'refresh',{})}>刷新此任务（不重新生成）</button>}
      {current&&j.status==='success'&&j.downloadStatus!=='downloaded'&&<button disabled={busy} onClick={()=>onAction(j,'download',{})}>重试保存输出（不重新生成）</button>}
      {current&&['running','queued'].includes(j.status)&&<button disabled={busy} onClick={()=>onAction(j,'track',{tracking:j.tracking===false})}>{j.tracking===false?'恢复跟踪':'停止跟踪（不取消云端）'}</button>}
      <button disabled={busy} onClick={()=>{setRemove(!remove);setDeleteAssets(false)}}>{removeLabel}</button>
    </div>
    {remove&&<div className="tw-delete-confirm"><p>{retain?'此任务尚未安全结束或仍被其他任务引用。仅隐藏并停止本地跟踪，保留恢复/查重信息和资产；不取消云端，不退款，不自动重发。':j.status==='failed'?'云端/提交已标记失败；仅删除本机记录，云端历史及扣费请以控制台为准。':['awaiting_approval','discarded'].includes(j.status)?'此为未提交/已丢弃草稿，仅删除本机记录，不发起云端任务。':'此云端任务已结束；删除本机记录不会撤回生成或云端历史。'} 默认保留全部本地资产。</p>
      {!retain&&outputs.length>0&&<label><input type="checkbox" checked={deleteAssets} onChange={e=>setDeleteAssets(e.target.checked)}/>同时删除该任务的 {outputs.length} 个本机产出资产（不可恢复；如被其他任务引用将拒绝）</label>}
      <button disabled={busy} onClick={()=>onAction(j,retain?'visibility':'delete',retain?{confirm:true,hidden:true}:{confirm:true,deleteAssets})}>{retain?'确认移除并保留恢复信息':`确认删除本地记录${deleteAssets?'及产出资产':''}`}</button><button disabled={busy} onClick={()=>setRemove(false)}>保留记录</button>
    </div>}
    {current&&j.status==='submission_unknown'&&!j.taskId&&<section className="tw-recovery" aria-label="关联已存在的云端任务"><h3>关联已存在的云端任务</h3>
      <p>旧版可能误拒 UUID。请到国内站控制台核对同一账户、输入和任务类型，粘贴对应 task_id。这里只查询并保存产出，不重新上传或生成。</p>
      <label>云端 task_id<input aria-label="恢复用云端 task_id" value={taskId} maxLength={128} placeholder="UUID 或 task_..." onChange={e=>{setTaskId(e.target.value);setConfirmed(false)}}/></label>
      <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我已核对这是此记录对应的同一云端任务</label>
      <button disabled={busy||!confirmed||!validTaskId(taskId.trim())} onClick={()=>onAction(j,'recover',{taskId:taskId.trim(),confirm:true})}>关联并刷新（不重新生成）</button>
    </section>}
  </article>
}
