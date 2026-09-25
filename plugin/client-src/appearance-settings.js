// Tripo-owned preferences. No dependency on third-party sizing state.
export const APPEARANCE_KEY = 'tripo-studio:appearance:v2'
export const LEGACY_APPEARANCE_KEY = 'tripo-studio:appearance:v1'
export const CONTROL_LIMITS = Object.freeze({height:[28,56],fontSize:[11,18],gap:[4,16],panelWidth:[220,420]})
export const CONTROL_PRESETS = Object.freeze({
  mini: Object.freeze({height:28,fontSize:11,gap:4,panelWidth:220}),
  compact: Object.freeze({height:28,fontSize:12,gap:6,panelWidth:248}),
  standard: Object.freeze({height:36,fontSize:13,gap:10,panelWidth:280}),
  comfortable: Object.freeze({height:40,fontSize:14,gap:12,panelWidth:300}),
  large: Object.freeze({height:52,fontSize:17,gap:16,panelWidth:380}),
  spacious: Object.freeze({height:44,fontSize:15,gap:14,panelWidth:320}),
})
export function normalizeControls(value) {
  return Object.fromEntries(Object.entries(CONTROL_LIMITS).map(([key,[low,high]]) => {
    const v=value?.[key]
    return [key,typeof v==='number' && Number.isFinite(v) ? Math.round(Math.min(high,Math.max(low,v))) : CONTROL_PRESETS.standard[key]]
  }))
}
export const PALETTE_DEFAULTS=Object.freeze({baseColor:'',toolbarColor:'',accentColor:'',titlebarGlass:true,blur:20,controlOpacity:92,titlebarOpacity:82})
export const colorValue=value=>typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():''
export function onColor(hex) {
  const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
  return c[0]*.2126+c[1]*.7152+c[2]*.0722>.179?'#102018':'#ffffff'
}
export function normalizeAppearance(value) {
  return {version:2,
    controlOpacity:typeof value?.controlOpacity==='number'&&Number.isFinite(value.controlOpacity)?Math.round(Math.max(0,Math.min(100,value.controlOpacity))):92,
    titlebarOpacity:typeof value?.titlebarOpacity==='number'&&Number.isFinite(value.titlebarOpacity)?Math.round(Math.max(0,Math.min(100,value.titlebarOpacity))):82,
    baseColor:colorValue(value?.baseColor),toolbarColor:colorValue(value?.toolbarColor),accentColor:colorValue(value?.accentColor),
    titlebarGlass:typeof value?.titlebarGlass==='boolean'?value.titlebarGlass:true,
    blur:typeof value?.blur==='number' && Number.isFinite(value.blur)?Math.round(Math.max(4,Math.min(40,value.blur))):20,
    theme:['host','light','dark'].includes(value?.theme)?value.theme:'host',
    surface:value?.surface==='solid'?'solid':'glass',
    controls:normalizeControls(value?.controls),
    opacity: typeof value?.opacity==='number' && Number.isFinite(value.opacity) ? Math.round(Math.min(100,Math.max(0,value.opacity))) : 92,
    textColor:typeof value?.textColor==='string' && /^#[0-9a-f]{6}$/i.test(value.textColor) ? value.textColor.toLowerCase() : ''}
}
export function migrateAppearance(current,legacy) {
  // Only migrate OUR prior theme/surface; external plugin dimensions are never read.
  return normalizeAppearance(current && typeof current==='object' && !Array.isArray(current) ? current : legacy)
}
