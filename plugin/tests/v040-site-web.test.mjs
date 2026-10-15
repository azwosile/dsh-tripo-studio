import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {JobService} from '../server/service.js'
import {CredentialStore} from '../server/credentials.js'
import {TripoClient} from '../server/tripo.js'
import {createHandler} from '../server/routes.js'
import {createWebAccess,normalizeWebOrigins} from '../server/web-access.js'
import {Config} from '../server/config.js'
import {estimateJobCredits} from '../shared/credit-estimate.js'
import {acceptSiteHandshake,TRIPO_SITES} from '../shared/site.js'
const token='TEST_WEB_ACCESS_ONLY_'.repeat(3)
const spec={kind:'text-to-image',params:{prompt:'测试',model:'chat_image_2.5_flare'}}
const dir=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v040-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d}
function fixture(t){const calls=[],factory=(key,site)=>({create:async()=>{calls.push({op:'create',key,site});return {task_id:'task_same'}},task:async id=>{calls.push({op:'task',key,site});return {task_id:id,type:'text_to_image',status:'queued',progress:0}}});const s=new JobService({directory:dir(t),key:'FAKE_CN_ONLY',enabled:true,clientFactory:factory});return {s,calls,p:s.store.newProject('双站')}}
test('国际站所有请求固定 .ai/v3，网络失败不切站、不重试收费 POST',async()=>{
 const calls=[],client=new TripoClient({site:'international',key:'FAKE_INT_ONLY',sleep:async()=>{},fetchImpl:async(url,opt)=>{calls.push({url,opt});return Response.json({code:0,data:{file_token:'file_int',task_id:'task_int'}})}})
 for(const kind of ['text-to-image','image-to-image','image-to-model','multiview-to-model','model-convert','mesh-decimate'])await client.create(kind,{})
 await client.upload(Buffer.from('fixture'),'image/png');await client.task('task_int');await client.balance();await client.usage()
 assert.equal(calls.length,10)
 for(const c of calls){assert.ok(c.url.startsWith(TRIPO_SITES.international.apiBase+'/'));assert.equal(c.opt.headers.Authorization,'Bearer FAKE_INT_ONLY');assert.equal(c.opt.redirect,'error')}
 let failed=0;const broken=new TripoClient({site:'international',key:'FAKE_INT_ONLY',fetchImpl:async url=>{failed++;assert.ok(url.startsWith(TRIPO_SITES.international.apiBase));throw Error('mock network')}})
 await assert.rejects(()=>broken.create('image-to-model',{}));assert.equal(failed,1)
 assert.throws(()=>new TripoClient({site:'https://evil.invalid'}))
})
test('站点切换不复制密钥、不查询供应商；收费重新确认，国内站草稿不可跨站提交',async t=>{
 const {s,p,calls}=fixture(t),cn=s.prepare(p.id,spec)
 const status=s.selectSite({site:'international',confirm:true});assert.equal(status.keyConfigured,false);assert.equal(s.enabled,false);assert.equal(calls.length,0)
 await assert.rejects(()=>s.submit(p.id,cn.id,cn.approvalHash),e=>e.code==='SITE_CHANGED')
 assert.throws(()=>s.configureCredentials({site:'cn',key:'FAKE_INT_ONLY',paidEnabled:true,remember:false}),e=>e.code==='SITE_CHANGED')
 s.configureCredentials({site:'international',key:'FAKE_INT_ONLY',paidEnabled:true,remember:false})
 const intl=s.prepare(p.id,spec);await s.submit(p.id,intl.id,intl.approvalHash)
 assert.deepEqual(calls,[{op:'create',site:'international',key:'FAKE_INT_ONLY'}]);assert.equal(intl.site,'international')
 s.selectSite({site:'cn',confirm:true});assert.equal(s.key,'FAKE_CN_ONLY');assert.equal(s.enabled,false)
 s.selectSite({site:'international',confirm:true});assert.equal(s.key,'FAKE_INT_ONLY');assert.equal(s.enabled,false)
})
test('双站相同 task_id 不冲突；刷新只访问当前站点',async t=>{
 const {s,p,calls}=fixture(t);await s.importTask(p.id,{taskId:'task_same',confirm:true})
 s.selectSite({site:'international',confirm:true});s.configureCredentials({site:'international',key:'FAKE_INT_ONLY',paidEnabled:false,remember:false})
 await s.importTask(p.id,{taskId:'task_same',confirm:true});assert.equal(Object.values(s.store.state.jobs).length,2)
 calls.length=0;await s.refresh(p.id);assert.deepEqual(calls,[{op:'task',key:'FAKE_INT_ONLY',site:'international'}])
})
test('操作中切站失败；无确认、非法站点及任意 URL 被拒绝',t=>{
 const {s}=fixture(t);for(const body of [{site:'international'},{site:'evil',confirm:true}])assert.throws(()=>s.selectSite(body))
 s.locks.add('fake');assert.throws(()=>s.selectSite({site:'international',confirm:true}),e=>e.code==='SITE_BUSY');assert.equal(s.site,'cn')
})
test('两站独立加密文件，不迁移旧 connection.json，内外站点均校验',t=>{
 const d=dir(t),protector={supported:true,protect:b=>Buffer.from(b),unprotect:b=>Buffer.from(b)}
 const cn=new CredentialStore(d,{site:'cn',protector}),intl=new CredentialStore(d,{site:'international',protector})
 cn.save('FAKE_CN_ONLY',true);intl.save('FAKE_INT_ONLY',false);fs.writeFileSync(path.join(d,'secrets','connection.json'),'legacy-sealed')
 assert.equal(cn.load().key,'FAKE_CN_ONLY');assert.equal(intl.load().key,'FAKE_INT_ONLY');intl.clear();assert.equal(cn.load().key,'FAKE_CN_ONLY')
 assert.equal(fs.readFileSync(path.join(d,'secrets','connection.json'),'utf8'),'legacy-sealed')
 fs.copyFileSync(cn.file,intl.file);assert.equal(intl.load().storageError,true)
})
test('国际站不使用国内站数值报价；仅接收合法站点握手',()=>{
 acceptSiteHandshake({site:'international',apiBase:TRIPO_SITES.international.apiBase,siteProtocol:'explicit-v1'})
 assert.equal(estimateJobCredits({...spec,site:'international'}),null)
 assert.throws(()=>acceptSiteHandshake({site:'international',apiBase:TRIPO_SITES.cn.apiBase,siteProtocol:'explicit-v1'}))
 acceptSiteHandshake({site:'cn',apiBase:TRIPO_SITES.cn.apiBase});assert.equal(estimateJobCredits(spec),10)
})
test('Web 配置默认仅本机，拒绝无授权配置、非 HTTPS 与通配来源',()=>{
 const validate=Config['~standard'].validate;assert.equal(validate({}).value.accessMode,'local')
 assert.ok(validate({accessMode:'web'}).issues);assert.ok(validate({site:'evil'}).issues)
 for(const o of ['http://web.example','https://*.example','https://web.example/path','https://u:p@web.example'])assert.throws(()=>normalizeWebOrigins([o]))
 assert.throws(()=>createWebAccess({allowedOrigins:['https://web.example'],webToken:'short'}))
})
test('Web 会话过期、跨 Host、跨来源均拒绝；Cookie 为 HttpOnly、Secure、SameSite=Strict',()=>{
 let now=0;const access=createWebAccess({allowedOrigins:['https://web.example','https://other.example'],webToken:token,now:()=>now})
 const req={headers:{host:'web.example',origin:'https://web.example','sec-fetch-site':'same-origin'}},headers={};const res={setHeader:(k,v)=>headers[k]=v}
 assert.throws(()=>access.authorize(req),e=>e.code==='WEB_AUTH_REQUIRED')
 assert.throws(()=>access.login(req,res,{token:'wrong'}),e=>e.code==='WEB_AUTH_REQUIRED')
 access.login(req,res,{token});assert.match(headers['set-cookie'],/HttpOnly; SameSite=Strict; Max-Age=28800; Secure/)
 req.headers.cookie=headers['set-cookie'].split(';')[0];access.authorize(req)
 assert.throws(()=>access.authorize({headers:{...req.headers,host:'other.example',origin:'https://other.example'}}))
 assert.throws(()=>access.authorize({headers:{...req.headers,origin:'https://evil.invalid'}}),e=>e.code==='ORIGIN_DENIED')
 now=28800001;assert.throws(()=>access.authorize(req),e=>e.code==='WEB_AUTH_REQUIRED')
})
async function serverFixture(t,mode='web'){
 const d=dir(t);let handler
 const server=http.createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
 const base=`http://127.0.0.1:${server.address().port}`
 handler=createHandler({directory:d,accessMode:mode,allowedOrigins:[base],webToken:token})
 const request=async(route,method='GET',body,extra={})=>fetch(base+'/dsh-tripo-studio'+route,{method,headers:{origin:base,'x-tripo-studio':'1',...(body!==undefined?{'content-type':'application/json'}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})})
 return {d,request}
}
test('Web 未授权时不读项目、不返回状态或资产；代理头不构成授权',async t=>{
 const {d,request}=await serverFixture(t)
 for(const route of ['/status','/projects','/assets/00000000-0000-4000-8000-000000000000']){const r=await request(route,'GET',undefined,{'x-forwarded-for':'127.0.0.1'});assert.equal(r.status,401);await r.text()}
 assert.equal(fs.existsSync(path.join(d,'state.json')),false)
})
test('Web 登录后仍需 CSRF，站点切换旋转 CSRF，远程目录固定，退出立即失效',async t=>{
 const {request}=await serverFixture(t)
 let r=await request('/session','POST',{token});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];await r.text()
 r=await request('/status','GET',undefined,{cookie});const s=await r.json();assert.equal(s.accessMode,'web')
 r=await request('/projects','POST',{name:'missing csrf'},{cookie});assert.equal(r.status,403);await r.text()
 const headers={cookie,'x-tripo-csrf':s.csrfToken,'x-tripo-site':'cn'}
 r=await request('/site','PUT',{site:'international',confirm:true},headers);assert.equal(r.status,200);const next=await r.json();assert.notEqual(next.csrfToken,s.csrfToken)
 r=await request('/projects','POST',{name:'old csrf'},headers);assert.equal(r.status,403);await r.text()
 headers['x-tripo-csrf']=next.csrfToken;headers['x-tripo-site']='international'
 r=await request('/storage/choose','POST',{},headers);assert.equal(r.status,403);assert.equal((await r.json()).code,'WEB_STORAGE_FIXED')
 r=await request('/projects','POST',{name:'authorized'},headers);assert.equal(r.status,201);await r.text()
 r=await request('/session','DELETE',{},headers);assert.equal(r.status,200);await r.text()
 r=await request('/status','GET',undefined,{cookie});assert.equal(r.status,401);await r.text()
})
test('默认本机模式仍拒绝远程 Host/反代，不提供 Web 登录旁路',async t=>{
 const {request}=await serverFixture(t,'local');const r=await request('/session','POST',{token},{'x-forwarded-for':'1.2.3.4'});assert.equal(r.status,403);await r.text()
})
