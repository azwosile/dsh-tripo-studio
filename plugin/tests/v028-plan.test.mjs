import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {JobService} from '../server/service.js'
import {normalizeAppearance} from '../client-src/appearance-settings.js'
test('alpha preferences clamp and migrate without changing other values',()=>{
 const old=normalizeAppearance({opacity:25,textColor:'#aabbcc'});assert.equal(old.opacity,25);assert.equal(old.controlOpacity,92);assert.equal(old.titlebarOpacity,82)
 const next=normalizeAppearance({controlOpacity:-1,titlebarOpacity:101});assert.equal(next.controlOpacity,0);assert.equal(next.titlebarOpacity,100)
})
test('whole and part are separately approved; priorities local; no calls at prepare',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-plan-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
 const calls=[];const service=new JobService({directory:dir,key:'FAKE',enabled:true,client:{upload:async()=> 'file_mock',create:async(kind,params)=>{calls.push(params);return {task_id:`task_${calls.length}`}}}})
 const p=service.store.newProject('test'),png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(16,16);png.writeUInt32BE(16,20)
 const a=service.store.addAsset(p.id,png),part=service.store.addAsset(p.id,png,{priority:'high'})
 const whole=service.prepare(p.id,{kind:'image-to-model',role:'whole',priority:'base',params:{input_asset:a.id}})
 const draft=service.prepare(p.id,{kind:'image-to-model',role:'part',priority:'high',params:{input_asset:part.id}})
 assert.equal(calls.length,0);assert.equal(whole.role,'whole');assert.equal(draft.priority,'high')
 await service.submit(p.id,whole.id,whole.approvalHash);assert.equal(calls.length,1);assert.equal(service.store.job(p.id,draft.id).status,'awaiting_approval');assert.equal('role' in calls[0],false);assert.equal('priority' in calls[0],false)
 service.store.setPriority(p.id,part.id,'normal');assert.equal(service.store.asset(p.id,part.id).priority,'normal');assert.equal(calls.length,1)
 const updated=service.store.updateProject(p.id,{revision:0,draft:{wholeAsset:a.id,splitModel:'banana2',splitSize:'2K',splitQuality:''}});assert.equal(updated.draft.wholeAsset,a.id)
})
