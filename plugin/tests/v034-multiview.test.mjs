// 0.3.4 (REQ-073～075): multiview-to-model, split-sheet moderation fix, split-sheet purple.
// All provider calls are mocks — 未调用真实 API, no credits spent.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {JobService} from '../server/service.js'
import {normalizeJob,jobInputAssets,MULTIVIEW_VIEWS,MULTIVIEW_LABELS,MODEL_KINDS,KINDS,sheetPrompt,partPrompt} from '../shared/contracts.js'
import {TRIPO_ENDPOINTS} from '../shared/image-models.js'
import {estimateJobCredits} from '../shared/credit-estimate.js'
import {KIND_LABEL,jobRoleLabel,toneOf,SHEET_TONE,looksModerated,MODERATION_HINT,MODEL_ROLES} from '../client-src/model-roles.js'
import {guessViews,multiviewIssues} from '../client-src/multiview.js'
import {buildRelations} from '../client-src/relations.js'
const png=fs.readFileSync(new URL('./fixtures/reference.png',import.meta.url))
const glb=Buffer.alloc(20);glb.write('glTF');glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8)
const TASK='0b3f6c1e-2d4a-4f5b-9c8d-7e6f5a4b3c2d'
const opts={model:'v3.1-20260211',face_limit:20000,texture:true,pbr:true,texture_alignment:'original_image',orientation:'default',geometry_quality:'standard',quad:false,auto_size:false,smart_low_poly:false,texture_quality:'standard'}
const U=n=>`00000000-0000-4000-8000-00000000000${n}`

