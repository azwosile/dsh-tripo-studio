// CN API contracts and public credit tables verified 2026-09-22.
export {TRIPO_API_BASE,TRIPO_CN_API_BASE} from './site.js'
export const MODEL_DOC_DATE='2026-09-22'
export const PRICING_URL='https://developers.tripo3d.com/zh/pricing'
export const IMAGE_SIZES=['1024x1024','1024x1536','1536x1024','2048x2048','2048x1152','3840x2160','2160x3840','auto']
const legacySizes=IMAGE_SIZES.slice(0,3).concat('auto')
const bananaSizes=['1024x1024','832x1248','1248x832','864x1184','1184x864','896x1152','1152x896','768x1344','1344x768','1536x672']
const modern={quality:['low','medium','high'],sizes:IMAGE_SIZES,defaultSize:'1024x1536',edit:true,background:false,sizeRule:'chat'}
export const IMAGE_MODEL_INFO=Object.freeze({
  'chat_image_2.5_flare':{...modern,label:'chat_image_2.5_flare · 速度档',quality:['low','medium','high','xhigh','max'],background:true,price:[10,10,15]},
  'chat_image_2.5_sunburst':{...modern,label:'chat_image_2.5_sunburst · 精修档',quality:['low','medium','high','xhigh','max'],background:true,price:[10,10,15]},
  'chat_image_2':{...modern,label:'chat_image_2 · 图像模型',price:[10,10,15]},
  'seedream_v5':{label:'seedream_v5 · 生图 / 编辑',quality:[],sizes:['2K','3K','2048x2048'],defaultSize:'2K',edit:true,sizeRule:'seed5',price:[5,5,5]},
  'seedream_v4':{label:'seedream_v4 · 仅文生图',quality:[],sizes:['2K','4K','2048x2048'],defaultSize:'2K',edit:false,sizeRule:'seed4',price:[5,5,5]},
  'banana':{label:'banana · 快速',quality:[],sizes:bananaSizes,defaultSize:'1024x1024',edit:true,sizeRule:'fixed',price:[5,null,null]},
  'banana2':{label:'banana2 · 新版快速',quality:[],sizes:['0.5K','1K','2K','4K'],defaultSize:'2K',edit:true,sizeRule:'fixed',price:[10,10,15]},
  'banana_pro':{label:'banana_pro · 高质量',quality:[],sizes:['1K','2K','4K'],defaultSize:'2K',edit:true,sizeRule:'fixed',price:[15,15,20]},
  'chat_image_1':{label:'chat_image_1 · 2026-10-23 下线',quality:[],sizes:legacySizes,defaultSize:'1024x1536',edit:true,sizeRule:'fixed',retireOn:'2026-10-23',price:[5,null,null]},
  'chat_image_1.5':{label:'chat_image_1.5 · 2026-12-01 下线',quality:[],sizes:legacySizes,defaultSize:'1024x1536',edit:true,sizeRule:'fixed',retireOn:'2026-12-01',price:[10,null,null]},
})
export const IMAGE_MODELS=Object.keys(IMAGE_MODEL_INFO)
export const EDIT_IMAGE_MODELS=IMAGE_MODELS.filter(m=>IMAGE_MODEL_INFO[m].edit)
export function modelAvailable(model,date=new Date()) {return Boolean(IMAGE_MODEL_INFO[model]) && (!IMAGE_MODEL_INFO[model].retireOn||date.toISOString().slice(0,10)<IMAGE_MODEL_INFO[model].retireOn)}
export function isImageSize(value,model='chat_image_2') {
  const info=IMAGE_MODEL_INFO[model];if(!info)return false
  if(info.sizes.includes(value))return true
  if(typeof value!=='string'||!/^\d{3,5}x\d{3,5}$/.test(value))return false
  const [w,h]=value.split('x').map(Number),pixels=w*h
  if(info.sizeRule==='chat')return w<=3840&&h<=3840&&w%16===0&&h%16===0&&Math.max(w,h)<=Math.min(w,h)*3&&pixels>=655360&&pixels<=8294400
  if(info.sizeRule==='seed4'||info.sizeRule==='seed5')return Math.max(w,h)<=Math.min(w,h)*16&&pixels>=3690000&&pixels<=(info.sizeRule==='seed4'?16780000:10400000)
  // banana_pro exact-pixel limits are not explicit; only verified semantic tiers are exposed.
  return false
}
export function imageDefaults(model) {const info=IMAGE_MODEL_INFO[model]||IMAGE_MODEL_INFO[IMAGE_MODELS[0]];return {model:IMAGE_MODEL_INFO[model]?model:IMAGE_MODELS[0],size:info.defaultSize,quality:info.quality[0]||''}}
export function imageRequest({model,size,quality,prompt,input_asset}) {
  const info=IMAGE_MODEL_INFO[model]
  return {model,size,prompt,...(input_asset?{input_asset}:{}),...(info?.quality.length?{quality}: {})}
}
export function priceText(model,quality='low') {
  const info=IMAGE_MODEL_INFO[model];if(!info)return '价格未核实，以账户结算为准。'
  const table=quality==='high'?[20,25,40]:quality==='xhigh'?[25,30,45]:quality==='max'?[30,50,50]:info.price
  const actual=info.quality.includes(quality)?table:info.price
  return `官方参考（积分/张）：≤1K ${actual[0]??'—'} / 2K ${actual[1]??'—'} / 4K ${actual[2]??'—'}${model.startsWith('chat_image_2')?'；auto 按2K':''}。不代表所有尺寸都支持；自定义像素计费档以账户为准。`
}
export const TRIPO_ENDPOINTS=Object.freeze({'text-to-image':'/generation/text-to-image','image-to-image':'/generation/image-to-image','image-to-model':'/generation/image-to-model','model-convert':'/models/convert'})
