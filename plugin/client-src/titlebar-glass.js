// Plugin-owned decoration only: never mutate the host drag region, theme or native buttons.
import React from 'react'
export function desktopInset(search) {
  const value=new URLSearchParams(search).get('dsh-desktop-titlebar-inset')
  return value!==null && Number.isFinite(Number(value))?Math.min(96,Math.max(0,Number(value))):0
}
export function useTitlebarGlass(shellRef,settings,hostTheme) {
  React.useLayoutEffect(()=>{
    const shell=shellRef.current
    if(!shell)return
    const inset=desktopInset(location.search)
    if(!inset)return
    const layer=document.createElement('div')
    layer.className='tripo-titlebar-glass';layer.setAttribute('aria-hidden','true')
    layer.style.setProperty('--tripo-titlebar-opacity',`${settings.surface==='solid'?100:settings.titlebarOpacity}%`)
    layer.style.setProperty('--tripo-titlebar-height',`${inset}px`)
    layer.style.setProperty('--tripo-titlebar-blur',`${settings.blur}px`)
    // Native symbols follow the HOST, not Tripo's independent light/dark choice.
    const base=hostTheme==='dark'?'#141416':'#f8f8f6'
    layer.style.setProperty('--tripo-titlebar-safe',base)
    layer.style.setProperty('--tripo-titlebar-tint',settings.toolbarColor||base)
    const sync=()=>{
      let visible=settings.titlebarGlass && document.body.classList.contains('dsh-desktop-windows-titlebar-layout') && shell.isConnected && !document.fullscreenElement && !document.hidden
      for(let p=shell;p&&visible;p=p.parentElement){const s=getComputedStyle(p);if(p.hidden||p.getAttribute('aria-hidden')==='true'||s.display==='none'||s.visibility==='hidden'||s.contentVisibility==='hidden'||s.opacity==='0')visible=false}
      const rect=shell.getBoundingClientRect();visible=visible&&rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight
      // Idempotent writes: avoid cycles with the host's DOM observer.
      if(layer.hidden===visible)layer.hidden=!visible
    }
    document.body.appendChild(layer)
    const observer=new MutationObserver(sync)
    for(let p=shell;p;p=p.parentElement)observer.observe(p,{attributes:true,attributeFilter:['style','class','hidden','aria-hidden']})
    const resize=new ResizeObserver(sync);resize.observe(shell)
    const intersection=new IntersectionObserver(sync);intersection.observe(shell)
    window.addEventListener('resize',sync);document.addEventListener('fullscreenchange',sync);document.addEventListener('visibilitychange',sync)
    sync()
    return()=>{observer.disconnect();resize.disconnect();intersection.disconnect();window.removeEventListener('resize',sync);document.removeEventListener('fullscreenchange',sync);document.removeEventListener('visibilitychange',sync);layer.remove()}
  },[shellRef,settings.titlebarGlass,settings.toolbarColor,settings.blur,settings.titlebarOpacity,settings.surface,hostTheme])
}
