import React from 'react'
import {MULTIVIEW_VIEWS, MULTIVIEW_LABELS} from '../shared/contracts.js'
import {guessViews, multiviewIssues} from './multiview.js'
// 0.3.4 REQ-073 UI: 4 view slots + one reviewed paid task. Pure helpers live in multiview.js (unit-tested).
export function MultiviewPlan({images, busy, canPay, onZoom, onPrepare, modelParams}) {
  const [views, setViews] = React.useState({}), [label, setLabel] = React.useState('')
  const valid = Object.fromEntries(Object.entries(views).filter(([, id]) => images.some(a => a.id === id)))
  const {blockers, warnings} = multiviewIssues(valid, images)
  const front = images.find(a => a.id === valid.front)
  const name = (label.trim() || (front ? `多视图「${front.label}」` : '多视图模型')).slice(0, 100)
  const set = (v, id) => setViews(prev => { const n = {...prev}; if (id) n[v] = id; else delete n[v]; return n })
  const count = Object.keys(valid).length
  return <div className="tw-model-plan tw-multiview-plan" aria-label="多视图建模">
    <h3>③ 多视图建模（同一物体 2～4 个视角 → 1 个任务）</h3>
    <p className="tw-note">官方「多视图生成模型」：正面必填，左侧／背面／右侧可选，至少 2 张；所有图应是同一物体、一致光照、同一比例。“左侧”指物体自身的左侧（物体向画面左转 90° 后露出的一面）。与上方主要／次要／基准勾选无关，单独审批、单独收费，参考积分与图生3D相同。</p>
    <div className="tw-view-slots">{MULTIVIEW_VIEWS.map(v => { const a = images.find(x => x.id === valid[v]); return <div key={v} className={`tw-view-slot ${a ? 'filled' : ''}`} data-view={v}>
      <strong>{MULTIVIEW_LABELS[v]}{v === 'front' ? ' *' : ''}</strong>
      {a ? <button type="button" className="tw-output-image" aria-label={`放大${MULTIVIEW_LABELS[v]}图：${a.label}`} onClick={() => onZoom?.(a)}><img src={a.url} alt={a.label}/></button> : <span className="tw-view-empty">未选择</span>}
      <select aria-label={`${MULTIVIEW_LABELS[v]}视角图片`} value={valid[v] || ''} disabled={busy} onChange={e => set(v, e.target.value)}><option value="">{v === 'front' ? '选择正面图（必填）' : '不使用此视角'}</option>{images.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
    </div> })}</div>
    <div className="tw-actions"><button type="button" disabled={busy || !images.length} onClick={() => setViews(guessViews(images))}>按图片名称自动填充</button><button type="button" disabled={busy || !count} onClick={() => setViews({})}>清空视角</button></div>
    <label>任务名称<input aria-label="多视图任务名称" maxLength={100} value={label} placeholder={name} onChange={e => setLabel(e.target.value)}/></label>
    {blockers.length > 0 && <p className="tw-placeholder">{blockers.join('；')}</p>}
    {warnings.map(w => <p className="tw-danger" role="note" key={w}>{w}</p>)}
    <div className="tw-actions"><button className="tw-primary" disabled={busy || !canPay || blockers.length > 0} onClick={() => onPrepare([{kind: 'multiview-to-model', role: 'part', priority: 'high', label: name, params: {views: valid, ...modelParams()}}])}>审阅多视图建模 · {count} 视角 · 1 个任务</button><small>使用下方「建模参数」同一套设置；多视图接口没有“生成前优化参考图”，该项不会发送。</small></div>
  </div>
}
