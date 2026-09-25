import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeJob} from '../shared/contracts.js'
import {IMAGE_MODELS,IMAGE_MODEL_INFO,IMAGE_SIZES,isImageSize,TRIPO_API_BASE,TRIPO_ENDPOINTS} from '../shared/image-models.js'
import {TripoClient} from '../server/tripo.js'
import {normalizeAppearance,CONTROL_PRESETS,CONTROL_LIMITS} from '../client-src/appearance-settings.js'
const input='00000000-0000-0000-0000-000000000000'
test('displayed official model ID, validated parameters and submitted ID are identical',()=>{
 for(const model of IMAGE_MODELS){
  assert.ok(IMAGE_MODEL_INFO[model].label.includes(model))
  assert.ok(!IMAGE_MODEL_INFO[model].label.includes('GPT'))
  for(const kind of ['text-to-image','image-to-image'])for(const quality of IMAGE_MODEL_INFO[model].quality){
   const p=normalizeJob(kind,{model,prompt:'完整角色 --no watermark',quality,size:'1088x1920',...(kind==='image-to-image'?{input_asset:input}:{})})
   assert.equal(p.model,model);assert.equal(p.quality,quality);assert.equal(p.output_format,'png')
  }
 }
 assert.throws(()=>normalizeJob('text-to-image',{model:'chat_image_2',quality:'max',prompt:'test'}))
 assert.equal(normalizeJob('text-to-image',{model:'seedream_v5',prompt:'integrated in 0.2.9'}).size,'2K')
})
test('official chat_image size bounds and auto are enforced before approval',()=>{
 for(const s of [...IMAGE_SIZES,'1536x864','1088x1920'])assert.equal(isImageSize(s),true,s)
 for(const s of ['1080x1920','16x16','4096x2048','512x2048','3840x3840','2K','2048×2048','auto '])assert.equal(isImageSize(s),false,s)
 assert.equal(normalizeJob('text-to-image',{prompt:'test',size:'auto'}).size,'auto')
 assert.throws(()=>normalizeJob('text-to-image',{prompt:'test',size:'1080x1920'}),/尺寸无效/)
})
test('every integrated model uses the official URL, method and JSON bearer headers',async()=>{
 const calls=[],client=new TripoClient({key:'test-transport-key',fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json({code:0,data:{task_id:'fixture'}})}})
 for(const model of IMAGE_MODELS)for(const kind of ['text-to-image','image-to-image']){
  if(kind==='image-to-image'&&!IMAGE_MODEL_INFO[model].edit)continue
  const params=normalizeJob(kind,{model,prompt:'test',...(kind==='image-to-image'?{input_asset:input}:{})});delete params.input_asset;if(kind==='image-to-image')params.input='file_fixture'
  await client.create(kind,params);const c=calls.at(-1)
  assert.equal(c.url,TRIPO_API_BASE+TRIPO_ENDPOINTS[kind]);assert.equal(c.options.method,'POST');assert.equal(c.options.headers.Authorization,'Bearer test-transport-key');assert.equal(c.options.headers['Content-Type'],'application/json');assert.equal(JSON.parse(c.options.body).model,model);assert.equal(c.options.redirect,'error')
 }
 for(const model of ['v3.1-20260211','v3.0-20250812']){await client.create('image-to-model',{input:'file_fixture',model,texture:true,pbr:true});assert.equal(calls.at(-1).url,TRIPO_API_BASE+'/generation/image-to-model')}
 assert.equal(calls.length,21);assert.throws(()=>client.create('other',{}));assert.equal(calls.length,21)
})
test('upload leaves multipart boundary to runtime; task and balance use authenticated GET',async()=>{
 const calls=[],client=new TripoClient({key:'fake-only',fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json({code:0,data:{file_token:'file_fixture'}})}})
 await client.upload(Buffer.from('fake PNG bytes'),'image/png');const upload=calls[0]
 assert.equal(upload.url,TRIPO_API_BASE+'/files');assert.equal(upload.options.method,'POST');assert.ok(upload.options.body instanceof FormData);assert.ok(!Object.hasOwn(upload.options.headers,'Content-Type'));assert.equal(upload.options.headers.Authorization,'Bearer fake-only')
 await client.task('task_fixture');await client.balance()
 assert.equal(calls[1].url,TRIPO_API_BASE+'/tasks/task_fixture');assert.equal(calls[2].url,TRIPO_API_BASE+'/account/balance');for(const c of calls.slice(1))assert.equal(c.options.method,'GET')
})
test('appearance additions are bounded, safe and backward compatible',()=>{
 assert.equal(normalizeAppearance({theme:'dark'}).opacity,92)
 assert.equal(normalizeAppearance({opacity:-10}).opacity,0);assert.equal(normalizeAppearance({opacity:999}).opacity,100)
 assert.equal(normalizeAppearance({opacity:NaN}).opacity,92)
 assert.equal(normalizeAppearance({textColor:'#ABC123'}).textColor,'#abc123')
 for(const textColor of ['red','url(http://evil)',';color:red','#00000000'])assert.equal(normalizeAppearance({textColor}).textColor,'')
 assert.equal(Object.keys(CONTROL_PRESETS).length,6)
 for(const preset of Object.values(CONTROL_PRESETS))for(const [k,[min,max]] of Object.entries(CONTROL_LIMITS))assert.ok(preset[k]>=min&&preset[k]<=max)
})
