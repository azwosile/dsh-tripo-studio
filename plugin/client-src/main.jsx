/**
 * dsh-tripo-studio — client half (DSH main-panel workbench).
 *
 * Loaded through the Harness client module loader:
 *   window.__ModuleLoader__.load({ id, factory })
 * The factory materializes on first import and returns a Cordis plugin
 * ({ inject, apply }) that contributes:
 *   - a `sidebar.panellist` row (key === the main panel id)
 *   - a `main` keyed panel — the workbench, opened inside DSH
 *
 * Workflow uses the backend approval service; the separate 3D preview tab is a
 * read-only local viewer + 3D asset library (0.3.1). Appearance is panel-scoped.
 */
import React from 'react'
import {Preview3D} from './preview-3d.jsx'
import {css} from './styles.js'
import {Workflow} from './workflow.jsx'
import {workflowCss} from './workflow-styles.js'
import {credentialCss} from './credential-settings.jsx'
import {useAppearance, AppearanceControls} from './appearance.js'
import {appearanceCss} from './appearance-styles.js'
import {studioCss} from './studio-styles.js'
import {v033Css} from './v033-styles.js'

const NS = 'tripoStudio'
const PANEL_ID = 'tripo-studio'
const STYLE_ID = 'dsh-tripo-studio/styles'

const zh = {
  'sidebar.title': 'Tripo 3D 工作台',
  'panel.title': 'Tripo 3D 工作台',
  'panel.subtitle': '在 DSH 内完成从想法到 3D 资产的创作',
  'panel.badge': '预览工具 · 左栏生成为离线演示',
  'create.section': '创建资产',
  'create.step': '01 / CREATE',
  'mode.text': '文字生成',
  'mode.image': '图片生成',
  'prompt.label': '你的创意',
  'prompt.placeholder': '描述主体、材质与风格…',
  'prompt.counter': '{n} / 1024',
  'ref.label': '参考图片',
  'ref.drop': '点击或拖入参考图',
  'ref.hint': 'PNG / JPG / WebP · 最大 20 MB',
  'ref.replace': '更换参考图',
  'style.label': '视觉风格',
  'style.stylized': '风格化',
  'style.lowpoly': '低多边形',
  'style.realistic': '写实',
  'version.label': '模型版本',
  'quality.label': '几何质量',
  'quality.standard': '标准',
  'quality.fine': '精细',
  'faces.label': '目标面数',
  'faces.light': '轻量',
  'faces.detail': '细节优先',
  'pbr.label': '生成 PBR 材质',
  'pbr.hint': '更自然的光照与表面质感',
  'cost.label': '预计消耗',
  'cost.value': '演示 · 不扣积分',
  'generate': '生成 3D 模型',
  'generate.busy': '正在模拟生成…',
  'generate.note': '当前为程序化示例，不调用 Tripo API',
  'import': '＋ 导入本地 3D 文件',
  'viewport.perspective': 'PERSPECTIVE / STUDIO',
  'viewport.hint': '拖拽旋转 · 滚轮缩放 · 右键平移',
  'tool.reset': '重置视角',
  'tool.wire': '切换线框',
  'tool.rotate': '自动旋转',
  'tool.grid': '显示网格',
  'tool.shot': '保存截图',
  'foot.triangles': '三角面',
  'foot.material': 'PBR 材质',
  'foot.local': '本地程序化示例',
  'foot.imported': '本地 3D 文件',
  'tag.demo': '示例模型',
  'tag.local': '本地模型',
  'detail.section': '资产详情',
  'detail.inspect': 'INSPECT',
  'detail.ready': '● 可预览',
  'detail.info': '模型信息',
  'detail.source': '来源',
  'detail.source.demo': '演示资产',
  'detail.material': '材质',
  'detail.units': '个',
  'detail.size': '尺寸',
  'detail.animation': '动画',
  'detail.none': '无',
  'detail.scene': '场景设置',
  'detail.background': '背景色',
  'detail.exposure': '光照强度',
  'detail.export.title': '让创意走得更远',
  'detail.export.body': '将当前预览模型保存为 GLB，继续在其它 3D 工具中创作。',
  'detail.export.button': '导出当前模型',
  'detail.export.note': '导出的是当前示例或导入模型',
  'assets.recent': '最近资产',
  'assets.jobs': '任务队列',
  'assets.session': '◉ 仅本次会话',
  'assets.empty': '还没有任务。写下一个想法，体验第一次创作。',
  'toast.wait': '请等待当前演示任务完成',
  'toast.image.type': '请选择 20 MB 以内的 PNG、JPG 或 WebP',
  'toast.model.size': '模型不能超过 150 MB',
  'toast.imported': '模型仅在本地读取，未上传',
  'toast.exported': '已导出当前预览几何体（不是 AI 生成结果）',
  'toast.export.fail': '导出失败：{message}',
  'toast.import.fail': '3D 文件加载失败：{message}',
  'toast.demo.done': '演示完成，示例资产已加入最近资产',
  'toast.need.prompt': '请先描述你的创意',
  'toast.need.image': '请先选择参考图片',
  'confirm.title': '开始一次演示创作？',
  'confirm.body': '你将体验排队、生成与资产入库的完整交互。此演示不调用 AI，结果是程序化机器人变体，不会根据文字或图片生成模型。',
  'confirm.cost': '费用：0 积分',
  'confirm.local': '图片：仅保留在当前窗口',
  'confirm.params': '参数：用于演示交互，不代表真实生成效果',
  'confirm.ok': '确认，开始演示',
  'confirm.cancel': '取消',
  'phase.queued': '排队中',
  'phase.geometry': '构建几何体',
  'phase.material': '模拟材质处理',
  'phase.preview': '准备预览资产',
  'job.demo': '演示任务',
  'job.done': '演示完成 · 非 AI 生成',
  'fallback': '此设备暂时无法初始化 WebGL，参数与任务流程仍可使用；请在支持 WebGL 的窗口中打开该面板。'
}

