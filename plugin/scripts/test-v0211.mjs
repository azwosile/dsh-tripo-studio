// Real local HTTP + isolated data, no live supplier transport or user credentials.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {fileURLToPath} from 'node:url'
import {chromium,expect} from '@playwright/test'
import {JobService} from '../server/service.js'
import {createHandler} from '../server/routes.js'
import {hostRouter} from '../tests/fixtures/host-router.mjs'
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const evidence=path.join(root,'..','validation','v0.3.2');fs.mkdirSync(evidence,{recursive:true})
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v0211-ui-')),calls=[]
const client={task:async id=>{calls.push(['task',id]);return {task_id:id,type:'text_to_image',status:'running'}},create:async()=>{calls.push(['create']);throw Error('NO LIVE OR MOCK PAID SUBMIT EXPECTED')},upload:async()=>{calls.push(['upload']);throw Error('NO UPLOAD EXPECTED')}}
const service=new JobService({directory:temp,key:'FAKE_LOCAL_V0211',enabled:true,client})
const p=service.store.newProject('0.2.11隔离测试'),png=fs.readFileSync(path.join(root,'tests/fixtures/reference.png'))
const imageA=service.store.addAsset(p.id,png,{label:'参考图A'}),imageB=service.store.addAsset(p.id,png,{label:'参考图B'})
service.store.updateProject(p.id,{revision:0,draft:{selectedAsset:imageA.id}})
const seed=(status,label,params={})=>{const j=service.prepare(p.id,{kind:'text-to-image',label,params:{prompt:'test fixture',model:'seedream_v5',size:'2K'}});const r=service.store.job(p.id,j.id);Object.assign(r,{status,tracking:false,...params});service.store.save();return r}
const failed=seed('failed','失败测试'),discarded=seed('discarded','丢弃测试'),cancelled=seed('cancelled','取消测试'),unknown=seed('submission_unknown','未知恢复测试'),running=seed('running','运行测试',{taskId:'task_ui_running'}),success=seed('success','成功测试'),draft=seed('awaiting_approval','待提交草稿')
// Reference protects the image and is intentionally preserved in this test.
unknown.params.input_asset=imageB.id;service.store.save()
const handler=createHandler({service}),router=hostRouter(handler)
const allowed=new Map([['/scripts/preview.html',['scripts/preview.html','text/html']],['/lib/client-v0.3.2.js',['lib/client-v0.3.2.js','text/javascript']],['/node_modules/react/umd/react.development.js',['node_modules/react/umd/react.development.js','text/javascript']],['/node_modules/react-dom/umd/react-dom.development.js',['node_modules/react-dom/umd/react-dom.development.js','text/javascript']]])
const server=http.createServer((req,res)=>{const route=router.match(req.url);if(route)return route.handler(req,res);const file=allowed.get(new URL(req.url,'http://localhost').pathname);if(!file){res.statusCode=404;return res.end()}res.setHeader('content-type',file[1]);res.end(fs.readFileSync(path.join(root,file[0])))})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const base=`http://127.0.0.1:${server.address().port}`,passed=[],failures=[],errors=[],external=[]
let browser
const check=(name,ok)=>{(ok?passed:failures).push(name);console.log(`${ok?'PASS':'FAIL'} ${name}`)}
try {
 browser=await chromium.launch({...(process.env.TRIPO_TEST_BROWSER?{executablePath:process.env.TRIPO_TEST_BROWSER}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']})
 const page=await browser.newPage({viewport:{width:1380,height:1000}})
  await page.addInitScript(()=>{try{const k='tripo-studio-layout-v1',v=JSON.parse(localStorage.getItem(k)||'{}');if(v.lib===undefined)localStorage.setItem(k,JSON.stringify({...v,lib:true}))}catch{}}) // 0.3.2: library defaults to a collapsed rail; these checks need it open
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',route=>{const u=route.request().url();if(/^https?:/.test(u)&&!u.startsWith(base+'/')){external.push(u);return route.abort()}return route.continue()})
 const pane=async name=>{const b=page.getByRole('navigation',{name:'窄屏区域切换'}).getByRole('button',{name,exact:true});if(await b.count())await b.click()}
 await page.goto(base+'/scripts/preview.html');await expect(page.getByRole('heading',{name:'资产库'})).toBeVisible()
 const cardB=page.locator('.tw-image-tile').filter({hasText:'参考图B'}),thumb=cardB.getByRole('button',{name:'放大图片：参考图B'})
 await cardB.hover();await thumb.click();await expect(page.getByRole('dialog',{name:'放大图片：参考图B'})).toBeVisible();await page.keyboard.press('Escape')
 check('single thumbnail click magnifies without changing selected input',await cardB.getByRole('button',{name:'选择图片：参考图B',exact:true}).count()===1)
 await expect(thumb).toBeFocused();check('image preview restores keyboard focus',true)
 await cardB.getByRole('button',{name:'选择图片：参考图B',exact:true}).click();await expect(cardB.getByRole('button',{name:'已选择图片：参考图B'})).toHaveAttribute('aria-pressed','true');check('selection is a separate explicit action',true)
 await page.getByRole('button',{name:'界面外观',exact:true}).click();await page.getByLabel('普通控件背景不透明度',{exact:true}).fill('0');await page.getByRole('button',{name:'关闭界面配色与毛玻璃'}).click()
 const alpha=()=>cardB.locator('.tw-pick-caption').evaluate(el=>{const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');ctx.fillStyle=getComputedStyle(el).backgroundColor;ctx.fillRect(0,0,1,1);return ctx.getImageData(0,0,1,1).data[3]})
 check('asset caption uses control transparency without fading text',await alpha()===0&&await cardB.locator('.tw-image-card strong').evaluate(el=>getComputedStyle(el).opacity)==='1')
 await page.getByRole('button',{name:'界面外观',exact:true}).click();await page.getByLabel('普通控件背景不透明度',{exact:true}).fill('100');await page.getByRole('button',{name:'关闭界面配色与毛玻璃'}).click();check('caption returns to opaque at 100 percent',await alpha()===255)
 await cardB.getByRole('button',{name:'删除参考图：参考图B'}).click()
 const dialog=page.getByRole('dialog',{name:'删除参考图确认'})
 await expect(dialog.locator('[role=alert]')).toHaveCount(0)
 await dialog.getByRole('button',{name:'确认删除本机图片'}).click();await expect(dialog.getByRole('alert')).toContainText('此资产仍关联任务')
 check('reference error appears only after refusal and inside deletion dialog',Boolean(service.store.state.assets[imageB.id]))
 await dialog.getByRole('button',{name:'保留图片'}).click()
 await page.locator('.tw-steps button').nth(1).click();await expect(page.locator('.tw-source-preview')).toContainText('参考图B')
 await page.getByLabel('拆件来源',{exact:true}).selectOption(imageA.id);await expect(page.locator('.tw-source-preview')).toContainText('参考图A')
 await page.getByRole('button',{name:'预览拆件来源：参考图A'}).click();await expect(page.getByRole('dialog',{name:'放大图片：参考图A'})).toBeVisible();await page.keyboard.press('Escape');check('split-source preview switches with selected image',true)
 await page.locator('.tw-steps button').nth(2).click();await page.getByRole('button',{name:'Tips · 3D计价'}).click()
 const tips=page.getByRole('dialog',{name:'3D建模与格式转换计价参考'});await expect(tips).toContainText('30 积分');await expect(tips).toContainText('2026-09-23');await expect(tips.locator('tbody tr')).toHaveCount(9)
 check('3D pricing shows dated official base/addons/conversion table',await tips.getByRole('link',{name:/官方3D计价/}).getAttribute('href')==='https://developers.tripo3d.com/zh/pricing')
 await page.keyboard.press('Escape');await page.getByLabel('贴图',{exact:true}).selectOption('off');await page.getByRole('button',{name:'Tips · 3D计价'}).click();await expect(tips).toContainText('20 积分');await page.keyboard.press('Escape')
 await page.getByLabel('Tripo 几何模型').selectOption('v2.5-20250123');await page.getByRole('button',{name:'Tips · 3D计价'}).click();await expect(tips).toContainText('当前价格未知');await page.keyboard.press('Escape');check('pricing responds to texture and avoids quoting unverified legacy model',true)
 // Responsive geometry checks across themes and maximum font; no visual-only assertions.
 for(const width of [1380,760,390])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1000})
  await page.evaluate(theme=>{const key='tripo-studio:appearance:v2',v=JSON.parse(localStorage.getItem(key)||'{}');localStorage.setItem(key,JSON.stringify({...v,theme,controls:{height:52,fontSize:18,gap:16,panelWidth:380}}))},theme)
  await page.reload();await page.locator('.tw-steps button').nth(2).click();await pane('参数') // 0.3.0: narrow slots show one pane
  const a=await page.getByLabel('目标面数',{exact:true}).boundingBox(),b=await page.getByLabel('几何质量',{exact:true}).boundingBox()
  check(`equal model parameter widths ${width}/${theme}`,Math.abs(a.width-b.width)<1)
  const button=page.getByRole('button',{name:/审阅并单独确认格式转换/}),link=page.getByRole('link',{name:'查看官方转换格式与参数'})
  await link.scrollIntoViewIfNeeded();const rb=await button.boundingBox(),rl=await link.boundingBox()
  check(`conversion actions do not overlap ${width}/${theme}`,rl.y>=rb.y+rb.height+5)
  await page.locator('.tw-steps button').nth(3).click();await pane('任务');const recovery=page.locator(`[data-job-id="${unknown.id}"] .tw-recovery`)
  const h=await recovery.getByRole('heading').boundingBox(),r=await recovery.boundingBox(),para=await recovery.locator('p').first().boundingBox()
  check(`recovery title in flow ${width}/${theme}`,h.x>=r.x+1&&h.y>=r.y+1&&para.y>=h.y+h.height-1&&h.x+h.width<=r.x+r.width+1)
  if(width===390&&theme==='dark')await page.screenshot({path:path.join(evidence,'v0211-recovery-mobile-dark.png'),fullPage:true})
 }
 await page.setViewportSize({width:1380,height:1000});await page.reload();await page.locator('.tw-steps button').nth(3).click()
 for(const [j,label] of [[discarded,'删除丢弃记录'],[cancelled,'删除取消记录'],[draft,'删除草稿记录']]){
  const c=page.locator(`[data-job-id="${j.id}"]`);await c.getByRole('button',{name:label,exact:true}).click();await c.getByRole('button',{name:'确认删除本地记录',exact:true}).click();await expect(c).toHaveCount(0)
 }
 check('discarded cancelled and unsubmitted records delete locally',![discarded,cancelled,draft].some(j=>service.store.state.jobs[j.id]))
 const c=page.locator(`[data-job-id="${unknown.id}"]`);await c.getByRole('button',{name:'从列表移除',exact:true}).click();await expect(c).toContainText('保留恢复/查重信息');await c.getByRole('button',{name:'确认移除并保留恢复信息'}).click();await expect(c).toHaveCount(0)
 check('unknown task removal hides but retains recovery input',service.store.state.jobs[unknown.id].hidden===true&&service.store.state.jobs[unknown.id].params.input_asset===imageB.id)
 await page.reload();await page.locator('.tw-steps button').nth(3).click();await expect(c).toHaveCount(0);await page.locator('.tw-hidden-jobs summary').click();await page.getByRole('button',{name:'恢复到任务列表'}).click();await expect(c).toBeVisible()
 check('hidden state persists and restore does not track or call cloud',service.store.state.jobs[unknown.id].tracking===false&&calls.length===0)
 const run=page.locator(`[data-job-id="${running.id}"]`);await run.getByRole('button',{name:'从列表移除',exact:true}).click();await run.getByRole('button',{name:'确认移除并保留恢复信息'}).click();await page.getByRole('button',{name:'刷新任务（只查询，不重提）'}).click()
 check('project manual refresh excludes hidden running task',!calls.some(c=>c[1]==='task_ui_running'))
 // Fresh selection snapshot; success, unknown and hidden active jobs remain untouched.
 const discarded2=seed('discarded','批量丢弃');await page.reload();await page.locator('.tw-steps button').nth(3).click()
 await page.getByRole('button',{name:/一键删除失败\/丢弃任务/}).click();await page.getByRole('button',{name:'取消清理'}).click();check('batch deletion requires confirmation',Boolean(service.store.state.jobs[failed.id]))
 await page.getByRole('button',{name:/一键删除失败\/丢弃任务/}).click();await page.getByRole('button',{name:'确认批量删除本地记录'}).click();await expect(page.getByRole('status')).toContainText('已删除 2 条')
 check('batch only removes confirmed failed/discarded; preserves assets and others',!service.store.state.jobs[failed.id]&&!service.store.state.jobs[discarded2.id]&&Boolean(service.store.state.jobs[success.id])&&Boolean(service.store.state.jobs[unknown.id])&&Object.keys(service.store.state.assets).length===2)
 await page.screenshot({path:path.join(evidence,'v0211-task-maintenance.png'),fullPage:true})
 check('no fake stop-cloud button or supplier submission',await page.getByRole('button',{name:/停止云端|取消云端任务/}).count()===0&&!calls.some(c=>['create','upload'].includes(c[0])))
 check('no page errors or external browser requests',errors.length===0&&external.length===0)
} catch(e){failures.push(e.message);console.error(e);const p=browser?.contexts()[0]?.pages()[0];if(p)await p.screenshot({path:path.join(evidence,'v0211-ui-failure.png'),fullPage:true}).catch(()=>{})}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true})}
fs.writeFileSync(path.join(evidence,'v0211-ui-results.json'),JSON.stringify({passed,failures,errors,external,calls,realProviderCalls:0},null,2)+'\n')
console.log(JSON.stringify({passed:passed.length,failed:failures.length}));if(failures.length||errors.length||external.length)process.exitCode=1
