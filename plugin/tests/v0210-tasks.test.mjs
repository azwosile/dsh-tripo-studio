import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {JobService} from '../server/service.js'
import {createHandler} from '../server/routes.js'
import {modelInfo} from '../server/store.js'
import {normalizeJob} from '../shared/contracts.js'
import {TripoClient} from '../server/tripo.js'

// An isolated synthetic image is enough for backend header checks; never load user data.
const png=Buffer.alloc(24)
Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(256,16);png.writeUInt32BE(256,20)
const glb=Buffer.alloc(20);glb.write('glTF');glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8)
const fbx=Buffer.concat([Buffer.from('Kaydara FBX Binary  \x00\x1a\x00','binary'),Buffer.alloc(32)])
const idA='12345678-1234-1234-1234-123456789012',idB='12345678-1234-1234-1234-123456789013'
function fixture(t,{key='fake-cn-account',enabled=false}={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v0210-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
 const calls={query:[],create:[],upload:0,download:[]},remote=new Map()
 const client={async task(id){calls.query.push(id);if(!remote.has(id))throw Error('not found');return remote.get(id)},async create(kind,params){calls.create.push({kind,params});return {task_id:idB}},async upload(){calls.upload++;return 'file_mock'}}
 const service=new JobService({directory:dir,key,enabled,client,downloader:async url=>{calls.download.push(url);return url.endsWith('.fbx')?fbx:url.endsWith('.glb')?glb:png}})
 const p=service.store.newProject('A'),a=service.store.addAsset(p.id,png,{label:'参考图'})
 return {service,client,calls,remote,p,a,dir}
}
const modelSpec=id=>({kind:'image-to-model',params:{input_asset:id,model:'v3.1-20260211',texture:false,pbr:false,quad:true,face_limit:150000,geometry_quality:'standard'}})

test('official model topology/model/texture rules are normalized and bounded',()=>{
 const params=modelSpec('0'.repeat(36)).params
 assert.equal(normalizeJob('image-to-model',params).quad,true)
 assert.equal(normalizeJob('image-to-model',{...params,quad:false,face_limit:1500000}).face_limit,1500000)
 for(const invalid of [{face_limit:150001},{pbr:true},{texture_quality:'extreme'},{model:'v2.5-20250123'},{smart_low_poly:true,face_limit:10001}])
  assert.throws(()=>normalizeJob('image-to-model',{...params,...invalid}))
 const v25=normalizeJob('image-to-model',{input_asset:'0'.repeat(36),model:'v2.5-20250123',texture:false,pbr:false,face_limit:500000})
 assert.equal(v25.model,'v2.5-20250123');assert.equal(v25.geometry_quality,undefined)
 assert.equal(normalizeJob('image-to-model',{...params,quad:false,texture:true,pbr:true,texture_quality:'detailed',auto_size:true,enable_image_autofix:true}).texture_quality,'detailed')
 assert.throws(()=>normalizeJob('model-convert',{input_job:'0'.repeat(36),format:'OBJ',quad:true}),/FBX/)
 assert.equal(normalizeJob('model-convert',{input_job:'0'.repeat(36),format:'STL'}).format,'STL')
})
test('conversion is its own reviewed paid task, uses only official endpoint, never auto-runs',async t=>{
 const x=fixture(t,{enabled:true})
 const first=x.service.prepare(x.p.id,modelSpec(x.a.id))
 const draft=x.service.store.job(x.p.id,first.id);draft.status='success';draft.taskId=idA;x.service.store.save()
 const convert=x.service.prepare(x.p.id,{kind:'model-convert',params:{input_job:first.id,format:'FBX',quad:true}})
 assert.equal(convert.status,'awaiting_approval');assert.equal(x.calls.create.length,0)
 await x.service.submit(x.p.id,convert.id,convert.approvalHash)
 assert.deepEqual(x.calls.create,[{kind:'model-convert',params:{format:'FBX',quad:true,input:idA}}])
 const requests=[];const api=new TripoClient({key:'dummy',fetchImpl:async (url,options)=>{requests.push({url,options});return new Response(JSON.stringify({code:0,data:{task_id:idB}}))}})
 await api.create('model-convert',{input:idA,format:'FBX'})
 assert.equal(requests[0].url,'https://openapi.tripo3d.com/v3/models/convert')
 assert.equal(requests[0].options.headers.Authorization,'Bearer dummy')
})
test('model-plan topology, texture and quality choices persist as bounded local draft strings',t=>{
 const x=fixture(t)
 const next=x.service.store.updateProject(x.p.id,{revision:0,draft:{modelVersion:'v3.1-20260211',modelFaceLimit:'150000',modelGeometry:'detailed',modelTexture:'false',modelPbr:'false',modelTextureQuality:'standard',modelQuad:'true',modelSmart:'false',modelAutoSize:'false',modelAutofix:'true',modelTextureAlignment:'geometry',modelOrientation:'default',privateToken:'must not persist'}})
 assert.equal(next.draft.modelQuad,'true');assert.equal(next.draft.modelFaceLimit,'150000');assert.equal(next.draft.modelTexture,'false');assert.equal('privateToken' in next.draft,false)
 assert.equal(new JobService({directory:x.dir,key:x.service.key}).store.project(x.p.id).draft.modelVersion,'v3.1-20260211')
})
test('conversion cannot chain a convert task where official input only accepts previous generation IDs',t=>{
 const x=fixture(t,{enabled:true})
 const first=x.service.prepare(x.p.id,modelSpec(x.a.id));x.service.store.job(x.p.id,first.id).status='success';x.service.store.job(x.p.id,first.id).taskId=idA
 const converted=x.service.prepare(x.p.id,{kind:'model-convert',params:{input_job:first.id,format:'FBX'}})
 x.service.store.job(x.p.id,converted.id).status='success';x.service.store.job(x.p.id,converted.id).taskId=idB
 assert.throws(()=>x.service.prepare(x.p.id,{kind:'model-convert',params:{input_job:converted.id,format:'OBJ'}}),/成功的同账户3D任务/)
 assert.equal(x.calls.create.length,0)
})
test('manual cloud task import GET-only even when paid disabled; no duplicate across projects/accounts',async t=>{
 const x=fixture(t)
 x.remote.set(idA,{task_id:idA,type:'image_to_image',status:'success',progress:100,output:{generated_image_url:'https://cdn.tripo3d.ai/mock.png'}})
 const job=await x.service.importTask(x.p.id,{taskId:idA,confirm:true,label:'旧图像任务'})
 assert.equal(job.status,'success');assert.equal(job.downloadStatus,'downloaded');assert.equal(job.kind,'image-to-image');assert.equal(job.label,'旧图像任务')
 assert.equal('accountHash' in job,false);assert.equal('output' in job,false)
 assert.deepEqual([x.calls.query.length,x.calls.create.length,x.calls.upload,x.calls.download.length],[1,0,0,1])
 const other=x.service.store.newProject('B');await assert.rejects(x.service.importTask(other.id,{taskId:idA,confirm:true}),/已关联/)
 x.service.key='different account';await x.service.refresh(x.p.id,{manual:true,jobId:job.id})
 assert.match(x.service.store.job(x.p.id,job.id).lastQueryError,/凭据已改变/)
 assert.equal(x.calls.query.length,1)
})
test('manual import validates ID, remote type/status, confirmation and concurrent duplicates before storing',async t=>{
 const x=fixture(t);x.remote.set(idA,{task_id:idA,type:'weird_type',status:'success'})
 for(const body of [{taskId:idA,confirm:false},{taskId:'http://secret',confirm:true},{taskId:idA,confirm:true,extra:1}])await assert.rejects(x.service.importTask(x.p.id,body))
 await assert.rejects(x.service.importTask(x.p.id,{taskId:idA,confirm:true}),/不符/)
 x.remote.set(idA,{task_id:idA,type:'image_to_model',status:'queued'})
 let release;x.client.task=()=>new Promise(r=>{release=r})
 const p=x.service.importTask(x.p.id,{taskId:idA,confirm:true})
 await assert.rejects(x.service.importTask(x.p.id,{taskId:idA,confirm:true}),/操作中/)
 release(x.remote.get(idA));await p
 assert.equal(x.service.store.snapshot(x.p.id).jobs.length,1)
})
test('uploaded reference can be deleted only unreferenced, project selection clears safely and no cloud calls',t=>{
 const x=fixture(t);x.service.store.updateProject(x.p.id,{revision:0,draft:{selectedAsset:x.a.id,wholeAsset:x.a.id,prompt:'safe'}})
 const file=x.service.store.assetPath(x.a)
 assert.throws(()=>x.service.deleteAsset(x.p.id,x.a.id,{confirm:false}))
 const b=x.service.store.addAsset(x.p.id,png);const job=x.service.prepare(x.p.id,{kind:'image-to-image',params:{input_asset:b.id,model:'seedream_v5',size:'2K',prompt:'服装颜色'}})
 assert.throws(()=>x.service.deleteAsset(x.p.id,b.id,{confirm:true}),/关联/)
 const result=x.service.deleteAsset(x.p.id,x.a.id,{confirm:true})
 assert.equal(result.deleted,true);assert.equal(fs.existsSync(file),false);assert.equal(x.service.store.project(x.p.id).draft.selectedAsset,'');assert.equal(x.service.store.project(x.p.id).draft.wholeAsset,'');assert.equal(x.service.store.project(x.p.id).draft.prompt,'safe')
 assert.equal(x.service.store.project(x.p.id).revision,2);assert.equal(x.calls.query.length+x.calls.create.length,0)
})
test('success/failed deletion default preserves local assets, optional deletion removes only exclusive output',t=>{
 const x=fixture(t);const j=x.service.prepare(x.p.id,modelSpec(x.a.id));const stored=x.service.store.job(x.p.id,j.id)
 stored.status='success';stored.taskId=idA
 const output=x.service.store.addAsset(x.p.id,fbx,{kind:'model',sourceJobId:j.id,label:'模型'});stored.assetIds=[output.id];x.service.store.save()
 const outputFile=x.service.store.assetPath(output)
 assert.equal(x.service.store.snapshot(x.p.id).assets.find(a=>a.id===output.id).format,'fbx')
 assert.throws(()=>x.service.deleteRecord(x.p.id,j.id,{confirm:false}))
 assert.throws(()=>x.service.deleteRecord(x.p.id,j.id,{confirm:true,deleteAssets:'yes'}))
 x.service.deleteRecord(x.p.id,j.id,{confirm:true})
 assert.equal(fs.existsSync(outputFile),true);assert.equal(x.service.store.asset(x.p.id,output.id).sourceJobId,undefined)
 x.service.deleteAsset(x.p.id,output.id,{confirm:true});assert.equal(fs.existsSync(outputFile),false)
 const failed=x.service.prepare(x.p.id,modelSpec(x.a.id));x.service.store.job(x.p.id,failed.id).status='failed'
 assert.equal(x.service.deleteRecord(x.p.id,failed.id,{confirm:true,deleteAssets:true}).removedAssetIds.length,0)
})
test('confirmed removal of successful output deletes only that output and rolls back if state save fails',t=>{
 const x=fixture(t);const j=x.service.prepare(x.p.id,modelSpec(x.a.id));const record=x.service.store.job(x.p.id,j.id)
 record.status='success';record.taskId=idA
 const output=x.service.store.addAsset(x.p.id,glb,{kind:'model',sourceJobId:j.id});record.assetIds=[output.id];x.service.store.save()
 const file=x.service.store.assetPath(output)
 const originalSave=x.service.store.save.bind(x.service.store)
 x.service.store.save=()=>{throw Error('simulated disk failure')}
 assert.throws(()=>x.service.deleteRecord(x.p.id,j.id,{confirm:true,deleteAssets:true}),/simulated/)
 x.service.store.save=originalSave
 assert.equal(fs.existsSync(file),true);assert.ok(x.service.store.job(x.p.id,j.id));assert.ok(x.service.store.asset(x.p.id,output.id))
 const removed=x.service.deleteRecord(x.p.id,j.id,{confirm:true,deleteAssets:true})
 assert.deepEqual(removed.removedAssetIds,[output.id]);assert.equal(fs.existsSync(file),false);assert.ok(x.service.store.asset(x.p.id,x.a.id))
})
test('record/asset references and active/unknown states block destructive actions',t=>{
 const x=fixture(t);const j=x.service.prepare(x.p.id,{kind:'text-to-image',params:{prompt:'a',model:'seedream_v5',size:'2K'}})
 const source=x.service.store.job(x.p.id,j.id);source.status='success';source.taskId=idA
 const image=x.service.store.addAsset(x.p.id,png,{sourceJobId:j.id});source.assetIds=[image.id]
 const dependent=x.service.prepare(x.p.id,{kind:'image-to-image',params:{input_asset:image.id,model:'seedream_v5',prompt:'blue',size:'2K'}})
 assert.throws(()=>x.service.deleteRecord(x.p.id,j.id,{confirm:true,deleteAssets:true}),/引用/)
 assert.throws(()=>x.service.deleteAsset(x.p.id,image.id,{confirm:true}),/关联/)
 x.service.store.job(x.p.id,dependent.id).status='submission_unknown'
 assert.throws(()=>x.service.deleteRecord(x.p.id,dependent.id,{confirm:true}))
 const other=x.service.store.newProject('B');assert.throws(()=>x.service.deleteAsset(other.id,image.id,{confirm:true}),/不属于/)
 x.service.refreshing.set(x.p.id,Promise.resolve());assert.throws(()=>x.service.deleteRecord(x.p.id,j.id,{confirm:true}));x.service.refreshing.clear()
})
test('model format checking accepts official outputs and rejects mismatch/unsafe external glTF',()=>{
 assert.equal(modelInfo(glb).format,'glb');assert.equal(modelInfo(fbx).format,'fbx')
 assert.equal(modelInfo(Buffer.from('# model\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3'),'OBJ').format,'obj')
 const stl=Buffer.alloc(84+50);stl.writeUInt32LE(1,80);assert.equal(modelInfo(stl,'STL').format,'stl')
 const embedded=Buffer.from(JSON.stringify({asset:{version:'2.0'},scenes:[],buffers:[{uri:'data:application/octet-stream;base64,AAAA'}]}))
 assert.equal(modelInfo(embedded,'GLTF').format,'gltf')
 assert.throws(()=>modelInfo(Buffer.from(JSON.stringify({asset:{version:'2.0'},scenes:[],buffers:[{uri:'../secret.bin'}]})),'GLTF'))
 assert.throws(()=>modelInfo(glb,'FBX'))
})
test('HTTP asset/delete and manual job import require CSRF, project isolation; no provider POST',async t=>{
 const x=fixture(t);x.remote.set(idA,{task_id:idA,type:'image_to_model',status:'success',output:{model_url:'https://cdn.tripo3d.ai/model.fbx'}})
 const server=http.createServer(createHandler({service:x.service}));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
 const base=`http://127.0.0.1:${server.address().port}/dsh-tripo-studio`,h={'x-tripo-studio':'1','content-type':'application/json'}
 const csrf=(await (await fetch(base+'/status',{headers:h})).json()).csrfToken
 const post=(route,body,token=csrf)=>fetch(base+route,{method:'POST',headers:{...h,...(token?{'x-tripo-csrf':token}:{})},body:JSON.stringify(body)})
 const imp=`/projects/${x.p.id}/jobs/import`
 assert.equal((await post(imp,{taskId:idA,confirm:true},'')).status,403)
 assert.equal((await post(imp,{taskId:idA,confirm:true})).status,201)
 const model=x.service.store.snapshot(x.p.id).assets.find(a=>a.kind==='model')
 assert.equal(model.format,'fbx')
 assert.equal((await fetch(`http://127.0.0.1:${server.address().port}`+model.url,{headers:h})).headers.get('content-disposition').includes('.fbx'),true)
 assert.equal((await post(`/projects/${x.p.id}/assets/${x.a.id}/delete`,{confirm:true})).status,200)
 assert.equal(x.calls.create.length,0);assert.equal(x.calls.upload,0)
})