const en = {
  'sidebar.title': 'Tripo 3D Workbench',
  'panel.title': 'Tripo 3D Workbench',
  'panel.subtitle': 'From idea to 3D asset without leaving DSH',
  'panel.badge': 'Preview tools · left-side generation is a local demo',
  'create.section': 'Create asset',
  'create.step': '01 / CREATE',
  'mode.text': 'Text to 3D',
  'mode.image': 'Image to 3D',
  'prompt.label': 'Your idea',
  'prompt.placeholder': 'Describe subject, material and style…',
  'prompt.counter': '{n} / 1024',
  'ref.label': 'Reference image',
  'ref.drop': 'Click or drop a reference image',
  'ref.hint': 'PNG / JPG / WebP · up to 20 MB',
  'ref.replace': 'Replace image',
  'style.label': 'Visual style',
  'style.stylized': 'Stylized',
  'style.lowpoly': 'Low poly',
  'style.realistic': 'Realistic',
  'version.label': 'Model version',
  'quality.label': 'Geometry quality',
  'quality.standard': 'Standard',
  'quality.fine': 'Fine',
  'faces.label': 'Target faces',
  'faces.light': 'Light',
  'faces.detail': 'Detail first',
  'pbr.label': 'Generate PBR materials',
  'pbr.hint': 'More natural lighting and surface response',
  'cost.label': 'Estimated cost',
  'cost.value': 'Demo · no credits',
  'generate': 'Generate 3D model',
  'generate.busy': 'Simulating generation…',
  'generate.note': 'Procedural sample only — no Tripo API call',
  'import': '＋ Import local 3D file',
  'viewport.perspective': 'PERSPECTIVE / STUDIO',
  'viewport.hint': 'Drag to orbit · wheel to zoom · right-drag to pan',
  'tool.reset': 'Reset view',
  'tool.wire': 'Toggle wireframe',
  'tool.rotate': 'Auto rotate',
  'tool.grid': 'Toggle grid',
  'tool.shot': 'Save screenshot',
  'foot.triangles': 'triangles',
  'foot.material': 'PBR material',
  'foot.local': 'Local procedural sample',
  'foot.imported': 'Local 3D file',
  'tag.demo': 'Sample',
  'tag.local': 'Local',
  'detail.section': 'Asset details',
  'detail.inspect': 'INSPECT',
  'detail.ready': '● Preview ready',
  'detail.info': 'Model info',
  'detail.source': 'Source',
  'detail.source.demo': 'Demo asset',
  'detail.material': 'Materials',
  'detail.units': '',
  'detail.size': 'Size',
  'detail.animation': 'Animation',
  'detail.none': 'None',
  'detail.scene': 'Scene settings',
  'detail.background': 'Background',
  'detail.exposure': 'Exposure',
  'detail.export.title': 'Take it further',
  'detail.export.body': 'Save the preview as GLB and keep creating in your other 3D tools.',
  'detail.export.button': 'Export current model',
  'detail.export.note': 'Exports the current sample or imported model',
  'assets.recent': 'Recent assets',
  'assets.jobs': 'Job queue',
  'assets.session': '◉ This session only',
  'assets.empty': 'No jobs yet. Describe an idea and try the first creation.',
  'toast.wait': 'Wait for the demo job to finish',
  'toast.image.type': 'Choose a PNG, JPG or WebP under 20 MB',
  'toast.model.size': 'Model must stay under 150 MB',
  'toast.imported': 'Read locally — nothing was uploaded',
  'toast.exported': 'Exported the current preview geometry (not AI output)',
  'toast.export.fail': 'Export failed: {message}',
  'toast.import.fail': '3D file load failed: {message}',
  'toast.demo.done': 'Demo finished — the sample asset joined Recent assets',
  'toast.need.prompt': 'Describe your idea first',
  'toast.need.image': 'Choose a reference image first',
  'confirm.title': 'Start a demo creation?',
  'confirm.body': 'You will walk through queueing, generating and storing an asset. This demo calls no AI: the result is a procedural robot variant, not a model generated from your text or image.',
  'confirm.cost': 'Cost: 0 credits',
  'confirm.local': 'Image: stays in this window',
  'confirm.params': 'Parameters: drive the walkthrough only',
  'confirm.ok': 'Confirm, start demo',
  'confirm.cancel': 'Cancel',
  'phase.queued': 'Queued',
  'phase.geometry': 'Building geometry',
  'phase.material': 'Simulating materials',
  'phase.preview': 'Preparing preview asset',
  'job.demo': 'Demo job',
  'job.done': 'Demo complete · not AI generated',
  'fallback': 'WebGL is unavailable here. Parameters and the job flow still work; open this panel in a WebGL-capable window.'
}

