import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {ProjectLocation} from '../server/project-location.js'
import {chooseNativeFolder} from '../server/folder-picker.js'
import {JobService} from '../server/service.js'
import {createHandler} from '../server/routes.js'
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-location-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const data=path.join(root,'original'),picked=path.join(root,'chosen');fs.mkdirSync(data);fs.mkdirSync(picked);return {root,data,picked}}
test('native picker fixed program, cancellation, platform and failures',async()=>{
 await assert.rejects(()=>chooseNativeFolder({platform:'linux'}),/Windows/)
 assert.equal(await chooseNativeFolder({platform:'win32',run:(exe,args,opts,cb)=>{assert.ok(args.includes('-STA'));assert.ok(args.includes('-EncodedCommand'));cb(null,'')}}),null)
 const selected='D:\\艺术项目';assert.equal(await chooseNativeFolder({platform:'win32',run:(exe,args,opts,cb)=>cb(null,Buffer.from(selected).toString('base64'))}),selected)
 await assert.rejects(()=>chooseNativeFolder({platform:'win32',run:(exe,args,opts,cb)=>cb(Error('private diagnostic'))}),e=>!e.message.includes('private'))
})
test('root switch persists; per-project assets; no data or credentials migration; default restore',async t=>{
 const {data,picked}=fixture(t),m=new ProjectLocation(data,{picker:async()=>picked}),old=m.openStore(),p=old.newProject('old')
 fs.mkdirSync(path.join(data,'secrets'));fs.writeFileSync(path.join(data,'secrets','keep.txt'),'NOT_A_KEY')
 const oldState=fs.readFileSync(old.file),proposal=await m.choose();assert.equal(fs.readdirSync(picked).length,0)
 const store=m.apply({selectionToken:proposal.selectionToken,confirm:true}),q=store.newProject('new')
 const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(16,16);png.writeUInt32BE(16,20)
 const a=store.addAsset(q.id,png);assert.equal(path.dirname(store.assetPath(a)),path.join(picked,'projects',q.id,'files'));assert.equal(fs.existsSync(path.join(picked,'secrets')),false)
 assert.deepEqual(fs.readFileSync(old.file),oldState);assert.equal(new ProjectLocation(data).openStore().project(q.id).name,'new')
 const back=await m.choose(true);const restored=m.apply({selectionToken:back.selectionToken,confirm:true});assert.equal(restored.project(p.id).name,'old');assert.equal(fs.readFileSync(path.join(data,'secrets','keep.txt'),'utf8'),'NOT_A_KEY')
})
test('tokens required and expiring; nonempty gets a subfolder proposal; overlap and forged path rejected',async t=>{
 const {data,picked}=fixture(t);let clock=0;const m=new ProjectLocation(data,{picker:async()=>picked,now:()=>clock})
 assert.throws(()=>m.apply({directory:picked,confirm:true}),/失效/)
 const p=await m.choose();assert.throws(()=>m.apply({selectionToken:p.selectionToken,confirm:true,directory:picked}),/失效/)
 clock=300001;assert.throws(()=>m.apply({selectionToken:p.selectionToken,confirm:true}),/失效/)
 // 0.3.3 REQ-068: a non-empty folder is no longer rejected; a dedicated child folder is proposed (created only on confirm).
 fs.writeFileSync(path.join(picked,'unrelated.txt'),'keep');const sub=await m.choose();assert.equal(sub.subfolder,true);assert.equal(sub.directory,path.join(fs.realpathSync(picked),'Tripo Studio 项目'));assert.equal(fs.existsSync(sub.directory),false)
 assert.equal(fs.readFileSync(path.join(picked,'unrelated.txt'),'utf8'),'keep')
 const nested=path.join(data,'child');fs.mkdirSync(nested);assert.throws(()=>m.validate(nested),/独立/)
 assert.throws(()=>m.validate(data),/独立/)
})
test('selection revalidated on confirmation; symlink and corrupt config fail closed',async t=>{
 const {root,data,picked}=fixture(t),m=new ProjectLocation(data,{picker:async()=>picked});const p=await m.choose()
 fs.writeFileSync(path.join(picked,'foreign'),'x');assert.throws(()=>m.apply({selectionToken:p.selectionToken,confirm:true}),/空文件夹/)
 const link=path.join(root,'junction');fs.symlinkSync(picked,link,process.platform==='win32'?'junction':'dir');assert.throws(()=>m.validate(link),/链接/)
 fs.writeFileSync(path.join(data,'storage-location.json'),'{broken');assert.throws(()=>new ProjectLocation(data),/损坏/)
})
test('storage routes require same-origin CSRF; busy blocks; switch rotates token and leaves credentials',async t=>{
 const {data,picked}=fixture(t);const m=new ProjectLocation(data,{picker:async()=>picked}),s=new JobService({directory:data,store:m.openStore(),key:'',enabled:false})
 const server=http.createServer(createHandler({service:s,storageManager:m}));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
 const base=`http://127.0.0.1:${server.address().port}/dsh-tripo-studio`;let csrf=''
 async function request(url,method='GET',body,headers={}){const r=await fetch(base+url,{method,headers:{'x-tripo-studio':'1','content-type':'application/json','x-tripo-csrf':csrf,...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()}}
 csrf=(await request('/status')).data.csrfToken
 assert.equal((await request('/storage/choose','POST',{}, {origin:'https://evil.invalid'})).status,403)
 assert.equal((await request('/storage/choose','POST',{directory:picked})).status,400)
 s.locks.add('test');assert.equal((await request('/storage/choose','POST',{})).status,409);s.locks.clear()
 const proposal=(await request('/storage/choose','POST',{})).data
 const originalCsrf=csrf,result=await request('/storage','PUT',{selectionToken:proposal.selectionToken,confirm:true});assert.equal(result.status,200);assert.notEqual(result.data.csrfToken,originalCsrf)
 assert.equal(s.credentialStore.directory,path.join(data,'secrets'));assert.equal((await request('/projects','POST',{name:'stale'})).status,403)
 csrf=result.data.csrfToken;assert.equal((await request('/projects','POST',{name:'new'})).status,201)
})
