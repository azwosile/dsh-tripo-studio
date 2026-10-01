// 0.3.3 REQ-067～072 unit coverage: unified modelling plan, split-sheet covers, storage subfolder,
// structured prompts, reference credits, balance normalisation and usage backfill. Mock provider only.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {JobService} from '../server/service.js'
import {ProjectLocation,SUBFOLDER} from '../server/project-location.js'
import {planModelTasks,jobRoleLabel,suggestSheet,roleOf,MODEL_ROLES,KIND_LABEL} from '../client-src/model-roles.js'
import {buildRelations} from '../client-src/relations.js'
import {estimateJobCredits,estimateBatch,imageTier,formatCredits} from '../shared/credit-estimate.js'
import {partPrompt,partCategory,sheetPrompt,HAIR_PROMPT} from '../shared/contracts.js'
const png=fs.readFileSync(new URL('./fixtures/reference.png',import.meta.url))
const TASK='d7e93b68-a29a-43e2-82ee-69450d7f54f4',TASK2='3b2b6e28-80cb-48c9-9d32-0275ecb7ba49'

function setup(t,client={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v033-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
 const service=new JobService({directory:dir,key:'v033-fake-key',enabled:true,client:{async create(){return {task_id:TASK}},async upload(){return 'file_mock'},async task(){return {status:'running',progress:1}},...client},downloader:async()=>png})
 const p=service.store.newProject('v033')
 const sheet=service.store.addAsset(p.id,png,{label:'拆件图'})
 const add=(label,priority)=>service.store.addAsset(p.id,png,{label,priority,sourceAssetId:sheet.id})
 return {dir,service,p,sheet,hair:add('头发','high'),shoes:add('鞋子','normal'),socks:add('长袜','normal'),body:add('身体基准','base')}
}
const modelParams=id=>({input_asset:id,model:'v3.1-20260211',face_limit:10000,texture:true,pbr:true,enable_image_autofix:false,texture_alignment:'original_image',orientation:'default',geometry_quality:'standard',quad:false,auto_size:false,smart_low_poly:false,texture_quality:'standard'})

test('roles: 主要=绿 / 次要=蓝 / 基准=红, stored as the 0.2.8 priority enum',()=>{
 assert.deepEqual(Object.fromEntries(Object.entries(MODEL_ROLES).map(([k,v])=>[k,[v.name,v.tone]])),{high:['主要','green'],normal:['次要','blue'],base:['基准','red']})
 assert.equal(roleOf({priority:'weird'}),'normal');assert.equal(roleOf({}),'normal')
 assert.match(KIND_LABEL['text-to-image'],/文生图/);assert.match(KIND_LABEL['image-to-image'],/图生图/)
})

test('plan: secondary parts ride on one split-sheet task; primary and base are one task each',t=>{
 const x=setup(t),images=x.service.store.snapshot(x.p.id).assets.filter(a=>a.kind==='image')
 const all=[x.hair.id,x.shoes.id,x.socks.id,x.body.id]
 const auto=planModelTasks({images,checked:all})
 assert.equal(auto.sheetId,x.sheet.id,'sheet inferred from the crop source');assert.equal(auto.autoSheet,true)
 assert.deepEqual(auto.secondary.map(a=>a.label).sort(),['长袜','鞋子'].sort())
 assert.deepEqual(auto.main.map(a=>a.label),['头发']);assert.deepEqual(auto.base.map(a=>a.label),['身体基准'])
 assert.equal(auto.taskCount,3);assert.equal(auto.missingSheet,false);assert.deepEqual(auto.foreign,[])
 assert.equal(suggestSheet([x.shoes,x.socks],images),x.sheet.id)
 const onlyMain=planModelTasks({images,checked:[x.hair.id]});assert.equal(onlyMain.taskCount,1);assert.equal(onlyMain.sheet?.id??'','',"no sheet task without secondary parts")
 const explicit=planModelTasks({images,checked:all,sheetAsset:x.hair.id})
 assert.equal(explicit.sheetId,x.hair.id);assert.equal(explicit.autoSheet,false);assert.equal(explicit.main.length,0,'the sheet itself is never a second task')
 assert.equal(explicit.foreign.length,2,'parts not cropped from the chosen sheet are flagged')
 const orphan=x.service.store.addAsset(x.p.id,png,{label:'孤立次要',priority:'normal'})
 // A ticked 次要 source image with no crop parent is the whole illustration: it becomes the sheet and is built once.
 const imgs2=x.service.store.snapshot(x.p.id).assets.filter(a=>a.kind==='image'),whole=planModelTasks({images:imgs2,checked:[orphan.id]})
 assert.equal(whole.sheetId,orphan.id);assert.equal(whole.sheetTask,true);assert.equal(whole.secondary.length,0);assert.equal(whole.taskCount,1);assert.equal(whole.missingSheet,false)
 const idle=planModelTasks({images:imgs2,checked:[],sheetAsset:x.sheet.id});assert.equal(idle.sheetTask,false);assert.equal(idle.taskCount,0,'an unticked sheet without 次要 parts is never submitted')
})

test('prepare: role sheet + covers is validated, stored and bound to approval; legacy drafts unchanged',t=>{
 const x=setup(t),svc=x.service
 const job=svc.prepare(x.p.id,{kind:'image-to-model',role:'sheet',priority:'normal',label:'整张拆件图',covers:[x.shoes.id,x.socks.id,x.shoes.id],params:modelParams(x.sheet.id)})
 assert.deepEqual(job.covers,[x.shoes.id,x.socks.id]);assert.equal(job.role,'sheet')
 assert.equal(jobRoleLabel(job),'整张拆件图 · 次要×2')
 const again=svc.prepare(x.p.id,{kind:'image-to-model',role:'sheet',priority:'normal',label:'整张拆件图',covers:[x.shoes.id],params:modelParams(x.sheet.id)})
 assert.notEqual(again.approvalHash,job.approvalHash,'covers are part of the approval binding')
 const plain=svc.prepare(x.p.id,{kind:'image-to-model',role:'part',priority:'high',label:'头发',params:modelParams(x.hair.id)})
 assert.equal('covers' in plain,false);assert.equal(jobRoleLabel(plain),'主要部件')
 assert.equal(jobRoleLabel({role:'part',priority:'base'}),'基准部件');assert.equal(jobRoleLabel({role:'whole'}),'整体（旧版）')
 assert.throws(()=>svc.prepare(x.p.id,{kind:'image-to-model',role:'part',covers:[x.shoes.id],params:modelParams(x.hair.id)}),/覆盖/)
 assert.throws(()=>svc.prepare(x.p.id,{kind:'image-to-image',role:'sheet',covers:[x.shoes.id],params:{model:'chat_image_2.5_flare',prompt:'x',input_asset:x.sheet.id}}),/覆盖/)
 assert.throws(()=>svc.prepare(x.p.id,{kind:'image-to-model',role:'sheet',covers:['../x'],params:modelParams(x.sheet.id)}),/覆盖/)
 assert.throws(()=>svc.prepare(x.p.id,{kind:'image-to-model',role:'sheet',covers:Array.from({length:37},()=>x.shoes.id),params:modelParams(x.sheet.id)}),/覆盖/)
 assert.throws(()=>svc.prepare(x.p.id,{kind:'image-to-model',role:'boss',params:modelParams(x.sheet.id)}),/无效/)
})

test('relations: a secondary part shows the split-sheet task that covers it',t=>{
 const x=setup(t),svc=x.service
 svc.prepare(x.p.id,{kind:'image-to-model',role:'sheet',priority:'normal',label:'整张拆件图',covers:[x.shoes.id],params:modelParams(x.sheet.id)})
 const snap=svc.store.snapshot(x.p.id),images=snap.assets.filter(a=>a.kind==='image')
 const [group]=buildRelations(images,snap.jobs,snap.assets)
 assert.equal(group.root.id,x.sheet.id)
 assert.equal(group.modelJobs(x.sheet.id)[0].covered,false,'the sheet itself is the direct input')
 assert.equal(group.modelJobs(x.shoes.id)[0].covered,true);assert.equal(group.modelJobs(x.socks.id).length,0)
})

test('reference credits follow the public tables and never pretend to know unknown combos',()=>{
 assert.equal(imageTier('1024x1536'),0);assert.equal(imageTier('2K'),1);assert.equal(imageTier('4K'),2);assert.equal(imageTier('auto','chat_image_2'),1)
 assert.equal(estimateJobCredits({kind:'text-to-image',params:{model:'chat_image_2.5_flare',quality:'high',size:'1024x1536'}}),20)
 assert.equal(estimateJobCredits({kind:'image-to-model',params:modelParams('x')}),30)
 assert.equal(estimateJobCredits({kind:'image-to-model',params:{...modelParams('x'),model:'v2.5-20250123'}}),null)
 assert.equal(estimateJobCredits({kind:'model-convert',params:{format:'FBX',quad:true}}),10)
 assert.deepEqual(estimateBatch([{kind:'model-convert',params:{}},{kind:'image-to-model',params:{model:'nope'}}]),{total:5,unknown:1,count:2})
 assert.equal(formatCredits('12.345'),'12.35');assert.equal(formatCredits(undefined),'未知')
})

test('prompts: structured generic templates; hair contract kept',()=>{
 assert.equal(partPrompt('头发'),HAIR_PROMPT);assert.equal(partCategory('发型'),'hair')
 for(const [name,cat] of [['外套','garment'],['裙装 / 外衣','garment'],['鞋子','shoes'],['长袜','legwear'],['头部','head'],['配饰','accessory'],['身体基准','body'],['翅膀','generic']]){
  assert.equal(partCategory(name),cat,name);const p=partPrompt(name)
  assert.ok(p.includes(`「${name}」`)&&p.includes('【部件要求】')&&p.includes('纯白背景'),name);assert.ok(p.length<600,name)
 }
 const s=sheetPrompt();for(const k of ['【保持】','【拆分】','【排版】','【画面】','同一比例尺','互不接触','不画人物'])assert.ok(s.includes(k),k)
 // 0.3.4 REQ-074: the 0.3.3 wording (内衬/贴身/不要裸体) reads as body/nudity to image moderation and the sheet task failed.
 for(const k of ['裸','内衬','贴身','内衣','身体'])assert.ok(!s.includes(k),k)
 assert.ok(s.length<700)
})

function locFixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v033-loc-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const data=path.join(root,'original'),picked=path.join(root,'我的文档');fs.mkdirSync(data);fs.mkdirSync(picked);return {data,picked}}