/** Fill `{name}` placeholders in a dictionary string. */
const fill = (text, params) => String(text).replace(/\{(\w+)\}/g, (_, key) => (params?.[key] ?? ''))

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return () => {}
  const tag = document.createElement('style')
  tag.id = STYLE_ID
  tag.setAttribute('data-plugin-css', 'dsh-tripo-studio')
  tag.textContent = css + workflowCss + appearanceCss + credentialCss + studioCss + v033Css
  document.head.appendChild(tag)
  return () => tag.remove()
}

/** Sidebar row glyph: a wireframe cube, colored by the active state. */
function SidebarIcon(props) {
  const size = props?.size ?? 18
  const color = props?.active ? 'currentColor' : 'currentColor'
  return React.createElement(
    'span',
    {className: 'tps-side', 'aria-hidden': 'true'},
    React.createElement(
      'svg',
      {width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.5},
      React.createElement('path', {d: 'M12 3 4 7.2v9.6L12 21l8-4.2V7.2L12 3Z', strokeLinejoin: 'round'}),
      React.createElement('path', {d: 'M4 7.2 12 11.4l8-4.2M12 11.4V21', strokeLinejoin: 'round'})
    )
  )
}

class PanelBoundary extends React.Component {
  constructor(props) { super(props); this.state = {error: null} }
  static getDerivedStateFromError(error) { return {error: error.message} }
  render() {
    if (this.state.error) return React.createElement('div', {className: 'tw-boundary'},
      React.createElement('h2', null, 'Tripo 面板遇到错误，已在插件内部隔离'),
      React.createElement('p', null, this.state.error),
      React.createElement('button', {onClick: () => this.setState({error: null})}, '重新打开面板'))
    return this.props.children
  }
}
function WorkbenchShell(props) {
  const appearance = useAppearance()
  const [tab, setTab] = React.useState('workflow')
  const [asset, setAsset] = React.useState(null)
  const t = (key, params) => fill(props?.t ? props.t(key) : zh[key] ?? key, params)
  return React.createElement(PanelBoundary, null,
    React.createElement('div', {className: 'tw-shell', ref:appearance.shellRef, 'data-custom-base':Boolean(appearance.settings.baseColor), 'data-custom-top':Boolean(appearance.settings.toolbarColor), 'data-custom-accent':Boolean(appearance.settings.accentColor), 'data-custom-opacity':appearance.settings.opacity!==92, 'data-custom-text':Boolean(appearance.settings.textColor), 'data-theme': appearance.theme, 'data-theme-mode': appearance.settings.theme, 'data-surface': appearance.settings.surface, style: appearance.style},
      React.createElement('div', {className: 'tw-topnav'},
       React.createElement('nav', {className: 'tw-nav-tabs', role: 'tablist', 'aria-label': '工作台页面'},
        React.createElement('button', {role: 'tab', 'aria-selected': tab === 'workflow', onClick: () => setTab('workflow')}, '创作'),
        React.createElement('button', {role: 'tab', 'aria-selected': tab === 'preview', onClick: () => setTab('preview')}, '3D 预览')),
       React.createElement(AppearanceControls, {appearance})),
      tab === 'workflow'
        ? React.createElement(Workflow, {onPreview: (next) => {setAsset(next); setTab('preview')}})
        : React.createElement(React.Fragment,null,React.createElement('p',{className:'tw-preview-help'},'3D 预览：打开项目中已下载的模型或本机 GLB／自包含GLTF／FBX／OBJ／STL，调整视角、截图并导出展示副本；USDZ／3MF 仅供下载。本页只做本地查看，不联网生成、不消耗积分；云端建模请回到「创作」。'),React.createElement(Preview3D, {t, asset}))))
}

