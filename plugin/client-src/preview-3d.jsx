import React from 'react'
import {createViewport, importModel, exportGlb, download} from './scene.js'
import {createLocalApi} from './local-api.js'
import {ModelThumb, THUMB_FORMATS} from './model-thumb.jsx'

// 0.3.1 REQ-057: the second page is only a 3D viewer plus a 3D asset library.
// The 0.2.x procedural "offline demo generation", seed samples and demo job queue are gone.
// Read-only: it lists already-downloaded project models via GET requests; no upload,
// no supplier call, no paid action, and imported local files never leave the browser.
const BACKGROUNDS = ['#eeeeea', '#dce5e4', '#252d35', '#ede0d2']
const PREVIEWABLE = THUMB_FORMATS
const MAX_MODEL = 150 * 1024 ** 2
const mb = bytes => `${(bytes / 1048576).toFixed(2)} MB`
const readProjectId = () => { try { return localStorage.getItem('tripo-studio-project') || '' } catch { return '' } }

export function Preview3D({t, asset: opened}) {
  const stage = React.useRef(null), viewport = React.useRef(null), modelRef = React.useRef(null), fileRef = React.useRef(null), toastTimer = React.useRef(null)
  const [webgl, setWebgl] = React.useState(true)
  const [meta, setMeta] = React.useState(null)
  const [stats, setStats] = React.useState({triangles: 0, materials: 0, size: [0, 0, 0]})
  const [wire, setWire] = React.useState(false), [rotate, setRotate] = React.useState(true), [grid, setGrid] = React.useState(true)
  const [background, setBackground] = React.useState(BACKGROUNDS[0]), [exposure, setExposure] = React.useState(1.2)
  const [toast, setToast] = React.useState(null), [loading, setLoading] = React.useState('')
  const [projects, setProjects] = React.useState([]), [projectId, setProjectId] = React.useState(opened?.projectId || readProjectId())
  const [models, setModels] = React.useState([]), [libraryState, setLibraryState] = React.useState('loading'), [query, setQuery] = React.useState('')
  const offline = Boolean(window.__TRIPO_OFFLINE__)
  const api = React.useMemo(() => createLocalApi({getCsrf: () => '', isOffline: () => offline}), [offline])

  const notify = React.useCallback(message => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3600)
  }, [])
  React.useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current) }, [])

  React.useEffect(() => {
    if (!stage.current) return undefined
    try {
      const controller = createViewport(stage.current, {background, exposure, onContextLost: () => setWebgl(false)})
      viewport.current = controller
      return () => { controller.dispose(); viewport.current = null; modelRef.current = null }
    } catch { setWebgl(false); return undefined }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 3D asset library: projects and their downloaded models (GET only).
  React.useEffect(() => {
    if (offline) { setLibraryState('offline'); return undefined }
    let live = true
    ;(async () => {
      try {
        const list = await api('/projects')
        if (!live) return
        setProjects(list)
        setProjectId(prev => list.some(p => p.id === prev) ? prev : list[0]?.id || '')
        if (!list.length) setLibraryState('empty')
      } catch (e) { if (live) { setLibraryState('error'); notify(e.message) } }
    })()
    return () => { live = false }
  }, [api, offline, notify])
  React.useEffect(() => {
    if (offline || !projectId) return undefined
    let live = true
    setLibraryState('loading')
    api(`/projects/${projectId}`).then(p => {
      if (!live) return
      setModels(p.assets.filter(a => a.kind === 'model').reverse())
      setLibraryState('ready')
    }).catch(e => { if (live) { setModels([]); setLibraryState('error'); notify(e.message) } })
    return () => { live = false }
  }, [api, projectId, offline, notify])

  const applyModel = (object, next) => {
    modelRef.current = object
    viewport.current?.setModel(object)
    if (viewport.current) setStats(viewport.current.stats())
    viewport.current?.setWireframe(wire)
    setMeta(next)
  }

  const openAsset = React.useCallback(async (asset, signal) => {
    if (!PREVIEWABLE.includes(asset.format || 'glb')) return notify('此格式请下载后用对应 3D 软件打开')
    setLoading(asset.label)
    try {
      const response = await fetch(asset.url, {signal, credentials: 'same-origin'})
      if (!response.ok) throw new Error('无法读取本地模型')
      if (Number(response.headers.get('content-length')) > MAX_MODEL) throw new Error('模型超过 150 MB')
      const buffer = await response.arrayBuffer()
      if (buffer.byteLength > MAX_MODEL) throw new Error('模型超过 150 MB')
      if (signal?.aborted || !viewport.current) return
      const object = await importModel(buffer, `${asset.id}.${asset.format || 'glb'}`)
      if (signal?.aborted) return
      applyModel(object, {id: asset.id, name: asset.label, source: 'project', format: (asset.format || 'glb').toUpperCase(), size: mb(asset.size)})
    } catch (e) { if (e.name !== 'AbortError') notify(`3D 文件加载失败：${e.message}`) }
    finally { setLoading('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify, wire])

  React.useEffect(() => {
    if (!opened) return undefined
    const abort = new AbortController()
    void openAsset(opened, abort.signal)
    return () => abort.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened?.id])

  const onPickModel = async file => {
    if (!file) return
    if (file.size > MAX_MODEL) return notify(t('toast.model.size'))
    try {
      const object = await importModel(await file.arrayBuffer(), file.name)
      applyModel(object, {id: 'local', name: file.name.replace(/\.[^.]+$/, ''), source: 'file', format: file.name.split('.').pop().toUpperCase(), size: mb(file.size)})
      notify(t('toast.imported'))
    } catch (error) { notify(t('toast.import.fail', {message: error.message})) }
  }

  const exportModel = async () => {
    if (!modelRef.current) return notify('请先从 3D 资产中打开或导入一个模型')
    try { download(await exportGlb(modelRef.current), `${meta?.name || 'tripo-preview'}-preview.glb`); notify('已导出当前预览的展示副本（不是供应商原始文件）') }
    catch (error) { notify(t('toast.export.fail', {message: error.message})) }
  }

  const q = query.trim().toLowerCase(), shown = models.filter(a => !q || a.label.toLowerCase().includes(q))
  const libraryNote = {offline: '离线预览没有本机服务：可用上方按钮导入本机模型文件查看。', empty: '还没有本地项目。在「创作」中新建项目并完成建模后，模型会出现在这里。', error: '暂时无法读取本机项目；可在「创作」页重新连接，或直接导入本机文件。', loading: '正在读取本机 3D 资产…'}[libraryState]
  const sourceLabel = meta?.source === 'project' ? '项目资产 · 本机副本' : meta?.source === 'file' ? '本机文件 · 未上传' : '未打开模型'

  return <div className="tps-root tps-preview3d">
    <div className="tps-head">
      <h1>3D 预览</h1>
      <p>查看本机已下载的 3D 资产或本机模型文件 · 仅本地读取</p>
      <span className="tps-badge"><i/>不联网生成 · 不消耗积分</span>
    </div>
    <div className="tps-grid">
      <div className="tps-col create assets3d" role="region" aria-label="3D 资产">
        <div className="tps-title"><span>3D 资产</span><em>{models.length} 个</em></div>
        <button type="button" className="tps-secondary tps-import" onClick={() => fileRef.current?.click()}>{t('import')}</button>
        {!offline && projects.length > 0 && <label className="tps-field tps-project"><span className="tps-label"><span>项目</span></span>
          <select aria-label="3D 资产所属项目" value={projectId} onChange={e => setProjectId(e.target.value)}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        {<input className="tps-search" type="search" aria-label="搜索 3D 资产" placeholder="搜索模型名称…" value={query} onChange={e => setQuery(e.target.value)}/>}
        {libraryState === 'ready' && models.length === 0 && <p className="tps-hint">当前项目还没有已保存到本机的 3D 模型。成功的建模任务下载完成后会出现在这里。</p>}
        {libraryState !== 'ready' && <p className="tps-hint">{libraryNote}</p>}
        <div className="tps-3d-grid" role="list" aria-label="3D 资产列表">{shown.map(a => {
          const can = PREVIEWABLE.includes(a.format || 'glb')
          return <div role="listitem" key={a.id} className={`tps-3d-card${meta?.id === a.id ? ' on' : ''}`} data-model-id={a.id}>
            <button type="button" className="tps-3d-open" disabled={!can || Boolean(loading)} aria-pressed={meta?.id === a.id} aria-label={`在查看器中打开：${a.label}`} onClick={() => openAsset(a)}>
              <ModelThumb asset={a}/>
              <span className="tps-3d-caption"><strong>{a.label}</strong><small>{(a.format || 'glb').toUpperCase()} · {mb(a.size)}{can ? '' : ' · 仅下载'}</small></span>
            </button>
            <a className="tps-3d-download" href={`${a.url}&download=1`} download aria-label={`下载模型：${a.label}`} title="下载原始文件">↓</a>
          </div>
        })}</div>
        <p className="tps-hint">3D 参考图由本机根据已下载模型渲染，仅用于辨认；要保留原始拓扑与材质请下载原始文件。</p>
      </div>
      <div className="tps-col center">
        <div className="tps-vtop">
          <strong>{meta?.name || '未打开模型'}</strong>
          <span className="tps-tag">{meta ? t('tag.local') : '空'}</span>
          <button type="button" className="tps-secondary" style={{marginLeft: 'auto', width: 'auto'}} onClick={() => fileRef.current?.click()}>{t('import')}</button>
          <button type="button" className="tps-secondary" style={{width: 'auto'}} disabled={!meta} onClick={exportModel}>导出 GLB</button>
          <input ref={fileRef} type="file" accept=".glb,.gltf,.fbx,.obj,.stl" hidden onChange={e => { void onPickModel(e.target.files?.[0]); e.target.value = '' }}/>
        </div>
        <div className="tps-stage" ref={stage}>
          {webgl ? <span className="tps-corner">{t('viewport.perspective')}</span> : <div className="tps-fallback">{t('fallback')}</div>}
          {webgl && meta && <span className="tps-hintline">{t('viewport.hint')}</span>}
          {webgl && !meta && !loading && <div className="tps-stage-empty"><span aria-hidden="true">◇</span><p>从左侧「3D 资产」选择模型，或导入本机 GLB／自包含 GLTF／FBX／OBJ／STL。</p></div>}
          {loading && <div className="tps-loading"><span className="tps-spin"/><strong>正在打开 {loading}</strong></div>}
          {webgl && <div className="tps-tools">
            <button type="button" title={t('tool.reset')} onClick={() => viewport.current?.reset()}>⌖</button>
            <button type="button" className={wire ? 'on' : ''} title={t('tool.wire')} onClick={() => { const next = !wire; setWire(next); viewport.current?.setWireframe(next) }}>◇</button>
            <button type="button" className={rotate ? 'on' : ''} title={t('tool.rotate')} onClick={() => { const next = !rotate; setRotate(next); viewport.current?.setAutoRotate(next) }}>⟳</button>
            <button type="button" className={grid ? 'on' : ''} title={t('tool.grid')} onClick={() => { const next = !grid; setGrid(next); viewport.current?.setGridVisible(next) }}>▦</button>
            <em/>
            <button type="button" title={t('tool.shot')} onClick={() => viewport.current?.screenshot(blob => download(blob, 'tripo-studio-preview.png'))}>▣</button>
          </div>}
        </div>
        <div className="tps-vfoot">
          <span><b>{stats.triangles.toLocaleString()}</b> {t('foot.triangles')}</span>
          <span>{meta?.format || '—'}</span>
          <span>{meta ? t('foot.imported') : '未打开模型'}</span>
        </div>
      </div>
      <div className="tps-col details">
        <div className="tps-title"><span>{t('detail.section')}</span><em>{t('detail.inspect')}</em></div>
        <div className="tps-icon">◇</div>
        <div className="tps-name">{meta?.name || '未打开模型'}</div>
        <p className="tps-sub">{sourceLabel}</p>
        <h4 className="tps-h3">{t('detail.info')}</h4>
        <dl className="tps-dl">
          <dt>{t('detail.source')}</dt><dd>{sourceLabel}</dd>
          <dt>文件</dt><dd>{meta ? `${meta.format} · ${meta.size}` : '—'}</dd>
          <dt>{t('detail.material')}</dt><dd>{`${stats.materials} ${t('detail.units')}`}</dd>
          <dt>{t('detail.size')}</dt><dd>{stats.size.map(v => v.toFixed(1)).join(' × ')}</dd>
        </dl>
        <h4 className="tps-h3">{t('detail.scene')}</h4>
        <div className="tps-label"><span>{t('detail.background')}</span></div>
        <div className="tps-sw">{BACKGROUNDS.map(color => <button key={color} type="button" aria-label={`背景色 ${color}`} className={color === background ? 'on' : ''} style={{background: color}} onClick={() => { setBackground(color); viewport.current?.setBackground(color) }}/>)}</div>
        <div className="tps-label"><span>{t('detail.exposure')}</span><span>{exposure.toFixed(1)}</span></div>
        <input className="tps-range" type="range" aria-label="光照强度" min={0.5} max={2} step={0.1} value={exposure} onChange={e => { const value = Number(e.target.value); setExposure(value); viewport.current?.setExposure(value) }}/>
        <div className="tps-export">
          <h4>展示副本</h4>
          <p>把当前预览另存为 GLB 展示副本（已居中缩放，不保证原始单位、朝向与动画）。</p>
          <button type="button" className="tps-secondary" disabled={!meta} onClick={exportModel}>{t('detail.export.button')}<span>GLB</span></button>
          <p className="tps-hint" style={{marginTop: '8px'}}>原始供应商文件请在 3D 资产或任务中「下载」。</p>
        </div>
      </div>
    </div>
    {toast && <div className="tps-toast">{toast}</div>}
  </div>
}
