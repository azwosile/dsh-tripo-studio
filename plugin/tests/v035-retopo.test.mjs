// 0.3.5 (REQ-076～078): 重拓扑 /mesh/decimate with mandatory official notes, export_orientation.
// All provider calls are mocks — 未调用真实 API, no credits spent.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {JobService} from '../server/service.js'
import {normalizeJob,KINDS,DECIMATE_MODELS,EXPORT_ORIENTATIONS,decimateFaceRange} from '../shared/contracts.js'
import {TRIPO_ENDPOINTS} from '../shared/image-models.js'
import {estimateJobCredits} from '../shared/credit-estimate.js'
import {KIND_LABEL} from '../client-src/model-roles.js'
import {buildRelations} from '../client-src/relations.js'
import {RETOPO_OFFICIAL_TIPS,ORIENTATION_GEN_TIP,ORIENTATION_CONVERT_TIP,DECIMATE_DOC,retopoSpec,orientationCaveat} from '../client-src/retopo.js'
const png=fs.readFileSync(new URL('./fixtures/reference.png',import.meta.url))
const glb=Buffer.alloc(20);glb.write('glTF');glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8)
const T=n=>`0b3f6c1e-2d4a-4f5b-9c8d-7e6f5a4b3c2${n}`
const U=n=>`00000000-0000-4000-8000-00000000000${n}`
const opts={model:'v3.1-20260211',face_limit:20000,texture:true,pbr:true,geometry_quality:'standard',quad:false}