test('storage: a non-empty folder gets a dedicated subfolder, created only on confirm, and survives restart',async t=>{
 const {data,picked}=locFixture(t);fs.writeFileSync(path.join(picked,'unrelated.txt'),'keep')
 const m=new ProjectLocation(data,{picker:async()=>picked})
 assert.deepEqual([m.status().persistedMatches,m.status().isDefault],[true,true])
 const p=await m.choose(),child=path.join(fs.realpathSync(picked),SUBFOLDER)
 assert.equal(p.subfolder,true);assert.equal(p.create,true);assert.equal(p.directory,child);assert.equal(p.picked,fs.realpathSync(picked))
 assert.equal(fs.existsSync(child),false,'nothing is created before confirmation')
 const applied=m.apply({selectionToken:p.selectionToken,confirm:true})
 assert.equal(applied.directory??m.current,child);assert.equal(fs.existsSync(path.join(child,'.tripo-studio-root.json')),true)
 assert.equal(fs.readFileSync(path.join(picked,'unrelated.txt'),'utf8'),'keep')
 const st=m.status();assert.equal(st.persisted,child);assert.equal(st.persistedMatches,true)
 const restarted=new ProjectLocation(data);assert.equal(restarted.current,child,'DSH restart reads the saved root')
 // Choosing the same parent again reuses the existing Tripo subfolder instead of nesting another one.
 const again=await m.choose();assert.equal(again.directory,child);assert.equal(again.create,false)
})

