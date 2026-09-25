import React from 'react'
import {useTitlebarGlass} from './titlebar-glass.js'
import {onColor} from './appearance-settings.js'
import {APPEARANCE_KEY, LEGACY_APPEARANCE_KEY, normalizeAppearance, migrateAppearance} from './appearance-settings.js'
export {AppearanceControls} from './control-settings.jsx'

function stored(key) {
  try { return JSON.parse(window.localStorage.getItem(key)) } catch { return null }
}
function readAppearance() { return migrateAppearance(stored(APPEARANCE_KEY),stored(LEGACY_APPEARANCE_KEY)) }
function hostTheme() {
  // Verified with DSH 0.1.5-rc.2: theme uses presence of this body attribute.
  if (document.body.hasAttribute('data-ds-dark-theme')) return 'dark'
  const hostToken=getComputedStyle(document.body).getPropertyValue('--dsw-alias-label-primary').trim()
  if (hostToken) return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light'
}
export function useAppearance() {
  const [settings,setSettings]=React.useState(readAppearance)
  const [theme,setTheme]=React.useState(hostTheme)
  const shellRef=React.useRef(null),[hostInset,setHostInset]=React.useState(0)
  React.useLayoutEffect(()=>{
    const parameter=new URLSearchParams(window.location.search).get('dsh-desktop-titlebar-inset'),raw=Number(parameter)
    const inset=Math.min(96,Math.max(0,parameter!==null && Number.isFinite(raw) ? raw : (/Electron\//.test(navigator.userAgent)?36:0)))
    const measure=()=>setHostInset(Math.max(0,Math.ceil(inset-(shellRef.current?.getBoundingClientRect().top||0))))
    measure();const observer=new ResizeObserver(measure);if(shellRef.current)observer.observe(shellRef.current)
    window.addEventListener('resize',measure);document.addEventListener('fullscreenchange',measure)
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);document.removeEventListener('fullscreenchange',measure)}
  },[])
  React.useEffect(()=>{
    const updateTheme=()=>setTheme(hostTheme())
    const sync=event=>{if(event.key===null||event.key===APPEARANCE_KEY) setSettings(readAppearance())}
    const observer=new MutationObserver(updateTheme)
    observer.observe(document.body,{attributes:true,attributeFilter:['data-ds-dark-theme','class','style']})
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['class','style']})
    const media=window.matchMedia?.('(prefers-color-scheme: dark)')
    media?.addEventListener('change',updateTheme)
    window.addEventListener('storage',sync)
    return ()=>{observer.disconnect();media?.removeEventListener('change',updateTheme);window.removeEventListener('storage',sync)}
  },[])
  const update=patch=>setSettings(old=>{
    const next=normalizeAppearance({...old,...patch})
    try {window.localStorage.setItem(APPEARANCE_KEY,JSON.stringify(next))} catch {/* session-only fallback */}
    return next
  })
  useTitlebarGlass(shellRef,settings,theme)
  const c=settings.controls
  return {settings,update,shellRef,theme:settings.theme==='host'?theme:settings.theme,
    style:{'--tps-control-opacity':`${settings.controlOpacity}%`,'--tps-titlebar-opacity':`${settings.titlebarOpacity}%`,'--tps-user-base':settings.baseColor||undefined,'--tps-user-top':settings.toolbarColor||undefined,'--tps-user-accent':settings.accentColor||undefined,'--tps-user-on-accent':settings.accentColor?onColor(settings.accentColor):undefined,'--tps-top-text':settings.toolbarColor?onColor(settings.toolbarColor):undefined,'--tps-blur':`${settings.blur}px`,'--tps-host-inset':`${hostInset}px`,'--tps-user-opacity':`${settings.opacity}%`,'--tps-custom-text':settings.textColor||undefined,'--tps-control-height':`${c.height}px`,'--tps-control-font':`${c.fontSize}px`,
      '--tps-control-gap':`${c.gap}px`,'--tps-params-width':`${c.panelWidth}px`}}
}
