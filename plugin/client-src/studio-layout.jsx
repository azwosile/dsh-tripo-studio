import React from 'react'
import {ImageTile} from './image-card.jsx'
import {TaskList,STATUS} from './task-list.jsx'
import {buildRelations,jobCounts,parentOf} from './relations.js'
import {ModelThumb} from './model-thumb.jsx'
import {RoleSwitch} from './model-plan.jsx'
import {MODEL_ROLES,roleOf,jobRoleLabel,planModelTasks,toneOf} from './model-roles.js'
export {buildRelations}

// 0.3.0 studio layout (REQ-048～051): library | canvas | inspector, with a task dock.
// Pure presentation: every paid action still goes through the existing prepare → review → consent flow.
export const LAYOUT_KEY = 'tripo-studio-layout-v1'
// 0.3.2 REQ-062～066: canvas-first vertical flow. The library is collapsed to an icon rail by default
// (`lib:false`); on wide containers an open library pushes the canvas, elsewhere it is a transient drawer.
const DEFAULT_LAYOUT = {dock: true, filter: 'all', lib: false}
export const LIB_PUSH_MIN = 1180
export function readLayout() {
  try {
    const v = JSON.parse(window.localStorage.getItem(LAYOUT_KEY))
    return {dock: typeof v?.dock === 'boolean' ? v.dock : true, filter: ['all', 'source', 'part', 'model'].includes(v?.filter) ? v.filter : 'all', lib: v?.lib === true}
  } catch { return {...DEFAULT_LAYOUT} }
}
const FILTER_SHORT = {all: '全', source: '原', part: '部', model: '3D'}
function libraryGroups(images, jobs) {
  const byId = new Map(jobs.map(j => [j.id, j])), ids = new Set(images.map(a => a.id))
  const parents = new Map(images.map(a => [a.id, parentOf(a, byId, ids)]))
  return {parents, sources: images.filter(a => !parents.get(a.id)), parts: images.filter(a => parents.get(a.id))}
}

/** Collapsed library: a slim icon rail. It is a nav (not the 资产库 complementary region). */
export function LibraryRail({images, models, jobs = [], filter, busy, onFilter, onOpen, onImport}) {
  const {sources, parts} = React.useMemo(() => libraryGroups(images, jobs), [images, jobs])
  const filters = [['all', '全部', images.length + models.length], ['source', '原图', sources.length], ['part', '部件', parts.length], ['model', '3D', models.length]]
  return <nav className="tw-lib-rail" aria-label="资产库快捷栏">
    <button type="button" className="tw-rail-open" aria-label="展开资产库" title="展开资产库" onClick={() => onOpen()}>☰</button>
    {filters.map(([id, label, n]) => <button key={id} type="button" aria-pressed={filter === id} aria-label={`打开资产库并筛选：${label}（${n}）`} title={`${label} ${n}`} onClick={() => { onFilter(id); onOpen() }}><span>{FILTER_SHORT[id]}</span><b>{n}</b></button>)}
    <button type="button" aria-label="打开资产库并搜索" title="搜索资产" onClick={() => onOpen(true)}>⌕</button>
    {onImport && <label className="tw-rail-import" title="导入参考图">＋<input aria-label="快捷导入参考图" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy} onChange={e => {const files = [...e.target.files]; e.target.value = ''; onImport(files)}}/></label>}
  </nav>
}
export function writeLayout(value) {
  try { window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(value)) } catch { /* session-only */ }
}

/** Long explanations collapse behind an ⓘ so the inspector stays scannable. */
export function Info({children, label = '说明'}) {
  return <details className="tw-info"><summary><span aria-hidden="true">ⓘ</span> {label}</summary><div>{children}</div></details>
}

