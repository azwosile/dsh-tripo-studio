// 0.3.6 (REQ-079): official P2.0 智能网格 (P2-20260801) in the 图生3D model list.
// All provider calls are mocks — 未调用真实 API, no credits spent.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {JobService} from '../server/service.js'
import {normalizeJob,MODEL_VERSIONS,H_MODEL_VERSIONS,P_MODEL_VERSIONS,MODEL_VERSION_LABELS,P_SERIES_DOC,isPSeries,modelFaceMax,modelFaceMin} from '../shared/contracts.js'
import {modelPriceReference,MODEL_PRICE_ROWS} from '../shared/model-pricing.js'
import {estimateJobCredits} from '../shared/credit-estimate.js'
const png=fs.readFileSync(new URL('./fixtures/reference.png',import.meta.url))
const P2='P2-20260801',A='0'.repeat(36),B='1'.repeat(36)
const job=(extra={})=>normalizeJob('image-to-model',{input_asset:A,model:P2,face_limit:20000,...extra})

test('contract: P2-20260801 is listed after the H series and the H default is unchanged',()=>{
 assert.deepEqual(P_MODEL_VERSIONS,[P2]);assert.deepEqual(MODEL_VERSIONS,[...H_MODEL_VERSIONS,P2])
 assert.equal(MODEL_VERSIONS[0],'v3.1-20260211');assert.deepEqual(H_MODEL_VERSIONS,['v3.1-20260211','v3.0-20250812','v2.5-20250123'])
 assert.ok(isPSeries(P2));assert.ok(!isPSeries('v3.1-20260211'));assert.ok(!isPSeries('P1-20260311'))
 assert.match(MODEL_VERSION_LABELS[P2],/P2\.0 智能网格/);assert.equal(P_SERIES_DOC,'https://developers.tripo3d.com/zh/docs/generation-image-to-model/p')
})

test('contract: official P2 face ranges — triangles 48–50,000, quad 48–25,000',()=>{
 assert.equal(modelFaceMin(P2),48);assert.equal(modelFaceMin('v3.1-20260211'),500)
 assert.equal(modelFaceMax(P2),50000);assert.equal(modelFaceMax(P2,{quad:true}),25000)
 assert.equal(job({face_limit:48}).face_limit,48);assert.equal(job({face_limit:50000}).face_limit,50000)
 assert.throws(()=>job({face_limit:47}),/48–50000/);assert.throws(()=>job({face_limit:50001}),/48–50000/)
 assert.equal(job({quad:true,face_limit:25000}).quad,true);assert.throws(()=>job({quad:true,face_limit:25001}),/48–25000/)
 assert.throws(()=>normalizeJob('image-to-model',{input_asset:A,model:'v3.1-20260211',face_limit:499}),/500–/,'H series minimum stays 500')
})

test('contract: P2 sends only parameters documented for the P series',()=>{
 const n=job({texture:true,pbr:true,quad:false,auto_size:true,smart_low_poly:false,texture_quality:'detailed',enable_image_autofix:true,texture_alignment:'geometry',orientation:'align_image',export_orientation:'-y'})
 assert.equal(n.model,P2);assert.equal(n.geometry_quality,undefined);assert.equal(n.smart_low_poly,undefined)
 assert.equal(n.quad,false);assert.equal(n.auto_size,true);assert.equal(n.texture_quality,'detailed');assert.equal(n.enable_image_autofix,true)
 assert.equal(n.texture_alignment,'geometry');assert.equal(n.orientation,'align_image');assert.equal(n.export_orientation,'-y')
 for(const bad of [{geometry_quality:'detailed'},{geometry_quality:'standard'},{smart_low_poly:true}]) assert.throws(()=>job(bad),/P2\.0/)
 const h=normalizeJob('image-to-model',{input_asset:A,model:'v3.1-20260211',face_limit:50000})
 assert.equal(h.geometry_quality,'standard');assert.equal(h.quad,false,'H series contract unchanged')
})

test('contract: multiview-to-model accepts P2 with the same P rules (no autofix)',()=>{
 const m=normalizeJob('multiview-to-model',{views:{front:A,left:B},model:P2,face_limit:3000,quad:true})
 assert.deepEqual(m.views,{front:A,left:B});assert.equal(m.model,P2);assert.equal(m.quad,true);assert.equal(m.geometry_quality,undefined)
 assert.throws(()=>normalizeJob('multiview-to-model',{views:{front:A,left:B},model:P2,face_limit:3000,geometry_quality:'detailed'}),/P2\.0/)
})

test('pricing: official P table 100 / 110; P HD/8K texture add-ons are not guessed',()=>{
 const base={texture:true,textureQuality:'standard',quad:false,smart:false}
 assert.equal(modelPriceReference(P2,'standard',base),110);assert.equal(modelPriceReference(P2,'standard',{...base,texture:false}),100)
 assert.equal(modelPriceReference(P2,'standard',{...base,quad:true}),110)
 assert.equal(modelPriceReference(P2,'standard',{...base,textureQuality:'detailed'}),null)
 assert.equal(modelPriceReference(P2,'standard',{...base,textureQuality:'extreme'}),null)
 assert.ok(MODEL_PRICE_ROWS.some(([l,c])=>l.includes('P2.0')&&c===100));assert.ok(MODEL_PRICE_ROWS.some(([l,c])=>l.includes('P2.0')&&c===110))
 assert.equal(estimateJobCredits({kind:'image-to-model',params:job()}),110)
 assert.equal(estimateJobCredits({kind:'multiview-to-model',params:{views:{front:A,left:B},model:P2,texture:false,pbr:false}}),100)
 assert.equal(modelPriceReference('v3.1-20260211','standard',base),30,'H pricing unchanged')
})

test('service: a P2 job is approved and submitted once to image-to-model with model P2-20260801 (mock provider)',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v036-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
 const calls={upload:0,create:[]}
 const service=new JobService({directory:dir,key:'v036-fake-key',enabled:true,client:{
  async upload(){calls.upload++;return `file_${calls.upload}`},
  async create(kind,params){calls.create.push({kind,params:structuredClone(params)});return {task_id:'0b3f6c1e-2d4a-4f5b-9c8d-7e6f5a4b3c20'}},
  async task(id){return {task_id:id,status:'running',progress:5}}}})
 const p=service.store.newProject('v036'),img=service.store.addAsset(p.id,png,{label:'道具'})
 const prepared=service.prepare(p.id,{kind:'image-to-model',label:'道具 P2',params:{input_asset:img.id,model:P2,face_limit:5000,texture:true,pbr:true,quad:true}})
 await service.submit(p.id,prepared.id,prepared.approvalHash)
 assert.equal(calls.upload,1);assert.equal(calls.create.length,1)
 const [c]=calls.create
 assert.equal(c.kind,'image-to-model');assert.equal(c.params.model,P2);assert.equal(c.params.quad,true);assert.equal(c.params.face_limit,5000)
 assert.equal(c.params.geometry_quality,undefined);assert.equal(c.params.smart_low_poly,undefined)
})
