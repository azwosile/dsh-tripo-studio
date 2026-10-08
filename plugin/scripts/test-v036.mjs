// 0.3.6 browser/contract evidence: official P2.0 智能网格 (P2-20260801) in the 图生3D model list.
// Mock provider only — 未调用真实 API，未消耗积分。 Writes validation/v0.3.6/v036-results.json.
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
const out=path.resolve(root,'..','validation','v0.3.6');fs.mkdirSync(out,{recursive:true})
const png=fs.readFileSync(path.join(root,'tests','fixtures','reference.png'))
const checks=[];const check=(name,ok,detail='')=>{checks.push({name,ok:Boolean(ok),...(detail?{detail}:{})});console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` — ${detail}`:''}`)}
const P2='P2-20260801'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v036-ui-')),calls=[]
const client={balance:async()=>({balance:500,frozen:0}),usage:async()=>[],task:async()=>{calls.push('task');throw Error('NO TASK QUERY EXPECTED')},create:async()=>{calls.push('create');throw Error('NO PAID SUBMIT EXPECTED')},upload:async()=>{calls.push('upload');throw Error('NO UPLOAD EXPECTED')}}
const service=new JobService({directory:temp,key:'FAKE_LOCAL_V036',enabled:true,client}),s=service.store
const p=s.newProject('0.3.6界面测试')
s.addAsset(p.id,png,{label:'道具',priority:'high'})
const router=hostRouter(createHandler({service}))
const allowed=new Map([['/scripts/preview.html',['scripts/preview.html','text/html']],['/lib/client-v0.3.6.js',['lib/client-v0.3.6.js','text/javascript']],['/node_modules/react/umd/react.development.js',['node_modules/react/umd/react.development.js','text/javascript']],['/node_modules/react-dom/umd/react-dom.development.js',['node_modules/react-dom/umd/react-dom.development.js','text/javascript']]])
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
 check('UI: header shows 0.3.6',await page.locator('.tw-brand').innerText().then(t=>t.includes('0.3.6')))
 await page.locator('.tw-steps button').nth(2).click()
 const sel=page.getByLabel('Tripo 几何模型')
 const options=await sel.locator('option').allInnerTexts()
 check('UI: 图生3D model list contains P2-20260801 · P2.0 智能网格 after the H series',options.length===4&&options[0].startsWith('v3.1-20260211')&&options[3].startsWith(P2)&&options[3].includes('P2.0 智能网格'),JSON.stringify(options))
 check('UI: default model is still v3.1-20260211',await sel.inputValue()==='v3.1-20260211')
 await sel.selectOption(P2)
 const fields=page.locator('.tw-model-fields')
 check('UI: P2 disables 几何质量 and hides 智能低面数',await page.getByLabel('几何质量').isDisabled()&&await page.getByLabel('智能低面数').count()===0)
 const face=page.getByLabel('目标面数',{exact:true})
 check('UI: P2 triangle face range 48–50,000',await face.getAttribute('min')==='48'&&await face.getAttribute('max')==='50000'&&await fields.innerText().then(t=>t.includes('48–50,000')))
 const note=page.getByRole('note',{name:'P2.0 官方说明'})
 check('UI: P2 official note (preview, ranges, 100/110) links to the P-series doc',await note.innerText().then(t=>['P2-20260801','preview','48–50,000','48–25,000','100','110'].every(x=>t.includes(x)))&&await note.getByRole('link').getAttribute('href')==='https://developers.tripo3d.com/zh/docs/generation-image-to-model/p')
 await page.getByLabel('网格拓扑').selectOption('quad')
 check('UI: P2 quad clamps the face limit to 25,000',await face.getAttribute('max')==='25000'&&await face.inputValue()==='25000')
 await page.getByRole('button',{name:'Tips · 3D计价'}).click()
 const tips=page.getByRole('dialog',{name:'3D建模与格式转换计价参考'})
 const tipText=await (await tips.count()?tips:page.locator('.tw-model-price-tips')).innerText()
 check('UI: price tips quote the P-series table (约 110)',tipText.includes('P 系列')&&tipText.includes('110'),tipText.slice(0,160))
 await page.keyboard.press('Escape')
 await page.getByLabel('加入建模：道具').check()
 await page.getByRole('button',{name:'审阅建模 · 1 个任务'}).click()
 const dialog=page.getByRole('dialog',{name:'收费任务确认'});await expect(dialog).toBeVisible()
 const sent=JSON.parse(await dialog.locator('pre').first().innerText()),dtext=await dialog.innerText()
 check('UI: approval sends model P2-20260801 with quad, without geometry_quality / smart_low_poly',sent.model===P2&&sent.quad===true&&sent.face_limit===25000&&!('geometry_quality' in sent)&&!('smart_low_poly' in sent),JSON.stringify(sent))
 check('UI: approval estimate shows 约 110',dtext.includes('约 110'))
 await page.screenshot({path:path.join(out,'v036-p2-approval.png'),fullPage:false})
 await dialog.getByRole('button',{name:'取消并丢弃草稿'}).click();await expect(dialog).toHaveCount(0)
 await sel.selectOption('v3.1-20260211')
 check('UI: switching back to H series restores 几何质量 and 智能低面数',await page.getByLabel('几何质量').isEnabled()&&await page.getByLabel('智能低面数').count()===1&&await page.getByRole('note',{name:'P2.0 官方说明'}).count()===0)
 check('UI: no page errors, no external requests, no provider calls',errors.length===0&&external.length===0&&calls.length===0,JSON.stringify({errors,external,calls}))
} catch(e){check('UI run completed',false,e.message);if(page)await page.screenshot({path:path.join(out,'v036-ui-failure.png'),fullPage:true}).catch(()=>{})}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true})}
const result={version:'0.3.6',generatedAt:new Date().toISOString(),disclaimer:'Mock provider only — 未调用真实 API，未消耗积分。',passed:checks.filter(c=>c.ok).length,failed:checks.filter(c=>!c.ok).length,checks}
fs.writeFileSync(path.join(out,'v036-results.json'),JSON.stringify(result,null,2)+'\n')
console.log(`v0.3.6: ${result.passed}/${checks.length} passed → ${path.relative(path.resolve(root,'..'),path.join(out,'v036-results.json'))}`)
if(result.failed)process.exit(1)
