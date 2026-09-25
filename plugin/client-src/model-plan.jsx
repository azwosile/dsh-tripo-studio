import React from 'react'
import {ModelPriceTips} from './model-price-tips.jsx'
import {MODEL_VERSIONS,MODEL_FORMATS,modelFaceMax} from '../shared/contracts.js'
import {ImageTile,RenameButton} from './image-card.jsx'
// 0.2.12: user-confirmed batch cap (was 12). Each part is still an individually approved paid task.
export const MAX_BATCH_PARTS=36

export const defaultModelOptions={texture:true,pbr:true,textureQuality:'standard',quad:false,smart:false,autoSize:false,autofix:false,textureAlignment:'original_image',orientation:'default'}
export function ModelPlan({images,onZoom,onRename,wholeAsset,onWhole,checked,setChecked,modelVersion,setModelVersion,faceLimit,setFaceLimit,geometry,setGeometry,options,setOptions,convertJobs,busy,canPay,onSave,onPrepare,onPriority,part='canvas'}) {
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
 const spec=(id,role)=>({kind:'image-to-model',role,priority:role==='whole'?'base':images.find(a=>a.id===id)?.priority??'normal',label:role==='whole'?'整体打底模型':images.find(a=>a.id===id)?.label||'独立部件',params:{
  input_asset:id,model:modelVersion,face_limit:faceLimit,texture:options.texture,pbr:options.pbr,enable_image_autofix:options.autofix,
  ...(options.texture?{texture_alignment:options.textureAlignment,orientation:options.orientation}:{}),
  ...(!old?{geometry_quality:geometry,quad:options.quad,auto_size:options.autoSize,smart_low_poly:options.smart,...(options.texture?{texture_quality:options.textureQuality}:{})}:{})
 }})
 const parts=images.filter(a=>a.id!==wholeAsset),chosen=parts.filter(a=>checked.includes(a.id)),whole=images.find(a=>a.id===wholeAsset)
 if(part==='canvas')return <section className="tw-panel tw-canvas-panel" aria-label="建模计划"><div className="tw-section-title"><span>04 / BUILD</span><h2>整体打底，重点部件精修</h2></div>
  <div className="tw-model-plan"><h3>① 整体模型打底</h3><label>完整角色定稿图<select aria-label="整体建模来源" value={wholeAsset} onChange={e=>onWhole(e.target.value)}><option value="">选择完整立绘，不选拆件图</option>{images.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
   {whole?<div className="tw-source-preview tw-whole-preview"><button type="button" className="tw-output-image" aria-label={`放大完整立绘：${whole.label}`} onClick={()=>onZoom?.(whole)}><img src={whole.url} alt={whole.label}/></button><strong>已选：{whole.label}</strong><small>{whole.width}×{whole.height} · 单击预览，不上传</small></div>:<p className="tw-placeholder">尚未选择整体建模来源：请在下方缩略图中点击完整立绘。</p>}
   <div className="tw-image-grid tw-strip-grid" aria-label="完整立绘缩略图选择">{images.map(a=><ImageTile key={a.id} compact asset={a} busy={busy} selected={a.id===wholeAsset} badge={a.sourceAssetId?'裁剪图':''} onSelect={x=>onWhole(x.id)} onZoom={onZoom} onRename={onRename}/>)}</div>
   <p>保留身体比例与次要结构；不自动移除头发、衣服或装配。先检查完整立绘，整体生成是一个独立收费任务。</p>
  </div>
  <h3>② 重点部件单独生成</h3><p>推荐头发、裙装等辨识度高的部件独立精修；头部、躯干、鞋袜与小配饰默认跟随整体。可手动调整主次；标签不是自动收费或质量保证。</p>
  <button disabled={busy} onClick={()=>setChecked(parts.filter(a=>a.priority==='high').map(a=>a.id))}>仅选择高优先级部件</button>
  <div className="tw-image-grid">{parts.map(a=><div className={`tw-image-card tw-part-card ${checked.includes(a.id)?'chosen':''}`} key={a.id}><img src={a.url} alt={a.label}/><button type="button" className="tw-zoom-hover" aria-label={`放大部件：${a.label}`} title="放大查看" onClick={()=>onZoom?.(a)}>⤢</button><RenameButton asset={a} busy={busy} onRename={onRename}/><div><label><input type="checkbox" checked={checked.includes(a.id)} onChange={e=>setChecked(prev=>e.target.checked?[...prev,a.id]:prev.filter(id=>id!==a.id))}/><strong>{a.label}</strong></label><label>处理方式<select aria-label={`${a.label}处理方式`} disabled={busy} value={a.priority} onChange={e=>onPriority(a.id,e.target.value)}><option value="high">主要 · 独立精修</option><option value="base">基准 · 比例参照</option><option value="normal">次要 · 默认跟随整体</option></select></label><small>{a.width}×{a.height} · 不自动提交</small></div></div>)}</div>
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
  <section className="tw-convert" aria-label="模型格式转换"><h3>③ 已完成模型 → 其他格式（独立收费转换）</h3><p>图生3D接口不提供任意输出格式开关。此处使用官方 /models/convert 新建另一笔云任务，必须另行审阅并确认；不会自动在生成后转换。GLTF须自包含，OBJ/STL等可能丢失贴图或动画，USDZ/3MF目前只支持下载。</p>
    <label>原模型任务<select aria-label="转换来源任务" value={convertJob} onChange={e=>setConvertJob(e.target.value)}><option value="">选择已成功的国内站3D任务</option>{convertJobs.map(j=><option key={j.id} value={j.id}>{j.label} · {j.taskId}</option>)}</select></label>
    <label>目标导出格式<select aria-label="目标导出格式" value={convertFormat} onChange={e=>{setConvertFormat(e.target.value);setConvertQuad(false)}}>{MODEL_FORMATS.map(fmt=><option key={fmt} value={fmt}>{fmt}</option>)}</select></label>
    {convertFormat==='FBX'&&<label><input type="checkbox" checked={convertQuad} onChange={e=>setConvertQuad(e.target.checked)}/>转换为四边面 FBX（若需要）</label>}
    <div className="tw-convert-actions"><button disabled={busy||!canPay||!convertJobs.some(j=>j.id===convertJob)} onClick={()=>onPrepare([{kind:'model-convert',label:`${convertJobs.find(j=>j.id===convertJob)?.label||'模型'} → ${convertFormat}`,params:{input_job:convertJob,format:convertFormat,...(convertQuad?{quad:true}:{})}}])}>审阅并单独确认格式转换 · 1 个任务</button>
    <p><a href="https://developers.tripo3d.com/zh/docs/models-convert" target="_blank" rel="noopener noreferrer">查看官方转换格式与参数</a></p></div>
  </section>
  </div>
  <div className="tw-insp-foot">
   <button className="tw-primary" disabled={busy||!canPay||!images.some(a=>a.id===wholeAsset)} onClick={()=>onPrepare([spec(wholeAsset,'whole')])}>审阅整体建模 · 1 个任务</button>
  <div className="tw-actions"><button disabled={busy||!canPay||chosen.length<1||chosen.length>MAX_BATCH_PARTS} className="tw-primary" onClick={()=>onPrepare(chosen.map(a=>spec(a.id,'part')))}>审阅并生成 {chosen.length} 个部件</button><small>最多{MAX_BATCH_PARTS}个；次要部件也可手动勾选，但会额外收费。单张对应独立任务，尺度与接缝仍需人工检查。</small></div>
  </div>
 </>
}
