import React from 'react'
import {FloatingPanel} from './floating-panel.jsx'
import {MODEL_PRICE_ROWS,MODEL_PRICING_SOURCE,MODEL_PRICING_CHECKED,modelPriceReference} from '../shared/model-pricing.js'
import {isPSeries} from '../shared/contracts.js'
export function ModelPriceTips({model,geometry,options}) {
 const reference=modelPriceReference(model,geometry,options)
 return <div className="tw-model-price-tips"><FloatingPanel label="Tips · 3D计价" title="3D建模与格式转换计价参考">
  <p>当前模型：{model}。{reference===null?(isPSeries(model)?'P 系列公开价表未单列高清/8K贴图加价，当前组合价格未知。':'旧版模型组合未单独确认，当前价格未知。'):`按${isPSeries(model)?'P 系列':'H系列'}公开价表，当前已列参数约 ${reference} 积分 / 单个图生3D任务。`}</p>
  <p>仅作参考，不是报价或余额保证；最终以国内站账户结算为准。每个整体/部件分别收费，批次按任务数量累加；格式转换另算，仍须逐笔审批。</p>
  <table><thead><tr><th>项目</th><th>积分</th></tr></thead><tbody>{MODEL_PRICE_ROWS.map(([label,credits])=><tr key={label}><td>{label}</td><td>{label.includes('附加')?'+':''}{credits}</td></tr>)}</tbody></table>
  <p>P2.0 智能网格（P2-20260801）：按官方 P 系列价表 无贴图 100 / 标准贴图 110；四边面未单列加价，上方 H 系列附加项不适用于 P 系列。</p>
  <p>贴图升级互斥：标准→高清 +10，标准→8K +20，不叠加两个升级档。自动尺寸等未单列项目不推测额外价格。此表不等于账户实时费用，未查询余额。</p>
  <small>公开页面核对：{MODEL_PRICING_CHECKED}；官方说明 1积分 = $0.01 USD，不换算本地币价。</small>
  <div className="tw-actions"><a href={MODEL_PRICING_SOURCE} target="_blank" rel="noopener noreferrer">官方3D计价 ↗</a></div>
 </FloatingPanel></div>
}