export function Library({images, models, jobs = [], selected, busy, filter, onFilter, onSelect, onZoom, onRename, onDelete, onImport, onPreview, canPreviewModel, mode = 'push', onClose, focusSearch = false}) {
  const [query, setQuery] = React.useState(''), searchRef = React.useRef(null)
  React.useEffect(() => { if (focusSearch) searchRef.current?.focus() }, [focusSearch])
  const q = query.trim().toLowerCase(), match = a => !q || a.label.toLowerCase().includes(q)
  const {parents, sources, parts} = React.useMemo(() => libraryGroups(images, jobs), [images, jobs])
  const shown = filter === 'source' ? sources : filter === 'part' ? parts : filter === 'model' ? [] : images
  const filters = [['all', '全部', images.length + models.length], ['source', '原图', sources.length], ['part', '部件', parts.length], ['model', '3D', models.length]]
  return <aside className="tw-library" aria-label="资产库" data-mode={mode}>
    <div className="tw-lib-head">
      <h2>资产库</h2>
      {onClose && <button type="button" className="tw-lib-close" aria-label="收起资产库" title={mode === 'overlay' ? '关闭（Esc）' : '收起为图标栏'} onClick={onClose}>«</button>}
      <label className="tw-upload tw-lib-import">＋ 导入<input aria-label="导入参考图" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy} onChange={e => {const files = [...e.target.files]; e.target.value = ''; onImport(files)}}/></label>
    </div>
    <input ref={searchRef} className="tw-lib-search" type="search" aria-label="搜索资产名称" placeholder="搜索名称…" value={query} onChange={e => setQuery(e.target.value)}/>
    <div className="tw-lib-filters" role="group" aria-label="资产筛选">{filters.map(([id, label, n]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => onFilter(id)}>{label} <b>{n}</b></button>)}</div>
    <div className="tw-lib-scroll">
      {filter !== 'model' && <div className="tw-image-grid tw-lib-grid">{shown.filter(match).map(a => <ImageTile key={a.id} compact asset={a} busy={busy} selected={selected === a.id} badge={a.sourceAssetId ? '裁剪图' : parents.get(a.id) ? 'AI 提取' : '本地资产'} onSelect={onSelect} onZoom={onZoom} onRename={onRename}>
        <div className="tw-image-commands"><button aria-label={`删除参考图：${a.label}`} disabled={busy} onClick={() => onDelete(a)}>删除</button></div>
      </ImageTile>)}</div>}
      {filter !== 'model' && images.length === 0 && <p className="tw-placeholder">还没有参考图。可直接导入已有图片，不需要 API Key。</p>}
      {(filter === 'all' || filter === 'model') && models.filter(match).length > 0 && <div className="tw-lib-models"><h3>3D 模型</h3><div className="tw-lib-model-grid">{models.filter(match).map(a => <div className="tw-lib-model" key={a.id}>
        <ModelThumb asset={a} onOpen={canPreviewModel(a) ? onPreview : null}/>
        <div className="tw-lib-model-meta"><strong>{a.label}</strong><small>{(a.format || 'glb').toUpperCase()} · {(a.size / 1048576).toFixed(2)} MB</small></div>
        <div className="tw-lib-model-cmd">{canPreviewModel(a) ? <button type="button" aria-label={`3D 预览：${a.label}`} onClick={() => onPreview?.(a)}>预览</button> : null}
        <a href={`${a.url}&download=1`} download aria-label={`下载模型：${a.label}`}>↓</a></div>
      </div>)}</div></div>}
      {filter === 'model' && models.length === 0 && <p className="tw-placeholder">成功且下载完成的 3D 模型会出现在这里。</p>}
    </div>
  </aside>
}

export function TaskDock({open, onToggle, project, busy, drafts, onRefresh, onReviewDrafts, taskProps}) {
  const c = jobCounts(project.jobs)
  return <section className="tw-dock" aria-label="任务坞" data-open={open}>
    <header className="tw-dock-head">
      <button type="button" className="tw-dock-toggle" aria-expanded={open} onClick={onToggle}>{open ? '▾' : '▸'} 任务</button>
      <span className="tw-chip run">进行中 {c.running}</span><span className={`tw-chip ${c.failed ? 'bad' : ''}`}>失败/待核对 {c.failed}</span><span className="tw-chip ok">完成 {c.done}</span>
      <span className="tw-dock-spacer"/>
      {drafts.length > 0 && <button disabled={busy} onClick={onReviewDrafts}>审阅 {drafts.length} 个未提交草稿</button>}
      <button disabled={busy} onClick={onRefresh}>刷新任务（只查询，不重提）</button>
    </header>
    {open && <div className="tw-dock-body"><TaskList key={project.id} jobs={project.jobs} assets={project.assets} busy={busy} {...taskProps}/></div>}
  </section>
}

