import React from 'react'
import {ModelPriceTips} from './model-price-tips.jsx'
import {MODEL_VERSIONS,MODEL_FORMATS,modelFaceMax} from '../shared/contracts.js'
import {ImageTile,RenameButton} from './image-card.jsx'
import {MODEL_ROLES,ROLE_ORDER,roleOf,planModelTasks,SHEET_TONE,toneOf} from './model-roles.js'
import {MultiviewPlan} from './multiview-plan.jsx'
// 0.2.12: user-confirmed batch cap (was 12). Each part is still an individually approved paid task.
export const MAX_BATCH_PARTS=36

export const defaultModelOptions={texture:true,pbr:true,textureQuality:'standard',quad:false,smart:false,autoSize:false,autofix:false,textureAlignment:'original_image',orientation:'default'}
/** Segmented 主要/次要/基准 control; the colour is the tag (green / blue / red). */
export function RoleSwitch({asset,busy,onPriority,compact=false}) {
 const role=roleOf(asset)
 return <span className={`tw-role-switch ${compact?'compact':''}`} role="group" aria-label={`${asset.label}建模角色`}>{ROLE_ORDER.map(r=><button key={r} type="button" className={`tw-role-btn tw-role-${MODEL_ROLES[r].tone}`} aria-pressed={role===r} disabled={busy} title={`${MODEL_ROLES[r].name}（${MODEL_ROLES[r].color}）：${MODEL_ROLES[r].how}`} onClick={()=>role!==r&&onPriority(asset.id,r)}>{MODEL_ROLES[r].name}</button>)}</span>
}
export function RoleLegend() {
 return <div className="tw-role-legend" aria-label="建模角色图例">{ROLE_ORDER.map(r=><span key={r} className={`tw-role-tag tw-role-${MODEL_ROLES[r].tone}`}><i aria-hidden="true"/>{MODEL_ROLES[r].name} · {MODEL_ROLES[r].color}<small>{MODEL_ROLES[r].how}</small></span>)}<span className={`tw-role-tag tw-role-${SHEET_TONE.tone}`}><i aria-hidden="true"/>{SHEET_TONE.name} · {SHEET_TONE.color}<small>{SHEET_TONE.how}</small></span></div>
}
export function ModelPlan({images,jobs=[],onZoom,onRename,sheetAsset,onSheet,checked,setChecked,modelVersion,setModelVersion,faceLimit,setFaceLimit,geometry,setGeometry,options,setOptions,convertJobs,busy,canPay,onSave,onPrepare,onPriority,part='canvas'}) {
 const [convertJob,setConvertJob]=React.useState(''),[convertFormat,setConvertFormat]=React.useState('FBX'),[convertQuad,setConvertQuad]=React.useState(false)
 const old=modelVersion==='v2.5-20250123'
 const cap=modelFaceMax(modelVersion,{quad:options.quad,smart:options.smart,geometry})
 const update=(key,value)=>{
  const next={...options,[key]:value}
  if(key==='texture'&&!value){next.pbr=false;next.orientation='default'}
  if(key==='quad'||key==='smart')setFaceLimit(Math.min(faceLimit,modelFaceMax(modelVersion,{quad:next.quad,smart:next.smart,geometry})))
  setOptions(next)
 }
 const selectModel=value=>{
  setModelVersion(value)
  if(value==='v2.5-20250123'){setGeometry('standard');setOptions({...options,quad:false,smart:false,autoSize:false,textureQuality:'standard'})}
  setFaceLimit(Math.min(faceLimit,modelFaceMax(value,{quad:value==='v2.5-20250123'?false:options.quad,smart:value==='v2.5-20250123'?false:options.smart,geometry:value==='v2.5-20250123'?'standard':geometry})))
 }
 const params=id=>({
  input_asset:id,model:modelVersion,face_limit:faceLimit,texture:options.texture,pbr:options.pbr,enable_image_autofix:options.autofix,
  ...(options.texture?{texture_alignment:options.textureAlignment,orientation:options.orientation}:{}),
  ...(!old?{geometry_quality:geometry,quad:options.quad,auto_size:options.autoSize,smart_low_poly:options.smart,...(options.texture?{texture_quality:options.textureQuality}:{})}:{})
 })
 // 0.3.3 REQ-067: one plan, one review. 次要 parts share a single task on the split sheet; 主要/基准 are one task each.
 const plan=planModelTasks({images,jobs,checked,sheetAsset})
 // 0.3.4 REQ-073: multiview shares the H-series options; it has no input_asset and no enable_image_autofix.
 const multiviewParams=()=>{const {input_asset,enable_image_autofix,...rest}=params('');return rest}
 const specs=()=>[
  ...(plan.sheetTask?[{kind:'image-to-model',role:'sheet',priority:'normal',label:`整张拆件图「${plan.sheet.label}」${plan.secondary.length?` · 次要×${plan.secondary.length}`:''}`.slice(0,100),covers:plan.secondary.map(a=>a.id),params:params(plan.sheet.id)}]:[]),
  ...plan.individual.map(a=>({kind:'image-to-model',role:'part',priority:roleOf(a),label:a.label||'独立部件',params:params(a.id)}))]
 const parts=images
 const toggle=(id,on)=>setChecked(prev=>on?(prev.includes(id)?prev:[...prev,id]):prev.filter(x=>x!==id))
 const selectRole=r=>setChecked(prev=>[...new Set([...prev,...parts.filter(a=>roleOf(a)===r).map(a=>a.id)])])
 if(part==='canvas')return <section className="tw-panel tw-canvas-panel" aria-label="建模计划"><div className="tw-section-title"><span>03 / BUILD</span><h2>统一建模：主要 · 次要 · 基准</h2></div>
  <RoleLegend/>
  <p className="tw-plan-intro">不再分“整体打底”和“部件精修”两个入口：给每张图打上颜色标签即可。<b className="tw-role-ink-blue">次要</b>部件不单独收费，由它们所在的<b>整张拆件图</b>一次送入 Tripo；<b className="tw-role-ink-green">主要</b>与<b className="tw-role-ink-red">基准</b>各自单独建模。被设为整张拆件图的那张图统一用<b className="tw-role-ink-purple">紫色</b>框标出。</p>
  <div className="tw-model-plan tw-sheet-plan"><h3>① 整张拆件图（次要部件共用 1 个任务）</h3>
   <label>整张拆件图<select aria-label="整张拆件图" value={plan.sheetId} onChange={e=>onSheet(e.target.value)}><option value="">未选择（有次要部件时必选）</option>{images.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
   {plan.sheet?<div className="tw-source-preview tw-whole-preview"><button type="button" className="tw-output-image" aria-label={`放大整张拆件图：${plan.sheet.label}`} onClick={()=>onZoom?.(plan.sheet)}><img src={plan.sheet.url} alt={plan.sheet.label}/></button><strong>{plan.autoSheet?'已自动推断：':'已选：'}{plan.sheet.label}</strong><small>{plan.sheet.width}×{plan.sheet.height} · {plan.secondary.length?`覆盖 ${plan.secondary.length} 个已勾选次要部件`:plan.sheetChecked?'已勾选本图：整张直接建模 1 个任务':'当前没有勾选次要部件，也没有勾选本图，不会提交'}{plan.autoSheet?' · 按次要部件的裁剪来源推断，可更改':''}</small></div>:<p className="tw-placeholder">{plan.missingSheet?'已勾选次要部件，但还没有整张拆件图：请在下方缩略图中点选拆件图。':'还没有选择整张拆件图。勾选次要部件后会按裁剪来源自动推断。'}</p>}
   <div className="tw-image-grid tw-strip-grid" aria-label="整张拆件图缩略图选择">{images.map(a=><ImageTile key={a.id} compact asset={a} busy={busy} selected={a.id===plan.sheetId} badge={a.sourceAssetId?'裁剪图':''} pickLabel="设为整张拆件图" onSelect={x=>onSheet(x.id)} onZoom={onZoom} onRename={onRename}/>)}</div>
   {plan.foreign.length>0&&<p className="tw-danger" role="note">有 {plan.foreign.length} 个次要部件不是从这张拆件图裁出的（{plan.foreign.map(a=>a.label).join('、')}）。它们仍只随这张图建模；若拆件图里没有它们，请改为主要/基准或换一张拆件图。</p>}
  </div>
  <h3>② 部件与标签</h3>
  <div className="tw-actions tw-role-quick"><button disabled={busy} onClick={()=>selectRole('high')}>勾选全部主要</button><button disabled={busy} onClick={()=>selectRole('normal')}>勾选全部次要</button><button disabled={busy} onClick={()=>selectRole('base')}>勾选全部基准</button><button disabled={busy||!checked.length} onClick={()=>setChecked([])}>清空勾选</button></div>
  <div className="tw-image-grid tw-role-grid">{parts.map(a=>{const r=roleOf(a),on=checked.includes(a.id),tone=toneOf(a,plan.sheetId);return <div className={`tw-image-card tw-part-card tw-role-card tw-role-${tone} ${on?'chosen':''}`} data-role={r} data-sheet={a.id===plan.sheetId?'true':undefined} key={a.id}><img src={a.url} alt={a.label}/><button type="button" className="tw-zoom-hover" aria-label={`放大部件：${a.label}`} title="放大查看" onClick={()=>onZoom?.(a)}>⤢</button><RenameButton asset={a} busy={busy} onRename={onRename}/><span className={`tw-role-badge tw-role-${tone}`}>{a.id===plan.sheetId?'拆件图':MODEL_ROLES[r].name}</span><div><label><input type="checkbox" aria-label={`加入建模：${a.label}`} checked={on} onChange={e=>toggle(a.id,e.target.checked)}/><strong>{a.label}</strong></label><RoleSwitch asset={a} busy={busy} onPriority={onPriority}/><small>{a.id===plan.sheetId?(on?'整张拆件图 · 勾选后整张直接建模':'整张拆件图 · 次要部件随它建模'):r==='normal'?(plan.sheet?`随「${plan.sheet.label}」建模 · 不单独收费`:'需要整张拆件图'):MODEL_ROLES[r].how} · {a.width}×{a.height}</small></div></div>})}</div>
  {parts.length===0&&<p className="tw-placeholder">还没有部件图片。先在 02 拆件与裁剪保存部件。</p>}
  <MultiviewPlan images={images} busy={busy} canPay={canPay} onZoom={onZoom} onPrepare={onPrepare} modelParams={multiviewParams}/>
 </section>
 return <>
  <div className="tw-insp-body">
  <h3 className="tw-insp-title">建模参数</h3>
  <ModelPriceTips model={modelVersion} geometry={geometry} options={options}/>
  <div className="tw-fields tw-model-fields"><label>Tripo 几何模型<select aria-label="Tripo 几何模型" value={modelVersion} onChange={e=>selectModel(e.target.value)}>{MODEL_VERSIONS.map(v=><option key={v} value={v}>{v}{v.startsWith('v2.5')?' · 旧版部分高级参数不支持':''}</option>)}</select></label>
   <label>目标面数<input aria-label="目标面数" type="number" min="500" max={cap} step="500" value={faceLimit} onChange={e=>setFaceLimit(Number(e.target.value))}/><small>当前模型/拓扑范围 500–{cap.toLocaleString()}</small></label>
   <label>几何质量<select aria-label="几何质量" value={geometry} disabled={old} onChange={e=>{setGeometry(e.target.value);setFaceLimit(Math.min(faceLimit,modelFaceMax(modelVersion,{quad:options.quad,smart:options.smart,geometry:e.target.value})))}}><option value="standard">标准</option><option value="detailed">精细 / Ultra（积分以官方结算为准）</option></select></label>
   <label>网格拓扑<select aria-label="网格拓扑" value={options.quad?'quad':'tri'} disabled={old} onChange={e=>update('quad',e.target.value==='quad')}><option value="tri">三角面 · 默认 GLB</option><option value="quad">四边面 · 官方强制 FBX</option></select></label>
   <label>贴图<select aria-label="贴图" value={options.texture?'on':'off'} onChange={e=>update('texture',e.target.value==='on')}><option value="on">生成贴图</option><option value="off">无贴图纯几何体</option></select></label>
   <label><input type="checkbox" aria-label="PBR 材质" checked={options.pbr} disabled={!options.texture} onChange={e=>update('pbr',e.target.checked)}/>启用 PBR 材质（需要贴图）</label>
   {!old&&options.texture&&<label>贴图质量<select aria-label="贴图质量" value={options.textureQuality} onChange={e=>update('textureQuality',e.target.value)}><option value="standard">标准</option><option value="detailed">精细</option><option value="extreme">8K · 极致（可能额外消耗积分）</option></select></label>}
   <label><input type="checkbox" aria-label="生成前优化参考图" checked={options.autofix} onChange={e=>update('autofix',e.target.checked)}/>生成前自动优化参考图</label>
   {options.texture&&<><label>贴图优先级<select aria-label="贴图优先级" value={options.textureAlignment} onChange={e=>update('textureAlignment',e.target.value)}><option value="original_image">参考图颜色</option><option value="geometry">几何体贴合</option></select></label><label>模型朝向<select aria-label="模型朝向" value={options.orientation} onChange={e=>update('orientation',e.target.value)}><option value="default">自动朝向</option><option value="align_image">对齐参考图视角</option></select></label></>}
   {!old&&<><label><input type="checkbox" aria-label="自动真实尺寸" checked={options.autoSize} onChange={e=>update('autoSize',e.target.checked)}/>自动缩放至真实尺寸（米）</label><label><input type="checkbox" aria-label="智能低面数" checked={options.smart} onChange={e=>update('smart',e.target.checked)}/>智能低面数（复杂输入可能失败）</label></>}
  </div>
  <p className="tw-note">H 系列公开参数：四边面直接得到 FBX，浏览器预览会三角化，仅原始 FBX 可保留四边拓扑。自动尺寸、贴图质量及 Ultra 可能改变收费；实际费用以云端账户结算为准。<a href="https://developers.tripo3d.com/zh/docs/generation-image-to-model/standard" target="_blank" rel="noopener noreferrer">官方图生3D参数</a></p>
  <button disabled={busy} onClick={onSave}>保存建模计划</button>
  <section className="tw-convert" aria-label="模型格式转换"><h3>④ 已完成模型 → 其他格式（独立收费转换）</h3><p>图生3D接口不提供任意输出格式开关。此处使用官方 /models/convert 新建另一笔云任务，必须另行审阅并确认；不会自动在生成后转换。GLTF须自包含，OBJ/STL等可能丢失贴图或动画，USDZ/3MF目前只支持下载。</p>
    <label>原模型任务<select aria-label="转换来源任务" value={convertJob} onChange={e=>setConvertJob(e.target.value)}><option value="">选择已成功的国内站3D任务</option>{convertJobs.map(j=><option key={j.id} value={j.id}>{j.label} · {j.taskId}</option>)}</select></label>
    <label>目标导出格式<select aria-label="目标导出格式" value={convertFormat} onChange={e=>{setConvertFormat(e.target.value);setConvertQuad(false)}}>{MODEL_FORMATS.map(fmt=><option key={fmt} value={fmt}>{fmt}</option>)}</select></label>
    {convertFormat==='FBX'&&<label><input type="checkbox" checked={convertQuad} onChange={e=>setConvertQuad(e.target.checked)}/>转换为四边面 FBX（若需要）</label>}
    <div className="tw-convert-actions"><button disabled={busy||!canPay||!convertJobs.some(j=>j.id===convertJob)} onClick={()=>onPrepare([{kind:'model-convert',label:`${convertJobs.find(j=>j.id===convertJob)?.label||'模型'} → ${convertFormat}`,params:{input_job:convertJob,format:convertFormat,...(convertQuad?{quad:true}:{})}}])}>审阅并单独确认格式转换 · 1 个任务</button>
    <p><a href="https://developers.tripo3d.com/zh/docs/models-convert" target="_blank" rel="noopener noreferrer">查看官方转换格式与参数</a></p></div>
  </section>
  </div>
  <div className="tw-insp-foot">
   <div className="tw-plan-summary" aria-label="本次建模任务">{plan.taskCount?<>本次共 <b>{plan.taskCount}</b> 个独立收费任务：{plan.sheetTask?<span className="tw-role-tag tw-role-purple"><i aria-hidden="true"/>拆件图 1{plan.secondary.length?`（次要 ${plan.secondary.length}）`:''}</span>:null}{plan.main.length?<span className="tw-role-tag tw-role-green"><i aria-hidden="true"/>主要 {plan.main.length}</span>:null}{plan.base.length?<span className="tw-role-tag tw-role-red"><i aria-hidden="true"/>基准 {plan.base.length}</span>:null}</>:'尚未勾选要建模的部件'}</div>
   <div className="tw-actions"><button className="tw-primary" disabled={busy||!canPay||!plan.taskCount||plan.missingSheet||plan.taskCount>MAX_BATCH_PARTS} onClick={()=>onPrepare(specs())}>审阅建模 · {plan.taskCount} 个任务</button><small>{plan.missingSheet?'有次要部件但没有整张拆件图，请先选择。':`最多${MAX_BATCH_PARTS}个任务；每个任务单独审批。尺度与接缝仍需在 Blender 中人工检查。`}</small></div>
  </div>
 </>
}
