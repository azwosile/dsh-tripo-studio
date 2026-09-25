import test from 'node:test'
import assert from 'node:assert/strict'
import {IMAGE_MODEL_INFO,IMAGE_MODELS,EDIT_IMAGE_MODELS,isImageSize,imageDefaults,imageRequest,priceText,modelAvailable} from '../shared/image-models.js'
import {normalizeJob} from '../shared/contracts.js'
import {TripoClient} from '../server/tripo.js'
const id='11111111-1111-1111-1111-111111111111'
test('official catalog is operation-aware; Seedream v4 never edits',()=>{
 assert.equal(IMAGE_MODELS.length,10);assert.equal(EDIT_IMAGE_MODELS.length,9)
 assert.throws(()=>normalizeJob('image-to-image',{model:'seedream_v4',prompt:'edit',input_asset:id,size:'2K'}),/图生图/)
 assert.equal(normalizeJob('text-to-image',{model:'seedream_v4',prompt:'draw',size:'4K'}).size,'4K')
})
test('per-model dimensions and quality do not inherit chat defaults',()=>{
 for(const m of IMAGE_MODELS){const d=imageDefaults(m);assert.ok(isImageSize(d.size,m));if(!modelAvailable(m))continue;const p=normalizeJob('text-to-image',imageRequest({...d,prompt:'draw'}));assert.equal(p.model,m);assert.equal('quality' in p,IMAGE_MODEL_INFO[m].quality.length>0)}
 for(const m of ['seedream_v5','seedream_v4','banana','banana_pro','banana2','chat_image_1','chat_image_1.5'])assert.throws(()=>normalizeJob('text-to-image',{model:m,prompt:'x',quality:'low'}))
 assert.equal(isImageSize('3K','seedream_v5'),true);assert.equal(isImageSize('4K','seedream_v5'),false)
 assert.equal(isImageSize('2048x2048','seedream_v5'),true);assert.equal(isImageSize('1024x1024','seedream_v5'),false)
 assert.equal(isImageSize('832x1248','banana'),true);assert.equal(isImageSize('2K','banana'),false)
 assert.equal(isImageSize('0.5K','banana2'),true);assert.equal(isImageSize('2048x2048','banana2'),false)
 assert.equal(isImageSize('1080x1920','chat_image_2'),false);assert.equal(isImageSize('1088x1920','chat_image_2'),true)
 assert.throws(()=>normalizeJob('text-to-image',{model:'banana2',prompt:'x',background:'transparent'}),/2.5/)
})
test('retirement calendar and official credit tables explicit',()=>{
 assert.ok(modelAvailable('chat_image_1',new Date('2026-10-22T23:00:00Z')))
 assert.equal(modelAvailable('chat_image_1',new Date('2026-10-23T00:00:00Z')),false)
 assert.match(priceText('seedream_v5'),/≤1K 5 \/ 2K 5 \/ 4K 5/)
 assert.match(priceText('chat_image_2.5_flare','max'),/30 \/ 2K 50 \/ 4K 50/)
 assert.match(priceText('banana_pro'),/15 \/ 2K 15 \/ 4K 20/)
 assert.match(priceText('banana','high'),/≤1K 5/)
})
test('expanded models transmit exact CN URL/method/header/body; fake transport only',async()=>{
 const calls=[];const client=new TripoClient({key:'FAKE_TEST_KEY',fetchImpl:async(url,options)=>{calls.push({url,...options});return Response.json({code:0,data:{task_id:'task_mock'}})}})
 for(const model of ['seedream_v5','seedream_v4','banana','banana2','banana_pro']){
  const p=normalizeJob('text-to-image',imageRequest({...imageDefaults(model),prompt:'design'}));await client.create('text-to-image',p)
  const c=calls.at(-1);assert.equal(c.url,'https://openapi.tripo3d.com/v3/generation/text-to-image');assert.equal(c.method,'POST');assert.equal(c.headers.Authorization,'Bearer FAKE_TEST_KEY');assert.deepEqual(JSON.parse(c.body),p);assert.equal('quality' in JSON.parse(c.body),false)
  if(IMAGE_MODEL_INFO[model].edit){const e=normalizeJob('image-to-image',imageRequest({...imageDefaults(model),prompt:'extract',input_asset:id}));delete e.input_asset;e.input='file_mock';await client.create('image-to-image',e);assert.equal(calls.at(-1).url,'https://openapi.tripo3d.com/v3/generation/image-to-image');assert.equal(JSON.parse(calls.at(-1).body).input,'file_mock')}
 }
})
