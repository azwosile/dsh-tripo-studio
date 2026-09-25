import test from 'node:test'
import assert from 'node:assert/strict'
import {createLocalApi} from '../client-src/local-api.js'
import {hostRouter} from './fixtures/host-router.mjs'
const token='a'.repeat(64)
const setup=(fetcher,extra={})=>createLocalApi({getCsrf:()=>token,isOffline:()=>false,fetcher,...extra})
test('production plugin registration reaches child routes with DSH prefix semantics',()=>{
 const handler=()=>{},router=hostRouter(handler)
 for(const p of ['/status','/projects','/credentials','/assets/id?project=x'])assert.equal(router.match('/dsh-tripo-studio'+p)?.handler,handler)
 assert.equal(router.match('/dsh-tripo-studio-evil/status'),undefined)
 assert.equal(router.match('/other/status'),undefined)
 router.dispose();assert.equal(router.match('/dsh-tripo-studio/status'),undefined)
})
test('historical trailing slash misses ordinary DSH child paths',()=>{
 const router=hostRouter(()=>{}),route=[...router.routes.values()][0];router.routes.clear();router.routes.set('/dsh-tripo-studio/',{...route,path:'/dsh-tripo-studio/'})
 assert.equal(router.match('/dsh-tripo-studio/status'),undefined)
})
test('HTML fallback gets actionable safe error, not false offline or invalid-key claim',async()=>{
 let calls=0;const api=setup(async()=>{calls++;return new Response('<html>PRIVATE-HOST-CONTENT</html>',{status:200,headers:{'content-type':'text/html'}})})
 await assert.rejects(()=>api('/status'),e=>/HTTP 200/.test(e.message)&&/路由/.test(e.message)&&!e.message.includes('PRIVATE-HOST-CONTENT'))
 assert.equal(calls,1)
})
test('invalid JSON and incomplete handshake never enable controls',async()=>{
 await assert.rejects(()=>setup(async()=>new Response('{broken',{headers:{'content-type':'application/json'}}))('/status'),/无效 JSON/)
 await assert.rejects(()=>setup(async()=>Response.json({keyConfigured:true,paidEnabled:true}))('/status'),/状态响应不完整/)
})
test('API keeps same-origin marker and CSRF; paid mutations are never retried',async()=>{
 let calls=0;const api=setup(async(url,options)=>{calls++;assert.equal(url,'/dsh-tripo-studio/projects/id/jobs/id/submit');assert.equal(options.credentials,'same-origin');assert.equal(options.headers['x-tripo-studio'],'1');assert.equal(options.headers['x-tripo-csrf'],token);assert.equal(options.signal,undefined);throw Error('private network detail')})
 await assert.rejects(()=>api('/projects/id/jobs/id/submit','POST',{approvalHash:'fake'}),e=>!e.message.includes('private network detail'))
 assert.equal(calls,1)
})
test('offline preview does not attempt network; status timeout is bounded',async()=>{
 await assert.rejects(()=>setup(()=>{throw Error('must not call')},{isOffline:()=>true})('/status'),/离线界面预览/)
 const api=setup((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')))),{statusTimeoutMs:10})
 await assert.rejects(()=>api('/status'),/超时/)
})
test('successful handshake returns credentials metadata only as supplied by backend',async()=>{
 const status={keyConfigured:false,paidEnabled:false,csrfToken:token,site:'cn',apiBase:'https://openapi.tripo3d.com/v3'}
 assert.deepEqual(await setup(async()=>Response.json(status))('/status'),status)
})
