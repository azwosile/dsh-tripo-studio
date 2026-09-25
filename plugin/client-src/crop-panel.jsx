import React from 'react'
import {ImageTile} from './image-card.jsx'

const pointAt=(e,element)=>{
  const r=element.getBoundingClientRect()
  return {x:Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)),y:Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100))}
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)

// Shared drawing surface for the inline panel and the enlarged editor (0.2.12 REQ-041).
// Lasso shapes follow Photoshop: plain drag = new selection, Shift = add, Alt = subtract.
function CropCanvas({active,rect,background,picking,mode,lasso,busy,width,onBegin,onRect,onLasso,onSample,label}) {
  const drag=React.useRef(null),points=React.useRef([]),op=React.useRef('replace'),[preview,setPreview]=React.useState(null)
  const start=e=>{
    if(!active||busy||e.button!==0)return
    const point=pointAt(e,e.currentTarget)
    if(picking){onSample(point);return}
    drag.current=point;e.currentTarget.setPointerCapture(e.pointerId)
    if(mode==='lasso'){
      op.current=e.shiftKey&&lasso.length?'add':e.altKey&&lasso.length?'subtract':'replace'
      points.current=[point];setPreview({op:op.current,points:[point]})
      if(e.altKey)e.preventDefault()
    } else onBegin()
  }
  const move=e=>{
    if(!drag.current)return
    const point=pointAt(e,e.currentTarget)
    if(mode==='lasso'){
      if(distance(point,points.current.at(-1))>=0.35&&points.current.length<1200){points.current=[...points.current,point];setPreview({op:op.current,points:points.current})}
    } else onRect({x:Math.min(point.x,drag.current.x),y:Math.min(point.y,drag.current.y),w:Math.abs(point.x-drag.current.x),h:Math.abs(point.y-drag.current.y)})
  }
  const finish=e=>{
    if(!drag.current)return
    if(mode==='lasso'){
      const point=pointAt(e,e.currentTarget)
      if(distance(point,points.current.at(-1))>0.35)points.current=[...points.current,point]
      onLasso(points.current.length>=3?points.current:[],op.current)
      setPreview(null);points.current=[]
    }
    drag.current=null
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)
  }
  const shapes=preview?[...(preview.op==='replace'?[]:lasso),{op:preview.op==='replace'?'add':preview.op,points:preview.points}]:lasso
  return <div className={`tw-crop ${picking?'picking':''}`} aria-label={label} style={{background,width,aspectRatio:`${active.width}/${active.height}`}}
    onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
    <img src={active.url} alt={active.label} draggable="false" />
    {mode==='rect'&&<span className="tw-crop-box" style={{left:`${rect.x}%`,top:`${rect.y}%`,width:`${rect.w}%`,height:`${rect.h}%`}}/>}
    {mode==='lasso'&&shapes.length>0&&<svg className="tw-crop-lasso" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {shapes.map((s,i)=><polygon key={i} points={s.points.map(p=>`${p.x},${p.y}`).join(' ')} fill={s.op==='subtract'?'rgba(230,60,60,.28)':'rgba(35,120,240,.22)'} stroke={s.op==='subtract'?'#d33':'#235ee5'} strokeDasharray={s.op==='subtract'?'4 3':undefined} strokeWidth="2" vectorEffect="non-scaling-stroke"/>)}
    </svg>}
  </div>
}

