import React from 'react'
import {IMAGE_MODEL_INFO,IMAGE_MODELS,EDIT_IMAGE_MODELS,imageDefaults,modelAvailable,priceText,PRICING_URL,MODEL_DOC_DATE} from '../shared/image-models.js'
import {ModelTips} from './model-tips.jsx'
export function ImageSettings({value,onChange,editing=false,prefix=editing?'拆件':''}) {
  const info=IMAGE_MODEL_INFO[value.model],id=React.useId()
  return <><div className="tw-fields">
    <label>{prefix}图像模型<select aria-label={prefix+'图像模型'} value={value.model} onChange={e=>onChange(imageDefaults(e.target.value))}>
      {(editing?EDIT_IMAGE_MODELS:IMAGE_MODELS).map(m=><option key={m} value={m} disabled={!modelAvailable(m)}>{IMAGE_MODEL_INFO[m].label}</option>)}
    </select></label>
    <label>{prefix}输出尺寸<input aria-label={prefix+'输出尺寸'} list={id} value={value.size} onChange={e=>onChange({...value,size:e.target.value})}/><datalist id={id}>{info.sizes.map(s=><option key={s} value={s}/>)}</datalist></label>
    <label>{prefix}图像质量<select aria-label={prefix+'图像质量'} disabled={!info.quality.length} value={info.quality.length?value.quality:''} onChange={e=>onChange({...value,quality:e.target.value})}>{info.quality.length?info.quality.map(q=><option key={q}>{q}</option>):<option value="">模型不支持，不发送 quality</option>}</select></label>
  </div><p className="tw-note tw-price-note">{priceText(value.model,value.quality)}<br/>1积分=$0.01 USD；核对日 {MODEL_DOC_DATE}，四张候选为四个独立任务。<a href={PRICING_URL} target="_blank" rel="noopener noreferrer">官方计价 ↗</a></p><ModelTips model={value.model}/></>
}
