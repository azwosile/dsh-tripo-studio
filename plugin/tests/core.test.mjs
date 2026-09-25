import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import * as plugin from '../index.js'
import {normalizeJob} from '../shared/contracts.js'
import {JobService} from '../server/service.js'
import {Store, imageInfo} from '../server/store.js'
import {TripoClient, TripoError, isPublicIP, validateAssetURL} from '../server/tripo.js'

const cordisRequire = createRequire(process.env.DSH_APP_NODE_MODULES ? path.join(process.env.DSH_APP_NODE_MODULES, '..', 'package.json') : import.meta.url)
const {Context, resolveConfig} = await import(pathToFileURL(cordisRequire.resolve('@deepseek-ai/cordis')).href)

const png = fs.readFileSync(new URL('./fixtures/reference.png', import.meta.url))
const make = (t, overrides = {}) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tripo-test-'))
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}))
  const calls = {create: 0, upload: 0, task: 0}
  const client = {async create(){calls.create++;return {task_id:'task_test'}},async upload(){calls.upload++;return 'file_test'},async task(){calls.task++;return {status:'success',progress:100,output:{generated_image_url:'https://cdn.tripo3d.ai/result.png'},credits_consumed:10}}}
  const service = new JobService({directory,key:'unit-test-key-never-real',enabled:true,client,downloader:async()=>png,...overrides})
  const p = service.store.newProject('测试'), a = service.store.addAsset(p.id,png)
  return {service,p,a,calls,client,directory}
}
const text = {kind:'text-to-image',params:{prompt:'一个完整成年角色',model:'chat_image_2.5_flare',size:'1024x1536',quality:'low'}}

