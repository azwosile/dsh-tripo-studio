// 0.3.5 browser/contract evidence: 重拓扑 /mesh/decimate with mandatory official notes, export_orientation.
// Mock provider only — 未调用真实 API，未消耗积分。 Writes validation/v0.3.5/v035-results.json.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import {fileURLToPath} from 'node:url'
import {chromium,expect} from '@playwright/test'
import {createHandler} from '../server/routes.js'
import {hostRouter} from '../tests/fixtures/host-router.mjs'
import {JobService} from '../server/service.js'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const out=path.resolve(root,'..','validation','v0.3.5');fs.mkdirSync(out,{recursive:true})
const png=fs.readFileSync(path.join(root,'tests','fixtures','reference.png'))
const glb=Buffer.alloc(20);glb.write('glTF');glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8)
const checks=[];const check=(name,ok,detail='')=>{checks.push({name,ok:Boolean(ok),...(detail?{detail}:{})});console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` — ${detail}`:''}`)}
const TASK='0b3f6c1e-2d4a-4f5b-9c8d-7e6f5a4b3c2d'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v035-ui-')),calls=[]
const client={balance:async()=>({balance:500,frozen:0}),usage:async()=>[],task:async()=>{calls.push('task');throw Error('NO TASK QUERY EXPECTED')},create:async()=>{calls.push('create');throw Error('NO PAID SUBMIT EXPECTED')},upload:async()=>{calls.push('upload');throw Error('NO UPLOAD EXPECTED')}}
const service=new JobService({directory:temp,key:'FAKE_LOCAL_V035',enabled:true,client}),s=service.store
const p=s.newProject('0.3.5界面测试')
const img=s.addAsset(p.id,png,{label:'头发',priority:'high'})
// A finished same-account 3D generation (seeded locally; no provider call) as retopology/convert source.
const gen=service.prepare(p.id,{kind:'image-to-model',label:'头发3D',priority:'high',params:{input_asset:img.id,model:'v3.1-20260211',face_limit:50000,texture:true,pbr:true}})
Object.assign(s.job(p.id,gen.id),{status:'success',taskId:TASK,progress:100,downloadStatus:'downloaded'})
const model=s.addAsset(p.id,glb,{kind:'model',label:'头发3D',sourceJobId:gen.id});s.job(p.id,gen.id).assetIds=[model.id];s.save()
const router=hostRouter(createHandler({service}))
const allowed=new Map([['/scripts/preview.html',['scripts/preview.html','text/html']],['/lib/client-v0.3.5.js',['lib/client-v0.3.5.js','text/javascript']],['/node_modules/react/umd/react.development.js',['node_modules/react/umd/react.development.js','text/javascript']],['/node_modules/react-dom/umd/react-dom.development.js',['node_modules/react-dom/umd/react-dom.development.js','text/javascript']]])
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
 check('UI: header shows 0.3.5',await page.locator('.tw-brand').innerText().then(t=>t.includes('0.3.5')))
 await page.locator('.tw-steps button').nth(2).click()
 const panel=page.getByLabel('重拓扑',{exact:true});await panel.scrollIntoViewIfNeeded()
 const tips=panel.getByRole('note',{name:'重拓扑官方提示'})
 const tipText=await tips.innerText()
 check('UI: ⑤ 重拓扑 panel shows the official Tripo notes (price, ranges, GLB, 150 MB, may fail)',['Tripo 官方提示','30 积分','10 积分','500–20,000','500–10,000','GLB','150 MB','可能处理失败','独立收费'].every(x=>tipText.includes(x)))
 check('UI: official notes link to the decimate doc',await tips.getByRole('link').getAttribute('href')==='https://developers.tripo3d.com/zh/docs/mesh-decimate')
 await panel.getByLabel('重拓扑来源任务').selectOption(gen.id)
 const btn=panel.getByRole('button',{name:'审阅并单独确认重拓扑 · 1 个任务'})
 check('UI: review button stays disabled until 已阅读官方提示 is ticked',await btn.isDisabled())
 await panel.getByLabel('已阅读重拓扑官方提示').check()
 check('UI: v2.0 adaptive is enabled after acknowledging',await btn.isEnabled())
 await panel.getByLabel('重拓扑模型').selectOption('v1.0')
 check('UI: v1.0 forces a face count field and hides bake',await panel.getByLabel('重拓扑目标面数').count()===1&&await panel.getByLabel('重拓扑烘焙贴图').count()===0)
 await panel.getByLabel('重拓扑模型').selectOption('v2.0')
 await panel.getByLabel('重拓扑面数方式').selectOption('fixed');await panel.getByLabel('重拓扑目标面数').fill('30000')
 check('UI: out-of-range v2.0 face count (30000 > 20000) disables review',await btn.isDisabled())
 await panel.getByLabel('重拓扑目标面数').fill('8000')
 await panel.screenshot({path:path.join(out,'v035-retopo-panel.png')})
 await btn.click()
 const dialog=page.getByRole('dialog',{name:'收费任务确认'});await expect(dialog).toBeVisible()
 const sent=JSON.parse(await dialog.locator('pre').first().innerText()),dtext=await dialog.innerText()
 check('UI: approval repeats the official notes and shows mesh-decimate params',dtext.includes('Tripo 官方提示')&&dtext.includes('mesh-decimate')&&sent.model==='v2.0'&&sent.face_limit===8000&&sent.input_job===gen.id&&!('bake' in sent),JSON.stringify(sent))
 check('UI: approval estimate shows 约 30',dtext.includes('约 30'))
 await page.screenshot({path:path.join(out,'v035-retopo-approval.png'),fullPage:false})
 await dialog.getByRole('button',{name:'取消并丢弃草稿'}).click();await expect(dialog).toHaveCount(0)
 const conv=page.getByLabel('模型格式转换')
 await conv.getByLabel('转换来源任务').selectOption(gen.id);await conv.getByLabel('转换朝向（前向轴）').selectOption('-y')
 check('UI: convert panel shows the official orientation note',await conv.innerText().then(t=>t.includes('export_orientation')&&t.includes('+x（默认）')))
 await conv.getByRole('button',{name:/审阅并单独确认格式转换/}).click()
 await expect(dialog).toBeVisible()
 const csent=JSON.parse(await dialog.locator('pre').first().innerText())
 check('UI: convert approval carries export_orientation -y',csent.export_orientation==='-y'&&csent.format==='FBX',JSON.stringify(csent))
 await dialog.getByRole('button',{name:'取消并丢弃草稿'}).click();await expect(dialog).toHaveCount(0)
 const gsel=page.getByLabel('导出前向轴（export_orientation）')
 check('UI: generation orientation defaults to 不设置 with the official recommendation',await gsel.inputValue()===''&&await page.locator('.tw-model-fields').innerText().then(t=>t.includes('官方建议留空')))
 check('UI: no page errors, no external requests, no provider calls',errors.length===0&&external.length===0&&calls.length===0,JSON.stringify({errors,external,calls}))
} catch(e){check('UI run completed',false,e.message);if(page)await page.screenshot({path:path.join(out,'v035-ui-failure.png'),fullPage:true}).catch(()=>{})}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true})}
const result={version:'0.3.5',generatedAt:new Date().toISOString(),disclaimer:'Mock provider only — 未调用真实 API，未消耗积分。',passed:checks.filter(c=>c.ok).length,failed:checks.filter(c=>!c.ok).length,checks}
fs.writeFileSync(path.join(out,'v035-results.json'),JSON.stringify(result,null,2)+'\n')
console.log(`v0.3.5: ${result.passed}/${checks.length} passed → ${path.relative(path.resolve(root,'..'),path.join(out,'v035-results.json'))}`)
if(result.failed)process.exit(1)