function ModelStatus({entry, busy, onPreview, canPreviewModel}) {
  const {job, models, converts, covered} = entry
  const tone = job.status === 'success' ? 'ok' : ['failed', 'submission_unknown', 'cancelled'].includes(job.status) ? 'bad' : job.status === 'discarded' ? '' : 'run'
  const shown = models.find(m => canPreviewModel(m)) || models[0]
  return <div className="tw-rel-model">
    {shown && <ModelThumb className="small" asset={shown} onOpen={canPreviewModel(shown) ? onPreview : null}/>}
    {covered && <small className="tw-role-ink-blue">随整张拆件图建模</small>}
    <span className={`tw-chip ${tone}`}>{jobRoleLabel(job)} · {STATUS[job.status] || job.status}{['queued', 'running'].includes(job.status) ? ` ${job.progress ?? 0}%` : ''}</span>
    {models.map(m => <span className="tw-rel-file" key={m.id}>{(m.format || 'glb').toUpperCase()}{canPreviewModel(m) && <button type="button" disabled={busy} aria-label={`3D 预览：${m.label}`} onClick={() => onPreview?.(m)}>预览</button>}<a href={`${m.url}&download=1`} download aria-label={`下载模型：${m.label}`}>↓</a></span>)}
    {converts.map(cv => <span className="tw-rel-file" key={cv.job.id}>→ {cv.job.params?.format} · {STATUS[cv.job.status] || cv.job.status}{cv.models.map(m => <a key={m.id} href={`${m.url}&download=1`} download aria-label={`下载模型：${m.label}`}>↓</a>)}</span>)}
  </div>
}

/** C-style "source → parts → 3D" relation view, opened as its own studio page.
 * 0.3.3 REQ-072: roles are edited here with the same green/blue/red switch as the modelling page, the split sheet
 * is chosen per source, and secondary parts show the sheet task that covers them. Still no paid action here. */
