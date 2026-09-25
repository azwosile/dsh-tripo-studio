import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import {JobService} from '../server/service.js'
import {createHandler} from '../server/routes.js'
import {TripoClient,TripoError} from '../server/tripo.js'
import {validTaskId} from '../shared/task-id.js'
import {normalizeJob,threeViewPrompt} from '../shared/contracts.js'
import {promptCap,promptGuidance} from '../shared/prompt-policy.js'
const png=fs.readFileSync(new URL('./fixtures/reference.png',import.meta.url))
const uuid='d7e93b68-a29a-43e2-82ee-69450d7f54f4',other='3b2b6e28-80cb-48c9-9d32-0275ecb7ba49'
const spec={kind:'text-to-image',params:{model:'chat_image_2.5_flare',prompt:'完整成年角色'}}
function setup(t,kind='text-to-image') {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v029-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
 const calls={create:0,upload:0,task:0,download:0}
 const result={task_id:uuid,type:kind.replaceAll('-','_'),status:'success',progress:100,output:{generated_image_url:'https://cdn.tripo3d.ai/mock.png',model_url:'https://cdn.tripo3d.ai/mock.glb'}}
 const client={async create(){calls.create++;return {task_id:uuid}},async upload(){calls.upload++;return 'file_mock'},async task(){calls.task++;return result}}
 const service=new JobService({directory:dir,key:'v029-fake-key',enabled:true,client,downloader:async()=>{calls.download++;return png}})
 const p=service.store.newProject('mock'),a=service.store.addAsset(p.id,png)
 const job=service.prepare(p.id,kind==='text-to-image'?spec:kind==='image-to-image'?{kind,params:{...spec.params,input_asset:a.id}}:{kind,params:{input_asset:a.id}})
 return {dir,service,client,calls,p,a,job,result}
}
function unknown(x){const j=x.service.store.job(x.p.id,x.job.id);j.status='submission_unknown';j.error='创建响应没有有效 task_id';x.service.store.save();return j}
test('ID grammar accepts observed UUIDs and documented task_ IDs only',()=>{
 for(const id of [uuid,other,uuid.toUpperCase(),'task_abc123','task_test-a_b'])assert.equal(validTaskId(id),true)
 for(const id of ['',null,42,'uuid','task_','task_x/../files','https://x/tasks/a',uuid+'?foo',uuid+'\n',' task_x','task_'+'x'.repeat(125)])assert.equal(validTaskId(id),false)
})
for(const kind of ['text-to-image','image-to-image','image-to-model'])test(`UUID create retained for ${kind}; replay never regenerates`,async t=>{
 const x=setup(t,kind);const j=await x.service.submit(x.p.id,x.job.id,x.job.approvalHash);assert.equal(j.taskId,uuid);assert.equal(j.status,'queued')
 await x.service.submit(x.p.id,x.job.id,x.job.approvalHash);assert.equal(x.calls.create,1)
})
test('actual transport decodes documented envelope, sends CN paths and bearer, accepts UUID task query',async()=>{
 const requests=[];const c=new TripoClient({key:'mock-key',fetchImpl:async(url,opts)=>{requests.push({url,opts});return new Response(JSON.stringify({code:0,data:{task_id:uuid}}),{status:200})}})
 assert.equal((await c.create('text-to-image',{prompt:'test'})).task_id,uuid);await c.task(uuid)
 assert.equal(requests[0].url,'https://openapi.tripo3d.com/v3/generation/text-to-image');assert.equal(requests[0].opts.headers.Authorization,'Bearer mock-key');assert.equal(requests[1].url,`https://openapi.tripo3d.com/v3/tasks/${uuid}`)
 assert.throws(()=>c.task('../files'));assert.equal(requests.length,2)
})
test('invalid create ID stays unknown, cannot delete or re-submit',async t=>{
 const x=setup(t);x.client.create=async()=>{x.calls.create++;return {task_id:'../files'}}
 const j=await x.service.submit(x.p.id,x.job.id,x.job.approvalHash);assert.equal(j.status,'submission_unknown')
 assert.throws(()=>x.service.deleteFailed(x.p.id,j.id,{confirm:true}),/不能删除/);await x.service.submit(x.p.id,j.id,j.approvalHash);assert.equal(x.calls.create,1)
})
test('unknown record recovery is GET-only, clears stale error, downloads once and survives restart',async t=>{
 const x=setup(t);unknown(x)
 const j=await x.service.recover(x.p.id,x.job.id,{taskId:uuid,confirm:true});assert.equal(j.status,'success');assert.equal(j.error,null);assert.equal(j.downloadStatus,'downloaded');assert.equal(j.assetIds.length,1)
 assert.deepEqual(x.calls,{create:0,upload:0,task:1,download:1})
 await x.service.recover(x.p.id,j.id,{taskId:uuid,confirm:true});assert.equal(x.calls.task,1)
 const restored=new JobService({directory:x.dir,key:x.service.key,client:x.client});assert.equal(restored.store.job(x.p.id,j.id).taskId,uuid)
 const manifest=restored.store.snapshot(x.p.id);assert.equal('accountHash'in manifest.jobs[0],false);assert.equal('output'in manifest.jobs[0],false)
})
test('recovery rejects wrong type/id/confirmation and account before mutating',async t=>{
 const x=setup(t);const j=unknown(x)
 await assert.rejects(x.service.recover(x.p.id,j.id,{taskId:uuid,confirm:false}));assert.equal(x.calls.task,0)
 for(const changes of [{type:'image_to_model'},{task_id:other},{status:'made_up'}]){
  const prev={...x.result};Object.assign(x.result,changes);await assert.rejects(x.service.recover(x.p.id,j.id,{taskId:uuid,confirm:true}));assert.equal(j.taskId,undefined);assert.equal(j.status,'submission_unknown');Object.assign(x.result,prev)
 }
 x.service.key='other-account';const count=x.calls.task;await assert.rejects(x.service.recover(x.p.id,j.id,{taskId:uuid,confirm:true}));assert.equal(x.calls.task,count)
})
test('recovery rejects missing type rather than guessing association',async t=>{const x=setup(t);unknown(x);delete x.result.type;await assert.rejects(x.service.recover(x.p.id,x.job.id,{taskId:uuid,confirm:true}));assert.equal(x.service.store.job(x.p.id,x.job.id).taskId,undefined)})
test('recovery rejects duplicate binding, including simultaneous different records',async t=>{
 const x=setup(t);unknown(x);const k=x.service.prepare(x.p.id,spec);x.service.store.job(x.p.id,k.id).status='submission_unknown'
 let resolve;x.client.task=()=>new Promise(r=>resolve=r)
 const pending=x.service.recover(x.p.id,x.job.id,{taskId:uuid,confirm:true});await assert.rejects(x.service.recover(x.p.id,k.id,{taskId:uuid,confirm:true}),/操作中/)
 resolve(x.result);await pending;await assert.rejects(x.service.recover(x.p.id,k.id,{taskId:uuid,confirm:true}),/已关联/)
})
test('manual refresh resumes query of paused known ID; automatic refresh respects pause',async t=>{
 const x=setup(t);await x.service.submit(x.p.id,x.job.id,x.job.approvalHash);x.service.track(x.p.id,x.job.id,false)
 await x.service.refresh(x.p.id);assert.equal(x.calls.task,0)
 await x.service.refresh(x.p.id,{manual:true,jobId:x.job.id});assert.equal(x.calls.task,1);assert.equal(x.calls.create,1);assert.equal(x.service.store.job(x.p.id,x.job.id).downloadStatus,'downloaded')
 await x.service.refresh(x.p.id,{manual:true,jobId:x.job.id});assert.equal(x.calls.download,1)
})
test('manual refresh can recover download failure without create/upload and saves at most one output',async t=>{
 const x=setup(t);await x.service.submit(x.p.id,x.job.id,x.job.approvalHash)
 x.service.downloader=async()=>{throw Error('expired')};await x.service.refresh(x.p.id);assert.equal(x.service.store.job(x.p.id,x.job.id).downloadStatus,'download_failed')
 x.service.downloader=async()=>png;await x.service.refresh(x.p.id,{manual:true});assert.equal(x.service.store.job(x.p.id,x.job.id).downloadStatus,'downloaded');assert.equal(x.calls.create,1);assert.equal(x.calls.task,2)
})
test('persisted output reused after interrupted job write',async t=>{
 const x=setup(t);const j=x.service.store.job(x.p.id,x.job.id);j.status='success';j.output={generated_image_url:'https://cdn.tripo3d.ai/mock.png'}
 const a=x.service.store.addAsset(x.p.id,png,{sourceJobId:j.id});await x.service.saveOutputs(x.p.id,j.id);assert.deepEqual(j.assetIds,[a.id]);assert.equal(x.calls.download,0)
})
test('confirmed failure delete removes only record; unknown/active/busy records protected; success deletable',t=>{
 const x=setup(t);const j=x.service.store.job(x.p.id,x.job.id)
 for(const status of ['submission_unknown','running','queued']){j.status=status;assert.throws(()=>x.service.deleteFailed(x.p.id,j.id,{confirm:true}))}
 j.status='failed';assert.throws(()=>x.service.deleteFailed(x.p.id,j.id,{confirm:false}))
 x.service.refreshing.set(x.p.id,Promise.resolve());assert.throws(()=>x.service.deleteFailed(x.p.id,j.id,{confirm:true}));x.service.refreshing.clear()
 const count=Object.keys(x.service.store.state.assets).length;x.service.deleteFailed(x.p.id,j.id,{confirm:true});assert.equal(x.service.store.state.jobs[j.id],undefined);assert.equal(Object.keys(x.service.store.state.assets).length,count);assert.equal(x.calls.task,0)
 const y=setup(t);y.service.store.job(y.p.id,y.job.id).status='success';y.service.deleteRecord(y.p.id,y.job.id,{confirm:true});assert.equal(y.service.store.state.jobs[y.job.id],undefined);assert.ok(y.service.store.state.assets[y.a.id])
})
test('image rewrite and three-view sheet use public image-to-image, normalized explicit input and saved selections',t=>{
 const x=setup(t);const j=x.service.prepare(x.p.id,{kind:'image-to-image',label:'角色三视图排版',params:{input_asset:x.a.id,model:'chat_image_2.5_sunburst',prompt:threeViewPrompt(),size:'2048x1152'}})
 assert.equal(j.kind,'image-to-image');assert.match(j.params.prompt,/正面.*侧面.*背面/);assert.equal(j.params.template,undefined);assert.equal(x.calls.create,0)
 const p=x.service.store.updateProject(x.p.id,{revision:0,draft:{editMode:'views',editPrompt:'改色',editModel:'banana2',editSize:'2K',editQuality:'',splitMode:'sheet'}});assert.equal(p.draft.splitMode,'sheet');assert.equal(p.draft.editMode,'views')
})
test('prompt limit labels separate official recommendation/local cap/observed Flare limit; no silent truncation',()=>{
 assert.equal(promptCap('chat_image_2.5_flare'),1800);assert.match(promptGuidance('banana2'),/未明确/)
 assert.equal(normalizeJob('text-to-image',{...spec.params,prompt:'x'.repeat(1800)}).prompt.length,1800)
 assert.throws(()=>normalizeJob('text-to-image',{...spec.params,prompt:'x'.repeat(1801)}),/1800/)
 assert.equal(normalizeJob('text-to-image',{model:'seedream_v5',prompt:'x'.repeat(1801)}).prompt.length,1801)
})
test('new HTTP actions keep CSRF and project isolation; GET-only recovery and delete confirmation',async t=>{
 const x=setup(t);unknown(x)
 const server=http.createServer(createHandler({service:x.service}));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
 const base=`http://127.0.0.1:${server.address().port}/dsh-tripo-studio`,headers={'x-tripo-studio':'1','content-type':'application/json'}
 const status=await(await fetch(base+'/status',{headers})).json();const post=(tail,body,csrf=true)=>fetch(base+tail,{method:'POST',headers:{...headers,...(csrf?{'x-tripo-csrf':status.csrfToken}:{})},body:JSON.stringify(body)})
 const route=`/projects/${x.p.id}/jobs/${x.job.id}`
 assert.equal((await post(route+'/recover',{taskId:uuid,confirm:true},false)).status,403)
 const p2=x.service.store.newProject('other');assert.equal((await post(`/projects/${p2.id}/jobs/${x.job.id}/recover`,{taskId:uuid,confirm:true})).status,404)
 assert.equal((await post(route+'/recover',{taskId:uuid,confirm:true})).status,200)
 assert.equal((await post(route+'/refresh',{})).status,200)
 assert.equal((await post(route+'/delete',{confirm:true})).status,200);assert.ok(x.service.store.state.assets[x.a.id])
 const j=x.service.prepare(x.p.id,spec);x.service.store.job(x.p.id,j.id).status='failed';assert.equal((await post(`/projects/${x.p.id}/jobs/${j.id}/delete`,{confirm:true})).status,200)
 assert.equal(x.calls.create,0);assert.equal(x.calls.upload,0)
})
