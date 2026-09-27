import https from 'node:https'
import {validTaskId} from '../shared/task-id.js'
import {TRIPO_API_BASE,TRIPO_ENDPOINTS} from '../shared/image-models.js'
import {lookup} from 'node:dns/promises'
import {isIP} from 'node:net'

export class TripoError extends Error {
  constructor(message, options = {}) { super(message); Object.assign(this, {status: 502, code: 'UPSTREAM_ERROR', definitive: false}, options) }
}
export function redact(value, key = '') {
  let text = String(value ?? '')
  if (key) text = text.split(key).join('[REDACTED]')
  return text.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]').replace(/\bsk-[\w-]{8,}/g, '[REDACTED]').slice(0, 1200)
}
export class TripoClient {
  constructor({key = process.env.TRIPO_CN_API_KEY ?? '', fetchImpl = globalThis.fetch, sleep = (ms) => new Promise(r => setTimeout(r, ms))} = {}) {
    this.key = key; this.fetch = fetchImpl; this.sleep = sleep
  }
  async request(path, {method = 'GET', body, form, retries, timeoutMs = 45000, phase = 'request'} = {}) {
    if (!this.key) throw new TripoError('请在连接设置中保存 Tripo API 密钥（或配置 TRIPO_CN_API_KEY）', {status: 503, code: 'NOT_CONFIGURED', definitive: true})
    // Never retry a paid POST. Only GET queries and the free /files upload may pass retries.
    const attempts = retries ?? (method === 'GET' ? 3 : 1)
    for (let i = 0; i < attempts; i++) {
      let response
      try {
        response = await this.fetch(`${TRIPO_API_BASE}${path}`, {
          method, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
          headers: {Authorization: `Bearer ${this.key}`, ...(form ? {} : {'Content-Type': 'application/json'})},
          body: form ?? (body ? JSON.stringify(body) : undefined),
        })
      } catch (error) {
        if (i + 1 < attempts) { await this.sleep(800 * 2 ** i); continue }
        const cause = networkCause(error)
        if (phase === 'upload') throw new TripoError(`参考图上传未取得响应（${cause}，已尝试${attempts}次）；尚未发起收费生成，可重新准备后重试`, {code: 'UPLOAD_NETWORK_ERROR', definitive: true, detail: cause})
        throw new TripoError(`Tripo 网络请求未取得响应（${cause}）；提交结果可能未知，请勿重复提交`, {code: 'NETWORK_ERROR', detail: cause})
      }
      if ((response.status === 429 || response.status >= 500) && i + 1 < attempts) {
        await response.body?.cancel(); await this.sleep(800 * 2 ** i); continue
      }
      let result
      try {
        const text = await readLimited(response.body, 2 * 1024 * 1024)
        result = JSON.parse(text.toString())
      } catch {
        if (phase === 'upload') throw new TripoError('参考图上传返回了无法解析的响应；尚未发起收费生成', {code: 'UPLOAD_INVALID_RESPONSE', definitive: true})
        throw new TripoError('Tripo 返回了无法解析的响应，不能据此重试收费提交', {code: 'INVALID_RESPONSE'})
      }
      if (!response.ok || result.code !== 0) {
        throw new TripoError(redact(result.message || `Tripo HTTP ${response.status}`, this.key), {
          status: response.status === 401 ? 401 : response.status === 429 ? 429 : 502,
          code: `TRIPO_${result.code ?? response.status}`, definitive: phase === 'upload' || response.status < 500,
        })
      }
      return result.data
    }
  }
  async upload(buffer, mime) {
    const form = new FormData()
    form.append('file', new Blob([buffer], {type: mime}), mime === 'image/png' ? 'reference.png' : 'reference.jpg')
    // /files is free: bounded retries are safe and the timeout grows with the payload.
    const timeoutMs = Math.min(300000, 60000 + Math.ceil(buffer.length / (256 * 1024)) * 5000)
    const result = await this.request('/files', {method: 'POST', form, retries: 3, timeoutMs, phase: 'upload'})
    if (typeof result?.file_token !== 'string') throw new TripoError('上传响应缺少 file_token；尚未发起收费生成', {code: 'UPLOAD_INVALID_RESPONSE', definitive: true})
    return result.file_token
  }
  create(kind, params) {
    if(!Object.hasOwn(TRIPO_ENDPOINTS,kind)) throw new TripoError('不支持的生成接口',{status:400,definitive:true})
    return this.request(TRIPO_ENDPOINTS[kind], {method: 'POST', body: params})
  }
  task(id) {
    if (!validTaskId(id)) throw new TripoError('云端 task_id 格式无效', {status:400,code:'INVALID_TASK_ID',definitive:true})
    return this.request(`/tasks/${encodeURIComponent(id)}`)
  }
  balance() { return this.request('/account/balance') }
  // Documented next to balance on the official account page; GET, bounded retries like every query.
  usage() { return this.request('/account/usage') }
}
// Redacted, stable network cause labels for diagnostics; never includes URLs, headers or keys.
export function networkCause(error) {
  const name = error?.name, code = error?.cause?.code ?? error?.code
  if (name === 'TimeoutError' || name === 'AbortError' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT' || code === 'UND_ERR_BODY_TIMEOUT' || code === 'ETIMEDOUT') return '请求超时'
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'DNS解析失败'
  if (['ECONNRESET', 'UND_ERR_SOCKET', 'EPIPE'].includes(code)) return '连接被重置'
  if (['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) return '无法建立连接'
  if (typeof code === 'string' && /^(CERT_|ERR_TLS|UNABLE_TO|SELF_SIGNED|DEPTH_ZERO)/.test(code)) return 'TLS证书校验失败'
  return typeof code === 'string' && /^[A-Z0-9_]{2,40}$/.test(code) ? `网络错误 ${code}` : '网络错误'
}
export async function readLimited(stream, max) {
  const chunks = []; let size = 0
  if (!stream) return Buffer.alloc(0)
  for await (const chunk of stream) {
    size += chunk.length
    if (size > max) throw new TripoError('响应超出大小限制', {code: 'TOO_LARGE'})
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}
export function isPublicIP(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 2)) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0))
  }
  // Conservatively accept IPv6 global unicast only, excluding special ranges.
  return isIP(address) === 6 && /^[23]/i.test(address) && !/^(2001:|2002:)/i.test(address)
}
export async function validateAssetURL(value, {resolve = lookup, extraHosts = []} = {}) {
  let url
  try { url = new URL(value) } catch { throw new TripoError('资产 URL 无效') }
  const h = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password || url.hash || isIP(h)) throw new TripoError('资产 URL 必须是受信任的 HTTPS 地址')
  if (!['tripo3d.ai', 'tripo3d.com'].some(d => h === d || h.endsWith(`.${d}`)) && !extraHosts.includes(h)) throw new TripoError('资产域名未获允许；请核实后在服务端配置 TRIPO_ASSET_HOSTS')
  const addresses = await resolve(h, {all: true, verbatim: true})
  if (!addresses.length || addresses.some(a => !isPublicIP(a.address))) throw new TripoError('已阻止指向非公网地址的资产下载')
  return {url, address: addresses[0]}
}
export async function downloadAsset(value, maxBytes, options = {}, redirects = 0) {
  if (redirects > 3) throw new TripoError('资产重定向过多')
  const {url, address} = await validateAssetURL(value, options)
  const result = await new Promise((resolve, reject) => {
    // Pin DNS and never send API Authorization to a CDN or a redirect target.
    const req = https.get(url, {
      headers: {'User-Agent': 'dsh-tripo-studio/0.2.0'},
      lookup: (_host, opts, cb) => opts?.all ? cb(null, [address]) : cb(null, address.address, address.family),
    }, async res => {
      try {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) { res.resume(); return resolve({redirect: new URL(res.headers.location, url).href}) }
        if (res.statusCode !== 200) { res.resume(); throw new TripoError(`资产下载 HTTP ${res.statusCode}`) }
        if (Number(res.headers['content-length']) > maxBytes) { res.destroy(); throw new TripoError('资产超出大小限制') }
        resolve({buffer: await readLimited(res, maxBytes)})
      } catch (error) { reject(error) }
    })
    const timer = setTimeout(() => req.destroy(new Error('Asset download deadline exceeded')), 90000)
    req.once('close', () => clearTimeout(timer))
    req.on('error', () => reject(new TripoError('资产下载失败或超时；可重试下载，不会重做生成')))
  })
  return result.redirect ? downloadAsset(result.redirect, maxBytes, options, redirects + 1) : result.buffer
}
