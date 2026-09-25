import React from 'react'

// Native top-layer dialog: independent of toolbar layout, host overflow and z-index.
export function FloatingPanel({label,title=label,children,className=''}) {
  const dialog=React.useRef(null),trigger=React.useRef(null),id=React.useId()
  const [open,setOpen]=React.useState(false)
  const close=()=>{dialog.current?.close();setOpen(false);trigger.current?.focus()}
  return <span className={`tw-floating ${className}`}>
    <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      onClick={()=>{dialog.current.showModal();setOpen(true)}}>{label}</button>
    <dialog ref={dialog} id={id} className="tw-floating-dialog" aria-label={title}
      onClose={()=>{setOpen(false);trigger.current?.focus()}}
      onClick={e=>{if(e.target!==dialog.current)return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}}>
      <div className="tw-floating-heading"><strong>{title}</strong><button type="button" onClick={close} aria-label={`关闭${title}`}>关闭 ×</button></div>
      {children}
    </dialog>
  </span>
}
