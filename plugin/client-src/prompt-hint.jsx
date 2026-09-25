import React from 'react'
import {promptCap,promptGuidance,PROMPT_RECOMMENDATION} from '../shared/prompt-policy.js'
export function PromptHint({model,prompt=''}) {
 const count=prompt.trim().length,cap=promptCap(model)
 return <div className="tw-prompt-hint"><small className={count>cap?'tw-danger':''}>提示词：{count} / {cap} 本地字符上限{count>cap?' · 超限，请缩短后再提交':''}</small><small>{promptGuidance(model)} {PROMPT_RECOMMENDATION}</small></div>
}