test('storage: subfolder names step past foreign folders; confirm fails closed if it appeared meanwhile',async t=>{
 const {data,picked}=locFixture(t);fs.writeFileSync(path.join(picked,'a.txt'),'x');fs.mkdirSync(path.join(picked,SUBFOLDER));fs.writeFileSync(path.join(picked,SUBFOLDER,'foreign.txt'),'x')
 const m=new ProjectLocation(data,{picker:async()=>picked});const p=await m.choose()
 assert.equal(path.basename(p.directory),`${SUBFOLDER} 2`)
 fs.mkdirSync(p.directory);assert.throws(()=>m.apply({selectionToken:p.selectionToken,confirm:true}),/重新选择/)
 assert.equal(m.status().isDefault,true)
})

test('balance is normalised to the documented schema; usage backfills real credits for this project only',async t=>{
 const x=setup(t,{async balance(){return {balance:'123.456',frozen:7}},async usage(){return [
  {task_id:TASK,type:'image_to_model',credits_consumed:30,created_at:'2026-09-27T00:00:00Z'},
  {task_id:TASK2,type:'text_to_image',credits_consumed:'10',created_at:'2026-09-27T00:00:00Z'},
  {task_id:'',credits_consumed:5},{task_id:'x',credits_consumed:'n/a'}]}})
 const b=await x.service.balance();assert.equal(b.balance,123.46);assert.equal(b.frozen,7);assert.ok(b.checkedAt)
 const job=x.service.prepare(x.p.id,{kind:'image-to-model',role:'part',priority:'high',label:'头发',params:modelParams(x.hair.id)})
 await x.service.submit(x.p.id,job.id,job.approvalHash)
 const r=await x.service.syncUsage(x.p.id)
 assert.deepEqual([r.total,r.matched,r.updated,r.projectTotal],[2,1,1,30])
 const saved=x.service.store.job(x.p.id,job.id);assert.equal(saved.creditsConsumed,30);assert.equal(saved.creditsSource,'usage')
 assert.equal((await x.service.syncUsage(x.p.id)).updated,0,'idempotent')
 x.service.locks.add('busy');await assert.rejects(()=>x.service.syncUsage(x.p.id),/稍后/)
})
