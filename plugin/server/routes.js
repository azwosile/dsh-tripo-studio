import {ProjectLocation} from './project-location.js'
import fs from 'node:fs'
import {randomBytes, timingSafeEqual} from 'node:crypto'
import {JobService} from './service.js'
import {fail, publicJob} from './store.js'
import {redact} from './tripo.js'

import {LOCAL_API_PREFIX as PREFIX} from '../shared/local-api.js'
export function assertLocalRequest(req) {
  const address = req.socket?.remoteAddress
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) fail('仅允许本机访问此插件', 403, 'LOCAL_ONLY')
  for (const h of ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'cf-connecting-ip']) if (req.headers[h]) fail('未配置远程访问授权，已拒绝代理请求', 403, 'LOCAL_ONLY')
  const host = String(req.headers.host ?? '')
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/.test(host)) fail('Host 不在本机白名单', 403, 'HOST_DENIED')
  if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) fail('拒绝跨站访问', 403, 'ORIGIN_DENIED')
  if (req.headers.origin && ![`http://${host}`, `https://${host}`].includes(req.headers.origin)) fail('请求来源不匹配', 403, 'ORIGIN_DENIED')
}
async function jsonBody(req, max = 29 * 1024 ** 2) {
  if (!String(req.headers['content-type']).startsWith('application/json')) fail('仅接受 application/json', 415)
  if (Number(req.headers['content-length']) > max) fail('请求过大', 413)
  let size = 0; const chunks = []
  for await (const chunk of req) { size += chunk.length; if (size > max) fail('请求过大', 413); chunks.push(chunk) }
  try { return JSON.parse(Buffer.concat(chunks).toString()) } catch { fail('JSON 无效') }
}
function send(res, status, value) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(JSON.stringify(value))
}
export function createHandler(options) {
  let instance = options.service
  let activeRequests = 0
  let location=options.storageManager
  const manager=()=>location??=(options.manageStorage?new ProjectLocation(options.directory):null)
  const service = () => instance ??= new JobService({...options,...(manager()?{store:manager().openStore()}: {})})
  const status=()=>({...service().status(),csrfToken:csrf,...(manager()?{storage:manager().status()}: {})})
  const storageReady=()=>{
    if(!manager())fail('当前环境没有目录选择能力',503,'STORAGE_UNAVAILABLE')
    const s=service()
    if(activeRequests||s.locks.size||s.refreshing.size||Object.values(s.store.state.jobs).some(j=>j.status==='awaiting_approval'||j.status==='submitting'||(['queued','running'].includes(j.status)&&j.tracking!==false)))fail('先完成操作、丢弃审批草稿并暂停云任务跟踪，再切换目录',409,'STORAGE_BUSY')
  }
  let csrf = randomBytes(32).toString('hex')
  const validCsrf = (token) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) && timingSafeEqual(Buffer.from(token), Buffer.from(csrf))
  return async (req, res) => {
    let active = false
    try {
      assertLocalRequest(req)
      const url = new URL(req.url, 'http://localhost'), method = req.method
      if (!url.pathname.startsWith(`${PREFIX}/`)) fail('路由不存在', 404)
      const route = url.pathname.slice(PREFIX.length)
      // Assets may be loaded by img/a without custom headers. All JSON routes
      // require a non-simple request header; no CORS preflight is enabled.
      if (!route.startsWith('/assets/') && req.headers['x-tripo-studio'] !== '1') fail('缺少本机工作台请求标记', 403)
      if (!['GET', 'HEAD'].includes(method) && !validCsrf(req.headers['x-tripo-csrf'])) fail('CSRF 校验失败，请刷新工作台', 403, 'CSRF_FAILED')
      if (method === 'GET' && route === '/status') return send(res, 200, status())
      if(['/storage/choose','/storage/default'].includes(route)&&method==='POST') {
        storageReady();const body=await jsonBody(req,1024)
        if(!body||Object.keys(body).length)fail('目录选择不接受客户端路径')
        activeRequests++;try{return send(res,200,await manager().choose(route==='/storage/default'))}finally{activeRequests--}
      }
      if(route==='/storage'&&method==='PUT') {
        const body=await jsonBody(req,2048);storageReady()
        service().store=manager().apply(body);csrf=randomBytes(32).toString('hex')
        return send(res,200,status())
      }
      if (route === '/credentials') {
        if (!['PUT','DELETE'].includes(method)) fail('此接口不返回密钥',405)
        const body = await jsonBody(req, 8192)
        if (activeRequests) fail('其他任务操作正在进行，请稍后更改密钥',409,'CREDENTIAL_BUSY')
        if (method === 'DELETE') {
          if (!body || body.confirm !== true) fail('清除密钥需要明确确认',400)
          return send(res,200,service().clearCredentials())
        }
        return send(res,200,service().configureCredentials(body))
      }
      activeRequests++; active = true
      if (method === 'GET' && route === '/balance') {
        const data = await service().client.balance()
        return send(res, 200, {balance: data?.balance ?? null, frozen: data?.frozen ?? null, note: '余额不是费用报价'})
      }
      if (route === '/projects') {
        if (method === 'GET') return send(res, 200, Object.values(service().store.state.projects).map(({draft, ...p}) => p))
        if (method === 'POST') return send(res, 201, service().store.newProject((await jsonBody(req, 20000)).name))
      }
      const assetMatch = route.match(/^\/assets\/([a-f0-9-]{36})$/)
      if (assetMatch && ['GET', 'HEAD'].includes(method)) {
        const a = service().store.asset(url.searchParams.get('project'), assetMatch[1])
        const file = service().store.assetPath(a)
        const stat = fs.statSync(file)
        res.statusCode = 200; res.setHeader('content-type', a.mime); res.setHeader('content-length', stat.size)
        res.setHeader('x-content-type-options', 'nosniff'); res.setHeader('cache-control', 'private, no-store')
        res.setHeader('content-security-policy', "default-src 'none'; sandbox")
        const extension = a.kind === 'model' ? (a.format||'glb') : a.mime === 'image/png' ? 'png' : 'jpg'
        res.setHeader('content-disposition', `${a.kind === 'model' || url.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="${a.id}.${extension}"`)
        if (method === 'HEAD') return res.end()
        const stream = fs.createReadStream(file); stream.on('error', () => res.destroy()); stream.pipe(res); return
      }
      const match = route.match(/^\/projects\/([a-f0-9-]{36})(.*)$/)
      if (!match) fail('路由不存在', 404)
      const [, projectId, tail] = match
      const s = service(); s.store.project(projectId)
      if (tail === '' && method === 'GET') return send(res, 200, s.store.snapshot(projectId))
      if (tail === '' && method === 'PATCH') return send(res, 200, s.store.updateProject(projectId, await jsonBody(req, 50000)))
      if (tail === '/files' && method === 'POST') {
        const body = await jsonBody(req)
        const parsed = typeof body.dataUrl === 'string' && body.dataUrl.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/)
        if (!parsed) fail('仅接受 PNG / JPEG 的 base64 图片')
        if (body.sourceAsset !== undefined && (typeof body.sourceAsset !== 'string' || !/^[a-f0-9-]{36}$/.test(body.sourceAsset))) fail('来源图片引用无效')
        const a = s.store.addAsset(projectId, Buffer.from(parsed[2], 'base64'), {label: body.label, sourceAssetId: body.sourceAsset, priority: ['high', 'base', 'normal'].includes(body.priority) ? body.priority : 'normal'})
        return send(res, 201, s.store.snapshot(projectId).assets.find(item => item.id === a.id))
      }
      const deleteAssetMatch=tail.match(/^\/assets\/([a-f0-9-]{36})\/delete$/)
      if(deleteAssetMatch&&method==='POST') return send(res,200,s.deleteAsset(projectId,deleteAssetMatch[1],await jsonBody(req,1024)))
      const labelMatch=tail.match(/^\/assets\/([a-f0-9-]{36})\/label$/)
      if(labelMatch&&method==='PATCH') {
        const body=await jsonBody(req,2048)
        if(!body||Object.keys(body).some(k=>k!=='label'))fail('重命名参数无效')
        return send(res,200,s.store.setLabel(projectId,labelMatch[1],body.label))
      }
      const priorityMatch=tail.match(/^\/assets\/([a-f0-9-]{36})\/priority$/)
      if(priorityMatch&&method==='PATCH') {
        const body=await jsonBody(req,1024)
        if(!body||Object.keys(body).some(k=>k!=='priority'))fail('优先级参数无效')
        return send(res,200,s.store.setPriority(projectId,priorityMatch[1],body.priority))
      }
      if (tail === '/prepare' && method === 'POST') return send(res, 201, s.prepare(projectId, await jsonBody(req, 50000)))
      if (tail === '/jobs/import' && method === 'POST') return send(res,201,await s.importTask(projectId,await jsonBody(req,20000)))
      if (tail === '/refresh' && method === 'POST') {
        const body=await jsonBody(req,1024)
        if(!body || Object.keys(body).some(k=>k!=='manual') || (body.manual!==undefined&&typeof body.manual!=='boolean')) fail('刷新参数无效')
        return send(res,200,await s.refresh(projectId,{manual:body.manual??false}))
      }
      if (tail === '/manifest' && method === 'GET') {
        const data = s.store.snapshot(projectId)
        return send(res, 200, {...data, jobs: data.jobs.map(({approvalHash, ...job}) => job), handoff: '模型需逐件下载；此清单不包含模型二进制，也未执行 Blender 装配。非GLB输出应使用对应DCC工具。'})
      }
      if (tail === '/jobs/cleanup' && method === 'POST') return send(res,200,s.cleanup(projectId,await jsonBody(req,30000)))
      const jobMatch = tail.match(/^\/jobs\/([a-f0-9-]{36})\/(submit|discard|track|download|recover|refresh|delete|visibility)$/)
      if (jobMatch && method === 'POST') {
        const [, id, action] = jobMatch, body = await jsonBody(req, 20000)
        const result = action === 'submit' ? await s.submit(projectId, id, body.approvalHash)
          : action === 'discard' ? s.discard(projectId, id)
          : action === 'track' ? s.track(projectId, id, body.tracking)
          : action === 'recover' ? await s.recover(projectId,id,body)
          : action === 'visibility' ? s.visibility(projectId,id,body)
          : action === 'delete' ? s.deleteRecord(projectId,id,body)
          : action === 'refresh' ? await s.refresh(projectId,{manual:true,jobId:id})
          : await s.saveOutputs(projectId, id)
        return send(res, 200, result)
      }
      fail('方法或路径不支持', 405)
    } catch (error) {
      if (res.headersSent) { res.destroy(); return }
      send(res, error.status ?? 500, {error: redact(redact(error.message, instance?.key), options.key ?? process.env.TRIPO_CN_API_KEY), code: error.code ?? 'LOCAL_ERROR'})
    } finally { if (active) activeRequests-- }
  }
}
