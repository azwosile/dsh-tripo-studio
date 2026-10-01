import React from 'react'
import {DECIMATE_MODELS,EXPORT_ORIENTATIONS,decimateFaceRange} from '../shared/contracts.js'
import {DECIMATE_DOC,RETOPO_OFFICIAL_TIPS,retopoSpec,orientationCaveat} from './retopo.js'
export {DECIMATE_DOC,CONVERT_DOC,RETOPO_OFFICIAL_TIPS,ORIENTATION_GEN_TIP,ORIENTATION_CONVERT_TIP,retopoSpec,orientationCaveat} from './retopo.js'
// 0.3.5 REQ-076/077/078: 重拓扑 (official POST /mesh/decimate) and export_orientation.
// The official notes are shown verbatim-in-substance before any paid request, and the user must tick
// 「已阅读官方提示」 before a retopology draft can even be prepared. The approval dialog repeats them.
const AXIS_TEXT = {'+x': '+X 前向（官方默认）', '-x': '-X 前向', '-y': '-Y 前向', '+y': '+Y 前向'}

export function RetopoOfficialTips({compact = false}) {
 return <div className="tw-official-tips" role="note" aria-label="重拓扑官方提示">
  <strong>Tripo 官方提示 · 重拓扑 /mesh/decimate</strong>
  <ul>{(compact ? RETOPO_OFFICIAL_TIPS.slice(1, 3).concat(RETOPO_OFFICIAL_TIPS.slice(4)) : RETOPO_OFFICIAL_TIPS).map(t => <li key={t}>{t}</li>)}</ul>
  <a href={DECIMATE_DOC} target="_blank" rel="noopener noreferrer">查看官方重拓扑文档</a>
 </div>
}

/** Select for export_orientation. '' = not sent (official default +x). */
export function OrientationSelect({value, onChange, label, tip, disabled}) {
 return <label className="tw-orientation">{label}<select aria-label={label} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
   <option value="">不设置 · 沿用官方默认 +x</option>
   {EXPORT_ORIENTATIONS.map(v => <option key={v} value={v}>{AXIS_TEXT[v]}</option>)}
  </select><small className="tw-official-inline">{tip}</small></label>
}

export function RetopoPanel({jobs = [], busy, canPay, onPrepare}) {
 const [jobId, setJobId] = React.useState(''), [model, setModel] = React.useState('v2.0')
 const [faceMode, setFaceMode] = React.useState('auto'), [faceLimit, setFaceLimit] = React.useState(10000)
 const [quad, setQuad] = React.useState(false), [bake, setBake] = React.useState(true), [ack, setAck] = React.useState(false)
 const [lo, hi] = decimateFaceRange(model, quad)
 const fixed = model === 'v1.0' || faceMode === 'fixed'
 const faceOk = !fixed || (Number.isInteger(faceLimit) && faceLimit >= lo && faceLimit <= hi)
 const job = jobs.find(j => j.id === jobId)
 const pickModel = v => { setModel(v); const [a, b] = decimateFaceRange(v, quad); setFaceLimit(Math.min(Math.max(faceLimit, a), b)) }
 const pickQuad = q => { setQuad(q); const [a, b] = decimateFaceRange(model, q); setFaceLimit(Math.min(Math.max(faceLimit, a), b)) }
 return <section className="tw-convert tw-retopo" aria-label="重拓扑">
  <h3>⑤ 已完成模型 → 重拓扑 / 减面（独立收费）</h3>
  <RetopoOfficialTips/>
  <label>原模型任务<select aria-label="重拓扑来源任务" value={jobId} onChange={e => setJobId(e.target.value)}><option value="">选择已成功的国内站3D生成任务</option>{jobs.map(j => <option key={j.id} value={j.id}>{j.label} · {j.taskId}</option>)}</select></label>
  {orientationCaveat(job) && <small className="tw-official-inline" role="alert">{orientationCaveat(job)}</small>}
  <label>重拓扑模型<select aria-label="重拓扑模型" value={model} onChange={e => pickModel(e.target.value)}>{DECIMATE_MODELS.map(v => <option key={v} value={v}>{v === 'v2.0' ? 'v2.0 智能重拓扑 · 30 积分（官方默认）' : 'v1.0 基础减面 · 10 积分'}</option>)}</select></label>
  <label>拓扑<select aria-label="重拓扑拓扑" value={quad ? 'quad' : 'tri'} onChange={e => pickQuad(e.target.value === 'quad')}><option value="tri">三角面</option><option value="quad">四边面</option></select></label>
  {model === 'v2.0' && <label>目标面数方式<select aria-label="重拓扑面数方式" value={faceMode} onChange={e => setFaceMode(e.target.value)}><option value="auto">不填 · 官方自适应</option><option value="fixed">指定面数</option></select></label>}
  {fixed && <label>目标面数<input aria-label="重拓扑目标面数" type="number" min={lo} max={hi} step="500" value={faceLimit} onChange={e => setFaceLimit(Number(e.target.value))}/><small>官方范围 {lo.toLocaleString()}–{hi.toLocaleString()}{model === 'v1.0' ? '（v1.0 必填）' : ''}</small></label>}
  {model === 'v2.0' && <label><input type="checkbox" aria-label="重拓扑烘焙贴图" checked={bake} onChange={e => setBake(e.target.checked)}/>bake 烘焙贴图到新拓扑（官方默认开启）</label>}
  {model === 'v1.0' && <small className="tw-official-inline">v1.0 官方不支持 bake，将不发送该参数。</small>}
  <label className="tw-retopo-ack"><input type="checkbox" aria-label="已阅读重拓扑官方提示" checked={ack} onChange={e => setAck(e.target.checked)}/>我已阅读上方 Tripo 官方提示，了解这是另一笔收费任务，复杂模型可能失败</label>
  <div className="tw-convert-actions"><button disabled={busy || !canPay || !job || !ack || !faceOk} onClick={() => onPrepare([retopoSpec({job, model, faceMode, faceLimit, quad, bake})])}>审阅并单独确认重拓扑 · 1 个任务</button>
   <small>{!ack ? '请先阅读并勾选官方提示。' : !faceOk ? `目标面数须在 ${lo}–${hi} 之间。` : '提交前仍会显示收费确认，可取消。'}</small></div>
 </section>
}
