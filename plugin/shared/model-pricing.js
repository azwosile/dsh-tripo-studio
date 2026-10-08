// Public H/P-series table, not a supplier quote. No pricing request or paid call.
import {isPSeries} from './contracts.js'
export const MODEL_PRICING_SOURCE='https://developers.tripo3d.com/zh/pricing'
export const MODEL_PRICING_CHECKED='2026-10-08'
export const MODEL_PRICE_ROWS=Object.freeze([
 ['图片转3D · 无贴图',20],['图片转3D · 标准贴图',30],
 ['高清贴图（detailed）附加',10],['8K贴图（extreme）附加',20],
 ['超清几何（detailed / Ultra）附加',20],['四边面网格附加',5],['智能低模附加',10],
 ['独立格式转换 · 基础',5],['独立格式转换 · 高级（如quad）',10],
 // 0.3.6 REQ-079: official P-series table — P2 图片转3D 100 (no texture) / 110 (standard texture).
 ['P2.0 智能网格 · 图片转3D 无贴图',100],['P2.0 智能网格 · 图片转3D 标准贴图',110],
])
export function modelPriceReference(model,geometry,options) {
 // P2: base 100, standard texture +10; the P table lists no HD/8K texture add-on → unknown, never guessed.
 if(isPSeries(model)){const texture=options.texture!==false;return texture&&['detailed','extreme'].includes(options.textureQuality)?null:texture?110:100}
 if(!['v3.1-20260211','v3.0-20250812'].includes(model))return null
 const texture=options.texture!==false
 return (texture?30:20)+(texture?({standard:0,detailed:10,extreme:20}[options.textureQuality]??0):0)+(geometry==='detailed'?20:0)+(options.quad?5:0)+(options.smart?10:0)
}
