// Public Tripo v3 contracts rechecked against CN + international docs on 2026-09-21.
import {promptCap} from './prompt-policy.js'
import {IMAGE_MODELS,IMAGE_SIZES,IMAGE_MODEL_INFO,isImageSize,modelAvailable} from './image-models.js'
export {IMAGE_MODELS,IMAGE_SIZES} from './image-models.js'
export const MODEL_VERSIONS = ['v3.1-20260211', 'v3.0-20250812', 'v2.5-20250123']
export const MODEL_FORMATS = ['GLTF', 'FBX', 'USDZ', 'OBJ', 'STL', '3MF']
export const KINDS = ['text-to-image', 'image-to-image', 'image-to-model', 'model-convert']
// Official H-series image-to-model face caps. Quad output is FBX, not GLB.
export function modelFaceMax(model, {quad = false, smart = false, geometry = 'standard'} = {}) {
  if (!MODEL_VERSIONS.includes(model)) return 0
  if (smart) return quad ? 10000 : 20000
  if (quad) return 150000
  if (model === 'v2.5-20250123') return 500000
  if (geometry === 'detailed') return 2000000
  return model === 'v3.1-20260211' ? 1500000 : 1000000
}
export const PARTS = [
  {id: 'body', name: '身体基准', priority: 'base'},
  {id: 'hair', name: '头发', priority: 'high'},
  {id: 'skirt', name: '裙装 / 外衣', priority: 'high'},
  {id: 'head', name: '头部', priority: 'normal'},
  {id: 'stockings', name: '长袜', priority: 'normal'},
  {id: 'shoes', name: '鞋子', priority: 'normal'},
  {id: 'accessories', name: '配饰', priority: 'normal'},
]
// 0.3.1 REQ-061: hair is extracted as ONE connected piece. Wording follows the user's tested
// prompt with character-specific traits (colour, length) generalised to "the input hairstyle".
export const HAIR_PROMPT = '图生图。保持输入图里角色的整顶发型不变（发色、长度和造型都照原样），删除其他所有内容，画面里只剩头发。\n只要一个部件：整顶发型作为一整块完整连成一体的头发，居中放在图片正中，正面视角，完整入画。\n不要分解、不要拆分部件、不要多块并排、不要留空隙、不要部件清单。\n排除脸和脸模，不要头、不要身体、不要手腿、不要衣服、不要文字。'
export const isHairPart = name => /头发|发型|hair/i.test(String(name || ''))
// 0.3.3 REQ-070: structured, generic templates (no character-specific traits, still user-editable in the UI).
// Each part category gets the one instruction that most often went wrong in 0.3.2 outputs.
const PART_RULES = [
  ['body', /身体|素体|基准|body|base/i, '作为比例基准：穿不透明贴身内衬的完整全身，标准 A 字站姿，双臂略张开，保持原身高与头身比例；不含头发、外衣、鞋和配饰，不要裸体。'],
  ['head', /头部|脸|面部|head|face/i, '只保留头部、脸和耳朵，不含头发（头发另行建模）；五官清晰，颈部在下颌下方平整截断。'],
  ['shoes', /鞋|靴|shoe|boot/i, '左右两只成对并排、间隔少许，正面略带俯视，鞋底和鞋跟完整可见；不要腿和袜子。'],
  ['legwear', /袜|腿|stocking|sock|leg/i, '左右两条成对并排，保持穿着时的腿部形状和完整长度；不要鞋、不要皮肤、不要身体其他部分。'],
  ['garment', /衣|裙|裤|袍|甲|外套|服|skirt|dress|coat|jacket|shirt|pants/i, '保持穿着时的立体形状和褶皱；领口、袖口、下摆等开口完整，内侧不露出身体（可见处用同色内里填充）。'],
  ['accessory', /饰|配件|发饰|首饰|帽|包|武器|道具|手持|accessor|weapon|prop|hat|bag/i, '单件完整、保持原尺寸比例；若有多件，逐件分开平铺排列并留出空隙，互不接触。'],
]
export function partCategory(name) {
  if (isHairPart(name)) return 'hair'
  return PART_RULES.find(([, re]) => re.test(String(name || '')))?.[0] ?? 'generic'
}
export function partPrompt(name) {
  if (isHairPart(name)) return HAIR_PROMPT
  const rule = PART_RULES.find(([, re]) => re.test(String(name || '')))?.[2] ?? '作为一件完整独立的部件，保持原有厚度和立体结构。'
  return [
    `图生图 · 单部件提取：只保留输入图中角色的「${name}」，作为独立三维建模参考。`,
    '【保持】颜色、材质、花纹、轮廓和比例照原图，不新增配件，不改设计。',
    `【部件要求】${rule}`,
    '【补全】删除其他所有部件；被遮挡或被裁掉的部分按原设计合理补全，形成完整的一件。',
    '【画面】正面视角，单件居中、完整入画、四周留足边距；纯白背景，均匀平光，无投影、无文字、无水印。',
    '此图用于单独建模，不保证自动装配对齐。',
  ].join('\n')
}
export function sheetPrompt() {
  return [
    '图生图 · 角色拆件设定图（用于裁剪和三维建模；整张图也会直接送去建模）。',
    '【保持】与输入图是同一角色：配色、材质、花纹、服装层次和配饰设计全部照原样，不新增、不改款。',
    '【拆分】把角色拆成互相分离的独立部件，每件单独完整呈现：身体比例基准（穿不透明贴身内衬，标准 A 字站姿）、整顶头发（一整块）、头部与脸、上衣或外套、下装或裙装、袜子等腿部服饰、成对的鞋子、配饰和手持物。原图没有的部件直接省略，不要编造。',
    '【排版】所有部件正面正交视角、同一比例尺，按身体从上到下排成整齐网格；部件之间留出明显空白，互不接触、互不遮挡、不被画面裁切；被遮挡处按原设计合理补全。',
    '【画面】纯白背景，均匀平光，无投影、无透视夸张，无文字、编号、箭头或标注。',
    '【禁止】不要裸体，不要多个角色，不要场景和地面。',
  ].join('\n')
}
export function threeViewPrompt() {
  return '依据这张参考图，生成同一成年角色的一张横向三视图设定图。画面从左到右依次为正面、严格侧面、背面，三个视图等高、全身完整、各自留有空隙，头顶和脚底对齐。忠实保留角色身份、发型、配色、服装层次与配饰，保持同一比例和站姿，合理补全不可见的背面设计。浅灰纯色背景，均匀光照，无透视夸张、无文字、无水印。三视图排在同一张图中，不要混入额外角色。'
}
export const ASSEMBLY_GUIDE = '在 Blender 中以 Body 为比例基准，保持各部件独立可选中。对齐头发、头部、衣服、鞋袜，保留 UV、材质及已有骨架。先检查正/侧/后视图的穿插和缝隙，再复用或创建双足骨架，验证转头、抬臂、屈肘、屈膝四个姿势。布料模拟与发束骨骼需另行制作与验证；本工作台不会自动完成装配、绑定或动力学。'

