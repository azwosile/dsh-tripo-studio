import React from 'react'
import {ImageSettings} from './image-settings.jsx'
import {PromptHint} from './prompt-hint.jsx'
import {imageRequest} from '../shared/image-models.js'
import {threeViewPrompt} from '../shared/contracts.js'
// 0.3.3 REQ-069: the spec is shared by the in-panel button (legacy layout) and the 图生图 tab's footer button.
export function editSpecs({active,value,prompt,mode}) {
 const effective=mode==='views'?threeViewPrompt():prompt
 return [{kind:'image-to-image',label:mode==='views'?'角色三视图排版':'图生图改写',params:imageRequest({...value,prompt:effective,input_asset:active.id})}]
}
export function ImageEdit({active,value,onChange,prompt,onPrompt,mode,onMode,busy,canPay,onPrepare,showAction=true}) {
 const effective=mode==='views'?threeViewPrompt():prompt
 return <section className="tw-image-edit" aria-label="图生图改写与三视图">
  <h3>图生图改写 / 三视图</h3>
  <label>操作<select aria-label="图像编辑操作" value={mode} onChange={e=>onMode(e.target.value)}><option value="edit">图生图改写</option><option value="views">一张正 / 侧 / 背三视图</option></select></label>
  <p>输入图：{active?.label||'请先选择或导入图片'}。生成新资产，不覆盖原图。</p>
  <ImageSettings value={value} onChange={onChange} editing prefix="改写"/>
  {mode==='edit'?<label>改写提示词<textarea aria-label="改写提示词" rows={4} value={prompt} onChange={e=>onPrompt(e.target.value)}/></label>:<p className="tw-note">一次图生图收费任务，提示模型将正面、侧面、背面排在同一张图中；建议选择横向尺寸。不是官方四视图接口，不保证严格几何一致性，完成后可本地裁剪。</p>}
  <PromptHint model={value.model} prompt={effective}/>
  {showAction&&<button disabled={busy||!canPay||!active||!effective.trim()} onClick={()=>onPrepare(editSpecs({active,value,prompt,mode}))}>{mode==='views'?'生成一张三视图 · 先确认':'生成改写图 · 先确认'}</button>}
 </section>
}
