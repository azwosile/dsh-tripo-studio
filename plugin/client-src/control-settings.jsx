import React from 'react'
import {FloatingPanel} from './floating-panel.jsx'
import {PALETTE_DEFAULTS,CONTROL_LIMITS,CONTROL_PRESETS,normalizeControls} from './appearance-settings.js'

const FIELDS=[['height','控件高度'],['fontSize','控件字号'],['gap','控件间距'],['panelWidth','3D 参数栏宽度']]
export function ControlSettings({controls,onChange}) {
  const [draft,setDraft]=React.useState(controls)
  const [message,setMessage]=React.useState('')
  React.useEffect(()=>{setDraft(controls)},[controls])
  const apply=next=>{onChange(next);setDraft(next);setMessage('已应用，仅影响 Tripo 工作台。')}
  return <FloatingPanel className="tw-control-settings" label="控件尺寸" title="独立控件尺寸设置">
    <form className="tw-control-form" aria-label="独立控件尺寸设置" onSubmit={e=>{
      e.preventDefault()
      apply(normalizeControls(Object.fromEntries(FIELDS.map(([key])=>[key,Number(draft[key])]))))
    }}>
      <p>内置尺寸设置，无需其他插件。宽度用于 3D 页的左侧参数栏，窄栏自动重排。</p>
      <div className="tw-size-presets" role="group" aria-label="尺寸预设">
        {Object.entries({mini:'极简',compact:'紧凑',standard:'标准',comfortable:'舒适',spacious:'宽松',large:'大字'}).map(([key,label])=><button type="button" key={key}
          aria-pressed={Object.keys(controls).every(k=>controls[k]===CONTROL_PRESETS[key][k])}
          onClick={()=>apply({...CONTROL_PRESETS[key]})}>{label}</button>)}
      </div>
      <div className="tw-size-fields">{FIELDS.map(([key,label])=><label key={key}>{label}（px）
        <input type="number" required step="1" min={CONTROL_LIMITS[key][0]} max={CONTROL_LIMITS[key][1]}
          aria-label={label} value={draft[key]} onChange={e=>{setDraft({...draft,[key]:e.target.value});setMessage('')}}/>
      </label>)}</div>
      <div className="tw-size-presets"><button type="submit">应用尺寸</button>
        <button type="button" onClick={()=>apply({...CONTROL_PRESETS.standard})}>重置尺寸</button></div>
      <small aria-live="polite">{message||'高度 28–56 · 字号 11–18 · 间距 4–16 · 栏宽 220–420。'}</small>
    </form>
  </FloatingPanel>
}
export function AppearanceControls({appearance}) {
  const {settings,update}=appearance
  return <div className="tw-appearance" role="group" aria-label="工作台外观">
    <label><span>主题</span><select aria-label="工作台主题" value={settings.theme} onChange={e=>update({theme:e.target.value})} title="跟随 DSH Desktop；手动浅色/夜间仅作用于本工作台，包括左侧参数栏。">
      <option value="host">跟随 DSH</option><option value="light">浅色</option><option value="dark">夜间</option>
    </select></label>
    <label><span>面板</span><select aria-label="工作台面板" value={settings.surface} onChange={e=>update({surface:e.target.value})}>
      <option value="glass">毛玻璃</option><option value="solid">实色 · 高对比</option>
    </select></label>
    <FloatingPanel label="界面外观" title="界面配色与毛玻璃">
      <div className="tw-visual-form">
        <fieldset className="tw-color-fields"><legend>界面配色（即时预览）</legend>
          {[['baseColor','界面底色',appearance.theme==='dark'?'#131c24':'#f3f5f3'],['toolbarColor','顶部栏颜色',appearance.theme==='dark'?'#202c37':'#ffffff'],['accentColor','强调色',appearance.theme==='dark'?'#a6dfc4':'#315d49']].map(([key,label,fallback])=><label key={key}>{label}<input type="color" aria-label={label} value={settings[key]||fallback} onChange={e=>update({[key]:e.target.value})}/><small>{settings[key]||'跟随主题'}</small></label>)}
          <div className="tw-size-presets"><button type="button" onClick={()=>update({baseColor:'#172b35',toolbarColor:'#243e4b',accentColor:'#8fdbc8',textColor:'#edf4f7',theme:'dark'})}>深海青</button><button type="button" onClick={()=>update({baseColor:'#2b2339',toolbarColor:'#40314f',accentColor:'#d8b4ef',textColor:'#f7edff',theme:'dark'})}>暮紫</button><button type="button" onClick={()=>update({baseColor:'#f3ede3',toolbarColor:'#e6d8c6',accentColor:'#785832',textColor:'#30291f',theme:'light'})}>暖砂</button><button type="button" onClick={()=>update({baseColor:'',toolbarColor:'',accentColor:''})}>配色跟随主题</button></div>
        </fieldset>
        <label>毛玻璃模糊：{settings.blur}px<input aria-label="毛玻璃模糊" type="range" min="4" max="40" step="1" value={settings.blur} onChange={e=>update({blur:Number(e.target.value)})}/></label>
        <label className="tw-titlebar-switch"><input type="checkbox" aria-label="Tripo 标题栏毛玻璃" checked={settings.titlebarGlass} onChange={e=>update({titlebarGlass:e.target.checked})}/>Tripo 标题栏毛玻璃</label>
        <small>仅在 Windows DSH 的 Tripo 面板可见时生效，离开后恢复。原生按钮保持宿主主题；标题栏颜色会作对比度保护。普通网页不添加窗口标题栏。</small>
        <label>界面背景不透明度：{settings.opacity}%<input aria-label="界面背景不透明度" type="range" min="0" max="100" step="1" value={settings.opacity} onChange={e=>update({opacity:Number(e.target.value),surface:'glass'})}/></label>
        <small>0% 为全透明背景，100% 为不透明；文字、图片不一起变淡。修改后使用毛玻璃模式，实色模式始终不透明。</small>
        {settings.opacity<35&&<p>背景很透明时可读性会降低，请配合字体颜色或恢复默认。</p>}
        <label>普通控件背景不透明度：{settings.controlOpacity}%<input aria-label="普通控件背景不透明度" type="range" min="0" max="100" value={settings.controlOpacity} onChange={e=>update({controlOpacity:Number(e.target.value),surface:'glass'})}/></label><label>标题区域背景不透明度：{settings.titlebarOpacity}%<input aria-label="标题区域背景不透明度" type="range" min="0" max="100" value={settings.titlebarOpacity} onChange={e=>update({titlebarOpacity:Number(e.target.value),surface:'glass'})}/></label><small>只改变背景，不降低文字、图片或原生按钮不透明度。审批、凭据、目录确认和下拉选项保持实色可读；低透明度需自行检查壁纸对比度。</small><label>字体颜色<input aria-label="自定义字体颜色" type="color" value={settings.textColor|| (appearance.theme==='dark'?'#edf4f7':'#202e28')} onChange={e=>update({textColor:e.target.value})}/></label>
        <p>{settings.textColor||'自动跟随当前主题'} · 正文与次级文字；错误 / 成功状态保留提示色。</p>
        <div className="tw-size-presets"><button type="button" onClick={()=>update({textColor:''})}>字体跟随主题</button><button type="button" onClick={()=>update({...PALETTE_DEFAULTS,opacity:92,textColor:'',surface:'glass'})}>恢复默认外观</button></div>
        <small>只保存 Tripo 自己的外观偏好，不修改 DSH 或壁纸设置。弹出设置保持实色，避免透明后找不到恢复按钮。</small>
      </div>
    </FloatingPanel>
    <ControlSettings controls={settings.controls} onChange={controls=>update({controls})}/>
  </div>
}
