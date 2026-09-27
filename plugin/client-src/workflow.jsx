import React from 'react'
import {ImageEdit,editSpecs} from './image-edit.jsx'
import {threeViewPrompt} from '../shared/contracts.js'
import {CropPanel} from './crop-panel.jsx'
import {ImageTile} from './image-card.jsx'
import {ImageLightbox} from './image-lightbox.jsx'
import {defaultModelOptions} from './model-plan.jsx'
import {validTaskId} from '../shared/task-id.js'
import {PromptHint} from './prompt-hint.jsx'
import {isCurrentSiteJob,TRIPO_API_BASE} from '../shared/site.js'
import {ImageSettings} from './image-settings.jsx'
import {StorageSettings} from './storage-settings.jsx'
import {ModelPlan} from './model-plan.jsx'
import {IMAGE_MODEL_INFO,isImageSize,imageDefaults,imageRequest,priceText} from '../shared/image-models.js'
import {createLocalApi} from './local-api.js'
import {CredentialSettings} from './credential-settings.jsx'
import {IMAGE_MODELS, IMAGE_SIZES, MODEL_VERSIONS, PARTS, partPrompt, sheetPrompt, ASSEMBLY_GUIDE, modelFaceMax} from '../shared/contracts.js'
import {readImageFile, cropImage, cropSelectionImage, detectParts, normalizeRect, sampleImageColor} from './image-tools.js'
import {MAX_BATCH_PARTS} from './model-plan.jsx'
import {Library,LibraryRail,TaskDock,Relations,Info,readLayout,writeLayout,LIB_PUSH_MIN} from './studio-layout.jsx'
import {jobCounts} from './relations.js'
import {planModelTasks,MODEL_ROLES,roleOf,jobRoleLabel,KIND_LABEL} from './model-roles.js'
import {estimateBatch,estimateJobCredits,formatCredits} from '../shared/credit-estimate.js'

