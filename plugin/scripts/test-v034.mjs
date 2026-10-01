// 0.3.4 browser/contract evidence: multiview-to-model, split-sheet moderation-safe prompt, split-sheet purple.
// Mock provider only — 未调用真实 API，未消耗积分。 Writes validation/v0.3.4/v034-results.json.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import {fileURLToPath} from 'node:url'
import {chromium,expect} from '@playwright/test'
import {createHandler} from '../server/routes.js'
import {hostRouter} from '../tests/fixtures/host-router.mjs'
import {JobService} from '../server/service.js'
import {normalizeJob,sheetPrompt,partPrompt,MULTIVIEW_VIEWS} from '../shared/contracts.js'
import {TRIPO_ENDPOINTS} from '../shared/image-models.js'
import {estimateJobCredits} from '../shared/credit-estimate.js'
import {toneOf,looksModerated,KIND_LABEL} from '../client-src/model-roles.js'
import {guessViews} from '../client-src/multiview.js'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const out=path.resolve(root,'..','validation','v0.3.4');fs.mkdirSync(out,{recursive:true})
const png=fs.readFileSync(path.join(root,'tests','fixtures','reference.png'))
const checks=[];const check=(name,ok,detail='')=>{checks.push({name,ok:Boolean(ok),...(detail?{detail}:{})});console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` — ${detail}`:''}`)}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v034-e2e-'))
try {
 const calls={upload:0,create:[]},TASK='0b3f6c1e-2d4a-4f5b-9c8d-7e6f5a4b3c2d'
 const svc=new JobService({directory:dir,key:'v034-mock',enabled:true,downloader:async()=>png,client:{async upload(){calls.upload++;return `tok_${calls.upload}`},async create(kind,params){calls.create.push({kind,params:structuredClone(params)});return {task_id:TASK}},async task(id){return {task_id:id,status:'running',progress:3}}}})
 const p=svc.store.newProject('0.3.4 隔离测试')
 const views=Object.fromEntries(['front','left','back','right'].map(v=>[v,svc.store.addAsset(p.id,png,{label:`头发_${v}`}).id]))
 const images=svc.store.snapshot(p.id).assets.filter(a=>a.kind==='image')
 const guessed=guessViews(images)
 check('auto-fill maps 头发_front/left/back/right to the four slots',MULTIVIEW_VIEWS.every(v=>guessed[v]===views[v]))
 const opts={model:'v3.1-20260211',face_limit:20000,texture:true,pbr:true,texture_alignment:'original_image',orientation:'default',geometry_quality:'standard',quad:false,auto_size:false,smart_low_poly:false,texture_quality:'standard'}
 const job=svc.prepare(p.id,{kind:'multiview-to-model',role:'part',priority:'high',label:'多视图「头发_front」',params:{views,...opts}})
 check('prepare → awaiting_approval with no upload / paid call',job.status==='awaiting_approval'&&calls.upload===0&&calls.create.length===0)
 await svc.submit(p.id,job.id,job.approvalHash)
 const c=calls.create[0]
 check('submit: 4 free uploads + exactly 1 POST /generation/multiview-to-model',calls.upload===4&&calls.create.length===1&&c.kind==='multiview-to-model'&&TRIPO_ENDPOINTS[c.kind]==='/generation/multiview-to-model')
 check('payload uses the documented view-key format in front/left/back/right order',JSON.stringify(c.params.inputs)===JSON.stringify([{front:'tok_1'},{left:'tok_2'},{back:'tok_3'},{right:'tok_4'}]),JSON.stringify(c.params.inputs))
 check('payload carries no views / input / enable_image_autofix',!('views' in c.params)&&!('input' in c.params)&&!('enable_image_autofix' in c.params))
 check('credit estimate equals image-to-model (official table 20/30)',estimateJobCredits({kind:'multiview-to-model',params:{views,...opts}})===estimateJobCredits({kind:'image-to-model',params:{input_asset:views.front,...opts}}))
 let rejected=0;for(const v of [{left:views.left,back:views.back},{front:views.front}])try{normalizeJob('multiview-to-model',{views:v,...opts})}catch{rejected++}
 check('front is mandatory and at least 2 views are required',rejected===2)
 check('KIND_LABEL shows 多视图生3D',KIND_LABEL['multiview-to-model']==='多视图生3D')
 const s=sheetPrompt(),b=partPrompt('身体基准')
 check('split-sheet prompt has no body / underwear / nudity wording',!/裸|内衬|贴身|内衣|身体|皮肤/.test(s),s.length+' chars')
 check('body-base prompt has no underwear / nudity wording',!/裸|内衬|内衣/.test(b))
 check('moderation-like errors get the hint; ordinary errors do not',looksModerated('rejected by the safety system')&&looksModerated('内容审核未通过')&&!looksModerated('network timeout'))
 check('split sheet is purple even when tagged 基准',toneOf({id:'s',priority:'base'},'s')==='purple'&&toneOf({id:'p',priority:'base'},'s')==='red')
} finally {fs.rmSync(dir,{recursive:true,force:true})}

// ---- Browser part: the real built bundle against local HTTP, isolated data, provider mock that throws on any call.
{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v034-ui-')),calls=[]
 const client={balance:async()=>({balance:500,frozen:0}),usage:async()=>[],task:async()=>{calls.push('task');throw Error('NO TASK QUERY EXPECTED')},create:async()=>{calls.push('create');throw Error('NO PAID SUBMIT EXPECTED')},upload:async()=>{calls.push('upload');throw Error('NO UPLOAD EXPECTED')}}
 const service=new JobService({directory:temp,key:'FAKE_LOCAL_V034',enabled:true,client}),s=service.store
 const p=s.newProject('0.3.4界面测试')
 const sheet=s.addAsset(p.id,png,{label:'拆件图S',priority:'base'})   // tagged 基准 like the user's 拆件图3 → must still be purple
 const part=(label,priority)=>s.addAsset(p.id,png,{label,priority,sourceAssetId:sheet.id})
 part('鞋子','normal');part('头发','high')
 const views=Object.fromEntries(['front','left','back','right'].map(v=>[v,s.addAsset(p.id,png,{label:`发型_${v}`}).id]))
 s.updateProject(p.id,{revision:0,draft:{selectedAsset:sheet.id,sheetAsset:sheet.id}})
 const failed=service.prepare(p.id,{kind:'image-to-image',label:'角色拆件图',priority:'normal',params:{model:'chat_image_2.5_sunburst',size:'1024x1536',quality:'low',prompt:'x',input_asset:sheet.id}})
 Object.assign(s.job(p.id,failed.id),{status:'failed',error:'Your request was rejected by the safety system.',errorCode:'2010'});s.save()
 const router=hostRouter(createHandler({service}))
 const allowed=new Map([['/scripts/preview.html',['scripts/preview.html','text/html']],['/lib/client-v0.3.4.js',['lib/client-v0.3.4.js','text/javascript']],['/node_modules/react/umd/react.development.js',['node_modules/react/umd/react.development.js','text/javascript']],['/node_modules/react-dom/umd/react-dom.development.js',['node_modules/react-dom/umd/react-dom.development.js','text/javascript']]])
 const server=http.createServer((req,res)=>{const route=router.match(req.url);if(route)return route.handler(req,res);const file=allowed.get(new URL(req.url,'http://localhost').pathname);if(!file){res.statusCode=404;return res.end()}res.setHeader('content-type',file[1]);res.end(fs.readFileSync(path.join(root,file[0])))})
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 const base=`http://127.0.0.1:${server.address().port}`,errors=[],external=[]
 let browser,page
 try {
  browser=await chromium.launch({...(process.env.TRIPO_TEST_BROWSER?{executablePath:process.env.TRIPO_TEST_BROWSER}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']})
  page=await browser.newPage({viewport:{width:1440,height:1000}})
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',route=>{const u=route.request().url();if(/^https?:/.test(u)&&!u.startsWith(base+'/')){external.push(u);return route.abort()}return route.continue()})
  await page.goto(base+'/scripts/preview.html');await expect(page.locator('.tw-steps')).toBeVisible()
  const upgrade=page.locator('.tw-upgrade');if(await upgrade.count())await upgrade.getByRole('button',{name:'知道了'}).click()
  if(!await page.locator('.tw-dock-body').count())await page.locator('.tw-dock-toggle').click()
  await expect(page.locator('.tw-dock-body .tw-job').first()).toBeVisible()
  const hint=page.locator('.tw-moderation-hint')
  check('UI: failed split-sheet task shows the moderation hint',await hint.count()===1&&await hint.innerText().then(t=>t.includes('内容安全审核')))
  await page.locator('.tw-steps button').nth(2).click()
  check('UI: legend lists 拆件图 · 紫色',await page.getByLabel('建模角色图例').innerText().then(t=>t.includes('拆件图 · 紫色')))
  const purple='rgb(124, 77, 204)'
  const sheetBadge=await page.locator('.tw-role-card[data-sheet=true] .tw-role-badge').evaluate(el=>getComputedStyle(el).backgroundColor)
  const shoeBadge=await page.locator('.tw-role-card').filter({hasText:'鞋子'}).locator('.tw-role-badge').evaluate(el=>getComputedStyle(el).backgroundColor)
  check('UI: split-sheet card is purple although tagged 基准; 次要 stays blue',sheetBadge===purple&&shoeBadge==='rgb(47, 111, 191)',`${sheetBadge} / ${shoeBadge}`)
  check('UI: ① 整张拆件图 frame is purple',await page.locator('.tw-sheet-plan').first().evaluate(el=>getComputedStyle(el).borderLeftColor)===purple)
  const mv=page.getByLabel('多视图建模')
  await mv.scrollIntoViewIfNeeded()
  check('UI: ③ 多视图建模 section with 4 slots',await mv.locator('.tw-view-slot').count()===4)
  await mv.getByRole('button',{name:'按图片名称自动填充'}).click()
  const vals=await Promise.all(['正面','左侧','背面','右侧'].map(n=>mv.getByLabel(`${n}视角图片`).inputValue()))
  check('UI: auto-fill picks 发型_front/left/back/right',JSON.stringify(vals)===JSON.stringify([views.front,views.left,views.back,views.right]))
  await page.screenshot({path:path.join(out,'v034-multiview-plan.png'),fullPage:true})
  await mv.getByRole('button',{name:'审阅多视图建模 · 4 视角 · 1 个任务'}).click()
  const dialog=page.getByRole('dialog',{name:'收费任务确认'});await expect(dialog).toBeVisible()
  const sent=JSON.parse(await dialog.locator('pre').first().innerText())
  check('UI: approval shows 多视图生3D, 4 view thumbnails and views without input_asset/autofix',await dialog.innerText().then(t=>t.includes('多视图生3D')&&t.includes('multiview-to-model'))&&await dialog.locator('.tw-approval-views img').count()===4&&Object.keys(sent.views).join()==='front,left,back,right'&&!('input_asset' in sent)&&!('enable_image_autofix' in sent))
  await page.screenshot({path:path.join(out,'v034-multiview-approval.png'),fullPage:false})
  await dialog.getByRole('button',{name:'取消并丢弃草稿'}).click();await expect(dialog).toHaveCount(0)
  await mv.getByLabel('正面视角图片').selectOption('')
  check('UI: without 正面 the review button is disabled',await mv.getByRole('button',{name:/审阅多视图建模/}).isDisabled())
  check('UI: no page errors, no external requests, no provider calls',errors.length===0&&external.length===0&&calls.length===0,JSON.stringify({errors,external,calls}))
 } catch(e){check('UI run completed',false,e.message);if(page)await page.screenshot({path:path.join(out,'v034-ui-failure.png'),fullPage:true}).catch(()=>{})}
 finally{if(browser)await browser.close();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true})}
}
const result={version:'0.3.4',generatedAt:new Date().toISOString(),disclaimer:'Mock provider only — 未调用真实 API，未消耗积分。',passed:checks.filter(c=>c.ok).length,failed:checks.filter(c=>!c.ok).length,checks}
fs.writeFileSync(path.join(out,'v034-results.json'),JSON.stringify(result,null,2)+'\n')
console.log(`v0.3.4: ${result.passed}/${checks.length} passed → ${path.relative(path.resolve(root,'..'),path.join(out,'v034-results.json'))}`)
if(result.failed)process.exit(1)
