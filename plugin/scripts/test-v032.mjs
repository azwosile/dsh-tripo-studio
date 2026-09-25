// 0.3.2 (REQ-062～066): canvas-first vertical flow — collapsible library rail/drawer, parameters below the canvas,
// sticky go-bar, tasks at the bottom with a jump button, 72vh canvas image, narrow vertical flow.
// Real local HTTP, isolated data and a fake supplier that must never be called.
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
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v032-ui-')),calls=[]
const png=fs.readFileSync(path.join(root,'tests/fixtures/reference.png'))
/** Minimal valid binary glTF 2.0 containing one triangle. */
function triangleGlb(){
  const bin=Buffer.from(new Float32Array([-1,0,0, 1,0,0, 0,2,0]).buffer)
  const json=Buffer.from(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,0],max:[1,2,0]}],bufferViews:[{buffer:0,byteLength:36}],buffers:[{byteLength:36}]}))
  const jsonPad=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)])
  const total=12+8+jsonPad.length+8+bin.length,out=Buffer.alloc(total)
  out.write('glTF',0,'ascii');out.writeUInt32LE(2,4);out.writeUInt32LE(total,8)
  out.writeUInt32LE(jsonPad.length,12);out.write('JSON',16,'ascii');jsonPad.copy(out,20)
  const o=20+jsonPad.length;out.writeUInt32LE(bin.length,o);out.write('BIN\0',o+4,'binary');bin.copy(out,o+8)
  return out
}
const glb=triangleGlb()
const client={task:async id=>{calls.push(['task',id]);throw Error('NO TASK QUERY EXPECTED')},create:async()=>{calls.push(['create']);throw Error('NO PAID SUBMIT EXPECTED')},upload:async()=>{calls.push(['upload']);throw Error('NO UPLOAD EXPECTED')}}
const service=new JobService({directory:temp,key:'FAKE_LOCAL_V031',enabled:true,client}),s=service.store
const p=s.newProject('0.3.2隔离测试')
const A=s.addAsset(p.id,png,{label:'立绘A'})
const crop=s.addAsset(p.id,png,{label:'头发裁剪',sourceAssetId:A.id,priority:'high'})
s.updateProject(p.id,{revision:0,draft:{selectedAsset:A.id}})
const finish=(job,assetIds,extra={})=>Object.assign(s.job(p.id,job.id),{status:'success',taskId:`task_fake_${job.id.slice(-6)}`,downloadStatus:'downloaded',assetIds,tracking:false},extra)
// Direct model from the uncropped original (REQ-059) and a part model from a crop.
const directJob=service.prepare(p.id,{kind:'image-to-model',role:'whole',label:'整体直出',params:{input_asset:A.id,model:'v3.1-20260211',face_limit:50000,texture:true,pbr:true}})
const direct=s.addAsset(p.id,glb,{label:'整体直出模型',kind:'model',format:'glb',sourceJobId:directJob.id});finish(directJob,[direct.id])
const partJob=service.prepare(p.id,{kind:'image-to-model',role:'part',label:'头发部件',params:{input_asset:crop.id,model:'v3.1-20260211',face_limit:50000,texture:true,pbr:true}})
const part=s.addAsset(p.id,glb,{label:'头发部件模型',kind:'model',format:'glb',sourceJobId:partJob.id});finish(partJob,[part.id])
// A successful cloud task whose local save failed: reference slot shows a retry hint, never a fake preview.
const failedJob=service.prepare(p.id,{kind:'image-to-model',role:'part',label:'下载失败部件',params:{input_asset:crop.id,model:'v3.1-20260211',face_limit:50000,texture:true,pbr:true}})
finish(failedJob,[],{downloadStatus:'download_failed',downloadError:'模拟：本机保存失败'})
s.save()
const handler=createHandler({service}),router=hostRouter(handler)
const allowed=new Map([['/scripts/preview.html',['scripts/preview.html','text/html']],['/lib/client-v0.3.2.js',['lib/client-v0.3.2.js','text/javascript']],['/node_modules/react/umd/react.development.js',['node_modules/react/umd/react.development.js','text/javascript']],['/node_modules/react-dom/umd/react-dom.development.js',['node_modules/react-dom/umd/react-dom.development.js','text/javascript']]])
const server=http.createServer((req,res)=>{const route=router.match(req.url);if(route)return route.handler(req,res);const file=allowed.get(new URL(req.url,'http://localhost').pathname);if(!file){res.statusCode=404;return res.end()}res.setHeader('content-type',file[1]);res.end(fs.readFileSync(path.join(root,file[0])))})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const base=`http://127.0.0.1:${server.address().port}`,passed=[],failures=[],errors=[],external=[]
let browser
const check=(name,ok)=>{(ok?passed:failures).push(name);console.log(`${ok?'PASS':'FAIL'} ${name}`)}
const root_=()=>page.locator('.tw-root')
let page
try {
  browser=await chromium.launch({...(process.env.TRIPO_TEST_BROWSER?{executablePath:process.env.TRIPO_TEST_BROWSER}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']})
  page=await browser.newPage({viewport:{width:1440,height:1000}})
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',route=>{const u=route.request().url();if(/^https?:/.test(u)&&!u.startsWith(base+'/')){external.push(u);return route.abort()}return route.continue()})
  await page.goto(base+'/scripts/preview.html');await expect(page.locator('.tw-steps')).toBeVisible()
  const upgrade=page.locator('.tw-upgrade');if(await upgrade.count())await upgrade.getByRole('button',{name:'知道了'}).click()
  const rail=page.getByRole('navigation',{name:'资产库快捷栏'}),library=page.getByRole('complementary',{name:'资产库'})
  const canvas=page.getByRole('main',{name:'画布'}),insp=page.getByRole('complementary',{name:'参数栏'}),dock=page.getByRole('region',{name:'任务坞'})
  // Q2: library collapsed to an icon rail by default; canvas takes the width.
  await expect(rail).toBeVisible()
  check('library starts collapsed to an icon rail (no library panel)',await library.count()===0&&(await rail.boundingBox()).width<=48)
  const rootBox=await root_().boundingBox(),cBox=await canvas.boundingBox()
  check('canvas uses most of the panel width when the library is collapsed',cBox.width>=rootBox.width*0.85)
  // Q1/Q5: canvas → parameters → tasks in one vertical flow.
  const iBox=await insp.boundingBox(),dBox=await dock.boundingBox()
  check('parameters sit below the canvas and tasks at the very bottom',iBox.y>=cBox.y+cBox.height-1&&dBox.y>=iBox.y+iBox.height-1&&Math.abs(iBox.x-cBox.x)<2)
  check('parameter area is laid out in two columns on a wide panel',await insp.locator('.tw-insp-body').evaluate(el=>getComputedStyle(el).columnCount)==='2')
  check('no inner scroll boxes: the whole page scrolls',await page.evaluate(()=>['.tw-canvas','.tw-insp-body','.tw-dock-body'].every(q=>{const el=document.querySelector(q);return !el||!['auto','scroll'].includes(getComputedStyle(el).overflowY)})))
  // Q6: the selected image may use up to 72vh.
  const img=canvas.locator('.tw-hero-image img');await expect(img).toBeVisible()
  const h=(await img.boundingBox()).height
  check('canvas image is sized to 72vh',Math.abs(h-Math.min(720,960))<=2)
  // Q4: sticky go-bar while the action row is below the visible area.
  const gobar=page.getByRole('region',{name:'吸底快捷操作'})
  await expect(gobar).toBeVisible()
  check('go-bar shows a prompt summary and its own generate button',await gobar.innerText().then(t=>t.includes('提示词')||t.includes('还没有提示词'))&&await gobar.getByRole('button',{name:'吸底快捷：生成一张候选（先审阅确认）'}).count()===1)
  check('go-bar button does not collide with the real button name',await page.getByRole('button',{name:'生成 1 张 · 先确认'}).count()===1)
  await gobar.getByRole('button',{name:'吸底快捷：生成一张候选（先审阅确认）'}).click()
  const modal=page.getByRole('dialog',{name:'收费任务确认'});await expect(modal).toBeVisible()
  check('go-bar generate opens the normal approval dialog; nothing is sent',calls.length===0)
  await modal.getByRole('button',{name:'取消并丢弃草稿'}).click();await expect(modal).toHaveCount(0)
  await page.screenshot({path:path.join(evidence,'v032-flow-top.png'),fullPage:false})
  await gobar.getByRole('button',{name:'↓ 参数与操作'}).click()
  await expect(gobar).toHaveCount(0,{timeout:5000})
  check('jumping to the parameters hides the go-bar once the action row is visible',await insp.locator('.tw-insp-foot').isVisible())
  // Q5: task jump button in the stage bar.
  await page.locator('.tw-task-jump').click()
  await expect(dock).toBeInViewport()
  check('task button scrolls to the task section',await page.locator('.tw-task-jump').innerText().then(t=>t.includes('进行中')))
  await page.screenshot({path:path.join(evidence,'v032-flow-tasks.png'),fullPage:false})
  // Q2/Q3: rail → open (push on wide panels), remembered; collapse again.
  await page.evaluate(()=>{const r=document.querySelector('.tw-root');r.scrollTo?.(0,0);window.scrollTo(0,0)})
  await rail.getByRole('button',{name:/打开资产库并筛选：3D/}).click()
  await expect(library).toBeVisible();await expect(library).toHaveAttribute('data-mode','push')
  const lBox=await library.boundingBox(),c2=await canvas.boundingBox()
  check('open library pushes the canvas on the left side',lBox.x<c2.x&&lBox.x+lBox.width<=c2.x+1&&await rail.count()===0)
  check('rail filter opens the library with that filter',await library.getByRole('group',{name:'资产筛选'}).getByRole('button',{name:/^3D/}).getAttribute('aria-pressed')==='true')
  await page.reload();await expect(library).toBeVisible()
  check('open/closed library state is remembered locally',JSON.parse(await page.evaluate(()=>localStorage.getItem('tripo-studio-layout-v1'))).lib===true)
  await page.screenshot({path:path.join(evidence,'v032-library-open.png'),fullPage:false})
  await library.getByRole('button',{name:'收起资产库'}).click();await expect(library).toHaveCount(0);await expect(rail).toBeVisible()
  await rail.getByRole('button',{name:'打开资产库并搜索'}).click();await expect(library.getByLabel('搜索资产名称')).toBeFocused()
  check('rail search opens the library with the search box focused',true)
  await page.locator('.tw-lib-toggle').click();await expect(library).toHaveCount(0)
  check('stage-bar toggle collapses the library',JSON.parse(await page.evaluate(()=>localStorage.getItem('tripo-studio-layout-v1'))).lib===false)
  // Medium panel (< push width): library opens as a drawer over the canvas, Esc closes.
  await page.setViewportSize({width:1100,height:900});await page.waitForTimeout(200)
  await expect(rail).toBeVisible();await page.locator('.tw-lib-toggle').click()
  await expect(library).toHaveAttribute('data-mode','overlay')
  await page.screenshot({path:path.join(evidence,'v032-drawer-1100.png'),fullPage:false})
  await page.keyboard.press('Escape');await expect(library).toHaveCount(0)
  check('medium panel opens the library as a drawer and Esc closes it',true)
  await page.locator('.tw-lib-toggle').click();await library.getByRole('group',{name:'资产筛选'}).getByRole('button',{name:/^全部/}).click();await library.getByRole('button',{name:'选择图片：头发裁剪',exact:true}).click({position:{x:10,y:10}});await expect(library).toHaveCount(0)
  check('picking from the drawer closes it and selects the image',await canvas.locator('.tw-hero-image img').getAttribute('alt')==='头发裁剪')
  // Q7: narrow slot keeps the same vertical flow (no pane switcher, no rail).
  await page.setViewportSize({width:760,height:900});await page.waitForTimeout(200)
  check('narrow slot: no pane switcher, no rail, all sections in order',await page.getByRole('navigation',{name:'窄屏区域切换'}).count()===0&&await rail.count()===0&&(await insp.boundingBox()).y>=(await canvas.boundingBox()).y&&(await dock.boundingBox()).y>=(await insp.boundingBox()).y)
  await page.screenshot({path:path.join(evidence,'v032-narrow-760.png'),fullPage:true})
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250)
  check('390px: no horizontal overflow',await page.evaluate(()=>{const el=document.querySelector('.tw-root');return el.scrollWidth<=el.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1}))
  await page.evaluate(()=>{const r=document.querySelector('.tw-root');r.scrollTo?.(0,0);window.scrollTo(0,0)})
  await page.waitForTimeout(150)
  if(await gobar.count()){const g=await gobar.boundingBox();check('390px go-bar stays inside the viewport',g.x>=0&&g.x+g.width<=390+1)}else check('390px go-bar stays inside the viewport',true)
  await page.screenshot({path:path.join(evidence,'v032-mobile-390.png'),fullPage:false})
  check('no supplier calls, page errors or external requests',calls.length===0&&errors.length===0&&external.length===0)
} catch(e){failures.push(e.message);console.error(e);if(page)await page.screenshot({path:path.join(evidence,'v032-ui-failure.png'),fullPage:true}).catch(()=>{})}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true})}
fs.writeFileSync(path.join(evidence,'v032-ui-results.json'),JSON.stringify({passed,failures,errors,external,calls,realProviderCalls:0},null,2)+'\n')
console.log(JSON.stringify({passed:passed.length,failed:failures.length}));if(failures.length||errors.length||external.length)process.exitCode=1