const STATUS = {awaiting_approval: '等待审批', submitting: '提交中', submission_unknown: '提交结果未知 · 禁止自动重发', queued: '排队中', running: '生成中', success: '云端成功', failed: '失败', cancelled: '云端已取消', discarded: '草稿已丢弃'}
const STAGES = ['生图定稿', '拆件与裁剪', '统一建模', '交付与导入', '来源 → 部件']
const APP_VERSION = '0.3.3'
function saveJson(value, name) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {type: 'application/json'}), url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function labelModel(id) { return IMAGE_MODEL_INFO[id]?.label || id }
// 0.3.3 REQ-071: balance is only useful next to what is about to be spent. Query stays explicit (one GET, free).
function BalanceCheck({balance, estimate, busy, canQuery, onQuery}) {
  const left = balance && Number.isFinite(balance.balance) ? balance.balance - estimate.total : null
  return <div className={`tw-balance-check ${left !== null && left < 0 ? 'short' : ''}`} role="group" aria-label="余额与参考积分">
    <span>本批参考积分：<b>{estimate.total}</b>{estimate.unknown ? `（另有 ${estimate.unknown} 个任务无法按公开表估算）` : ''}</span>
    {balance ? <span>账户可用 <b>{formatCredits(balance.balance)}</b> · 冻结 {formatCredits(balance.frozen)}{left !== null ? ` · 提交后约剩 ${formatCredits(left)}` : ''}<small>查询于 {new Date(balance.checkedAt || Date.now()).toLocaleTimeString()}</small></span> : <span>账户余额：未查询</span>}
    {left !== null && left < 0 && <strong className="tw-danger">余额可能不足：Tripo 会在提交时冻结额度，不足时创建失败（错误码 2010）。</strong>}
    <button type="button" disabled={busy || !canQuery} onClick={onQuery}>{balance ? '刷新余额' : '查询余额（不提交）'}</button>
  </div>
}
export function Workflow({onPreview}) {
  const [connecting, setConnecting] = React.useState(false)
  const [status, setStatus] = React.useState(null), [projects, setProjects] = React.useState([]), [project, setProject] = React.useState(null)
  const [stage, setStage] = React.useState(0), [prompt, setPrompt] = React.useState('成年角色，全身完整，四肢分开，服装分层清晰，头发与衣服独立，干净浅灰背景，无文字，无水印。')
  const [model, setModel] = React.useState(IMAGE_MODELS[0]), [quality, setQuality] = React.useState('low'), [size, setSize] = React.useState('1024x1536')
  const [split,setSplit]=React.useState(imageDefaults('chat_image_2.5_sunburst'))
  const [editSettings,setEditSettings]=React.useState(imageDefaults('chat_image_2.5_sunburst')), [editPrompt,setEditPrompt]=React.useState('保留角色身份和构图，将服装改为蓝色。'), [editMode,setEditMode]=React.useState('edit')
  const [splitMode,setSplitMode]=React.useState('part'),[cropBackground,setCropBackground]=React.useState('#ffffff'),[pickingColor,setPickingColor]=React.useState(false),[cropHistory,setCropHistory]=React.useState([])
  const [selectionMode,setSelectionMode]=React.useState('rect'),[lasso,setLasso]=React.useState([])
  const [sheetPromptText,setSheetPromptText]=React.useState(null),[partPromptText,setPartPromptText]=React.useState(null),[cropOrigin,setCropOrigin]=React.useState('')
  const [wholeAsset,setWholeAsset]=React.useState(''),[sheetAsset,setSheetAsset]=React.useState(''),[genMode,setGenMode]=React.useState('text'),[usage,setUsage]=React.useState(null)
  const [selected, setSelected] = React.useState(''), [part, setPart] = React.useState('头发'), [priority, setPriority] = React.useState('high')
  const [rect, setRect] = React.useState({x: 0, y: 0, w: 100, h: 100}), [boxes, setBoxes] = React.useState([])
  const [faceLimit, setFaceLimit] = React.useState(50000), [geometry, setGeometry] = React.useState('standard'), [modelVersion, setModelVersion] = React.useState(MODEL_VERSIONS[0])
  const [modelOptions,setModelOptions]=React.useState(defaultModelOptions)
  const [checked, setChecked] = React.useState([]), [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState(''), [error, setError] = React.useState('')
  const [approval, setApproval] = React.useState(null), [consent, setConsent] = React.useState(false), [settings, setSettings] = React.useState(false), [balance, setBalance] = React.useState(null)
  const [zoomAsset,setZoomAsset]=React.useState(null),[deleteImage,setDeleteImage]=React.useState(null),[deleteImageError,setDeleteImageError]=React.useState('')
  const rootRef=React.useRef(null),[layout,setLayoutState]=React.useState(readLayout),[narrow,setNarrow]=React.useState(false),[wide,setWide]=React.useState(true),[drawer,setDrawer]=React.useState(false),[searchLib,setSearchLib]=React.useState(0),[goBar,setGoBar]=React.useState(false)
  const setLayout=patch=>setLayoutState(prev=>{const next={...prev,...patch};writeLayout(next);return next})
  const [upgradeSeen,setUpgradeSeenState]=React.useState(()=>{try{return localStorage.getItem('tripo-studio-upgrade-seen')||''}catch{return ''}})
  const setUpgradeSeen=()=>{const v=status?.upgrade?.backup||'';setUpgradeSeenState(v);try{localStorage.setItem('tripo-studio-upgrade-seen',v)}catch{/* optional */}}
  const [importId,setImportId]=React.useState(''),[importLabel,setImportLabel]=React.useState(''),[importConfirm,setImportConfirm]=React.useState(false)
  const narrowRef = React.useRef(false), csrf = React.useRef(''), pending = React.useRef(false), mounted = React.useRef(true), projectRef = React.useRef(null), refreshing = React.useRef(false)
  const api = React.useMemo(() => createLocalApi({getCsrf:()=>csrf.current, isOffline:()=>Boolean(window.__TRIPO_OFFLINE__)}), [])
  const load = React.useCallback(async (id, restore = false) => {
    const p = await api(`/projects/${id}`)
    if (!mounted.current) return p
    if (projectRef.current && projectRef.current !== id && !restore) return p
    projectRef.current = id; setProject(p)
    if (restore) {
      setSelected(p.assets.some(a=>a.id===p.draft?.selectedAsset)?p.draft.selectedAsset:''); setChecked([]); setBoxes([]);setRect({x:0,y:0,w:100,h:100});setCropHistory([]);setPickingColor(false);setCropBackground('#ffffff');setSelectionMode('rect');setLasso([]);setZoomAsset(null);setDeleteImage(null);setImportId('');setImportConfirm(false)
      setSplitMode(p.draft?.splitMode==='sheet'?'sheet':'part');setEditMode(p.draft?.editMode==='views'?'views':'edit');setEditPrompt(p.draft?.editPrompt||'保留角色身份和构图，将服装改为蓝色。')
      const em=IMAGE_MODEL_INFO[p.draft?.editModel]?.edit?p.draft.editModel:'chat_image_2.5_sunburst';setEditSettings({...imageDefaults(em),...(isImageSize(p.draft?.editSize,em)?{size:p.draft.editSize}:{}),...(IMAGE_MODEL_INFO[em].quality.includes(p.draft?.editQuality)?{quality:p.draft.editQuality}:{})})
      if (p.draft?.prompt) setPrompt(p.draft.prompt)
      if (IMAGE_MODELS.includes(p.draft?.model)) setModel(p.draft.model)
      if (isImageSize(p.draft?.size,p.draft?.model)) setSize(p.draft.size)
      setQuality(p.draft?.quality || 'low')
      const sm=IMAGE_MODEL_INFO[p.draft?.splitModel]?.edit?p.draft.splitModel:'chat_image_2.5_sunburst'
      setSplit({...imageDefaults(sm),...(isImageSize(p.draft?.splitSize,sm)?{size:p.draft.splitSize}:{}),...(IMAGE_MODEL_INFO[sm].quality.includes(p.draft?.splitQuality)?{quality:p.draft.splitQuality}:{})})
      setWholeAsset(p.assets.some(a=>a.id===p.draft?.wholeAsset)?p.draft.wholeAsset:'');setSheetAsset(p.assets.some(a=>a.id===p.draft?.sheetAsset)?p.draft.sheetAsset:p.assets.some(a=>a.id===p.draft?.wholeAsset)?p.draft.wholeAsset:'');setGenMode(p.draft?.genMode==='image'?'image':'text');setUsage(null)
      const mv=MODEL_VERSIONS.includes(p.draft?.modelVersion)?p.draft.modelVersion:MODEL_VERSIONS[0]
      const old=mv==='v2.5-20250123'
      const g=!old&&p.draft?.modelGeometry==='detailed'?'detailed':'standard'
      const opts={...defaultModelOptions,texture:p.draft?.modelTexture!=='false',pbr:p.draft?.modelTexture!=='false'&&p.draft?.modelPbr!=='false',
        textureQuality:['standard','detailed','extreme'].includes(p.draft?.modelTextureQuality)?p.draft.modelTextureQuality:'standard',
        quad:!old&&p.draft?.modelQuad==='true',smart:!old&&p.draft?.modelSmart==='true',autoSize:!old&&p.draft?.modelAutoSize==='true',
        autofix:p.draft?.modelAutofix==='true',textureAlignment:p.draft?.modelTextureAlignment==='geometry'?'geometry':'original_image',orientation:p.draft?.modelOrientation==='align_image'?'align_image':'default'}
      setModelVersion(mv);setGeometry(g);setModelOptions(opts)
      setFaceLimit(Math.min(modelFaceMax(mv,{quad:opts.quad,smart:opts.smart,geometry:g}),Math.max(500,Number(p.draft?.modelFaceLimit)||50000)))
      setPart(p.draft?.partName || '头发'); setPriority(p.draft?.partPriority || 'high')
      setSheetPromptText(p.draft?.splitSheetPrompt||null);setPartPromptText(p.draft?.splitPartPrompt||null);setCropOrigin('')
      try { localStorage.setItem('tripo-studio-project', id) } catch { /* storage may be unavailable */ }
    }
    return p
  }, [api])
  const run = async (work) => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(''); setMessage('')
    try { await work() } catch (e) { if (mounted.current) setError(e.message) }
    finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  const connect = React.useCallback(async () => {
    setConnecting(true); setStatus(null); csrf.current = ''; setError('')
    setApproval(null); setConsent(false); setBalance(null)
    try {
      const s = await api('/status')
      if (!mounted.current) return
      csrf.current = s.csrfToken; setStatus(s)
      const ps = await api('/projects')
      if (!mounted.current) return
      setProjects(ps)
      let previous; try { previous = localStorage.getItem('tripo-studio-project') } catch { /* optional */ }
      const id = ps.find(p => p.id === previous)?.id ?? ps[0]?.id
      if (id) await load(id, true)
    } catch (e) { if (mounted.current) setError(e.message) }
    finally { if (mounted.current) setConnecting(false) }
  }, [api, load])
  React.useEffect(() => {
    mounted.current = true
    void connect()
    return () => { mounted.current = false }
  }, [connect])
  // 0.3.2 REQ-062/066: one vertical flow at every width. <820px hides the rail; >=LIB_PUSH_MIN lets an open library push the canvas.
  React.useLayoutEffect(()=>{
    const el=rootRef.current;if(!el)return
    const measure=()=>{const w=el.clientWidth,n=w>0&&w<820,wd=w===0||w>=LIB_PUSH_MIN;narrowRef.current=n;setNarrow(n);setWide(wd);if(wd)setDrawer(false)}
    measure();const ro=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;ro?.observe(el)
    window.addEventListener('resize',measure)
    return()=>{ro?.disconnect();window.removeEventListener('resize',measure)}
  },[])
  // 0.3.2 REQ-063/064: the drawer and the sticky "go" bar are position:fixed, clipped to the visible part of
  // the panel (DSH slot or preview page), whichever element actually scrolls.
  React.useLayoutEffect(()=>{
    const el=rootRef.current;if(!el)return
    let frame=0
    const update=()=>{frame=0
      const r=el.getBoundingClientRect(),vh=window.innerHeight,vw=window.innerWidth
      const top=Math.max(0,r.top),bottom=Math.min(vh,r.bottom),left=Math.max(0,r.left),right=Math.min(vw,r.right)
      el.style.setProperty('--tw-vp-top',`${Math.round(top)}px`);el.style.setProperty('--tw-vp-bottom',`${Math.round(Math.max(0,vh-bottom))}px`)
      el.style.setProperty('--tw-vp-left',`${Math.round(left)}px`);el.style.setProperty('--tw-vp-width',`${Math.round(Math.max(0,right-left))}px`)
      const foot=el.querySelector('.tw-inspector .tw-insp-foot')||el.querySelector('.tw-inspector')
      if(!foot){setGoBar(false);return}
      const f=foot.getBoundingClientRect();setGoBar(f.height>0&&f.top>bottom-8)
    }
    const schedule=()=>{if(!frame)frame=window.requestAnimationFrame(update)}
    update()
    el.addEventListener('scroll',schedule,{passive:true});window.addEventListener('scroll',schedule,{passive:true,capture:true});window.addEventListener('resize',schedule)
    const ro=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;ro?.observe(el)
    const mo=typeof MutationObserver==='function'?new MutationObserver(schedule):null;mo?.observe(el,{childList:true,subtree:true})
    return()=>{if(frame)window.cancelAnimationFrame(frame);el.removeEventListener('scroll',schedule);window.removeEventListener('scroll',schedule,{capture:true});window.removeEventListener('resize',schedule);ro?.disconnect();mo?.disconnect()}
  },[])
  React.useEffect(()=>{
    if(!drawer)return
    const onKey=e=>{if(e.key==='Escape'){setDrawer(false);setSearchLib(0)}}
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)
  },[drawer])
  React.useEffect(() => {
    if (!project?.jobs.some(j => isCurrentSiteJob(j) && ['running', 'queued'].includes(j.status) && j.tracking !== false)) return
    const id = project.id
    const timer = setInterval(async () => {
      if (refreshing.current || pending.current) return
      refreshing.current = true
      try { const p = await api(`/projects/${id}/refresh`, 'POST', {}); if (mounted.current && projectRef.current === id) setProject(p) }
      catch (e) { if (mounted.current) setError(e.message) }
      finally { refreshing.current = false }
    }, 6000)
    return () => clearInterval(timer)
  }, [project, api])
  const images = project?.assets.filter(a => a.kind === 'image') ?? [], models = project?.assets.filter(a => a.kind === 'model') ?? []
  const active = images.find(a => a.id === selected)
  const canPay = status?.keyConfigured && status?.paidEnabled
  // Balance/usage are explicit, read-only GETs; they never run on connect or in the background.
  const queryBalance = () => run(async () => setBalance(await api('/balance')))
  const syncUsage = () => run(async () => { const r = await api(`/projects/${project.id}/usage/sync`, 'POST', {}); setUsage(r); if (r.project) setProject(r.project); setMessage(`已同步用量记录：${r.total} 条，匹配本项目任务 ${r.matched} 个，更新实扣积分 ${r.updated} 个；本项目已记录实扣合计 ${formatCredits(r.projectTotal)}。只查询，不提交任务。`) })
  const rememberCrop = () => setCropHistory(h=>[...h.slice(-39),{selected,rect,boxes,background:cropBackground,part,selectionMode,lasso}])
  const select = (a) => {rememberCrop();setSelected(a.id);setRect({x:0,y:0,w:100,h:100});setBoxes([]);setPickingColor(false);setSelectionMode('rect');setLasso([])}
  const undoCrop = () => {const prev=cropHistory.at(-1);if(!prev)return;setSelected(prev.selected);setRect(prev.rect);setBoxes(prev.boxes);setCropBackground(prev.background);setPart(prev.part);setSelectionMode(prev.selectionMode||'rect');setLasso(prev.lasso||[]);setCropHistory(h=>h.slice(0,-1));setPickingColor(false);setMessage('已撤回裁剪编辑；原图和已保存资产均保留，不会删除文件。')}
  const changeRect = next => {rememberCrop();setRect(normalizeRect(next));setSelectionMode('rect');setLasso([])}
  async function newProject() {
    const p = await api('/projects', 'POST', {name: `角色项目 ${projects.length + 1}`})
    setProjects(await api('/projects')); await load(p.id, true)
  }
  async function saveDraft() {
    const p = await api(`/projects/${project.id}`, 'PATCH', {revision: project.revision, draft: {prompt, model, quality, size, selectedAsset: selected, partName: part, partPriority: priority,splitModel:split.model,splitQuality:split.quality,splitSize:split.size,wholeAsset,splitMode,editPrompt,editMode,editModel:editSettings.model,editSize:editSettings.size,editQuality:editSettings.quality,
      modelVersion,modelFaceLimit:String(faceLimit),modelGeometry:geometry,modelTexture:String(modelOptions.texture),modelPbr:String(modelOptions.pbr),
      modelTextureQuality:modelOptions.textureQuality,modelQuad:String(modelOptions.quad),modelSmart:String(modelOptions.smart),modelAutoSize:String(modelOptions.autoSize),
      modelAutofix:String(modelOptions.autofix),modelTextureAlignment:modelOptions.textureAlignment,modelOrientation:modelOptions.orientation,splitSheetPrompt:sheetPromptText||'',splitPartPrompt:partPromptText||'',sheetAsset,genMode}})
    setProject(prev => ({...prev, ...p})); setMessage('提示词与选择已保存到本机项目')
  }
  async function importFiles(files) {
    if (!project) throw new Error('请先创建项目')
    if (files.length > 12) throw new Error('一次最多导入 12 张图片')
    for (const f of files) {
      const a = await api(`/projects/${project.id}/files`, 'POST', {label: f.name.replace(/\.[^.]+$/, ''), dataUrl: await readImageFile(f), priority})
      select(a)
    }
    await load(project.id); setMessage('图片已保存到本机项目，尚未上传到云端')
  }
  async function prepare(specs) {
    if (!project) throw new Error('请先创建项目')
    if (!canPay) throw new Error('请先打开连接设置，保存 Tripo API 密钥并确认启用收费。不要把密钥粘贴到对话或项目文件。')
    const drafts = []
    try { for (const spec of specs) drafts.push(await api(`/projects/${project.id}/prepare`, 'POST', spec)) }
    catch (e) { await load(project.id); throw e }
    setApproval(drafts); setConsent(false); await load(project.id)
  }
  async function confirm() {
    if (!consent || !approval) return
    const drafts=approval;setApproval(null);setConsent(false)
    let problem=null
    try {
      for(const d of drafts){
        const j=await api(`/projects/${project.id}/jobs/${d.id}/submit`,'POST',{approvalHash:d.approvalHash})
        if(!['queued','running','success'].includes(j.status)){
          setMessage(`批次已停止：${STATUS[j.status]||j.status}。剩余草稿未提交，需要重新确认。`)
          break
        }
      }
    } catch(e){problem=e}
    // A rejected/ambiguous paid submit must still reveal its persisted local record.
    setLayout({dock:true});revealTasks()
    try{await load(project.id)}catch(e){problem??=e}
    if(problem)throw problem
  }
  async function cancelApproval() {
    const drafts = approval; setApproval(null); setConsent(false)
    for (const d of drafts ?? []) await api(`/projects/${project.id}/jobs/${d.id}/discard`, 'POST', {})
    await load(project.id)
  }
  const imageParams = () => imageRequest({model, prompt, quality, size})
  const setImageSettings=next=>{setModel(next.model);setSize(next.size);setQuality(next.quality)}
  const storageChanged=async next=>{csrf.current=next.csrfToken;setStatus(next);setApproval(null);setConsent(false);setProjects([]);setProject(null);projectRef.current=null;setSelected('');setWholeAsset('');setSheetAsset('');setUsage(null);setChecked([]);setBoxes([]);setCropHistory([]);setPickingColor(false);setSelectionMode('rect');setLasso([]);setDeleteImage(null);setZoomAsset(null);setImportId('');setImportConfirm(false);setStage(0);try{localStorage.removeItem('tripo-studio-project')}catch{};const list=await api('/projects');setProjects(list);if(list[0])await load(list[0].id,true);setMessage(`项目根目录已切换并写入配置（重启 DSH 后仍使用）：${next.storage?.directory||''}。旧数据未迁移、未删除；${list.length?`已打开「${list[0].name}」，可在顶部切换项目。`:'新目录还没有项目，请新建。'}`)}
  async function saveCrop(box = rect, name = part, shapes = null) {
    if (!active) throw new Error('请先选择参考图')
    const a = await api(`/projects/${project.id}/files`, 'POST', {label: name, priority, sourceAsset: active.id, dataUrl: shapes?.length ? await cropSelectionImage(active.url,shapes,cropBackground) : await cropImage(active.url,box,cropBackground)})
    return a
  }
  async function renameAsset(a, label) {
    try { const p = await api(`/projects/${project.id}/assets/${a.id}/label`, 'PATCH', {label}); setProject(prev => ({...prev, ...p})); setMessage(`已重命名为「${label}」；只改本机显示名称，不影响文件和云端任务`); return true }
    catch (e) { setError(e.message); return false }
  }
  const splitPreset = splitMode === 'sheet' ? sheetPrompt() : partPrompt(part)
  const splitPromptValue = splitMode === 'sheet' ? (sheetPromptText ?? splitPreset) : (partPromptText ?? splitPreset)
  const splitCustom = splitMode === 'sheet' ? sheetPromptText !== null : partPromptText !== null
  const setSplitPromptValue = v => { const next = v === splitPreset ? null : v; if (splitMode === 'sheet') setSheetPromptText(next); else setPartPromptText(next) }
  const drafts = project?.jobs.filter(j => j.hidden!==true && isCurrentSiteJob(j) && j.status === 'awaiting_approval') ?? []
  const convertJobs=project?.jobs.filter(j=>j.hidden!==true&&isCurrentSiteJob(j)&&j.kind==='image-to-model'&&j.status==='success'&&validTaskId(j.taskId))??[]
  const canPreviewModel=a=>['glb','gltf','fbx','obj','stl'].includes(a.format||'glb')
  const selectSource=a=>{select(a);setCropOrigin(a.sourceAssetId&&images.some(x=>x.id===a.sourceAssetId)?a.sourceAssetId:a.id)}
  const counts = jobCounts(project?.jobs||[])
  const libPush = wide && layout.lib, libShown = libPush || drawer
  const openLibrary = (search=false) => { if (wide) setLayout({lib:true}); else setDrawer(true); if (search) setSearchLib(n=>n+1) }
  const closeLibrary = () => { if (wide) setLayout({lib:false}); setDrawer(false); setSearchLib(0) }
  const toggleLibrary = () => libShown ? closeLibrary() : openLibrary()
  const generateOne = () => run(() => prepare([{kind: 'text-to-image', label: '角色定稿候选', params: imageParams()}]))
  const editEffective = editMode === 'views' ? threeViewPrompt() : editPrompt
  const generateEdit = () => { if (active) run(() => prepare(editSpecs({active, value: editSettings, prompt: editPrompt, mode: editMode}))) }
  const revealTasks = () => window.requestAnimationFrame(()=>rootRef.current?.querySelector('.tw-dock')?.scrollIntoView({behavior:'smooth',block:'start'}))
  const scrollToInspector = () => rootRef.current?.querySelector('.tw-inspector')?.scrollIntoView({behavior:'smooth',block:'start'})
  const pick=a=>{if(stage===1)selectSource(a);else select(a);setDrawer(false)}
  const openCrop=a=>{selectSource(a);setStage(1)}
  const taskProps={onRename:renameAsset,onZoom:setZoomAsset,onPreview,onImage:a=>{select(a);setStage(1)},
    onCleanup:ids=>run(async()=>{const result=await api(`/projects/${project.id}/jobs/cleanup`,'POST',{confirm:true,ids});await load(project.id);setMessage(result.note+(result.skipped.length?` 跳过详情：${result.skipped.map(s=>`${s.id}：${s.reason}`).join('；')}`:''))}),
    onAction:(job,action,body)=>run(async()=>{const result=await api(`/projects/${project.id}/jobs/${job.id}/${action}`,'POST',body);await load(project.id);if(result.note)setMessage(result.note)})}
  const setPriorityOf=(id,priority)=>run(async()=>setProject(await api(`/projects/${project.id}/assets/${id}/priority`,'PATCH',{priority})))
  const chooseSheet=id=>setSheetAsset(id)
  const modelPlanProps={images,jobs:project?.jobs||[],onZoom:setZoomAsset,onRename:renameAsset,sheetAsset,onSheet:chooseSheet,checked,setChecked,modelVersion,setModelVersion,faceLimit,setFaceLimit,geometry,setGeometry,options:modelOptions,setOptions:setModelOptions,convertJobs,busy,canPay,onSave:()=>run(saveDraft),onPrepare:specs=>run(()=>prepare(specs)),onPriority:setPriorityOf}
  const relPlan = planModelTasks({images, jobs: project?.jobs || [], checked, sheetAsset})
  const canvas = !project ? null : stage === 0 ? <section className="tw-panel tw-canvas-panel" aria-label="当前立绘">
      <div className="tw-section-title"><span>01 / SELECT</span><h2>{active ? active.label : '选择或生成一张立绘'}</h2></div>
      {active ? <div className="tw-hero">
        <button className="tw-output-image tw-hero-image" aria-label={`放大当前图片：${active.label}`} onClick={() => setZoomAsset(active)}><img src={active.url} alt={active.label}/></button>
        <small>{active.width}×{active.height}{active.sourceAssetId ? ' · 裁剪图' : ' · 本地资产'} · 单击放大，不上传</small>
        <p className={`tw-gen-mode-note ${genMode==='image'?'is-image':'is-text'}`} role="note">{genMode==='image'?`图生图模式：下一次生成以「${active.label}」为输入图`:'文生图模式：下一次生成只用提示词，不使用这张图'}</p>
        <div className="tw-actions"><button className="tw-primary" onClick={() => setStage(1)}>使用「{active.label}」拆件 →</button><button disabled={roleOf(active)==='base'&&checked.includes(active.id)} onClick={() => run(async()=>{if(roleOf(active)!=='base')setProject(await api(`/projects/${project.id}/assets/${active.id}/priority`,'PATCH',{priority:'base'}));setChecked(prev=>prev.includes(active.id)?prev:[...prev,active.id]);setMessage(`已将「${active.label}」标为基准（红）并加入建模勾选（未提交任务）`)})}>{roleOf(active)==='base'&&checked.includes(active.id)?'已标为基准并加入建模':'标为基准（红）· 加入建模'}</button></div>
      </div> : <div className="tw-canvas-empty"><div className="tw-orbit">✧</div><p>在左侧资产库导入或点击一张图片；也可以在右侧写提示词生成候选（每次都先审阅收费）。</p></div>}
    </section>
    : stage === 1 ? <CropPanel active={active} rect={rect} boxes={boxes} background={cropBackground} historyLength={cropHistory.length} picking={pickingColor} mode={selectionMode} lasso={lasso} busy={busy} images={images} origin={cropOrigin}
        onSelectSource={selectSource} onZoomAsset={setZoomAsset} onRename={renameAsset} onBackToOrigin={a=>{select(a);setCropOrigin(a.id);setMessage(`已换回原图「${a.label}」`)}}
        onClearLasso={()=>{rememberCrop();setLasso([])}}
        onImport={files=>run(()=>importFiles(files))} onUndo={undoCrop} onColor={v=>{rememberCrop();setCropBackground(v)}} onPick={()=>setPickingColor(!pickingColor)}
        onMode={v=>{rememberCrop();setSelectionMode(v);setLasso([]);setPickingColor(false)}}
        onBegin={rememberCrop} onRect={next=>setRect(normalizeRect(next))}
        onLasso={(points,op)=>{if(points.length<3){setMessage('套索需要沿区域边缘拖出至少三个点');return}rememberCrop();setLasso(prev=>op==='replace'||!prev.length?[{op:'add',points}]:[...prev.slice(-39),{op,points}])}}
        onSample={point=>run(async()=>{const color=await sampleImageColor(active.url,point);rememberCrop();setCropBackground(color);setPickingColor(false)})}
        onField={changeRect} onBox={(b,i)=>{changeRect(b);setPart(`候选部件 ${i+1}`)}}
        onSave={()=>run(async()=>{const origin=active;const a=await saveCrop(rect,part,selectionMode==='lasso'?lasso:null);await load(project.id);setCropOrigin(origin.sourceAssetId&&images.some(x=>x.id===origin.sourceAssetId)?origin.sourceAssetId:origin.id);setMessage(`裁剪已保存：「${a.label}」已写入本机，仍停留在原图「${origin.label}」，可继续裁剪下一个部件`)})}
        onDetect={()=>run(async()=>{const b=await detectParts(active.url);rememberCrop();setBoxes(b);setMessage(b.length?`找到 ${b.length} 个候选区域，请人工核对；接触或复杂背景仍建议手动套索。`:'未找到独立区域，请使用手动框选或套索。')})}
        onSaveBoxes={()=>run(async()=>{for(let i=0;i<boxes.length;i++)await saveCrop(boxes[i],`待核对部件 ${i+1}`);await load(project.id);setBoxes([]);setCropOrigin(active.id);setMessage(`${boxes.length} 个候选裁剪已保存，仍停留在原图；请逐件核对并重命名，不会自动建模`)})}/>
    : stage === 2 ? <ModelPlan {...modelPlanProps} part="canvas"/>
    : stage === 3 ? <section className="tw-panel tw-canvas-panel" aria-label="交付"><div className="tw-section-title"><span>DELIVER / DCC</span><h2>交给 Blender 继续完成</h2></div>{models.map(a=><div className="tw-model" key={a.id}><span>◇</span><div><strong>{a.label}</strong><small>独立 {(a.format||'glb').toUpperCase()} · {(a.size/1048576).toFixed(2)} MB</small></div>{canPreviewModel(a)?<button onClick={()=>onPreview?.(a)}>3D 预览</button>:<small>请在对应3D软件打开</small>}<a href={`${a.url}&download=1`} download>下载</a></div>)}{models.length===0&&<p className="tw-placeholder">成功且下载完成的 3D 部件会出现在这里。</p>}<div className="tw-note"><h3>装配验收约束</h3><p>{ASSEMBLY_GUIDE}</p></div><button disabled={busy} onClick={()=>run(async()=>saveJson({...await api(`/projects/${project.id}/manifest`),assemblyGuide:ASSEMBLY_GUIDE},'tripo-project-manifest.json'))}>导出项目清单与装配指引</button><Info>清单不包含模型二进制。模型需逐件下载，FBX四边面请保留原始文件；未调用 DCC Bridge、未自动绑定骨骼或生成动力学。</Info></section>
    : <Relations images={images} jobs={project.jobs} assets={project.assets} selected={selected} busy={busy} sheetAsset={relPlan.sheetId} checked={checked}
        onSelect={a=>select(a)} onZoom={setZoomAsset} onCrop={openCrop} onSheet={a=>{chooseSheet(a.id);setMessage(`已将「${a.label}」设为整张拆件图：勾选的次要（蓝）部件将随它一次建模（未提交任务）`)}} onPriority={setPriorityOf}
        onCheck={(id,on)=>setChecked(prev=>on?(prev.includes(id)?prev:[...prev,id]):prev.filter(x=>x!==id))} onPreview={onPreview} canPreviewModel={canPreviewModel}/>
  const inspector = !project ? null : stage === 0 ? <>
      <div className="tw-insp-body">
        <div className="tw-gen-tabs" role="tablist" aria-label="生成方式">
          <button type="button" role="tab" aria-selected={genMode==='text'} className="tw-gen-tab is-text" onClick={()=>setGenMode('text')}><b>文生图</b><small>只用提示词，不使用任何图片</small></button>
          <button type="button" role="tab" aria-selected={genMode==='image'} className="tw-gen-tab is-image" onClick={()=>setGenMode('image')}><b>图生图</b><small>{active?`以「${active.label}」为输入图`:'先在资产库选择一张输入图'}</small></button>
        </div>
        {genMode==='text' ? <div role="tabpanel" aria-label="文生图设置">
          <h3 className="tw-insp-title">文生图 · 提示词</h3>
          <label>角色提示词<textarea aria-label="角色提示词" rows={7} maxLength={6000} value={prompt} onChange={e => setPrompt(e.target.value)} /></label>
          <Info>文生图不上传、也不参考画布上的图片。建议突出比例、材质、部件边界、完整四肢与干净背景；选定参考图后再进入 3D。四张不是 API 的 n=4 参数，而是四次独立任务；中途异常会停止后续提交。实际扣费以 Tripo 账户结算为准。</Info>
          <PromptHint model={model} prompt={prompt}/><ImageSettings value={{model,quality,size}} onChange={setImageSettings}/>
          <button disabled={busy} onClick={() => run(saveDraft)}>保存提示词</button>
        </div> : <div role="tabpanel" aria-label="图生图设置">
          {active ? <><div className="tw-gen-input"><button className="tw-output-image" aria-label={`放大图生图输入图：${active.label}`} onClick={()=>setZoomAsset(active)}><img src={active.url} alt={active.label}/></button><div><strong>输入图：{active.label}</strong><small>{active.width}×{active.height} · 会上传这张图；换输入图请在资产库点选</small></div></div>
            <ImageEdit active={active} value={editSettings} onChange={setEditSettings} prompt={editPrompt} onPrompt={setEditPrompt} mode={editMode} onMode={setEditMode} busy={busy} canPay={canPay} onPrepare={specs=>run(()=>prepare(specs))} showAction={false}/>
            <button disabled={busy} onClick={() => run(saveDraft)}>保存图生图设置</button></>
            : <p className="tw-placeholder">图生图需要一张输入图：请在左侧资产库导入或点选图片。只想用提示词生成，请切换到「文生图」。</p>}
        </div>}
      </div>
      <div className="tw-insp-foot">{genMode==='text'?<><button className="tw-primary" disabled={busy || !canPay} onClick={generateOne}>文生图 · 生成 1 张 · 先确认</button><button disabled={busy || !canPay} onClick={() => run(() => prepare(Array.from({length: 4}, (_, i) => ({kind: 'text-to-image', label: `角色候选 ${i + 1}`, params: imageParams()}))))}>文生图 · 四张候选 · 4 个独立收费任务</button></>
        :<button className="tw-primary" disabled={busy||!canPay||!active||!editEffective.trim()} onClick={generateEdit}>{editMode==='views'?'图生图 · 生成三视图 · 先确认':'图生图 · 生成改写图 · 先确认'}</button>}</div>
    </>
    : stage === 1 ? <>
      <div className="tw-insp-body">
        <div className="tw-insp-title"><h3>拆分立绘</h3><small>本地裁剪不花积分</small></div>
        <label>拆件来源<select aria-label="拆件来源" value={selected} onChange={e => {const a=images.find(x=>x.id===e.target.value);if(a)selectSource(a);else select({id:e.target.value})}}><option value="">选择已保存图片</option>{images.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
        {active&&<div className="tw-source-preview tw-source-mini"><button className="tw-output-image" aria-label={`预览拆件来源：${active.label}`} onClick={()=>setZoomAsset(active)}><img src={active.url} alt={active.label}/></button><div><strong>{active.label}</strong><small>{active.width}×{active.height} · 单击预览，不上传</small></div></div>}
        {splitMode==='part'&&<><label>部件名称<input aria-label="部件名称" value={part} maxLength={80} onChange={e => setPart(e.target.value)} /></label><div className="tw-chips">{PARTS.map(p => <button key={p.id} className={part === p.name ? 'on' : ''} onClick={() => {setPart(p.name); setPriority(p.priority)}}>{p.name}</button>)}</div><label>建模角色<select aria-label="建模角色" value={priority} onChange={e => setPriority(e.target.value)}><option value="high">主要（绿）· 单独建模精修</option><option value="normal">次要（蓝）· 随整张拆件图建模</option><option value="base">基准（红）· 比例参照，单独建模</option></select></label></>}
        <details className="tw-fold" open><summary>AI 拆件（收费） <span className="tw-chip">{splitMode==='sheet'?'整张拆件图':'单个部件'}</span><span className="tw-chip">{labelModel(split.model)}</span></summary>
          <label>拆图方式<select aria-label="拆图方式" value={splitMode} onChange={e=>setSplitMode(e.target.value)}><option value="sheet">整张拆件图</option><option value="part">单个部件</option></select></label>
          <ImageSettings value={split} onChange={setSplit} editing/>
          <label>{splitMode==='sheet'?'拆件提示词（整张）':'拆件提示词（单部件）'}<textarea aria-label="拆件提示词" rows={5} maxLength={6000} value={splitPromptValue} onChange={e=>setSplitPromptValue(e.target.value)}/></label>
          <div className="tw-prompt-tools"><small>{splitCustom?'已自定义；审批与提交使用此文本。':splitMode==='part'?'预设模板，随部件名称自动更新；直接修改即变为自定义。':'预设模板；直接修改即变为自定义。'}</small><button type="button" disabled={!splitCustom} onClick={()=>setSplitPromptValue(splitPreset)}>恢复预设</button></div>
          <PromptHint model={split.model} prompt={splitPromptValue}/>
          <Info>使用公开 image-to-image 接口与可编辑提示词（预设一套，可恢复），不调用未公开的「角色拆分」模板。AI 提取会补画遮挡处，必须人工检查；不是确定性的模型分割。</Info>
          <div className="tw-actions">{splitMode==='part'?<button disabled={!active || busy || !canPay || !part.trim() || !splitPromptValue.trim()} onClick={() => run(() => prepare([{kind:'image-to-image',label:part,priority,params:imageRequest({...split,prompt:splitPromptValue,input_asset:active.id})}]))}>AI 提取此部件 · 先确认</button>:<button disabled={!active || busy || !canPay || !splitPromptValue.trim()} onClick={() => run(() => prepare([{kind:'image-to-image',label:'角色拆件图',priority:'normal',params:imageRequest({...split,prompt:splitPromptValue,input_asset:active.id})}]))}>生成整张拆件图 · 先确认</button>}</div>
        </details>
      </div>
      <div className="tw-insp-foot"><button onClick={()=>setStage(4)}>查看来源 → 部件</button><button className="tw-primary" onClick={()=>setStage(2)}>检查部件并进入建模 →</button></div>
    </>
    : stage === 2 ? <ModelPlan {...modelPlanProps} part="inspector"/>
    : stage === 3 ? <div className="tw-insp-body"><h3 className="tw-insp-title">导入已有云端任务</h3><fieldset className="tw-manual-import"><legend>按云端 task_id 手动添加任务</legend><Info>只用当前国内站密钥查询已存在的云端任务并保存到当前项目；不上传、不创建收费任务。若本机已有“提交结果未知”记录，请在该记录中关联恢复，不要重复添加。</Info>
          <label>云端 task_id<input aria-label="手动添加云端 task_id" maxLength={128} value={importId} onChange={e=>{setImportId(e.target.value);setImportConfirm(false)}} placeholder="UUID 或 task_..."/></label>
          <label>任务备注（可选）<input aria-label="手动添加任务备注" maxLength={100} value={importLabel} onChange={e=>setImportLabel(e.target.value)}/></label>
          <label><input type="checkbox" checked={importConfirm} onChange={e=>setImportConfirm(e.target.checked)}/>确认这是当前国内站账户中已存在的任务，并添加到当前项目</label>
          <button disabled={busy||!status?.keyConfigured||!importConfirm||!validTaskId(importId.trim())} onClick={()=>run(async()=>{const j=await api(`/projects/${project.id}/jobs/import`,'POST',{taskId:importId.trim(),confirm:true,label:importLabel});await load(project.id);setImportId('');setImportLabel('');setImportConfirm(false);setLayout({dock:true});setMessage(`已查询并添加云端任务：${j.label}；未创建新收费任务。`)})}>查询并加入当前项目（不发起生成）</button>
        </fieldset><p className="tw-note">任务列表常驻在底部任务坞；刷新只查询，不会重新提交。</p></div>
    : <>
      <div className="tw-insp-body"><h3 className="tw-insp-title">关系图说明</h3>
        <ul className="tw-legend"><li><b>来源图</b>：没有上级的原图 / 立绘 / 整张拆件图</li><li><b>↳ 本地裁剪</b>：裁剪台保存的部件（0 积分）</li><li><b>↳ AI 提取</b>：图生图任务的产出</li><li><b>→ 3D</b>：以该图为输入的图生3D任务；次要部件显示它们共用的拆件图模型</li></ul>
        <div className="tw-role-legend compact">{['high','normal','base'].map(r=><span key={r} className={`tw-role-tag tw-role-${MODEL_ROLES[r].tone}`}><i aria-hidden="true"/>{MODEL_ROLES[r].name}<small>{MODEL_ROLES[r].how}</small></span>)}</div>
        <p className="tw-note">已勾选：<span className="tw-role-ink-green">主要 {relPlan.main.length}</span> · <span className="tw-role-ink-blue">次要 {relPlan.secondary.length}</span>{relPlan.secondary.length?(relPlan.sheet?`（随拆件图「${relPlan.sheet.label}」）`:'（缺少整张拆件图）'):''} · <span className="tw-role-ink-red">基准 {relPlan.base.length}</span>。共 {relPlan.taskCount} 个建模任务；本页不会发起任何收费任务。</p>
      </div>
      <div className="tw-insp-foot"><button onClick={()=>active?openCrop(active):setStage(1)}>打开裁剪台</button><button className="tw-primary" onClick={()=>setStage(2)}>去统一建模页审阅（{relPlan.taskCount} 个任务）</button></div>
    </>
  return <div ref={rootRef} className="tw-root tw-studio" data-stage={stage} data-narrow={narrow} data-lib={libPush?"push":drawer?"overlay":"rail"} data-dock={layout.dock ? 'open' : 'closed'}>
    <header className="tw-header tw-appbar">
      <div className="tw-brand"><strong>Tripo Studio</strong><span className="tw-eyebrow">{APP_VERSION} · 国内站</span></div>
      <label className="tw-project-pick"><span>当前项目</span><select aria-label="当前项目" disabled={busy || Boolean(approval)} value={project?.id ?? ''} onChange={e => run(() => load(e.target.value, true))}><option value="" disabled>先创建本地项目</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <button disabled={!status || busy || Boolean(approval)} onClick={() => run(newProject)}>＋ 新建项目</button>
      <StorageSettings storage={status?.storage} busy={busy||connecting} blocked={Boolean(approval)} api={api} onChanged={storageChanged}/>
      <span className="tw-appbar-spacer"/>
      <span className={`tw-pill ${canPay ? 'ready' : ''}`} title="本地保存 · 无自动付费提交">{canPay ? '● 云端已配置 · 每次须确认' : '○ 本地工作区 · 未启用收费'}</span>
      {status?.keyConfigured && <button type="button" className="tw-balance-pill" disabled={busy} title="查询 Tripo 国内站账户余额（GET /account/balance，不提交任务）" aria-label={balance ? `账户余额 ${formatCredits(balance.balance)}，冻结 ${formatCredits(balance.frozen)}，点击刷新` : '查询账户余额'} onClick={queryBalance}>{balance ? <>余额 <b>{formatCredits(balance.balance)}</b>{balance.frozen ? <small> · 冻结 {formatCredits(balance.frozen)}</small> : null}</> : '查询余额'}</button>}
      <button className="tw-connect" aria-expanded={settings} onClick={() => setSettings(!settings)}>连接设置</button>
    </header>
    {!status && <section className="tw-settings" aria-label="本机服务连接" aria-busy={connecting}>
      <strong>{window.__TRIPO_OFFLINE__ ? '离线预览 · 无本机服务' : connecting ? '正在连接本机 Tripo 服务…' : '尚未连接本机 Tripo 服务'}</strong>
      <p>密钥输入、收费开关和新建项目需要本机后端连接成功后才能使用；不需要先填写密钥才能连接，也不需要启用收费才能创建本地项目。</p>
      <button disabled={busy || connecting || Boolean(window.__TRIPO_OFFLINE__)} onClick={()=>run(connect)}>重新连接</button>
    </section>}
    {settings && <CredentialSettings status={status} busy={busy} balance={balance}
      onSave={body=>run(async()=>{const next=await api('/credentials','PUT',body);setStatus(prev=>({...prev,...next}));setApproval(null);setConsent(false);setBalance(null);setMessage('连接设置已保存，未提交生成任务；可查询余额验证密钥。')})}
      onClear={()=>run(async()=>{const next=await api('/credentials','DELETE',{confirm:true});setStatus(prev=>({...prev,...next}));setApproval(null);setConsent(false);setBalance(null);setMessage('密钥已清除，收费已关闭；不会自动取消云端任务。')})}
      onBalance={queryBalance} usage={usage} onUsage={project?syncUsage:null}/> }
    {status?.upgrade && upgradeSeen!==status.upgrade.backup && <div className="tw-alert tw-upgrade" role="status">已从 {status.upgrade.from} 升级到 {status.upgrade.to}：项目、图片与任务记录均保留，升级前的索引已自动备份为 <code>backups/{status.upgrade.backup}</code>。<button onClick={setUpgradeSeen}>知道了</button></div>}
    {error && <div className="tw-alert error" role="alert">{error}<button onClick={() => setError('')}>关闭</button></div>}
    {message && <div className="tw-alert" role="status">{message}</div>}
    <div className="tw-stepbar">
      <nav className="tw-steps" aria-label="创作阶段">{STAGES.map((s, i) => <button key={s} aria-current={i === stage ? 'step' : undefined} onClick={() => setStage(i)}><b>0{i + 1}</b><span>{s}</span></button>)}</nav>
      {project&&<div className="tw-step-tools">
        <button type="button" className="tw-lib-toggle" aria-expanded={libShown} aria-label={libShown?'收起资产库侧栏':'展开资产库侧栏'} onClick={toggleLibrary}>☰ 资产库</button>
        <button type="button" className="tw-task-jump" aria-label={`跳到任务（进行中 ${counts.running}，失败/待核对 ${counts.failed}）`} onClick={()=>{setLayout({dock:true});revealTasks()}}>任务 <span className="tw-chip run">进行中 {counts.running}</span>{counts.failed>0&&<span className="tw-chip bad">待核对 {counts.failed}</span>}</button>
      </div>}
    </div>
    {!project ? <div className="tw-empty"><div className="tw-orbit">✧</div><h2>先给创作一个归属</h2><p>创建项目后导入参考图、保存提示词和裁剪部件。云端生图需要你的 Tripo Key 和每次确认。</p><button className="tw-primary" disabled={!status || busy} onClick={() => run(newProject)}>创建本地项目</button></div> : <>
      <div className="tw-workspace" data-lib={libPush?'push':drawer?'overlay':'rail'}>
        {!narrow&&!libPush&&<LibraryRail images={images} models={models} jobs={project.jobs} filter={layout.filter} busy={busy} onFilter={f=>setLayout({filter:f})} onOpen={openLibrary} onImport={files=>run(()=>importFiles(files))}/>}
        {libShown&&<Library key={libPush?'push':'overlay'} mode={libPush?'push':'overlay'} onClose={closeLibrary} focusSearch={searchLib>0} images={images} models={models} jobs={project.jobs} selected={selected} busy={busy} filter={layout.filter} onFilter={f=>setLayout({filter:f})} onSelect={pick} onZoom={setZoomAsset} onRename={renameAsset}
          onDelete={a=>{setDeleteImageError('');setDeleteImage(a)}} onImport={files=>run(()=>importFiles(files))} onPreview={onPreview} canPreviewModel={canPreviewModel}/>}
        {drawer&&!libPush&&<div className="tw-lib-scrim" aria-hidden="true" onClick={closeLibrary}/>}
        <div className="tw-flow">
          <main className="tw-canvas" aria-label="画布">{canvas}</main>
          <aside className="tw-inspector" aria-label="参数栏">{inspector}</aside>
        </div>
      </div>
      <TaskDock open={layout.dock} onToggle={()=>setLayout({dock:!layout.dock})} project={project} busy={busy} drafts={drafts}
        onRefresh={()=>run(async()=>{setProject(await api(`/projects/${project.id}/refresh`,'POST',{manual:true}))})}
        onReviewDrafts={()=>{setApproval(drafts.slice(0,MAX_BATCH_PARTS));setConsent(false)}} taskProps={taskProps}/>
    </>}
    {project&&goBar&&!approval&&<div className="tw-gobar" role="region" aria-label="吸底快捷操作">
      <span className="tw-gobar-text">{stage===0?(genMode==='image'?(active?`图生图 · 输入图「${active.label}」`:'图生图 · 尚未选择输入图'):(prompt.trim()?`文生图 · 提示词：${prompt.trim().slice(0,48)}${prompt.trim().length>48?'…':''}`:'文生图 · 还没有提示词')):`${STAGES[stage]} · 操作按钮在参数区`}</span>
      <button type="button" onClick={()=>scrollToInspector()}>↓ 参数与操作</button>
      {stage===0&&(genMode==='image'?<button type="button" className="tw-primary" aria-label="吸底快捷：图生图生成（先审阅确认）" disabled={busy||!canPay||!active||!editEffective.trim()} onClick={generateEdit}>图生图 · 生成 · 先确认</button>
        :<button type="button" className="tw-primary" aria-label="吸底快捷：文生图生成一张候选（先审阅确认）" disabled={busy||!canPay} onClick={generateOne}>文生图 · 生成 · 先确认</button>)}
    </div>}
    {approval && <div className="tw-modal" role="dialog" aria-modal="true" aria-label="收费任务确认"><div className="tw-dialog tw-approval-dialog"><span className="tw-eyebrow">REVIEW BEFORE COMMIT</span><h2>确认 {approval.length} 个独立收费任务</h2><p>图像、3D模型或提示词（依本次参数）将发送至 Tripo 国内站（<code>{TRIPO_API_BASE}</code>）。建模和格式转换分别是独立收费任务，不会自动转换；实际费用按账户结算。四张候选就是四次独立提交。</p>
      <BalanceCheck balance={balance} estimate={estimateBatch(approval)} busy={busy} canQuery={Boolean(status?.keyConfigured)} onQuery={queryBalance}/>
      <div className="tw-approval-list">{approval.map(d=>{const input=d.params?.input_asset&&images.find(a=>a.id===d.params.input_asset),est=estimateJobCredits(d);return <article key={d.id} data-kind={d.kind}><strong>{d.label} · <span className={`tw-kind-tag kind-${d.kind}`}>{KIND_LABEL[d.kind]||d.kind}</span> <code>{d.kind}</code></strong>
        {input&&<div className="tw-approval-input"><img src={input.url} alt={input.label}/><small>{d.kind==='image-to-image'?'图生图输入图':'建模输入图'}：{input.label}</small></div>}
        {d.kind==='text-to-image'&&<small className="tw-approval-noinput">文生图：不上传任何图片，只发送提示词。</small>}
        <pre>{JSON.stringify(d.params,null,2)}</pre><small>{d.kind==='model-convert'?`格式转换到 ${d.params.format} · 新增独立收费任务，不自动触发`:d.kind==='image-to-model'?(d.role==='sheet'?`整张拆件图 · 代替 ${d.covers?.length??0} 个次要部件一次建模 · 1 个独立收费任务，不自动拆分或装配`:d.role==='whole'?'整体打底（旧版计划）· 独立收费，未自动装配':`${jobRoleLabel(d)} · 独立收费任务`):priceText(d.params.model,d.params.quality)}<br/>参考积分：{est===null?'未能按公开表估算':`约 ${est}`}<br/>输入哈希：{d.inputHash||'纯文本'}<br/>审批绑定国内站、当前图片、参数与账户；后续改图需重新准备。</small></article>})}</div><label className="tw-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>我已核对上述输入与任务数量，同意数据上传及实际积分扣除。</label><div className="tw-actions"><button disabled={busy} onClick={()=>run(cancelApproval)}>取消并丢弃草稿</button><button className="tw-primary" disabled={!consent||busy||!canPay} onClick={()=>run(confirm)}>确认上传并提交 {approval.length} 个任务</button></div></div></div>}
    {deleteImage&&<div className="tw-modal" role="dialog" aria-modal="true" aria-label="删除参考图确认"><div className="tw-dialog"><h2>删除本机参考图？</h2><p>即将删除「{deleteImage.label}」的本地文件和资产记录，此操作不可撤回。云端任务和其他文件不会受影响。</p>{deleteImageError&&<p className="tw-danger" role="alert">{deleteImageError}</p>}<div className="tw-actions"><button disabled={busy} onClick={()=>setDeleteImage(null)}>保留图片</button><button disabled={busy} onClick={()=>run(async()=>{const id=deleteImage.id;setDeleteImageError('');try{await api(`/projects/${project.id}/assets/${id}/delete`,'POST',{confirm:true})}catch(e){setDeleteImageError(e.message);return}setDeleteImage(null);if(selected===id)setSelected('');if(wholeAsset===id)setWholeAsset('');if(sheetAsset===id)setSheetAsset('');await load(project.id);setMessage('已删除本机参考图及资产记录')})}>确认删除本机图片</button></div></div></div>}
    <ImageLightbox asset={zoomAsset} onClose={()=>setZoomAsset(null)}/>
  </div>
}