const fail = (message) => { throw Object.assign(new Error(message), {status: 400, code: 'INVALID_PARAMETERS'}) }
const pick = (value, choices, name) => choices.includes(value) ? value : fail(`${name} 不受支持`)
export function normalizeJob(kind, raw = {}) {
  pick(kind, KINDS, '任务类型')
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('参数必须是对象')
  const common = kind === 'image-to-model'
    ? ['input_asset', 'input_job', 'model', 'face_limit', 'texture', 'pbr', 'geometry_quality', 'texture_quality', 'quad', 'auto_size', 'smart_low_poly', 'enable_image_autofix', 'texture_alignment', 'orientation']
    : kind === 'model-convert' ? ['input_job', 'format', 'quad']
    : ['input_asset', 'input_job', 'model', 'prompt', 'size', 'quality', 'background']
  for (const key of Object.keys(raw)) if (!common.includes(key)) fail(`不支持的参数：${key}`)
  const input = {}
  if (kind !== 'text-to-image') {
    if (kind === 'model-convert' ? !raw.input_job || raw.input_asset : Boolean(raw.input_asset) === Boolean(raw.input_job)) fail('必须且只能选择一个受支持的输入资产或任务')
    const key = raw.input_asset ? 'input_asset' : 'input_job'
    if (typeof raw[key] !== 'string' || !/^[a-f0-9-]{36}$/.test(raw[key])) fail('图片引用无效')
    input[key] = raw[key]
  } else if (raw.input_asset || raw.input_job) fail('文生图不接受参考图片，请使用图像编辑')
  if (kind === 'model-convert') {
    if (typeof raw.quad !== 'undefined' && typeof raw.quad !== 'boolean') fail('四边面开关无效')
    const format = pick(raw.format, MODEL_FORMATS, '目标格式')
    if (raw.quad && format !== 'FBX') fail('四边面只支持 FBX 输出')
    return {...input, format, ...(raw.quad ? {quad: true} : {})}
  }
  if (kind === 'image-to-model') {
    const model = pick(raw.model ?? MODEL_VERSIONS[0], MODEL_VERSIONS, '3D 模型版本')
    for (const k of ['texture', 'pbr', 'quad', 'auto_size', 'smart_low_poly', 'enable_image_autofix'])
      if (raw[k] !== undefined && typeof raw[k] !== 'boolean') fail(`${k} 必须为布尔值`)
    const texture = raw.texture ?? true, pbr = raw.pbr ?? true
    const quad = raw.quad ?? false, smart = raw.smart_low_poly ?? false
    if (!texture && pbr) fail('PBR 需要启用贴图')
    const old = model === 'v2.5-20250123'
    if (old && (quad || smart || raw.auto_size || raw.geometry_quality !== undefined || raw.texture_quality !== undefined))
      fail('v2.5 不支持高级质量、四边面、智能低面数或自动尺寸')
    const geometry = old ? 'standard' : pick(raw.geometry_quality ?? 'standard', ['standard', 'detailed'], '几何质量')
    const face_limit = raw.face_limit ?? 50000
    const max = modelFaceMax(model, {quad, smart, geometry})
    if (!Number.isInteger(face_limit) || face_limit < 500 || face_limit > max) fail(`此模型/拓扑目标面数须为 500–${max} 的整数`)
    if (!texture && raw.texture_quality !== undefined) fail('关闭贴图时不能选择贴图质量')
    const params = {...input, model, face_limit, texture, pbr}
    if (!old) {
      params.geometry_quality = geometry
      params.quad = quad
      if (texture && raw.texture_quality !== undefined) params.texture_quality = pick(raw.texture_quality, ['standard', 'detailed', 'extreme'], '贴图质量')
      if (raw.auto_size !== undefined) params.auto_size = raw.auto_size
      if (raw.smart_low_poly !== undefined) params.smart_low_poly = smart
    }
    if (raw.enable_image_autofix !== undefined) params.enable_image_autofix = raw.enable_image_autofix
    if (raw.texture_alignment !== undefined) params.texture_alignment = pick(raw.texture_alignment, ['original_image', 'geometry'], '贴图对齐')
    if (raw.orientation !== undefined) {
      if (!texture) fail('图像朝向对齐要求启用贴图')
      params.orientation = pick(raw.orientation, ['default', 'align_image'], '模型朝向')
    }
    return params
  }
  if (typeof raw.prompt !== 'string' || !raw.prompt.trim() || raw.prompt.length > 6000) fail('提示词须为 1–6000 个字符')
  const model = pick(raw.model ?? IMAGE_MODELS[0], IMAGE_MODELS, '图像模型')
  if (raw.prompt.trim().length > promptCap(model)) fail(`当前模型提示词最多 ${promptCap(model)} 个字符；请手动缩短，不会自动截断或提交`)
  const info=IMAGE_MODEL_INFO[model]
  if(!modelAvailable(model)) fail('模型已到官方下线日期，请选择其他模型')
  if(kind==='image-to-image'&&!info.edit) fail('此模型未列入官方图生图接口，不能用于编辑或拆件')
  const size=raw.size ?? info.defaultSize
  if(!isImageSize(size,model)) fail('图像尺寸无效：请使用当前模型的受支持尺寸；chat_image要求16倍数、每边≤3840且长宽比≤3')
  const params={...input,model,prompt:raw.prompt.trim(),size,output_format:'png'}
  if(info.quality.length) params.quality=pick(raw.quality??'low',info.quality,'图像质量')
  else if(raw.quality!==undefined) fail('此模型不支持quality参数')
  if(raw.background!==undefined) {
    if(!info.background) fail('透明背景设置需要 2.5 模型')
    params.background=pick(raw.background,['auto','opaque','transparent'],'背景')
  }
  return params
}