/** Plugin metadata (mirrors the cordis plugin face of this bundle). */
export const name = 'tripo-studio'
export const inject = ['slots', 'locale']

/**
 * Register the workbench into the DSH shell.
 * @param ctx - client root context carrying `slots`/`locale`/`layout`.
 */
export function apply(ctx) {
  ctx.effect(() => injectStyles(), 'tripo-studio: styles')
  if (typeof ctx.locale?.register === 'function') {
    ctx.effect(() => ctx.locale.register(NS, {zh, en}), 'tripo-studio: dictionaries')
  }

  const install = (slot, factory) => {
    // The target slot may be declared after this plugin activates; `slots.inject`
    // waits for the declaration, with a polling fallback for older surfaces.
    if (typeof ctx.slots?.inject === 'function') {
      try {
        return ctx.slots.inject(slot, factory)
      } catch (error) {
        ctx.logger?.warn?.(`tripo-studio: slots.inject(${slot}) failed: ${error?.message ?? error}`)
      }
    }
    let dispose = null
    let tries = 0
    let timer = null
    const attempt = () => {
      try {
        dispose = factory()
      } catch (error) {
        if (tries < 40) {
          tries += 1
          timer = window.setTimeout(attempt, 250)
        } else {
          ctx.logger?.warn?.(`tripo-studio: slot ${slot} never became available`)
        }
      }
    }
    attempt()
    return () => {
      if (timer) window.clearTimeout(timer)
      if (typeof dispose === 'function') dispose()
    }
  }

  ctx.effect(
    () => install('sidebar.panellist', () =>
      ctx.slots.register({name: 'sidebar.panellist', id: PANEL_ID, order: 32, label: () => 'Tripo Studio', locale: NS}, SidebarIcon)
    ),
    'tripo-studio: sidebar row'
  )

  ctx.effect(
    () => install('main', () => ctx.slots.register({name: 'main', key: PANEL_ID, locale: NS}, WorkbenchShell)),
    'tripo-studio: workbench panel'
  )
}
