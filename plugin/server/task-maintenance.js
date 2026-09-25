import {fail, publicJob} from './store.js'
import {CLEANUP_STATUSES} from '../shared/task-policy.js'

function idle(service, projectId, id) {
  if (service.refreshing.has(projectId) || service.locks.has(id) || service.locks.has(`download:${id}`))
    fail('任务操作中，请稍后再移除或恢复记录',409,'JOB_BUSY')
}
export function setVisibility(service, projectId, id, body) {
  const job=service.store.job(projectId,id)
  if (!body || body.confirm!==true || typeof body.hidden!=='boolean' || Object.keys(body).some(k=>!['confirm','hidden'].includes(k)))
    fail('隐藏/恢复需要明确确认和布尔 hidden 参数')
  idle(service,projectId,id)
  const before=structuredClone(job)
  try {
    job.hidden=body.hidden
    if (body.hidden) {
      job.tracking=false
      // A retained, referenced draft must not remain submit-capable while hidden.
      if (job.status==='awaiting_approval') job.status='discarded'
    }
    service.store.save()
  } catch (error) {service.store.state.jobs[id]=before;throw error}
  return {job:publicJob(job),note:body.hidden?'已从列表移除并停止本地跟踪；恢复记录和资产仍保留，未取消云端任务。':'已恢复列表显示；未恢复跟踪、未查询或提交云端任务。'}
}
export function cleanupRecords(service, projectId, body) {
  service.store.project(projectId)
  if (!body || body.confirm!==true || Object.keys(body).some(k=>!['confirm','ids'].includes(k)) || !Array.isArray(body.ids) || !body.ids.length || body.ids.length>500 || new Set(body.ids).size!==body.ids.length || body.ids.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)))
    fail('批量清理需要确认本次1–500个不重复的任务ID')
  // Project ownership is checked for the whole request before any mutation.
  const jobs=body.ids.map(id=>service.store.job(projectId,id)), eligible=new Set(), skipped=[]
  for (const job of jobs) {
    if (job.hidden===true || !CLEANUP_STATUSES.includes(job.status)) {skipped.push({id:job.id,reason:'状态已变化或已隐藏，未删除'});continue}
    try {idle(service,projectId,job.id);eligible.add(job.id)} catch {skipped.push({id:job.id,reason:'任务操作中，未删除'})}
  }
  // Fixed point: a skipped dependent can protect another candidate transitively.
  let changed=true
  while(changed){
    changed=false
    for(const id of eligible) if(Object.values(service.store.state.jobs).some(j=>j.id!==id&&!eligible.has(j.id)&&j.params?.input_job===id)){
      eligible.delete(id);skipped.push({id,reason:'仍被其他保留任务引用'});changed=true
    }
  }
  const removedIds=[...eligible]
  if(removedIds.length) service.store.commitDeletion(projectId,{jobIds:removedIds})
  return {removedIds,skipped,note:`已删除 ${removedIds.length} 条失败/丢弃记录，跳过 ${skipped.length} 条；全部本地资产保留，未操作云端。`}
}
