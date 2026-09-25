export const LOCAL_PROMPT_CAP=6000
export function promptCap(model) {return model === 'chat_image_2.5_flare' ? 1800 : LOCAL_PROMPT_CAP}
export function promptGuidance(model) {
  return model === 'chat_image_2.5_flare'
    ? '此模型有用户实测接口报错：最多1800 characters；本地按1800字符保守拦截（非官网逐模型硬上限声明）。'
    : '当前已核对官网未明确此模型的专属硬上限；本地输入安全上限6000字符，不代表供应商上限。'
}
export const PROMPT_RECOMMENDATION='官方文生图通用建议：≤300中文字符或600英文单词（建议而非逐模型硬限制）。本地计数按UTF-16长度，表情可能占2个单位。'