export function Relations({images, jobs, assets, selected, busy, sheetAsset, checked, onSelect, onZoom, onCrop, onSheet, onCheck, onPriority, onPreview, canPreviewModel}) {
  const groups = React.useMemo(() => buildRelations(images, jobs, assets), [images, jobs, assets])
  const partCount = groups.reduce((n, g) => n + g.parts.length, 0)
  const plan = planModelTasks({images, jobs, checked, sheetAsset})
  if (!images.length) return <section className="tw-panel tw-canvas-panel"><div className="tw-section-title"><span>MAP / SOURCE → PART</span><h2>来源 → 部件</h2></div><p className="tw-placeholder">还没有图片。导入或生成立绘后，裁剪 / AI 提取出的部件会按来源归组显示在这里。</p></section>
  return <section className="tw-panel tw-canvas-panel tw-relations" aria-label="来源与部件对应关系">
    <div className="tw-section-title"><span>MAP / SOURCE → PART → 3D</span><h2>来源 → 部件</h2></div>
    <p className="tw-rel-summary">{groups.length} 张来源图 · {partCount} 个部件。颜色即建模方式：<b className="tw-role-ink-green">主要（绿）单独建模</b> · <b className="tw-role-ink-blue">次要（蓝）随整张拆件图建模</b> · <b className="tw-role-ink-red">基准（红）单独建模作比例参照</b> · <b className="tw-role-ink-purple">整张拆件图（紫框）</b>。勾选后到「统一建模」页一次审阅。</p>
    <div className="tw-rel-head" aria-hidden="true"><span>来源图 / 整张拆件图</span><span>部件（裁剪 / AI 提取）</span><span>3D 模型 / 任务</span></div>
    {groups.map(({root, parts, modelJobs}) => { const isSheet = plan.sheetId === root.id; const ids = new Set([root.id, ...parts.map(p => p.asset.id)]); const sheetInside = plan.sheetId && ids.has(plan.sheetId) && !isSheet; return <article className={`tw-rel-group ${isSheet ? 'is-sheet' : ''}`} key={root.id} data-root-id={root.id}>
      <div className="tw-rel-source">
        <ImageTile compact asset={root} busy={busy} selected={selected === root.id} pickLabel="在关系图中选择" zoomLabel="放大来源图" badge={isSheet ? '整张拆件图' : `${parts.length} 个部件`} onSelect={onSelect} onZoom={onZoom}/>
        <div className="tw-rel-actions"><button type="button" disabled={busy} onClick={() => onCrop(root)} aria-label={`裁剪：${root.label}`}>裁剪 →</button><button type="button" className={isSheet ? 'tw-role-ink-purple' : ''} disabled={busy || isSheet} onClick={() => onSheet(root)} aria-label={`设为整张拆件图：${root.label}`}>{isSheet ? '✓ 整张拆件图' : '设为整张拆件图'}</button></div>
        {isSheet && <small className="tw-rel-sheet-note">勾选的次要（蓝）部件：{plan.secondary.length} 个 → 共用 1 个图生3D任务</small>}
      </div>
      <div className="tw-rel-parts">
        {modelJobs(root.id).length > 0 && <div className="tw-rel-row tw-rel-direct" data-asset-id={root.id} data-direct="true">
          <div className="tw-rel-part">
            <button type="button" className="tw-rel-thumb" aria-label={`放大来源图：${root.label}`} onClick={() => onZoom(root)}><img src={root.url} alt={root.label}/></button>
            <div className="tw-rel-meta"><strong>{root.label}</strong><small>↳ 未裁剪 · 直接用此图建模{isSheet ? ' · 整张拆件图' : ''}</small></div>
          </div>
          <span className="tw-rel-arrow" aria-hidden="true">→</span>
          <div className="tw-rel-models">{modelJobs(root.id).map(e => <ModelStatus key={e.job.id} entry={e} busy={busy} onPreview={onPreview} canPreviewModel={canPreviewModel}/>)}</div>
        </div>}
        {parts.length === 0 && <p className="tw-placeholder">还没有从这张图裁出的部件。点「裁剪 →」开始。</p>}
        {parts.map(({asset: a, depth, via}) => { const mj = modelJobs(a.id), role = roleOf(a), on = checked.includes(a.id), tone = toneOf(a, plan.sheetId)
          const pending = !on ? '未勾选' : role === 'normal' ? (a.id === plan.sheetId ? '已设为整张拆件图' : plan.sheet ? `已勾选 · 随「${plan.sheet.label}」建模` : '已勾选 · 需先设整张拆件图') : '已勾选 · 单独建模 · 待审阅'
          return <div className={`tw-rel-row tw-role-row tw-role-${tone}`} key={a.id} data-asset-id={a.id} data-role={role} style={{'--depth': depth - 1}}>
          <div className={`tw-rel-part ${selected === a.id ? 'on' : ''}`}>
            <button type="button" className="tw-rel-thumb" aria-label={`放大部件：${a.label}`} onClick={() => onZoom(a)}><img src={a.url} alt={a.label}/></button>
            <div className="tw-rel-meta"><strong>{a.label}</strong><small>↳ {via === 'crop' ? '本地裁剪' : 'AI 提取'} · <span className={`tw-role-ink-${MODEL_ROLES[role].tone}`}>{MODEL_ROLES[role].name} · {MODEL_ROLES[role].how}</span>{a.id === plan.sheetId ? <> · <span className="tw-role-ink-purple">整张拆件图</span></> : null}{depth > 1 ? ` · 第 ${depth} 级` : ''}</small>
              {onPriority && <RoleSwitch compact asset={a} busy={busy} onPriority={onPriority}/>}
              <span className="tw-rel-line"><label><input type="checkbox" aria-label={`加入建模：${a.label}`} checked={on} onChange={e => onCheck(a.id, e.target.checked)}/>加入建模</label><button type="button" disabled={busy} onClick={() => onCrop(a)} aria-label={`在裁剪台打开：${a.label}`}>裁剪</button><button type="button" disabled={busy || a.id === plan.sheetId} onClick={() => onSheet(a)} aria-label={`设为整张拆件图：${a.label}`}>{a.id === plan.sheetId ? '✓ 拆件图' : '设为拆件图'}</button></span></div>
          </div>
          <span className="tw-rel-arrow" aria-hidden="true">→</span>
          <div className="tw-rel-models">{mj.length ? mj.map(e => <ModelStatus key={e.job.id} entry={e} busy={busy} onPreview={onPreview} canPreviewModel={canPreviewModel}/>) : <small>{pending}</small>}</div>
        </div> })}
        {sheetInside && <p className="tw-note">本组中的「{images.find(x => x.id === plan.sheetId)?.label}」已被设为整张拆件图。</p>}
      </div>
    </article> })}
  </section>
}