function ZoomEditor({active,onClose,children,zoom,setZoom,tools}) {
  const card=React.useRef(null),viewport=React.useRef(null),close=React.useRef(onClose),[fit,setFit]=React.useState(600)
  close.current=onClose
  // Mount-only: capture the opener once so focus returns to it (not to the dialog) on close.
  React.useEffect(()=>{
    const opener=document.activeElement
    card.current?.focus()
    const key=e=>{if(e.key==='Escape'){e.stopPropagation();close.current()}}
    window.addEventListener('keydown',key,true)
    return()=>{window.removeEventListener('keydown',key,true);if(opener?.isConnected&&opener.focus)setTimeout(()=>opener.focus(),0)}
  },[])
  React.useLayoutEffect(()=>{
    const measure=()=>{const v=viewport.current;if(!v)return;const w=v.clientWidth-16,h=v.clientHeight-16;setFit(Math.max(160,Math.min(w,h*active.width/active.height)))}
    measure();const ro=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;if(ro&&viewport.current)ro.observe(viewport.current)
    return()=>ro?.disconnect()
  },[active.width,active.height])
  return <div className="tw-crop-zoom" role="dialog" aria-modal="true" aria-label={`放大裁剪：${active.label}`}>
    <div className="tw-crop-zoom-card" ref={card} tabIndex={-1}>
      <div className="tw-crop-zoom-bar">
        <strong>放大编辑 · {active.label}</strong>
        {tools}
        <label className="tw-zoom-level">缩放 {Math.round(zoom*100)}%<input type="range" min="1" max="4" step="0.25" value={zoom} aria-label="裁剪放大倍数" onChange={e=>setZoom(Number(e.target.value))}/></label>
        <button type="button" onClick={onClose}>完成并返回 ✕</button>
      </div>
      <div className="tw-crop-zoom-viewport" ref={viewport}>{children(fit*zoom)}</div>
    </div>
  </div>
}

