// Fixed China deployment. No arbitrary URL override or automatic region fallback.
export const TRIPO_SITE = 'cn'
export const TRIPO_CN_API_BASE = 'https://openapi.tripo3d.com/v3'
export const TRIPO_API_BASE = TRIPO_CN_API_BASE
// Jobs created before 0.2.6 had no site and always used the international API.
export const jobSite = job => job.site ?? 'international'
export const isCurrentSiteJob = job => jobSite(job) === TRIPO_SITE
