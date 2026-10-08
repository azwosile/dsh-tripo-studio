// 0.2.12 UI regression: real local HTTP + isolated data; no live supplier transport or user credentials.
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
const evidence=path.join(root,'..','validation','v0.3.6');fs.mkdirSync(evidence,{recursive:true})
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v0212-ui-')),calls=[]
const client={task:async id=>{calls.push(['task',id]);throw Error('NO TASK QUERY EXPECTED')},create:async()=>{calls.push(['create']);throw Error('NO PAID SUBMIT EXPECTED')},upload:async()=>{calls.push(['upload']);throw Error('NO UPLOAD EXPECTED')}}
const service=new JobService({directory:temp,key:'FAKE_LOCAL_V0212',enabled:true,client})
const p=service.store.newProject('0.2.12隔离测试'),png=fs.readFileSync(path.join(root,'tests/fixtures/reference.png'))
const imageA=service.store.addAsset(p.id,png,{label:'立绘A'}),imageB=service.store.addAsset(p.id,png,{label:'立绘B'})
service.store.updateProject(p.id,{revision:0,draft:{selectedAsset:imageA.id}})
const netJob=service.prepare(p.id,{kind:'image-to-model',role:'whole',label:'整体网络失败',params:{input_asset:imageA.id,model:'v3.1-20260211',face_limit:50000,texture:true,pbr:true}});Object.assign(service.store.job(p.id,netJob.id),{status:'failed',errorCode:'UPLOAD_NETWORK_ERROR',errorPhase:'before_create',errorDetail:'连接被重置',error:'参考图上传失败（连接被重置），已自动重试 3 次；尚未发起收费生成，可直接重试'});service.store.save()
const handler=createHandler({service}),router=hostRouter(handler)
const allowed=new Map([['/scripts/preview.html',['scripts/preview.html','text/html']],['/lib/client-v0.3.6.js',['lib/client-v0.3.6.js','text/javascript']],['/node_modules/react/umd/react.development.js',['node_modules/react/umd/react.development.js','text/javascript']],['/node_modules/react-dom/umd/react-dom.development.js',['node_modules/react-dom/umd/react-dom.development.js','text/javascript']]])
const server=http.createServer((req,res)=>{const route=router.match(req.url);if(route)return route.handler(req,res);const file=allowed.get(new URL(req.url,'http://localhost').pathname);if(!file){res.statusCode=404;return res.end()}res.setHeader('content-type',file[1]);res.end(fs.readFileSync(path.join(root,file[0])))})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const base=`http://127.0.0.1:${server.address().port}`,passed=[],failures=[],errors=[],external=[]
let browser
const check=(name,ok)=>{(ok?passed:failures).push(name);console.log(`${ok?'PASS':'FAIL'} ${name}`)}
const assets=()=>service.store.snapshot(p.id).assets
async function drag(page,box,pts,modifier){
  if(modifier)await page.keyboard.down(modifier)
  const at=([x,y])=>[box.x+box.width*x,box.y+box.height*y]
  await page.mouse.move(...at(pts[0]));await page.mouse.down()
  for(const pt of pts.slice(1))await page.mouse.move(...at(pt),{steps:4})
  await page.mouse.up();if(modifier)await page.keyboard.up(modifier)
}
try {
  browser=await chromium.launch({...(process.env.TRIPO_TEST_BROWSER?{executablePath:process.env.TRIPO_TEST_BROWSER}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']})
  const page=await browser.newPage({viewport:{width:1380,height:1000}})
  await page.addInitScript(()=>{try{const k='tripo-studio-layout-v1',v=JSON.parse(localStorage.getItem(k)||'{}');if(v.lib===undefined)localStorage.setItem(k,JSON.stringify({...v,lib:true}))}catch{}}) // 0.3.2: library defaults to a collapsed rail; these checks need it open
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',route=>{const u=route.request().url();if(/^https?:/.test(u)&&!u.startsWith(base+'/')){external.push(u);return route.abort()}return route.continue()})
  await page.goto(base+'/scripts/preview.html');await expect(page.getByRole('heading',{name:'资产库'})).toBeVisible()
  await expect(page.locator('.tw-header')).toContainText('0.3.6')

  // REQ-038 item 1: picture click selects; only delete remains as a text command; hover-only zoom.
  const tileB=page.locator('.tw-image-grid .tw-image-tile').filter({hasText:'立绘B'})
  check('reference tile keeps only the delete command',await tileB.locator('.tw-image-commands button').count()===1&&await page.getByRole('button',{name:/^(选择此图|已选此图|放大)$/}).count()===0)
  const zoomB=tileB.getByRole('button',{name:'放大图片：立绘B'})
  check('zoom control is hidden until hover',await zoomB.evaluate(el=>getComputedStyle(el).opacity)==='0')
  await tileB.locator('.tw-pick-area').hover();await expect.poll(()=>zoomB.evaluate(el=>getComputedStyle(el).opacity)).toBe('1')
  const zb=await zoomB.boundingBox(),ib=await tileB.locator('.tw-pick-area img').boundingBox()
  check('hover zoom control is small and centered over the image',zb.width<=40&&Math.abs(zb.x+zb.width/2-(ib.x+ib.width/2))<3&&zb.y>ib.y&&zb.y+zb.height<ib.y+ib.height)
  await zoomB.click();await expect(page.getByRole('dialog',{name:'放大图片：立绘B'})).toBeVisible();await page.keyboard.press('Escape')
  check('zoom does not change the selected image',await tileB.getByRole('button',{name:'选择图片：立绘B'}).getAttribute('aria-pressed')==='false')
  await tileB.locator('.tw-pick-area').click({position:{x:12,y:12}})
  await expect(tileB.getByRole('button',{name:'已选择图片：立绘B'})).toHaveAttribute('aria-pressed','true')
  check('clicking elsewhere on the picture selects it',true)
  // REQ-039 item 2
  // 0.3.3 REQ-069: the image-to-image panel now lives in the 图生图 tab.
  await page.getByRole('tab',{name:/图生图/}).click()
  check('redundant prompt-edit button removed; image-to-image panel remains',await page.getByRole('button',{name:/按提示词编辑选中图/}).count()===0&&await page.getByRole('region',{name:'图生图改写与三视图'}).count()===1)
  await page.getByRole('tab',{name:/文生图/}).click()
  // REQ-044 item 7: rename at top-right, Esc cancels, Enter saves, file hash unchanged.
  const renameB=tileB.getByRole('button',{name:'重命名图片：立绘B'}),rb=await renameB.boundingBox(),cb=await tileB.locator('.tw-image-card').boundingBox()
  check('rename control sits at the image top-right',rb.x+rb.width>cb.x+cb.width-40&&rb.y<cb.y+40)
  await renameB.click();await page.getByLabel('新名称：立绘B').fill('不会保存');await page.keyboard.press('Escape')
  await expect(renameB).toBeFocused();check('rename Esc cancels and restores focus',service.store.state.assets[imageB.id].label==='立绘B')
  const hash=service.store.state.assets[imageB.id].hash
  await renameB.click();await page.getByLabel('新名称：立绘B').fill('角色正面');await page.keyboard.press('Enter')
  await expect(page.locator('.tw-image-grid .tw-image-tile').filter({hasText:'角色正面'})).toHaveCount(1)
  check('rename saves local label only',service.store.state.assets[imageB.id].label==='角色正面'&&service.store.state.assets[imageB.id].hash===hash)

  // REQ-040 item 3: editable split prompt with preset and reset.
  await page.locator('.tw-steps button').nth(1).click();await page.getByLabel('拆图方式').selectOption('sheet')
  const splitPrompt=page.getByLabel('拆件提示词',{exact:true}),preset=await splitPrompt.inputValue()
  check('split prompt is an editable textarea prefilled with one preset',preset.length>20&&await page.getByRole('button',{name:'恢复预设'}).isDisabled())
  await splitPrompt.fill('只拆出头发和外套，保持白底，其他全部忽略')
  await expect(page.getByRole('button',{name:'恢复预设'})).toBeEnabled()
  await page.getByRole('button',{name:'生成整张拆件图 · 先确认'}).click()
  const modal=page.getByRole('dialog',{name:'收费任务确认'});await expect(modal).toBeVisible()
  const params=JSON.parse(await modal.locator('pre').innerText())
  check('approval uses the edited split prompt, no paid call',params.prompt.includes('只拆出头发和外套')&&!params.prompt.includes(preset.slice(0,30))&&calls.length===0)
  await modal.getByRole('button',{name:'取消并丢弃草稿'}).click();await expect(modal).toHaveCount(0)
  await splitPrompt.fill('');await expect(splitPrompt).toHaveValue('');check('clearing the textarea does not snap back to the preset while typing',true)
  await splitPrompt.fill('自定义持久化');await page.locator('.tw-steps button').nth(0).click();await page.getByRole('button',{name:'保存提示词'}).click();await expect(page.getByRole('status')).toBeVisible();await page.reload();await page.locator('.tw-steps button').nth(1).click();await page.getByLabel('拆图方式').selectOption('sheet')
  await expect(splitPrompt).toHaveValue('自定义持久化');check('custom split prompt persists in the project draft',service.store.snapshot(p.id).draft.splitSheetPrompt==='自定义持久化')
  await page.getByRole('button',{name:'恢复预设'}).click();await expect(splitPrompt).toHaveValue(preset);check('reset restores the preset text',true)

  // REQ-041 item 4 (0.3.0 location): the always-visible library is the crop-source picker.
  const strip=page.getByLabel('资产库')
  check('library lists all existing image assets as crop sources',await strip.locator('.tw-image-tile').count()===2)
  await strip.getByRole('button',{name:'选择图片：立绘A'}).click()
  await expect(page.getByLabel('裁剪画布',{exact:true}).locator('img')).toHaveAttribute('alt','立绘A');check('clicking a strip image switches the crop source',true)

  // REQ-042/043 items 5-6: zoomed editor + Photoshop-like lasso add/subtract.
  await page.getByRole('button',{name:'⤢ 放大编辑'}).click()
  const zoom=page.getByRole('dialog',{name:'放大裁剪：立绘A'});await expect(zoom).toBeVisible()
  const inline=await page.getByLabel('裁剪画布',{exact:true}).boundingBox()
  await zoom.getByLabel('裁剪放大倍数').fill('2')
  const canvas=zoom.getByLabel('放大裁剪画布');const big=await canvas.boundingBox()
  check('zoom editor enlarges the crop canvas',big.width>inline.width*1.4)
  await zoom.getByRole('button',{name:'手动套索框选'}).click()
  await canvas.scrollIntoViewIfNeeded();let box=await canvas.boundingBox()
  const vp=await zoom.locator('.tw-crop-zoom-viewport').boundingBox()
  // keep strokes inside the visible part of the scrolled viewport
  const vis={x:Math.max(box.x,vp.x),y:Math.max(box.y,vp.y)};vis.width=Math.min(box.x+box.width,vp.x+vp.width)-vis.x;vis.height=Math.min(box.y+box.height,vp.y+vp.height)-vis.y
  await drag(page,vis,[[.1,.1],[.4,.1],[.4,.4],[.1,.4]])
  await expect(zoom).toContainText('套索 1 段：加')
  await drag(page,vis,[[.5,.5],[.8,.5],[.8,.8],[.5,.8]],'Shift')
  await expect(zoom).toContainText('套索 2 段：加 / 加');check('Shift+drag adds a second lasso region in the zoomed editor',true)
  await drag(page,vis,[[.2,.2],[.3,.2],[.3,.3]],'Alt')
  await expect(zoom).toContainText('套索 3 段：加 / 加 / 减');check('Alt+drag subtracts from the selection',true)
  await drag(page,vis,[[.6,.1],[.9,.1],[.9,.3]])
  await expect(zoom).toContainText('套索 1 段：加');check('plain drag replaces the selection',true)
  await drag(page,vis,[[.5,.5],[.8,.5],[.8,.8],[.5,.8]],'Shift')
  await page.screenshot({path:path.join(evidence,'v0212-zoom-lasso.png'),fullPage:false})
  await page.keyboard.press('Escape');await expect(zoom).toHaveCount(0)
  await expect(page.getByRole('button',{name:'⤢ 放大编辑'})).toBeFocused();check('Esc closes the zoom editor, keeps lasso and restores focus',await page.getByText('套索 2 段：加 / 加').count()>0)
  await page.getByLabel('部件名称').fill('头发').catch(()=>{})
  const before=assets().length
  await page.getByRole('button',{name:'保存当前裁剪',exact:true}).click();await expect(page.getByRole('status')).toContainText('裁剪已保存')
  const crop=assets().find(a=>a.sourceAssetId===imageA.id)
  check('multi-region lasso crop saves one local square image linked to its source',assets().length===before+1&&crop&&crop.width===crop.height&&calls.length===0)
  // REQ-045 item 8: stays on original, can go back from crop.
  check('after saving the crop the canvas stays on the original',await page.getByLabel('裁剪画布',{exact:true}).locator('img').getAttribute('alt')==='立绘A')
  await strip.getByRole('button',{name:`选择图片：${crop.label}`}).click()
  await expect(page.locator('.tw-origin-bar')).toBeVisible()
  await page.getByRole('button',{name:'↩ 换回原图「立绘A」'}).click()
  await expect(page.getByLabel('裁剪画布',{exact:true}).locator('img')).toHaveAttribute('alt','立绘A');check('crop view offers one-click switch back to the original',true)
  await page.screenshot({path:path.join(evidence,'v0212-crop-strip.png'),fullPage:true})

  // REQ-046 item 11 + REQ-047 item 10 (0.3.3 REQ-067: now the split-sheet picker): thumbnail picker and 36 cap.
  await page.locator('.tw-steps button').nth(2).click()
  const picker=page.getByLabel('整张拆件图缩略图选择')
  check('split-sheet picker shows image thumbnails',await picker.locator('img').count()===3)
  await picker.getByRole('button',{name:'设为整张拆件图：角色正面'}).click({position:{x:10,y:10}})
  await expect(page.getByLabel('整张拆件图',{exact:true})).toHaveValue(imageB.id);check('thumbnail click sets the split sheet',true)
  check('batch limit text is 36',await page.getByText(/最多36个/).count()>0)
  await page.screenshot({path:path.join(evidence,'v0212-sheet-picker.png'),fullPage:true})
  await page.locator('.tw-steps button').nth(3).click();const netCard=page.locator(`[data-job-id="${netJob.id}"]`)
  await expect(netCard.locator('[data-error-phase=before_create]')).toContainText('尚未发起收费生成');await expect(netCard).toContainText('原因：连接被重置')
  check('upload-phase network failure shows phase, cause and that nothing was charged',true)
  await page.setViewportSize({width:390,height:844})
  check('390px layout has no horizontal overflow',await page.evaluate(()=>{const el=document.querySelector('.tw-root');return el.scrollWidth<=el.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1}))
  check('no supplier calls, page errors or external requests',calls.length===0&&errors.length===0&&external.length===0)
} catch(e){failures.push(e.message);console.error(e);const pg=browser?.contexts()[0]?.pages()[0];if(pg)await pg.screenshot({path:path.join(evidence,'v0212-ui-failure.png'),fullPage:true}).catch(()=>{})}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true})}
fs.writeFileSync(path.join(evidence,'v0212-ui-results.json'),JSON.stringify({passed,failures,errors,external,calls,realProviderCalls:0},null,2)+'\n')
console.log(JSON.stringify({passed:passed.length,failed:failures.length}));if(failures.length||errors.length||external.length)process.exitCode=1
