import React from 'react'

// 0.2.12 shared image tile: the picture itself selects, a centred hover/focus button zooms,
// and a top-right pencil renames. Zoom and rename never change the selected input.
export function RenameButton({asset,busy,onRename}) {
  const [editing,setEditing]=React.useState(false),[value,setValue]=React.useState(asset.label)
  const input=React.useRef(null),opener=React.useRef(null)
  React.useEffect(()=>{if(editing){input.current?.focus();input.current?.select()}},[editing])
  if(!onRename)return null
  const close=()=>{setEditing(false);setValue(asset.label);setTimeout(()=>opener.current?.focus(),0)}
  const save=async()=>{const next=value.trim();if(!next||next===asset.label){close();return}const ok=await onRename(asset,next);if(ok!==false){setEditing(false);setTimeout(()=>opener.current?.focus(),0)}}
  return <div className="tw-rename" onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}>
    {editing?<form className="tw-rename-form" onSubmit={e=>{e.preventDefault();void save()}}>
      <input ref={input} aria-label={`新名称：${asset.label}`} maxLength={100} value={value} disabled={busy} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}}}/>
      <button type="submit" disabled={busy||!value.trim()}>保存</button><button type="button" onClick={close}>取消</button>
    </form>:<button ref={opener} type="button" className="tw-rename-open" title="重命名" aria-label={`重命名图片：${asset.label}`} disabled={busy} onClick={()=>{setValue(asset.label);setEditing(true)}}>✎</button>}
  </div>
}

export function ImageTile({asset,selected,busy,onSelect,onZoom,onRename,badge,children,compact,pickLabel='选择图片',zoomLabel='放大图片'}) {
  return <div className={`tw-image-tile ${compact?'compact':''}`}>
    <div className={`tw-image-card tw-pick-card ${selected?'chosen':''}`}>
      <button type="button" className="tw-pick-area" aria-pressed={selected} aria-label={pickLabel==='选择图片'?`${selected?'已选择':'选择'}图片：${asset.label}`:`${pickLabel}${selected?'（当前）':''}：${asset.label}`} onClick={()=>onSelect?.(asset)}>
        <img src={asset.url} alt={asset.label} draggable="false"/>
        <span className="tw-pick-caption"><strong>{asset.label}</strong><small>{asset.width}×{asset.height}{badge?` · ${badge}`:''}{selected?' · 已选':''}</small></span>
      </button>
      {onZoom&&<button type="button" className="tw-zoom-hover" aria-label={`${zoomLabel}：${asset.label}`} title="放大查看" onClick={e=>{e.stopPropagation();onZoom(asset)}}>⤢</button>}
      <RenameButton asset={asset} busy={busy} onRename={onRename}/>
    </div>
    {children}
  </div>
}
