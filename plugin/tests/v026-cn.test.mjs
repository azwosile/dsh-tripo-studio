import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {CredentialStore} from '../server/credentials.js'
import {JobService} from '../server/service.js'
import {TripoClient} from '../server/tripo.js'
import {hash,publicJob} from '../server/store.js'
import {TRIPO_SITE,TRIPO_API_BASE} from '../shared/site.js'
import {IMAGE_MODELS} from '../shared/image-models.js'
import {MODEL_VERSIONS} from '../shared/contracts.js'
import {createLocalApi} from '../client-src/local-api.js'
const KEY='fake-cn-test-only', spec={kind:'text-to-image',params:{prompt:'test'}}
function directory(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-cn-test-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d}
function fixture(t){
 const dir=directory(t),calls=[]
 const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(256,16);png.writeUInt32BE(256,20)
 const client={upload:async()=>{calls.push('upload');return 'file_cn'},create:async()=>{calls.push('create');return {task_id:'task_cn'}},task:async()=>{calls.push('task');return {task_id:'task_cn',status:'success',output:{generated_image_url:'https://cdn.tripo3d.com/fake.png'}}}}
 const s=new JobService({directory:dir,key:KEY,enabled:true,client,downloader:async()=>{calls.push('download');return png}})
 const p=s.store.newProject('CN test'),j=s.prepare(p.id,spec)
 return {dir,s,p,j,calls,client,png}
}
function legacy(s,j,site){const raw=s.store.state.jobs[j.id];delete raw.site;if(site!==undefined)raw.site=site;s.store.save();return raw}
const siteError=e=>e.code==='SITE_CHANGED'