test('Cordis reproduces old validate crash; fixed Config passes real resolveConfig', () => {
  assert.throws(()=>resolveConfig({Config:{demoMode:{type:'boolean'}}},{}),/validate/)
  assert.deepEqual(resolveConfig(plugin,{}),{demoMode:false})
  assert.deepEqual(resolveConfig(plugin,{demoMode:true}),{demoMode:true})
  assert.throws(()=>resolveConfig(plugin,{demoMode:'false'}),/demoMode/)
})
test('real Cordis context activates and disposes the route, without starting network jobs', async () => {
  const ctx=new Context();let active=0
  ctx.provide('webServer',{register(route){assert.equal(route.kind,'prefix');assert.equal(route.path,'/dsh-tripo-studio');active++;return()=>active--}})
  const fiber=ctx.plugin(plugin,{demoMode:false})
  await new Promise(r=>setTimeout(r,30));assert.equal(active,1)
  fiber.dispose();await new Promise(r=>setTimeout(r,10));assert.equal(active,0)
})
test('GPT-image 2.5 model mapping and high quality supported; unknown contracts rejected', () => {
  assert.equal(normalizeJob('text-to-image',{...text.params,model:'chat_image_2.5_sunburst',quality:'max'}).quality,'max')
  assert.throws(()=>normalizeJob('text-to-image',{...text.params,model:'gpt-image-2.5'}))
  assert.throws(()=>normalizeJob('text-to-image',{...text.params,model:'chat_image_2',quality:'max'}))
  assert.throws(()=>normalizeJob('text-to-image',{...text.params,template:'character_split'}))
  assert.throws(()=>normalizeJob('text-to-image',{...text.params,n:4}))
  assert.throws(()=>normalizeJob('image-to-model',{input_asset:'0'.repeat(36),texture:false,pbr:true}))
})
test('local asset does not call API; PNG dimensions and project isolation checked', t => {
  const {service,p,a,calls}=make(t)
  assert.deepEqual(imageInfo(png),{mime:'image/png',width:256,height:256})
  assert.equal(calls.upload,0);assert.equal(calls.create,0)
  const other=service.store.newProject('Other')
  assert.throws(()=>service.prepare(other.id,{kind:'image-to-image',params:{...text.params,input_asset:a.id}}),/不属于/)
  assert.throws(()=>service.store.asset(other.id,a.id),/不属于/)
  assert.throws(()=>imageInfo(Buffer.from('<svg/>')),/有效 PNG/)
  assert.equal(service.store.snapshot(p.id).assets[0].url.includes(p.id),true)
})
test('preparing needs no key or payment; enabling + approval required for submission', async t => {
  const {service,p,calls}=make(t,{key:'',enabled:false})
  const j=service.prepare(p.id,text)
  assert.equal(j.status,'awaiting_approval');assert.equal(calls.create,0)
  await assert.rejects(()=>service.submit(p.id,j.id,j.approvalHash),/TRIPO_CN_API_KEY/)
  await assert.rejects(()=>service.submit(p.id,j.id,'wrong'),/审批/)
})
test('concurrent submit and refresh/restart cannot double-submit a paid POST', async t => {
  const {service,p,a,calls,client,directory}=make(t)
  const j=service.prepare(p.id,{kind:'image-to-image',params:{...text.params,input_asset:a.id}})
  await Promise.all([service.submit(p.id,j.id,j.approvalHash),service.submit(p.id,j.id,j.approvalHash)])
  assert.equal(calls.create,1);assert.equal(calls.upload,1)
  const restored=new JobService({directory,key:service.key,enabled:true,client,downloader:async()=>png})
  await restored.refresh(p.id)
  assert.equal(calls.create,1);assert.equal(calls.task,1)
  const done=restored.store.snapshot(p.id).jobs[0]
  assert.equal(done.status,'success');assert.equal(done.downloadStatus,'downloaded');assert.equal(done.creditsConsumed,10)
  assert.equal('accountHash' in done,false);assert.equal('output' in done,false)
  assert.equal(fs.readFileSync(path.join(directory,'state.json'),'utf8').includes(service.key),false)
})
test('changed bytes and changed account invalidate approval', async t => {
  const {service,p,a,directory,client}=make(t)
  const j=service.prepare(p.id,{kind:'image-to-image',params:{...text.params,input_asset:a.id}})
  const other=new JobService({directory,key:'another-test-key',enabled:true,client})
  await assert.rejects(()=>other.submit(p.id,j.id,j.approvalHash),/账户已改变/)
  fs.appendFileSync(service.store.assetPath(a),'changed')
  await assert.rejects(()=>service.submit(p.id,j.id,j.approvalHash),/输入文件已改变/)
})
test('lost POST response stays submission_unknown across restart; never automatically retried', async t => {
  const {service,p,calls,client,directory}=make(t)
  client.create=async()=>{calls.create++;throw new TripoError('network dropped')}
  const j=service.prepare(p.id,text)
  assert.equal((await service.submit(p.id,j.id,j.approvalHash)).status,'submission_unknown')
  const restored=new JobService({directory,key:service.key,enabled:true,client})
  await restored.submit(p.id,j.id,j.approvalHash);await restored.refresh(p.id)
  assert.equal(calls.create,1);assert.equal(calls.task,0)
})
test('interrupted submitting recovers as unknown, not as a queued retry', t=>{
  const {service,p,directory}=make(t),j=service.prepare(p.id,text)
  service.store.state.jobs[j.id].status='submitting';service.store.save()
  assert.equal(new Store(directory).job(p.id,j.id).status,'submission_unknown')
})
test('download failure remains cloud success; retry saves without generating again', async t=>{
  const {service,p,calls}=make(t,{downloader:async()=>{throw new Error('CDN offline')}})
  const j=service.prepare(p.id,text);await service.submit(p.id,j.id,j.approvalHash);await service.refresh(p.id)
  assert.equal(service.store.job(p.id,j.id).status,'success');assert.equal(service.store.job(p.id,j.id).downloadStatus,'download_failed')
  service.downloader=async()=>png;await service.saveOutputs(p.id,j.id)
  assert.equal(service.store.job(p.id,j.id).downloadStatus,'downloaded');assert.equal(calls.create,1)
})
test('stopping tracking is not cancellation, and draft discard does not call provider', async t=>{
  const {service,p,calls}=make(t);const j=service.prepare(p.id,text)
  service.discard(p.id,j.id);assert.equal(calls.create,0)
  const k=service.prepare(p.id,text);await service.submit(p.id,k.id,k.approvalHash)
  service.track(p.id,k.id,false);await service.refresh(p.id);assert.equal(calls.task,0);assert.equal(service.store.job(p.id,k.id).status,'queued')
  assert.throws(()=>service.discard(p.id,k.id),/只能丢弃/)
})
test('malformed/unreadable database fails closed without overwriting it', t=>{
  const {directory}=make(t);fs.writeFileSync(path.join(directory,'state.json'),'{broken')
  assert.throws(()=>new Store(directory));assert.equal(fs.readFileSync(path.join(directory,'state.json'),'utf8'),'{broken')
})
test('stale project revisions do not overwrite latest draft', t=>{
  const {service,p}=make(t)
  service.store.updateProject(p.id,{revision:0,draft:{prompt:'new'}})
  assert.throws(()=>service.store.updateProject(p.id,{revision:0,draft:{prompt:'old'}}),/已变化/)
  assert.equal(service.store.project(p.id).draft.prompt,'new')
})
test('upstream GET retries 429; paid POST is never retried and errors are redacted', async()=>{
  let n=0;const client=new TripoClient({key:'secret-unit-key',sleep:async()=>{},fetchImpl:async()=>{n++;return new Response(JSON.stringify({code:n<3?429:0,message:'secret-unit-key',data:{status:'running'}}),{status:n<3?429:200})}})
  await client.task('task_abc');assert.equal(n,3)
  n=0;await assert.rejects(()=>client.create('text-to-image',{}),e=>!e.message.includes('secret-unit-key'));assert.equal(n,1)
})
test('CDN URL and DNS guards block loopback, credentials, evil suffixes, private resolution',async()=>{
  assert.equal(isPublicIP('127.0.0.1'),false);assert.equal(isPublicIP('10.0.0.1'),false);assert.equal(isPublicIP('::ffff:127.0.0.1'),false);assert.equal(isPublicIP('8.8.8.8'),true)
  const resolve=async()=>[{address:'8.8.8.8',family:4}]
  for(const url of ['http://cdn.tripo3d.ai/x','https://cdn.tripo3d.ai.evil.example/x','https://u:p@cdn.tripo3d.ai/x','https://127.0.0.1/x','file:///etc/passwd'])await assert.rejects(()=>validateAssetURL(url,{resolve}))
  await assert.rejects(()=>validateAssetURL('https://cdn.tripo3d.ai/x',{resolve:async()=>[{address:'192.168.0.1',family:4}]}))
  assert.equal((await validateAssetURL('https://cdn.tripo3d.ai/x',{resolve})).url.hostname,'cdn.tripo3d.ai')
})