async function setup(t,{decimateType='mesh_decimate'}={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v035-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
 const calls={upload:0,create:[]},remote=new Map();let n=0
 const service=new JobService({directory:dir,key:'v035-fake-key',enabled:true,downloader:async url=>url.endsWith('.glb')?glb:png,client:{
  async upload(){calls.upload++;return `file_${calls.upload}`},
  async create(kind,params){calls.create.push({kind,params:structuredClone(params)});return {task_id:T(n++)}},
  async task(id){return remote.get(id)??{task_id:id,status:'running',progress:5}}}})
 const p=service.store.newProject('v035'),img=service.store.addAsset(p.id,png,{label:'头发'})
 const gen=service.prepare(p.id,{kind:'image-to-model',label:'头发3D',params:{input_asset:img.id,...opts}})
 await service.submit(p.id,gen.id,gen.approvalHash)
 remote.set(T(0),{task_id:T(0),type:'image_to_model',status:'success',progress:100,output:{model_url:'https://cdn.tripo3d.com/a.glb'}})
 await service.refresh(p.id,{manual:true,jobId:gen.id})
 return {service,calls,remote,p,gen:service.store.job(p.id,gen.id),decimateType}
}

test('contract: mesh-decimate kind, endpoint, label, models and official face ranges',()=>{
 assert.ok(KINDS.includes('mesh-decimate'));assert.equal(TRIPO_ENDPOINTS['mesh-decimate'],'/mesh/decimate')
 assert.equal(KIND_LABEL['mesh-decimate'],'重拓扑');assert.deepEqual(DECIMATE_MODELS,['v2.0','v1.0'])
 assert.deepEqual(decimateFaceRange('v2.0'),[500,20000]);assert.deepEqual(decimateFaceRange('v2.0',true),[500,10000])
 assert.equal(decimateFaceRange('v1.0')[1],2000000);assert.equal(decimateFaceRange('v1.0',true)[1],150000)
 assert.deepEqual(normalizeJob('mesh-decimate',{input_job:U(1)}),{input_job:U(1),model:'v2.0',quad:false},'v2.0 default, face_limit omitted = adaptive')
 assert.deepEqual(normalizeJob('mesh-decimate',{input_job:U(1),model:'v2.0',face_limit:8000,quad:true,bake:false}),{input_job:U(1),model:'v2.0',face_limit:8000,quad:true,bake:false})
 assert.throws(()=>normalizeJob('mesh-decimate',{input_job:U(1),face_limit:20001}),/500–20000/)
 assert.throws(()=>normalizeJob('mesh-decimate',{input_job:U(1),quad:true,face_limit:12000}),/500–10000/)
 assert.throws(()=>normalizeJob('mesh-decimate',{input_job:U(1),model:'v1.0'}),/必须填写目标面数/)
 assert.throws(()=>normalizeJob('mesh-decimate',{input_job:U(1),model:'v1.0',face_limit:50000,bake:true}),/不支持 bake/)
 assert.deepEqual(normalizeJob('mesh-decimate',{input_job:U(1),model:'v1.0',face_limit:1500000}),{input_job:U(1),model:'v1.0',face_limit:1500000,quad:false})
 assert.throws(()=>normalizeJob('mesh-decimate',{input_job:U(1),model:'v1.0',face_limit:150001,quad:true}),/150000/)
 assert.throws(()=>normalizeJob('mesh-decimate',{input_asset:U(1)}),/不支持的参数|必须且只能/)
 assert.throws(()=>normalizeJob('mesh-decimate',{input_job:U(1),part_names:['a']}),/不支持的参数/)
 assert.throws(()=>normalizeJob('mesh-decimate',{input_job:U(1),model:'v3.0'}),/重拓扑模型/)
})

test('credits: official decimate pricing v2.0 = 30, v1.0 = 10',()=>{
 assert.equal(estimateJobCredits({kind:'mesh-decimate',params:{model:'v2.0'}}),30)
 assert.equal(estimateJobCredits({kind:'mesh-decimate',params:{model:'v1.0',face_limit:9000}}),10)
})

test('official notes: pricing, ranges, GLB, 150 MB, v1.0 limits, may fail, separate paid task, doc link',()=>{
 const all=RETOPO_OFFICIAL_TIPS.join('\n')
 for(const s of ['30 积分','10 积分','500–20,000','500–10,000','2,000,000','150,000','GLB','150 MB','不支持 bake','可能处理失败','独立收费','不会在生成后自动触发'])assert.ok(all.includes(s),s)
 assert.equal(DECIMATE_DOC,'https://developers.tripo3d.com/zh/docs/mesh-decimate')
 assert.match(ORIENTATION_GEN_TIP,/默认 \+x/);assert.match(ORIENTATION_GEN_TIP,/不会报错/);assert.match(ORIENTATION_GEN_TIP,/仅作用于本次生成/)
 assert.equal(orientationCaveat({params:{}}),'');assert.match(orientationCaveat({params:{export_orientation:'-y'}}),/export_orientation=-y.*不会报错/)
assert.match(ORIENTATION_GEN_TIP,/models\/convert/);assert.match(ORIENTATION_CONVERT_TIP,/-y/)
})

test('UI spec helper: adaptive v2.0 omits face_limit; v1.0 always sends it and never bake',()=>{
 const job={id:U(2),label:'头发3D'}
 assert.deepEqual(retopoSpec({job,model:'v2.0',faceMode:'auto',faceLimit:9000,quad:false,bake:true}).params,{input_job:U(2),model:'v2.0',quad:false})
 assert.deepEqual(retopoSpec({job,model:'v2.0',faceMode:'fixed',faceLimit:9000,quad:true,bake:false}).params,{input_job:U(2),model:'v2.0',quad:true,face_limit:9000,bake:false})
 const v1=retopoSpec({job,model:'v1.0',faceMode:'auto',faceLimit:50000,quad:false,bake:false})
 assert.deepEqual(v1.params,{input_job:U(2),model:'v1.0',quad:false,face_limit:50000});assert.equal(v1.kind,'mesh-decimate');assert.match(v1.label,/重拓扑 v1\.0/)
 for(const s of [retopoSpec({job,model:'v2.0',faceMode:'auto',faceLimit:1,quad:false,bake:true}),v1])assert.doesNotThrow(()=>normalizeJob(s.kind,s.params))
})

test('service: retopology is one reviewed POST /mesh/decimate with input = source task_id; GLB saved as model',async t=>{
 const {service,calls,remote,p,gen}=await setup(t)
 assert.equal(gen.status,'success');assert.equal(gen.downloadStatus,'downloaded')
 const job=service.prepare(p.id,{kind:'mesh-decimate',label:'头发3D → 重拓扑',params:{input_job:gen.id,model:'v2.0',face_limit:10000,quad:false}})
 assert.equal(job.status,'awaiting_approval');assert.equal(calls.create.length,1,'prepare never calls the provider')
 await service.submit(p.id,job.id,job.approvalHash)
 assert.equal(calls.create.length,2);assert.equal(calls.upload,1,'no upload for retopology')
 assert.deepEqual(calls.create[1],{kind:'mesh-decimate',params:{model:'v2.0',face_limit:10000,quad:false,input:T(0)}})
 remote.set(T(1),{task_id:T(1),type:'mesh_decimate',status:'success',progress:100,output:{model_url:'https://cdn.tripo3d.com/low.glb'}})
 await service.refresh(p.id,{manual:true,jobId:job.id})
 const done=service.store.job(p.id,job.id);assert.equal(done.status,'success');assert.equal(done.downloadStatus,'downloaded')
 const asset=service.store.state.assets[done.assetIds[0]];assert.equal(asset.kind,'model');assert.equal(asset.format,'glb')
 const snap=service.store.snapshot(p.id),rel=buildRelations(snap.assets.filter(a=>a.kind==='image'),snap.jobs,snap.assets)
 assert.equal(rel[0].modelJobs(rel[0].root.id)[0].converts[0].job.kind,'mesh-decimate','retopology shows under its source model')
})

test('service: undocumented decimate type strings are accepted, image types are not',async t=>{
 const {service,remote,p,gen}=await setup(t)
 for(const [i,type,ok] of [[1,'highpoly_to_lowpoly',true],[2,'smart_low_poly',true],[3,'image_to_image',false]]){
  const j=service.prepare(p.id,{kind:'mesh-decimate',label:`r${i}`,params:{input_job:gen.id,model:'v1.0',face_limit:9000+i}})
  await service.submit(p.id,j.id,j.approvalHash)
  const taskId=service.store.job(p.id,j.id).taskId
  remote.set(taskId,{task_id:taskId,type,status:'success',progress:100,output:{model_url:'https://cdn.tripo3d.com/r.glb'}})
  await service.refresh(p.id,{manual:true,jobId:j.id})
  assert.equal(service.store.job(p.id,j.id).status==='success',ok,type)
 }
})

test('service: retopology input must be a successful same-account 3D generation (not convert / image / retopo)',async t=>{
 const {service,p,gen}=await setup(t)
 const conv=service.prepare(p.id,{kind:'model-convert',label:'c',params:{input_job:gen.id,format:'FBX'}})
 assert.throws(()=>service.prepare(p.id,{kind:'mesh-decimate',params:{input_job:conv.id}}),/重拓扑输入必须是成功的同账户3D生成任务/)
 const img=service.store.snapshot(p.id).assets.find(a=>a.kind==='image')
 const draft=service.prepare(p.id,{kind:'image-to-model',params:{input_asset:img.id,...opts}})
 assert.throws(()=>service.prepare(p.id,{kind:'mesh-decimate',params:{input_job:draft.id}}),/重拓扑输入/)
})

test('export_orientation: convert + generation, omitted by default, only documented axes',async t=>{
 assert.deepEqual(EXPORT_ORIENTATIONS,['+x','-x','-y','+y'])
 assert.deepEqual(normalizeJob('model-convert',{input_job:U(1),format:'FBX'}),{input_job:U(1),format:'FBX'},'not sent unless chosen')
 assert.equal(normalizeJob('model-convert',{input_job:U(1),format:'GLTF',export_orientation:'-y'}).export_orientation,'-y')
 assert.throws(()=>normalizeJob('model-convert',{input_job:U(1),format:'GLTF',export_orientation:'+z'}),/导出朝向/)
 assert.equal('export_orientation' in normalizeJob('image-to-model',{input_asset:U(1),...opts}),false)
 assert.equal(normalizeJob('image-to-model',{input_asset:U(1),...opts,export_orientation:'+y'}).export_orientation,'+y')
 assert.equal(normalizeJob('multiview-to-model',{views:{front:U(1),back:U(2)},...opts,export_orientation:'-x'}).export_orientation,'-x')
 assert.throws(()=>normalizeJob('mesh-decimate',{input_job:U(1),export_orientation:'+x'}),/不支持的参数/,'decimate has no orientation option')
 const {service,calls,p,gen}=await setup(t)
 const c=service.prepare(p.id,{kind:'model-convert',label:'c',params:{input_job:gen.id,format:'FBX',export_orientation:'-x'}})
 await service.submit(p.id,c.id,c.approvalHash)
 assert.deepEqual(calls.create.at(-1),{kind:'model-convert',params:{format:'FBX',export_orientation:'-x',input:T(0)}})
})

test('draft keeps modelExportOrientation; convert/old behaviour unchanged',async t=>{
 const {service,p}=await setup(t)
 const rev=service.store.project(p.id).revision
 service.store.updateProject(p.id,{revision:rev,draft:{modelExportOrientation:'-y'}})
 assert.equal(service.store.project(p.id).draft.modelExportOrientation,'-y')
 assert.equal(estimateJobCredits({kind:'model-convert',params:{format:'FBX',quad:true}}),10)
})