test('all catalog image and official geometry models plus upload, query and balance target literal CN origin',async()=>{
 assert.equal(TRIPO_SITE,'cn');assert.equal(TRIPO_API_BASE,'https://openapi.tripo3d.com/v3')
 const calls=[],client=new TripoClient({key:KEY,fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json({code:0,data:{file_token:'file_cn',task_id:'task_cn'}})}})
 for(const model of IMAGE_MODELS)for(const kind of ['text-to-image','image-to-image'])await client.create(kind,{model,prompt:'test'})
 for(const model of MODEL_VERSIONS)await client.create('image-to-model',{model,input:'file_cn'})
 await client.upload(Buffer.from('fixture'),'image/png');await client.task('task_cn');await client.balance()
 assert.equal(calls.length,IMAGE_MODELS.length*2+MODEL_VERSIONS.length+3)
 for(const {url,options} of calls){assert.equal(new URL(url).origin,'https://openapi.tripo3d.com');assert.ok(new URL(url).pathname.startsWith('/v3/'));assert.equal(options.headers.Authorization,`Bearer ${KEY}`);assert.equal(options.redirect,'error')}
})
test('unscoped legacy environment key and paid flag are not consumed; explicit CN environment works',t=>{
 const names=['TRIPO_API_KEY','TRIPO_STUDIO_ENABLE_PAID','TRIPO_CN_API_KEY','TRIPO_CN_ENABLE_PAID'],previous=Object.fromEntries(names.map(n=>[n,process.env[n]]))
 t.after(()=>{for(const n of names){if(previous[n]===undefined)delete process.env[n];else process.env[n]=previous[n]}})
 process.env.TRIPO_API_KEY='fake-legacy-only';process.env.TRIPO_STUDIO_ENABLE_PAID='1';delete process.env.TRIPO_CN_API_KEY;delete process.env.TRIPO_CN_ENABLE_PAID
 const s=new JobService({directory:directory(t)});assert.equal(s.key,'');assert.equal(s.enabled,false);assert.equal(new TripoClient().key,'')
 process.env.TRIPO_CN_API_KEY=KEY;process.env.TRIPO_CN_ENABLE_PAID='1'
 const cn=new JobService({directory:directory(t)});assert.equal(cn.key,KEY);assert.equal(cn.enabled,true);assert.equal(new TripoClient().key,KEY)
})
test('CN vault never decrypts or overwrites legacy international credential file',t=>{
 const dir=directory(t);fs.mkdirSync(path.join(dir,'secrets'));const old=path.join(dir,'secrets','connection.json'),sentinel='old encrypted fixture - not a real key';fs.writeFileSync(old,sentinel)
 let unprotects=0;const vault=new CredentialStore(dir,{protector:{supported:true,protect:()=>Buffer.from('fixture'),unprotect:()=>{unprotects++;throw Error('unexpected')}}})
 assert.equal(vault.load(),null);assert.equal(unprotects,0);assert.equal(path.basename(vault.file),'connection-cn.json')
 vault.save(KEY,false);vault.clear();assert.equal(fs.readFileSync(old,'utf8'),sentinel);assert.equal(unprotects,0)
})
test('copied old or wrong-site encrypted records fail closed without environment fallback',t=>{
 for(const record of [{version:1,provider:'windows-dpapi-current-user',ciphertext:'eA=='},{version:2,site:'international',cleared:true}]){
  const dir=directory(t),vault=new CredentialStore(dir,{protector:{supported:true,unprotect:()=>{throw Error('must not decrypt')}}});fs.mkdirSync(vault.directory);const before=JSON.stringify(record);fs.writeFileSync(vault.file,before)
  const s=new JobService({directory:dir,key:KEY,enabled:true,credentialStore:vault});assert.equal(s.key,'');assert.equal(s.enabled,false);assert.equal(s.storageError,true);assert.equal(fs.readFileSync(vault.file,'utf8'),before)
 }
})
test('inner encrypted site is checked even when the outer CN record looks correct',t=>{
 const dir=directory(t),vault=new CredentialStore(dir,{protector:{supported:true,unprotect:()=>Buffer.from(JSON.stringify({site:'international',key:KEY,paidEnabled:true}))}})
 fs.mkdirSync(vault.directory);fs.writeFileSync(vault.file,JSON.stringify({version:2,site:'cn',provider:'windows-dpapi-current-user',ciphertext:'eA=='}))
 assert.equal(vault.load().storageError,true);assert.equal(vault.load().key,'')
})
test('new jobs and approval/account fingerprints bind the CN site and status contains no key',t=>{
 const {s,p,j}=fixture(t),raw=s.store.job(p.id,j.id)
 assert.equal(j.site,'cn');assert.equal(s.status().site,'cn');assert.equal(s.status().apiBase,TRIPO_API_BASE)
 assert.notEqual(raw.accountHash,hash(KEY));assert.equal(raw.approvalHash,hash(JSON.stringify({site:'cn',projectId:p.id,kind:raw.kind,params:raw.params,inputHash:raw.inputHash,accountHash:raw.accountHash,priority:raw.priority,role:raw.role})))
 assert.ok(!JSON.stringify(s.status()).includes(KEY));assert.ok(!JSON.stringify(publicJob(raw)).includes(raw.accountHash))
})
test('legacy, explicit international and unknown-site drafts cannot submit even with the same key',async t=>{
 for(const site of [undefined,'international','unknown']){const {s,p,j,calls}=fixture(t);legacy(s,j,site);await assert.rejects(()=>s.submit(p.id,j.id,j.approvalHash),siteError);assert.deepEqual(calls,[])}
})
test('legacy queued tasks are preserved but skipped by refresh and cannot resume tracking',async t=>{
 const {s,p,j,calls}=fixture(t),raw=legacy(s,j);raw.status='queued';raw.taskId='task_legacy';s.store.save();const before=fs.readFileSync(s.store.file)
 const snapshot=await s.refresh(p.id);assert.equal(snapshot.jobs[0].site,'international');assert.equal(snapshot.jobs[0].status,'queued');assert.deepEqual(calls,[]);assert.deepEqual(fs.readFileSync(s.store.file),before)
 assert.throws(()=>s.track(p.id,j.id,true),siteError);s.track(p.id,j.id,false)
})
test('legacy image task IDs cannot be referenced or downloaded through CN',async t=>{
 const {s,p,j,calls}=fixture(t),raw=legacy(s,j);raw.status='success';raw.taskId='task_legacy';raw.downloadStatus='download_failed';raw.output={generated_image_url:'https://cdn.tripo3d.ai/old.png'}
 for(const kind of ['image-to-image','image-to-model'])assert.throws(()=>s.prepare(p.id,{kind,params:{input_job:j.id,...(kind==='image-to-image'?{prompt:'test'}:{})}}),siteError)
 await assert.rejects(()=>s.saveOutputs(p.id,j.id),siteError);assert.deepEqual(calls,[])
})
test('revalidates referenced task site before sending a paid request',async t=>{
 const {s,p,j,calls}=fixture(t),raw=s.store.job(p.id,j.id);raw.status='success';raw.taskId='task_cn'
 const next=s.prepare(p.id,{kind:'image-to-model',params:{input_job:j.id}});legacy(s,j)
 const result=await s.submit(p.id,next.id,next.approvalHash);assert.equal(result.status,'failed');assert.equal(result.errorCode,'SITE_CHANGED');assert.deepEqual(calls,[])
})
test('existing local assets survive and can be explicitly reused in a newly approved CN job',async t=>{
 const {s,p,j,calls,png}=fixture(t),raw=legacy(s,j);raw.status='success';raw.downloadStatus='downloaded'
 const a=s.store.addAsset(p.id,png,{kind:'image',label:'old local asset',sourceJobId:j.id});raw.assetIds=[a.id];s.store.save()
 await s.saveOutputs(p.id,j.id);assert.deepEqual(calls,[]);assert.deepEqual(fs.readFileSync(s.store.assetPath(a)),png)
 const next=s.prepare(p.id,{kind:'image-to-model',params:{input_asset:a.id}});assert.equal(next.site,'cn');assert.deepEqual(calls,[])
 await s.submit(p.id,next.id,next.approvalHash);assert.deepEqual(calls,['upload','create'])
})
test('CN jobs resume normally after restart without re-submitting generation',async t=>{
 const {s,p,j,calls,client,dir,png}=fixture(t);await s.submit(p.id,j.id,j.approvalHash)
 const next=new JobService({directory:dir,key:KEY,enabled:true,client,downloader:async()=>png});await next.refresh(p.id)
 assert.equal(next.store.job(p.id,j.id).downloadStatus,'downloaded');assert.deepEqual(calls,['create','task'])
})
test('new UI rejects legacy or wrong-site backend handshakes',async()=>{
 for(const more of [{},{site:'international',apiBase:'https://openapi.tripo3d.ai/v3'},{site:'cn',apiBase:'https://openapi.tripo3d.ai/v3'}]){
  const api=createLocalApi({getCsrf:()=>'',isOffline:()=>false,fetcher:async()=>Response.json({keyConfigured:true,paidEnabled:true,csrfToken:'a'.repeat(64),...more})})
  await assert.rejects(()=>api('/status'),/站点不一致/)
 }
})
