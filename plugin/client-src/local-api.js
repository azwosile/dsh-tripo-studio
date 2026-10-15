import {TRIPO_SITE,acceptSiteHandshake} from '../shared/site.js'
import {LOCAL_API_PREFIX} from '../shared/local-api.js'

// Never echo non-JSON HTML, request bodies or network error objects: these can
// contain unrelated host data. A failed request is not evidence of an invalid key.
export function createLocalApi({getCsrf, isOffline, fetcher = (...args) => fetch(...args), statusTimeoutMs = 20000}) {
  let site=TRIPO_SITE
  return async (path, method = 'GET', body) => {
    if (isOffline()) throw new Error('当前为离线界面预览，无本机后端；密钥和项目操作需在 DSH 的 Tripo Studio 插件内使用。')
    const controller = path === '/status' && method === 'GET' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), statusTimeoutMs) : null
    try {
      let response
      try {
        response = await fetcher(`${LOCAL_API_PREFIX}${path}`, {
          method, credentials:'same-origin', ...(controller ? {signal:controller.signal} : {}),
          headers:{'x-tripo-studio':'1', ...(method !== 'GET' ? {'content-type':'application/json','x-tripo-csrf':getCsrf(),'x-tripo-site':site} : {})},
          ...(body !== undefined ? {body:JSON.stringify(body)} : {}),
        })
      } catch {
        throw new Error(controller?.signal.aborted
          ? '连接本机 Tripo 服务超时；请确认 DSH 插件已启动，再点击「重新连接」。未自动重试任何生成任务。'
          : '无法连接本机 Tripo 服务；请确认 DSH 插件已启动，再点击「重新连接」。这不是 API 密钥验证失败。')
      }
      if (!String(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
        throw new Error(`本机 Tripo 接口未返回 JSON（HTTP ${response.status}），请求可能落到了 DSH 页面或插件路由未加载。请启用修复版插件并重启 DSH，然后点击「重新连接」。这不是 API 密钥错误。`)
      }
      let data
      try { data = await response.json() } catch { throw new Error(`本机 Tripo 接口返回了无效 JSON（HTTP ${response.status}）；请重新连接或检查插件后端。`) }
      if (!response.ok) { const error=new Error(typeof data?.error === 'string' ? data.error : `Tripo 工作台请求失败（HTTP ${response.status}）`);error.code=data?.code;throw error }
      if (path === '/status' && (!data || typeof data.keyConfigured !== 'boolean' || typeof data.paidEnabled !== 'boolean' || !/^[a-f0-9]{64}$/.test(data.csrfToken))) {
        throw new Error('本机 Tripo 状态响应不完整，暂不开放密钥和项目操作。请确认前后端版本一致，再重新连接。')
      }
      if (path === '/status' || path === '/site') { acceptSiteHandshake(data); site=data.site }
      return data
    } finally { if (timer !== null) clearTimeout(timer) }
  }
}
