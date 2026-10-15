// Explicit official sites only. Never infer a region from the key or retry another site.
export const TRIPO_CN_API_BASE = 'https://openapi.tripo3d.com/v3'
export const TRIPO_INTERNATIONAL_API_BASE = 'https://openapi.tripo3d.ai/v3'
export const TRIPO_SITES = Object.freeze({
  cn: Object.freeze({id:'cn',label:'国内站',apiBase:TRIPO_CN_API_BASE,keysUrl:'https://developers.tripo3d.com/zh/keys',pricingUrl:'https://developers.tripo3d.com/zh/pricing',keyEnv:'TRIPO_CN_API_KEY',paidEnv:'TRIPO_CN_ENABLE_PAID'}),
  international: Object.freeze({id:'international',label:'国际站',apiBase:TRIPO_INTERNATIONAL_API_BASE,keysUrl:'https://developers.tripo3d.ai/en/keys',pricingUrl:'https://developers.tripo3d.ai/en/pricing',keyEnv:'TRIPO_INTERNATIONAL_API_KEY',paidEnv:'TRIPO_INTERNATIONAL_ENABLE_PAID'}),
})
export const validSite = site => typeof site === 'string' && Object.hasOwn(TRIPO_SITES,site)
export function siteInfo(site) {
  if (!validSite(site)) throw new Error('不支持的 Tripo 站点')
  return TRIPO_SITES[site]
}
// Browser live bindings follow a validated server handshake. Server services use their
// own explicit site, never these mutable browser defaults (multiple services are safe).
export let TRIPO_SITE = 'cn'
export let TRIPO_API_BASE = TRIPO_CN_API_BASE
export function acceptSiteHandshake(data) {
  if (!validSite(data?.site) || data.apiBase !== siteInfo(data.site).apiBase ||
      (data.site !== 'cn' && data.siteProtocol !== 'explicit-v1')) throw new Error('前后端站点不一致，已阻止密钥和任务操作。请更新插件后重新连接。')
  TRIPO_SITE = data.site; TRIPO_API_BASE = data.apiBase
}
// Pre-0.2.6 jobs belong to the international site, but their old account/approval
// hashes are not upgraded silently; existing account guards still fail closed.
export const jobSite = job => job.site ?? 'international'
export const isCurrentSiteJob = (job,site=TRIPO_SITE) => jobSite(job) === site