export function CropPanel({active,rect,boxes,background,historyLength,picking,mode,lasso,busy,images=[],origin,
  onImport,onUndo,onColor,onPick,onMode,onBegin,onRect,onLasso,onClearLasso,onSample,onField,onBox,onSave,onDetect,onSaveBoxes,onSelectSource,onZoomAsset,onRename,onBackToOrigin}) {
  const [zoomed,setZoomed]=React.useState(false),[zoom,setZoom]=React.useState(1.5)
  React.useEffect(()=>{if(!active)setZoomed(false)},[active])
  const canvasProps={active,rect,background,picking,mode,lasso,busy,onBegin,onRect,onLasso,onSample}
  const modeTools=<>
    <button type="button" disabled={busy||!active} aria-pressed={mode==='lasso'} onClick={()=>onMode(mode==='lasso'?'rect':'lasso')}>{mode==='lasso'?'回到矩形框选':'手动套索框选'}</button>
    {mode==='lasso'&&<button type="button" disabled={busy||!lasso.length} onClick={onClearLasso}>清空套索</button>}
    <button type="button" disabled={busy||!historyLength} onClick={onUndo}>撤回裁剪编辑</button>
  </>
  const selectionNote=mode==='lasso'?(lasso.length?`套索 ${lasso.length} 段：${lasso.map(s=>s.op==='subtract'?'减':'加').join(' / ')}`:'尚未画出套索'):''
  const origin0=active&&(images.find(a=>a.id===active.sourceAssetId)??images.find(a=>a.id===origin))
  // 0.3.0: the library is the single asset picker; this strip only shows the current origin and its crops.
  const root=active&&(images.find(a=>a.id===active.sourceAssetId)??active)
  const rootCrops=root?images.filter(a=>a.sourceAssetId===root.id):[]
  // The zoom editor is rendered as a sibling: .tw-panel uses backdrop-filter, which would trap position:fixed.
  return <><section className="tw-panel" aria-label="本地裁剪工具">
    <div className="tw-section-title"><span>LOCAL / NO CREDITS</span><h2>裁成干净的建模参考</h2></div>
    <div className="tw-crop-toolbar">
      <label>换张图片（本地导入）<input aria-label="裁剪换张图片" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{const files=[...e.target.files];e.target.value='';onImport(files)}}/></label>
      <label>裁剪背景色<input aria-label="裁剪背景色" type="color" value={background} disabled={busy} onChange={e=>onColor(e.target.value)}/></label>
      <button disabled={busy||!active} aria-pressed={picking} onClick={onPick}>{picking?'取消取色':'从图片取背景色'}</button>
      {modeTools}
      <button type="button" className="tw-primary" disabled={!active} onClick={()=>setZoomed(true)}>⤢ 放大编辑</button>
    </div>
    {active?<>
      {origin0&&origin0.id!==active.id&&<div className="tw-origin-bar"><span>当前是裁剪图「{active.label}」</span><button type="button" onClick={()=>onBackToOrigin(origin0)}>↩ 换回原图「{origin0.label}」</button></div>}
      <div className="tw-crop-viewport">
        <CropCanvas {...canvasProps} label="裁剪画布" width={Math.min(active.width,active.width*520/active.height)}/>
      </div>
      <small>图片按比例缩入画布；矩形拖拽，或套索沿边缘拖动：直接拖＝新选区，<b>Shift</b>＋拖＝添加，<b>Alt</b>＋拖＝减去。精细操作请用「放大编辑」。套索外像素用背景色填充成方图；撤回最多40步，不删除已保存资产、不上传。{selectionNote&&<> {selectionNote}</>}</small>
      <div className="tw-crop-fields">{['x','y','w','h'].map(k=><label key={k}>{k.toUpperCase()} %<input aria-label={`裁剪 ${k}`} type="number" min="0" max="100" value={Math.round(rect[k])} onChange={e=>onField({...rect,[k]:Number(e.target.value)})}/></label>)}</div>
      <div className="tw-actions"><button className="tw-primary" disabled={busy||(mode==='lasso'&&!lasso.length)} onClick={onSave}>保存当前裁剪</button><button disabled={busy} onClick={onDetect}>检测分离区域（本地）</button></div>
      {boxes.length>0&&<div className="tw-candidates">{boxes.map((b,i)=><button key={i} onClick={()=>onBox(b,i)}>候选 {i+1}</button>)}<button disabled={busy} onClick={onSaveBoxes}>保存这 {boxes.length} 个候选裁剪</button></div>}
      <p className="tw-note">自动检测基于边缘背景泛洪与连通域，最多36个候选而非语义分割；浅色、相连或重叠部件请用矩形／套索人工核对。保存裁剪后仍停留在原图，便于连续裁剪下一个部件。</p>
    </>:<p className="tw-placeholder">先在左侧资产库导入或点击一张图片作为裁剪来源。</p>}
    {root&&<div className="tw-asset-strip tw-origin-strip" aria-label="原图与已裁部件">
      <h3>原图 → 已裁部件 <small>{rootCrops.length?`「${root.label}」已裁出 ${rootCrops.length} 张 · 点击切换裁剪来源`:'保存裁剪后会出现在这里'}</small></h3>
      <div className="tw-origin-row">{[root,...rootCrops].map((a,i)=><React.Fragment key={a.id}>{i===1&&<span className="tw-origin-arrow" aria-hidden="true">→</span>}<ImageTile compact asset={a} busy={busy} selected={active?.id===a.id} pickLabel="切换裁剪来源" zoomLabel="放大裁剪图" badge={i===0?'原图':'由原图裁出'} onSelect={onSelectSource} onZoom={onZoomAsset}/></React.Fragment>)}</div>
    </div>}
  </section>
    {zoomed&&active&&<ZoomEditor active={active} zoom={zoom} setZoom={setZoom} onClose={()=>setZoomed(false)} tools={<>{modeTools}<span className="tw-zoom-hint">{mode==='lasso'?'Shift 添加 · Alt 减去':'拖动框选'}{selectionNote&&` · ${selectionNote}`}</span><button type="button" className="tw-primary" disabled={busy||(mode==='lasso'&&!lasso.length)} onClick={onSave}>保存当前裁剪</button></>}>
      {w=><CropCanvas {...canvasProps} label="放大裁剪画布" width={w}/>}
    </ZoomEditor>}
  </>
}