function setup(t,client={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v034-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
 const calls={upload:[],create:[]},remote=new Map()
 const service=new JobService({directory:dir,key:'v034-fake-key',enabled:true,downloader:async url=>url.endsWith('.glb')?glb:png,client:{
  async upload(buf,mime){calls.upload.push(mime);return `file_${calls.upload.length}`},
  async create(kind,params){calls.create.push({kind,params:structuredClone(params)});return {task_id:TASK}},
  async task(id){return remote.get(id)??{task_id:id,status:'running',progress:5}},...client}})
 const p=service.store.newProject('v034')
 const add=label=>service.store.addAsset(p.id,png,{label})
 return {dir,service,calls,remote,p,front:add('头发_front'),left:add('头发_left'),back:add('头发_back'),right:add('头发_right')}
}

test('contract: multiview kind, endpoint, labels and view-key normalisation',()=>{
 assert.ok(KINDS.includes('multiview-to-model'));assert.deepEqual(MODEL_KINDS,['image-to-model','multiview-to-model'])
 assert.equal(TRIPO_ENDPOINTS['multiview-to-model'],'/generation/multiview-to-model')
 assert.deepEqual(MULTIVIEW_VIEWS,['front','left','back','right']);assert.equal(MULTIVIEW_LABELS.back,'背面')
 assert.equal(KIND_LABEL['multiview-to-model'],'多视图生3D')
 const job=normalizeJob('multiview-to-model',{views:{back:U(3),front:U(1)},...opts})
 assert.deepEqual(job.views,{front:U(1),back:U(3)},'canonical front/left/back/right order')
 assert.equal(job.input_asset,undefined);assert.equal(job.enable_image_autofix,undefined)
 assert.equal(job.model,'v3.1-20260211');assert.equal(job.texture_quality,'standard')
 for(const bad of [{views:{left:U(2),back:U(3)}},{views:{front:U(1)}},{views:{front:U(1),left:U(1)}},{views:{front:U(1),top:U(2)}},{views:{front:'x',left:U(2)}},{views:[U(1),U(2)]}])
  assert.throws(()=>normalizeJob('multiview-to-model',{...bad,...opts}),JSON.stringify(bad.views))
 assert.throws(()=>normalizeJob('multiview-to-model',{views:{front:U(1),left:U(2)},...opts,enable_image_autofix:true}),'autofix is image-to-model only')
 assert.throws(()=>normalizeJob('multiview-to-model',{views:{front:U(1),left:U(2)},...opts,input_asset:U(3)}))
 assert.throws(()=>normalizeJob('multiview-to-model',{views:{front:U(1),left:U(2)},...opts,face_limit:150001,quad:true,texture:false,pbr:false}),'same face caps as image-to-model')
 assert.deepEqual(jobInputAssets({kind:'multiview-to-model',params:{views:{front:U(1),right:U(4)}}}),[U(1),U(4)])
 assert.deepEqual(jobInputAssets({kind:'image-to-model',params:{input_asset:U(2)}}),[U(2)])
 assert.deepEqual(jobInputAssets({kind:'text-to-image',params:{}}),[])
})

test('credits: multiview uses the official H-series table, same as image-to-model',()=>{
 const one=estimateJobCredits({kind:'image-to-model',params:{input_asset:U(1),...opts}})
 assert.ok(Number.isFinite(one));assert.equal(estimateJobCredits({kind:'multiview-to-model',params:{views:{front:U(1),left:U(2)},...opts}}),one)
})

test('prepare binds every view; submit uploads each view then makes ONE view-key create (mock)',async t=>{
 const x=setup(t),svc=x.service
 const job=svc.prepare(x.p.id,{kind:'multiview-to-model',role:'part',priority:'high',label:'多视图「头发_front」',params:{views:{right:x.right.id,front:x.front.id,back:x.back.id},...opts}})
 assert.equal(job.status,'awaiting_approval');assert.match(job.inputHash,/^[a-f0-9]{16,}$/)
 assert.equal(jobRoleLabel(job),'多视图 · 3 视角')
 const other=svc.prepare(x.p.id,{kind:'multiview-to-model',role:'part',priority:'high',label:'x',params:{views:{front:x.front.id,back:x.back.id},...opts}})
 assert.notEqual(other.inputHash,job.inputHash,'the view set is part of the approval binding')
 assert.equal(x.calls.upload.length+x.calls.create.length,0,'prepare never uploads or pays')
 await svc.submit(x.p.id,job.id,job.approvalHash)
 assert.equal(x.calls.upload.length,3);assert.equal(x.calls.create.length,1)
 const {kind,params}=x.calls.create[0]
 assert.equal(kind,'multiview-to-model')
 assert.deepEqual(params.inputs,[{front:'file_1'},{back:'file_2'},{right:'file_3'}],'documented view-key format, canonical order')
 for(const k of ['views','input_asset','input','enable_image_autofix'])assert.equal(k in params,false,k)
 assert.equal(params.model,'v3.1-20260211')
 const saved=svc.store.job(x.p.id,job.id);assert.equal(saved.status,'queued');assert.equal(saved.taskId,TASK)
 assert.deepEqual(saved.params.views,{front:x.front.id,back:x.back.id,right:x.right.id},'local record keeps asset ids, not tokens')
 await svc.submit(x.p.id,job.id,job.approvalHash);assert.equal(x.calls.create.length,1,'idempotent: never a second paid POST')
})

test('a changed view file after approval blocks submit before any upload',async t=>{
 const x=setup(t),svc=x.service
 const job=svc.prepare(x.p.id,{kind:'multiview-to-model',role:'part',priority:'high',label:'m',params:{views:{front:x.front.id,left:x.left.id},...opts}})
 fs.appendFileSync(svc.store.assetPath(svc.store.asset(x.p.id,x.left.id)),Buffer.from([0]))
 await assert.rejects(()=>svc.submit(x.p.id,job.id,job.approvalHash),e=>e.code==='INPUT_CHANGED')
 assert.equal(x.calls.upload.length+x.calls.create.length,0)
})

test('refresh saves the multiview GLB; views stay protected from deletion; result type tolerated',async t=>{
 const x=setup(t),svc=x.service
 const job=svc.prepare(x.p.id,{kind:'multiview-to-model',role:'part',priority:'high',label:'m',params:{views:{front:x.front.id,left:x.left.id},...opts}})
 await svc.submit(x.p.id,job.id,job.approvalHash)
 x.remote.set(TASK,{task_id:TASK,type:'multiview_to_model',status:'success',output:{model_url:'https://cdn.tripo3d.ai/m.glb'},credits_consumed:30})
 await svc.refresh(x.p.id,{manual:true,jobId:job.id})
 const snap=svc.store.snapshot(x.p.id),model=snap.assets.find(a=>a.kind==='model')
 assert.ok(model,'model asset saved');assert.equal(model.format,'glb');assert.equal(svc.store.job(x.p.id,job.id).creditsConsumed,30)
 assert.throws(()=>svc.deleteAsset(x.p.id,x.left.id,{confirm:true}),e=>e.code==='ASSET_IN_USE')
 const groups=buildRelations(snap.assets.filter(a=>a.kind==='image'),snap.jobs,snap.assets)
 const g=groups.find(g=>g.root.id===x.front.id);assert.ok(g.modelJobs(x.front.id).some(e=>e.job.id===job.id),'relations list the multiview job under its front view')
 const conv=svc.prepare(x.p.id,{kind:'model-convert',label:'转FBX',params:{input_job:job.id,format:'FBX'}})
 assert.equal(conv.status,'awaiting_approval','a finished multiview model can be converted like image-to-model')
})

test('client helpers: auto-fill by file name, blockers mirror the server contract',()=>{
 const imgs=[{id:'a',label:'头发_back',width:1200,height:1200},{id:'b',label:'头发_front',width:1200,height:1200},{id:'c',label:'头发 左侧',width:1200,height:1200},{id:'d',label:'头发_right',width:1200,height:1200},{id:'e',label:'立绘',width:200,height:900}]
 assert.deepEqual(guessViews(imgs),{front:'b',left:'c',back:'a',right:'d'})
 assert.deepEqual(multiviewIssues({front:'b',left:'c'},imgs).blockers,[])
 assert.ok(multiviewIssues({left:'c',back:'a'},imgs).blockers.some(m=>/正面/.test(m)))
 assert.ok(multiviewIssues({front:'b'},imgs).blockers.some(m=>/2 张/.test(m)))
 assert.ok(multiviewIssues({front:'b',left:'b'},imgs).blockers.some(m=>/多个视角/.test(m)))
 const w=multiviewIssues({front:'b',left:'e'},imgs).warnings;assert.ok(w.some(m=>/256/.test(m))&&w.some(m=>/宽高比/.test(m)))
})

test('REQ-074: split-sheet prompts avoid moderation triggers; failures get a concrete hint',()=>{
 const s=sheetPrompt()
 for(const k of ['裸','内衬','贴身','内衣','身体','皮肤'])assert.equal(s.includes(k),false,k)
 assert.ok(s.includes('不画人物')&&s.includes('纯白背景'))
 const body=partPrompt('身体基准');for(const k of ['裸','内衬','内衣'])assert.equal(body.includes(k),false,k)
 for(const m of ['Your request was rejected by the safety system','content moderation','prompt violates policy','输入包含敏感内容','内容审核未通过'])assert.ok(looksModerated(m),m)
 for(const m of ['network timeout','余额不足','',null])assert.equal(looksModerated(m),false,String(m))
 assert.match(MODERATION_HINT,/内容安全审核/)
})

test('REQ-075: the split sheet is purple whatever its own role tag; other parts keep green/blue/red',()=>{
 assert.equal(SHEET_TONE.tone,'purple');assert.equal(SHEET_TONE.name,'拆件图')
 for(const priority of ['high','normal','base'])assert.equal(toneOf({id:'s',priority},'s'),'purple',priority)
 assert.equal(toneOf({id:'p',priority:'base'},'s'),MODEL_ROLES.base.tone);assert.equal(toneOf({id:'p',priority:'base'},null),'red')
 const css=fs.readFileSync(new URL('../client-src/v034-styles.js',import.meta.url),'utf8')
 assert.match(css,/--tw-role-purple:#7c4dcc/);assert.match(css,/\.tw-role-purple\{--tw-role:var\(--tw-role-purple\)\}/)
 assert.match(css,/\.tw-sheet-plan\{border-left-color:var\(--tw-role-purple\)\}/)
})