test('credential changes pause old queries and cannot reuse another credential task reference', async t=>{
  const {service,p,calls,client,directory}=make(t)
  const j=service.prepare(p.id,text);await service.submit(p.id,j.id,j.approvalHash)
  const changed=new JobService({directory,key:'rotated-test-key',enabled:true,client})
  await changed.refresh(p.id)
  assert.equal(calls.task,0);assert.match(changed.store.job(p.id,j.id).lastQueryError,/凭据已改变/)
  await service.refresh(p.id)
  const rotated=new JobService({directory,key:'rotated-test-key',enabled:true,client})
  assert.throws(()=>rotated.prepare(p.id,{kind:'image-to-image',params:{...text.params,input_job:j.id}}),/其他凭据/)
})
test('a mismatched task response cannot replace this task or download someone else\'s output',async t=>{
  const {service,p,client}=make(t)
  const j=service.prepare(p.id,text);await service.submit(p.id,j.id,j.approvalHash)
  client.task=async()=>({task_id:'task_unrelated',status:'success',progress:100,output:{generated_image_url:'https://cdn.tripo3d.ai/unrelated.png'}})
  await service.refresh(p.id)
  assert.equal(service.store.job(p.id,j.id).status,'queued')
  assert.match(service.store.job(p.id,j.id).lastQueryError,/标识不匹配/)
  assert.equal(service.store.job(p.id,j.id).downloadStatus,'not_started')
})
test('explicit download retry refreshes the signed output URL without another paid POST',async t=>{
  const {service,p,client,calls}=make(t,{downloader:async url=>{if(url.endsWith('/expired.png'))throw new Error('expired');return png}})
  let queries=0
  client.task=async()=>({task_id:'task_test',status:'success',progress:100,output:{generated_image_url:++queries===1?'https://cdn.tripo3d.ai/expired.png':'https://cdn.tripo3d.ai/renewed.png'}})
  const j=service.prepare(p.id,text);await service.submit(p.id,j.id,j.approvalHash);await service.refresh(p.id)
  assert.equal(service.store.job(p.id,j.id).downloadStatus,'download_failed')
  await service.saveOutputs(p.id,j.id)
  assert.equal(service.store.job(p.id,j.id).downloadStatus,'downloaded')
  assert.equal(queries,2);assert.equal(calls.create,1)
})
