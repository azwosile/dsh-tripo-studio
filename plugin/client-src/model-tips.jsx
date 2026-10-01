import React from 'react'
import {promptGuidance,PROMPT_RECOMMENDATION} from '../shared/prompt-policy.js'
import {FloatingPanel} from './floating-panel.jsx'
import {IMAGE_MODEL_INFO,TRIPO_API_BASE,priceText,MODEL_DOC_DATE,PRICING_URL} from '../shared/image-models.js'
export function ModelTips({model}) {
 const info=IMAGE_MODEL_INFO[model]
 return <div className="tw-model-tips"><FloatingPanel label="Tips · Prompt / size" title="Tripo 图像模型与参数提示">
  <p>实际 model：<code>{model}</code>。ID即请求值，不推测映射产品别名。{info?.edit?'支持文生图和单参考图编辑。':'仅文生图，不用于拆件/编辑。'}</p>
  <h4>Prompt</h4><p>{PROMPT_RECOMMENDATION} {promptGuidance(model)} 重要内容前置，反向描述接在 --no 后。拆件AI可能补画，须人工核对。</p>
  <h4>size</h4><p>支持预设：{info?.sizes.join(' / ')}。</p>
  <p>{info?.sizeRule==='chat'?'自定义宽x高：每边≤3840，16倍数，长宽比≤3，总像素655360–8294400。1088x1920可用，1080x1920无效。':info?.sizeRule?.startsWith('seed')?'支持官方分辨率档或自定义宽x高；长宽比≤16，最少3.69MP；v5最多10.40MP，v4最多16.78MP。':'仅开放已核实的固定尺寸/档位。banana_pro暂不开放边界不明确的任意像素。'}</p>
  <h4>质量 / 计价</h4><p>{info?.quality.length?`quality：${info.quality.join(' / ')}；不支持auto。`:'该模型不支持quality，不会发送此字段。'} {info?.background?'支持auto/opaque/transparent背景。':'不发送background。'} 输出PNG。</p>
  {['low',...(info?.quality.includes('high')?['high']:[]),...(info?.quality.includes('xhigh')?['xhigh','max']:[])].map(q=><p key={q}>{q==='low'?'基础价（low/medium如适用）':q}：{priceText(model,q)}</p>)}
  <p>1积分=$0.01 USD。核对日{MODEL_DOC_DATE}；只提供官方价表参考，不承诺固定实际费用，不自动选择收费档。{info?.retireOn&&`官方下线日期 ${info.retireOn}，届时停止新建任务。`}</p>
  <h4>请求与凭据</h4><p>国内站 <code>{TRIPO_API_BASE}</code>；文生图 POST /generation/text-to-image，拆件/编辑 POST /generation/image-to-image，建模 POST /generation/image-to-model，多视图建模 POST /generation/multiview-to-model（view-key 格式，正面必填、至少 2 张），格式/朝向转换 POST /models/convert，重拓扑 POST /mesh/decimate（v2.0 智能重拓扑 30 积分 / v1.0 基础减面 10 积分，均为独立收费任务）。</p>
  <p>后端Authorization: Bearer [密钥]；JSON Content-Type: application/json；上传/files使用FormData，不向CDN转发Key。不自动回退国际站。</p>
  <p>Seedream v4仅文生图；本地模型、Anima、NovelAI及LLM修改模块尚未接入。</p>
  <div className="tw-doc-links"><a href="https://developers.tripo3d.com/zh/docs/generation-text-to-image" target="_blank" rel="noopener noreferrer">官方参数文档 ↗</a><a href={PRICING_URL} target="_blank" rel="noopener noreferrer">官方计价 ↗</a></div>
 </FloatingPanel></div>
}
