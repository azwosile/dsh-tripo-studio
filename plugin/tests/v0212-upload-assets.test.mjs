import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {fileURLToPath} from 'node:url'
import {JobService} from '../server/service.js'
import {createHandler} from '../server/routes.js'
import {TripoClient,networkCause} from '../server/tripo.js'
import {detectRegions,validSelection,selectionBounds,MAX_CROP_CANDIDATES} from '../client-src/image-tools.js'

const here=path.dirname(fileURLToPath(import.meta.url))
const png=fs.readFileSync(path.join(here,'fixtures/reference.png'))
const netError=code=>Object.assign(new TypeError('fetch failed'),{cause:{code}})
function fixture(t,client) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v0212-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
  const service=new JobService({directory:dir,key:'FAKE_V0212',enabled:true,client})
  const p=service.store.newProject('0.2.12隔离测试'),a=service.store.addAsset(p.id,png,{label:'整体立绘'})
  return {dir,service,p,a}
}
const modelSpec=id=>({kind:'image-to-model',role:'whole',params:{input_asset:id,model:'v3.1-20260211',face_limit:50000,texture:true,pbr:true}})

test('free /files upload retries transient network errors; paid create is attempted once',async()=>{
  const calls=[];let failUploads=2
  const client=new TripoClient({key:'unit-v0212',sleep:async()=>{},fetchImpl:async(url,options)=>{
    calls.push({url,method:options.method,timeout:Boolean(options.signal)})
    if(url.endsWith('/files')){if(failUploads-->0)throw netError('ECONNRESET');return Response.json({code:0,data:{file_token:'file_ok'}})}
    throw netError('ECONNRESET')
  }})
  assert.equal(await client.upload(png,'image/png'),'file_ok')
  assert.equal(calls.filter(c=>c.url.endsWith('/files')).length,3)
  await assert.rejects(client.create('image-to-model',{input:'file_ok',model:'v3.1-20260211'}),e=>e.code==='NETWORK_ERROR'&&e.definitive===false&&/连接被重置/.test(e.message)&&/可能未知/.test(e.message))
  assert.equal(calls.filter(c=>c.url.endsWith('/generation/image-to-model')).length,1)
})

test('upload failure is definitive, marked before_create and never reaches the paid create',async t=>{
  let creates=0,uploads=0
  const client=new TripoClient({key:'unit-v0212',sleep:async()=>{},fetchImpl:async url=>{if(url.endsWith('/files')){uploads++;throw Object.assign(new Error('timeout'),{name:'TimeoutError'})}creates++;return Response.json({code:0,data:{task_id:'task_x'}})}})
  const x=fixture(t,client)
  const draft=x.service.prepare(x.p.id,modelSpec(x.a.id))
  const job=await x.service.submit(x.p.id,draft.id,draft.approvalHash)
  assert.equal(job.status,'failed');assert.equal(job.errorCode,'UPLOAD_NETWORK_ERROR');assert.equal(job.errorPhase,'before_create');assert.equal(job.errorDetail,'请求超时')
  assert.match(job.error,/尚未发起收费生成/);assert.doesNotMatch(job.error,/可能未知/)
  assert.equal(uploads,3);assert.equal(creates,0)
  assert.doesNotMatch(JSON.stringify(x.service.store.state),/FAKE_V0212|unit-v0212/)
})

test('upload auth errors are not retried and stay definitive; create network errors stay submission_unknown',async t=>{
  let uploads=0
  const auth=new TripoClient({key:'unit-v0212',sleep:async()=>{},fetchImpl:async()=>{uploads++;return new Response(JSON.stringify({code:2,message:'Authentication required'}),{status:401})}})
  await assert.rejects(auth.upload(png,'image/png'),e=>e.definitive===true&&e.status===401);assert.equal(uploads,1)
  const client={upload:async()=>'file_ok',create:async()=>{throw Object.assign(new Error('Tripo 网络请求未取得响应（连接被重置）；提交结果可能未知，请勿重复提交'),{code:'NETWORK_ERROR',definitive:false,detail:'连接被重置'})}}
  const x=fixture(t,client),draft=x.service.prepare(x.p.id,modelSpec(x.a.id))
  const job=await x.service.submit(x.p.id,draft.id,draft.approvalHash)
  assert.equal(job.status,'submission_unknown');assert.equal(job.errorPhase,'create');assert.equal(job.errorDetail,'连接被重置')
  assert.equal((await x.service.submit(x.p.id,draft.id,draft.approvalHash)).status,'submission_unknown')
})

test('network causes are redacted stable labels',()=>{
  assert.equal(networkCause(Object.assign(new Error(),{name:'TimeoutError'})),'请求超时')
  assert.equal(networkCause(netError('ENOTFOUND')),'DNS解析失败')
  assert.equal(networkCause(netError('UND_ERR_SOCKET')),'连接被重置')
  assert.equal(networkCause(netError('ECONNREFUSED')),'无法建立连接')
  assert.equal(networkCause(netError('CERT_HAS_EXPIRED')),'TLS证书校验失败')
  assert.equal(networkCause(netError('https://x/?key=secret')),'网络错误')
})

