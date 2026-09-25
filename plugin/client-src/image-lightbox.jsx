import React from 'react'

/** Local project image only: never display signed upstream URLs in the browser. */
export function ImageLightbox({asset,onClose}) {
  const closeRef=React.useRef(null),previousFocus=React.useRef(null),closeCallback=React.useRef(onClose)
  closeCallback.current=onClose
  React.useEffect(()=>{
    if(!asset)return undefined
    previousFocus.current=document.activeElement
    closeRef.current?.focus()
    const key=e=>{if(e.key==='Escape'){e.preventDefault();closeCallback.current()}}
    window.addEventListener('keydown',key)
    return ()=>{window.removeEventListener('keydown',key);previousFocus.current?.focus?.()}
  },[asset?.id])
  if(!asset)return null
  return <div className="tw-lightbox" role="dialog" aria-modal="true" aria-label={`放大图片：${asset.label}`} onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="tw-lightbox-card">
      <div className="tw-lightbox-header"><h2>{asset.label}</h2><button ref={closeRef} onClick={onClose} aria-label="关闭图片预览">关闭 ✕</button></div>
      <img src={asset.url} alt={asset.label}/>
      <div><small>{asset.width}×{asset.height} · 本机资产 · 图片不上传</small><a href={`${asset.url}&download=1`} download>下载原图</a></div>
    </div>
  </div>
}
