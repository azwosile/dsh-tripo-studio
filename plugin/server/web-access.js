// Web mode is opt-in and independent of the host's authentication implementation.
// Never trust forwarded headers or grant access just because a proxy is loopback.
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto'
import {fail} from './store.js'
import {LOCAL_API_PREFIX} from '../shared/local-api.js'
const COOKIE='tripo_studio_session'
const digest = value => createHash('sha256').update(value).digest()
export function normalizeWebOrigins(origins) {
  if (!Array.isArray(origins) || !origins.length || origins.length>16) throw new Error('Web 模式需要 1–16 个明确的允许来源')
  return [...new Set(origins.map(value=>{
    if(typeof value!=='string')throw new Error('允许来源必须是 URL')
    const url=new URL(value)
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname)
    if(url.host.includes('*')||url.username||url.password||url.search||url.hash||url.pathname!=='/'||(!local&&url.protocol!=='https:')||!['http:','https:'].includes(url.protocol))throw new Error('来源须为 HTTPS origin（仅回环地址允许 HTTP），不允许路径、凭据或通配符')
    return url.origin
  }))]
}
export function createWebAccess({allowedOrigins=[],webToken=process.env.TRIPO_STUDIO_WEB_TOKEN??'',now=Date.now}={}) {
  const origins=normalizeWebOrigins(allowedOrigins)
  if(typeof webToken!=='string'||webToken.length<32||webToken.length>512||!/^[\x21-\x7e]+$/.test(webToken))throw new Error('Web 模式必须设置独立的 TRIPO_STUDIO_WEB_TOKEN（32–512 个非空白 ASCII 字符）；不是 Tripo API Key')
  const tokenHash=digest(webToken),sessions=new Map(),ttl=8*60*60*1000
  function origin(req) {
    const host=String(req.headers.host??'')
    const expected=origins.find(o=>new URL(o).host===host)
    if(!expected)fail('Host 不在 Web 允许来源内',403,'HOST_DENIED')
    if(req.headers.origin && req.headers.origin!==expected)fail('请求来源不匹配',403,'ORIGIN_DENIED')
    if(req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site']))fail('拒绝跨站访问',403,'ORIGIN_DENIED')
    return expected
  }
  const cookie=(value,o,maxAge)=>`${COOKIE}=${value}; Path=${LOCAL_API_PREFIX}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${o.startsWith('https:')?'; Secure':''}`
  function prune(){for(const [id,s]of sessions)if(s.expires<=now())sessions.delete(id)}
  function login(req,res,body) {
    const o=origin(req);prune()
    if(!body||Object.keys(body).some(k=>k!=='token')||typeof body.token!=='string'||body.token.length>512||!timingSafeEqual(digest(body.token),tokenHash))fail('Web 访问口令无效',401,'WEB_AUTH_REQUIRED')
    // Bounded memory, including successful logins. No provider call or disk write.
    if(sessions.size>=128)fail('Web 会话数量已达上限',429,'WEB_SESSION_LIMIT')
    const id=randomBytes(32).toString('hex');sessions.set(id,{origin:o,expires:now()+ttl})
    res.setHeader('set-cookie',cookie(id,o,ttl/1000));return {authenticated:true,expiresIn:ttl/1000}
  }
  function authorize(req) {
    const o=origin(req);prune()
    const id=String(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)
    const s=sessions.get(id)
    if(!s||s.origin!==o)fail('请先输入独立的 DSH Web 访问口令',401,'WEB_AUTH_REQUIRED')
    return {id,origin:o}
  }
  function logout(req,res){const s=authorize(req);sessions.delete(s.id);res.setHeader('set-cookie',cookie('',s.origin,0));return {authenticated:false}}
  return {origin,login,authorize,logout}
}