test('rename only changes the local label; crop source must belong to the project; split prompts persist',t=>{
  const x=fixture(t,{})
  const before={...x.service.store.asset(x.p.id,x.a.id)}
  x.service.store.setLabel(x.p.id,x.a.id,'  新名字\u0007 ')
  const after=x.service.store.asset(x.p.id,x.a.id)
  assert.equal(after.label,'新名字');assert.equal(after.hash,before.hash);assert.equal(after.file,before.file)
  assert.throws(()=>x.service.store.setLabel(x.p.id,x.a.id,'   '),/1–100/);assert.throws(()=>x.service.store.setLabel(x.p.id,x.a.id,'x'.repeat(101)),/1–100/)
  const crop=x.service.store.addAsset(x.p.id,png,{label:'头发',sourceAssetId:x.a.id});assert.equal(crop.sourceAssetId,x.a.id)
  const other=x.service.store.newProject('other'),foreign=x.service.store.addAsset(other.id,png,{label:'外部'})
  assert.throws(()=>x.service.store.addAsset(x.p.id,png,{label:'bad',sourceAssetId:foreign.id}),/不属于/)
  const p=x.service.store.updateProject(x.p.id,{revision:0,draft:{splitSheetPrompt:'自定义整张',splitPartPrompt:'自定义单件',unknown:'drop'}})
  assert.equal(p.draft.splitSheetPrompt,'自定义整张');assert.equal(p.draft.splitPartPrompt,'自定义单件');assert.equal(p.draft.unknown,undefined)
  assert.equal(new JobService({directory:x.dir,key:'FAKE_V0212'}).store.asset(x.p.id,crop.id).sourceAssetId,x.a.id)
})

test('rename and crop-source HTTP routes keep CSRF, origin and project isolation',async t=>{
  const x=fixture(t,{}),other=x.service.store.newProject('other'),foreign=x.service.store.addAsset(other.id,png,{label:'外部'})
  const server=http.createServer(createHandler({service:x.service}));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
  const base=`http://127.0.0.1:${server.address().port}/dsh-tripo-studio`,headers={'x-tripo-studio':'1','content-type':'application/json'}
  const token=(await (await fetch(base+'/status',{headers})).json()).csrfToken
  const call=(method,route,body,extra={})=>fetch(base+route,{method,headers:{...headers,'x-tripo-csrf':token,...extra},body:JSON.stringify(body)})
  const route=`/projects/${x.p.id}/assets/${x.a.id}/label`
  assert.equal((await call('PATCH',route,{label:'A'},{'x-tripo-csrf':''})).status,403)
  assert.equal((await call('PATCH',route,{label:'A'},{origin:'https://evil.invalid'})).status,403)
  assert.equal((await call('PATCH',route,{label:'A',extra:1})).status,400)
  assert.equal((await call('PATCH',`/projects/${x.p.id}/assets/${foreign.id}/label`,{label:'A'})).status,404)
  const ok=await call('PATCH',route,{label:'改名后'});assert.equal(ok.status,200);assert.equal((await ok.json()).assets.find(a=>a.id===x.a.id).label,'改名后')
  const dataUrl='data:image/png;base64,'+png.toString('base64')
  assert.equal((await call('POST',`/projects/${x.p.id}/files`,{label:'bad',dataUrl,sourceAsset:foreign.id})).status,404)
  assert.equal((await call('POST',`/projects/${x.p.id}/files`,{label:'bad',dataUrl,sourceAsset:'../x'})).status,400)
  const crop=await call('POST',`/projects/${x.p.id}/files`,{label:'裁剪',dataUrl,sourceAsset:x.a.id});assert.equal(crop.status,201);assert.equal((await crop.json()).sourceAssetId,x.a.id)
})

test('local candidate detection returns up to 36 regions',()=>{
  assert.equal(MAX_CROP_CANDIDATES,36)
  const w=400,h=400,data=new Uint8ClampedArray(w*h*4).fill(255)
  for(let gy=0;gy<7;gy++)for(let gx=0;gx<7;gx++)for(let y=10+gy*55;y<40+gy*55;y++)for(let x=10+gx*55;x<40+gx*55;x++){const i=(y*w+x)*4;data[i]=30;data[i+1]=60;data[i+2]=90}
  const found=detectRegions(data,w,h)
  assert.equal(found.length,36)
})

test('lasso selections must start with add and may combine add/subtract shapes',()=>{
  const tri=(o=0)=>[{x:10+o,y:10},{x:40+o,y:10},{x:25+o,y:40}]
  assert.equal(validSelection([{op:'add',points:tri()},{op:'add',points:tri(40)},{op:'subtract',points:tri(5)}]),true)
  assert.equal(validSelection([{op:'subtract',points:tri()}]),false)
  assert.equal(validSelection([{op:'add',points:tri().slice(0,2)}]),false)
  assert.equal(validSelection([{op:'add',points:[{x:-1,y:0},{x:1,y:1},{x:2,y:3}]}]),false)
  assert.deepEqual(selectionBounds([{op:'add',points:tri()},{op:'add',points:tri(40)},{op:'subtract',points:[{x:0,y:0},{x:99,y:0},{x:50,y:99}]}]),{x:10,y:10,w:70,h:30})
})
