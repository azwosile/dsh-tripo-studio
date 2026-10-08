import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {JobService} from '../server/service.js'
import {createHandler} from '../server/routes.js'
import {modelPriceReference,MODEL_PRICE_ROWS} from '../shared/model-pricing.js'
import {requiresRetention} from '../shared/task-policy.js'
function fixture(t) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v0211-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
 const calls=[];const client={task:async id=>{calls.push(id);return {task_id:id,type:'text_to_image',status:'running',progress:20}},create:async()=>{throw Error('NO PAID CALL')},upload:async()=>{throw Error('NO UPLOAD')}}
 const service=new JobService({directory:dir,key:'fake-v0211',enabled:false,client})
 const p=service.store.newProject('isolated')
 const job=status=>{const j=service.prepare(p.id,{kind:'text-to-image',params:{model:'seedream_v5',size:'2K',prompt:'isolated'}});const record=service.store.job(p.id,j.id);record.status=status;service.store.save();return record}
 return {service,p,job,dir,calls,client}
}
test('all safe local states can delete; active and unknown require retention',t=>{
 const x=fixture(t)
 for(const status of ['awaiting_approval','discarded','failed','success','cancelled']){const j=x.job(status);assert.equal(requiresRetention(j,[]),false);assert.equal(x.service.deleteRecord(x.p.id,j.id,{confirm:true}).deleted,true)}
 for(const status of ['submitting','submission_unknown','queued','running','unexpected']){const j=x.job(status);assert.equal(requiresRetention(j,[]),true);assert.throws(()=>x.service.deleteRecord(x.p.id,j.id,{confirm:true}));x.service.visibility(x.p.id,j.id,{confirm:true,hidden:true});assert.equal(x.service.store.job(x.p.id,j.id).status,status)}
 assert.equal(x.calls.length,0)
})
test('hidden task survives restart with IDs and approvals; refresh and imports retain safeguards',async t=>{
 const x=fixture(t),j=x.job('running');j.taskId='task_retained';x.service.store.save()
 const before=structuredClone(j);x.service.visibility(x.p.id,j.id,{confirm:true,hidden:true})
 await x.service.refresh(x.p.id,{manual:true});await x.service.refresh(x.p.id)
 assert.equal(x.calls.length,0)
 await assert.rejects(x.service.refresh(x.p.id,{manual:true,jobId:j.id}),/恢复列表/)
 await assert.rejects(x.service.importTask(x.p.id,{taskId:j.taskId,confirm:true}),/已关联/)
 assert.throws(()=>x.service.track(x.p.id,j.id,true),/恢复列表/)
 const reopened=new JobService({directory:x.dir,key:'fake-v0211',enabled:false,client:x.client})
 const stored=reopened.store.job(x.p.id,j.id)
 for(const key of ['taskId','accountHash','approvalHash','status'])assert.equal(stored[key],before[key])
 assert.equal(stored.hidden,true);assert.equal(stored.tracking,false)
 reopened.visibility(x.p.id,j.id,{confirm:true,hidden:false});assert.equal(stored.tracking,false);assert.equal(x.calls.length,0)
 await reopened.refresh(x.p.id,{manual:true,jobId:j.id});assert.equal(x.calls.length,1)
})
test('hidden unknown preserves recovery data and never re-submits',async t=>{
 const x=fixture(t),j=x.job('submission_unknown'),approval=j.approvalHash
 x.service.visibility(x.p.id,j.id,{confirm:true,hidden:true})
 await assert.rejects(x.service.submit(x.p.id,j.id,approval),/隐藏记录/)
 await assert.rejects(x.service.recover(x.p.id,j.id,{confirm:true,taskId:'task_recovery'}),/恢复列表/)
 await assert.rejects(x.service.saveOutputs(x.p.id,j.id),/恢复列表/)
 x.service.visibility(x.p.id,j.id,{confirm:true,hidden:false})
 assert.equal((await x.service.submit(x.p.id,j.id,approval)).status,'submission_unknown')
 assert.equal(x.calls.length,0)
})
test('hide referenced draft discards approval and retains dependency; no silent paid restore',async t=>{
 const x=fixture(t),a=x.job('awaiting_approval'),b=x.job('discarded');b.params.input_job=a.id
 assert.equal(requiresRetention(a,[a,b]),true)
 x.service.visibility(x.p.id,a.id,{confirm:true,hidden:true});assert.equal(a.status,'discarded')
 x.service.visibility(x.p.id,a.id,{confirm:true,hidden:false});assert.equal((await x.service.submit(x.p.id,a.id,a.approvalHash)).status,'discarded')
})
test('visibility checks confirmation, ownership, locks and rolls back failed persistence',t=>{
 const x=fixture(t),j=x.job('running'),other=x.service.store.newProject('other')
 for(const body of [{hidden:true},{confirm:true,hidden:1},{confirm:true,hidden:true,extra:1}])assert.throws(()=>x.service.visibility(x.p.id,j.id,body))
 assert.throws(()=>x.service.visibility(other.id,j.id,{confirm:true,hidden:true}),/不属于/)
 for(const lock of [j.id,`download:${j.id}`]){x.service.locks.add(lock);assert.throws(()=>x.service.visibility(x.p.id,j.id,{confirm:true,hidden:true}),/操作中/);x.service.locks.clear()}
 x.service.refreshing.set(x.p.id,true);assert.throws(()=>x.service.visibility(x.p.id,j.id,{confirm:true,hidden:true}));x.service.refreshing.clear()
 const save=x.service.store.save.bind(x.service.store),before=structuredClone(j);x.service.store.save=()=>{throw Error('disk')}
 assert.throws(()=>x.service.visibility(x.p.id,j.id,{confirm:true,hidden:true}),/disk/);x.service.store.save=save
 assert.deepEqual(x.service.store.job(x.p.id,j.id),before)
})
test('cleanup explicitly selected failed/discarded only; assets retained and no cloud calls',t=>{
 const x=fixture(t),a=x.job('failed'),b=x.job('discarded'),c=x.job('success'),d=x.job('failed')
 const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(20,16);png.writeUInt32BE(20,20)
 const asset=x.service.store.addAsset(x.p.id,png,{sourceJobId:a.id});a.assetIds=[asset.id]
 const result=x.service.cleanup(x.p.id,{confirm:true,ids:[a.id,b.id,c.id]})
 assert.deepEqual(result.removedIds,[a.id,b.id]);assert.equal(result.skipped.length,1)
 assert.ok(x.service.store.job(x.p.id,d.id));assert.ok(x.service.store.job(x.p.id,c.id));assert.ok(fs.existsSync(x.service.store.assetPath(asset)))
 assert.equal(x.service.store.asset(x.p.id,asset.id).sourceJobId,undefined);assert.equal(x.calls.length,0)
})
test('cleanup reports changed/hidden/locked and transitive protected references',t=>{
 const x=fixture(t),a=x.job('failed'),b=x.job('discarded'),c=x.job('failed'),d=x.job('running'),e=x.job('failed')
 b.params.input_job=a.id;c.params.input_job=b.id;x.service.locks.add(c.id);e.hidden=true
 const r=x.service.cleanup(x.p.id,{confirm:true,ids:[a.id,b.id,c.id,d.id,e.id]})
 assert.equal(r.removedIds.length,0);assert.equal(r.skipped.length,5);assert.equal(Object.keys(x.service.store.state.jobs).length,5)
 x.service.locks.clear();const deleted=x.service.cleanup(x.p.id,{confirm:true,ids:[a.id,b.id,c.id]});assert.equal(deleted.removedIds.length,3)
})
test('cleanup validates entire request before mutation and atomically rolls back save failure',t=>{
 const x=fixture(t),a=x.job('failed'),b=x.job('discarded')
 for(const body of [{confirm:false,ids:[a.id]},{confirm:true,ids:[]},{confirm:true,ids:[a.id,a.id]},{confirm:true,ids:[a.id],deleteAssets:true},{confirm:true,ids:[a.id,'../bad']}])assert.throws(()=>x.service.cleanup(x.p.id,body))
 const other=x.service.store.newProject('other');const foreign=x.service.prepare(other.id,{kind:'text-to-image',params:{model:'seedream_v5',size:'2K',prompt:'x'}})
 assert.throws(()=>x.service.cleanup(x.p.id,{confirm:true,ids:[a.id,foreign.id]}),/不属于/);assert.ok(x.service.store.job(x.p.id,a.id))
 const before=structuredClone(x.service.store.state),save=x.service.store.save.bind(x.service.store);x.service.store.save=()=>{throw Error('disk')}
 assert.throws(()=>x.service.cleanup(x.p.id,{confirm:true,ids:[a.id,b.id]}),/disk/);x.service.store.save=save;assert.deepEqual(x.service.store.state,before)
})
test('new maintenance routes require CSRF/same-origin and never bypass project ownership',async t=>{
 const x=fixture(t),j=x.job('running'),f=x.job('failed')
 const server=http.createServer(createHandler({service:x.service}));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
 const origin=`http://127.0.0.1:${server.address().port}`,base=origin+'/dsh-tripo-studio',headers={'x-tripo-studio':'1','content-type':'application/json'}
 const token=(await (await fetch(base+'/status',{headers})).json()).csrfToken
 const post=(route,body,extra={})=>fetch(base+route,{method:'POST',headers:{...headers,'x-tripo-csrf':token,...extra},body:JSON.stringify(body)})
 const route=`/projects/${x.p.id}/jobs/${j.id}/visibility`
 assert.equal((await post(route,{confirm:true,hidden:true},{'x-tripo-csrf':''})).status,403)
 assert.equal((await post(route,{confirm:true,hidden:true},{origin:'https://evil.invalid'})).status,403)
 assert.equal((await post(route,{confirm:true,hidden:true})).status,200)
 const clean=`/projects/${x.p.id}/jobs/cleanup`
 assert.equal((await post(clean,{confirm:true,ids:[f.id]},{'x-tripo-csrf':''})).status,403)
 assert.equal((await post(clean,{confirm:true,ids:[f.id]})).status,200);assert.equal(x.calls.length,0)
})
test('public H pricing respects texture exclusivity, geometry, topology and unknown legacy',()=>{
 const base={texture:true,textureQuality:'standard',quad:false,smart:false}
 assert.equal(modelPriceReference('v3.1-20260211','standard',base),30)
 assert.equal(modelPriceReference('v3.0-20250812','standard',{...base,texture:false,textureQuality:'extreme'}),20)
 assert.equal(modelPriceReference('v3.1-20260211','detailed',{...base,textureQuality:'extreme',quad:true,smart:true}),85)
 assert.equal(modelPriceReference('v3.1-20260211','standard',{...base,textureQuality:'detailed'}),40)
 assert.equal(modelPriceReference('v2.5-20250123','standard',base),null);assert.equal(MODEL_PRICE_ROWS.length,11)
})
