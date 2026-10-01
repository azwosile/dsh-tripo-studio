// 0.3.0 studio layout + relation view + upgrade notice: real local HTTP, isolated data, fake supplier that must never be called.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {fileURLToPath} from 'node:url'
import {chromium,expect} from '@playwright/test'
import {JobService} from '../server/service.js'
import {Store} from '../server/store.js'
import {createHandler} from '../server/routes.js'
import {hostRouter} from '../tests/fixtures/host-router.mjs'
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const evidence=path.join(root,'..','validation','v0.3.5');fs.mkdirSync(evidence,{recursive:true})
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v030-ui-')),calls=[]
const png=fs.readFileSync(path.join(root,'tests/fixtures/reference.png'))
// 1) Build a 0.2.12-era data folder, then let 0.3.0 open it (upgrade path).
const old=new Store(temp,{appVersion:'0.2.12'}),p=old.newProject('0.3.0隔离测试')
const A=old.addAsset(p.id,png,{label:'立绘A'}),B=old.addAsset(p.id,png,{label:'立绘B'})
const crop=old.addAsset(p.id,png,{label:'头发裁剪',sourceAssetId:A.id,priority:'high'})
old.updateProject(p.id,{revision:0,draft:{selectedAsset:A.id}})
old.save();const rawBefore=fs.readFileSync(path.join(temp,'state.json'))
const client={task:async id=>{calls.push(['task',id]);throw Error('NO TASK QUERY EXPECTED')},create:async()=>{calls.push(['create']);throw Error('NO PAID SUBMIT EXPECTED')},upload:async()=>{calls.push(['upload']);throw Error('NO UPLOAD EXPECTED')}}
const service=new JobService({directory:temp,key:'FAKE_LOCAL_V030',enabled:true,client})
const s=service.store
// AI extraction (image-to-image output) and a finished part model — records only, no supplier traffic.
const aiJob=service.prepare(p.id,{kind:'image-to-image',label:'AI外套',params:{model:'chat_image_2.5_sunburst',prompt:'extract',quality:'low',size:'1024x1536',input_asset:A.id}})
const coat=s.addAsset(p.id,png,{label:'AI外套',sourceJobId:aiJob.id});Object.assign(s.job(p.id,aiJob.id),{status:'success',assetIds:[coat.id]})
const glb=Buffer.alloc(20);glb.write('glTF',0,'ascii');glb.writeUInt32LE(2,4);glb.writeUInt32LE(20,8)
const mJob=service.prepare(p.id,{kind:'image-to-model',role:'part',label:'头发模型',params:{input_asset:crop.id,model:'v3.1-20260211',face_limit:50000,texture:true,pbr:true}})
const model=s.addAsset(p.id,glb,{label:'头发模型',kind:'model',format:'glb',sourceJobId:mJob.id});Object.assign(s.job(p.id,mJob.id),{status:'success',taskId:'task_fake_v030',downloadStatus:'downloaded',assetIds:[model.id],tracking:false})
s.save()
const handler=createHandler({service}),router=hostRouter(handler)
const allowed=new Map([['/scripts/preview.html',['scripts/preview.html','text/html']],['/lib/client-v0.3.5.js',['lib/client-v0.3.5.js','text/javascript']],['/node_modules/react/umd/react.development.js',['node_modules/react/umd/react.development.js','text/javascript']],['/node_modules/react-dom/umd/react-dom.development.js',['node_modules/react-dom/umd/react-dom.development.js','text/javascript']]])
const server=http.createServer((req,res)=>{const route=router.match(req.url);if(route)return route.handler(req,res);const file=allowed.get(new URL(req.url,'http://localhost').pathname);if(!file){res.statusCode=404;return res.end()}res.setHeader('content-type',file[1]);res.end(fs.readFileSync(path.join(root,file[0])))})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const base=`http://127.0.0.1:${server.address().port}`,passed=[],failures=[],errors=[],external=[]
let browser
const check=(name,ok)=>{(ok?passed:failures).push(name);console.log(`${ok?'PASS':'FAIL'} ${name}`)}
try {
  const backups=fs.readdirSync(path.join(temp,'backups'))
  check('upgrade keeps a byte-identical 0.2.12 index backup before writing',backups.length===1&&fs.readFileSync(path.join(temp,'backups',backups[0])).equals(rawBefore)&&s.state.appVersion==='0.3.5')
  check('upgrade keeps every project, asset and file',Object.keys(s.state.projects).length===1&&[A,B,crop].every(a=>s.state.assets[a.id]&&fs.existsSync(path.join(temp,'files',a.file))))
  browser=await chromium.launch({...(process.env.TRIPO_TEST_BROWSER?{executablePath:process.env.TRIPO_TEST_BROWSER}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']})
  const page=await browser.newPage({viewport:{width:1440,height:1000}})
  await page.addInitScript(()=>{try{const k='tripo-studio-layout-v1',v=JSON.parse(localStorage.getItem(k)||'{}');if(v.lib===undefined)localStorage.setItem(k,JSON.stringify({...v,lib:true}))}catch{}}) // 0.3.2: library defaults to a collapsed rail; these checks need it open
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',route=>{const u=route.request().url();if(/^https?:/.test(u)&&!u.startsWith(base+'/')){external.push(u);return route.abort()}return route.continue()})
  await page.goto(base+'/scripts/preview.html');await expect(page.getByRole('heading',{name:'资产库'})).toBeVisible()
  const notice=page.locator('.tw-upgrade');await expect(notice).toContainText('0.3.5');await expect(notice).toContainText(backups[0])
  check('one-time upgrade notice names the backup file',true)
  await notice.getByRole('button',{name:'知道了'}).click();await expect(notice).toHaveCount(0)
  await page.reload();await expect(page.getByRole('heading',{name:'资产库'})).toBeVisible();check('dismissed upgrade notice stays dismissed after reload',await notice.count()===0)
  // Layout regions (REQ-048)
  for(const name of ['资产库','画布','参数栏','任务坞'])await expect(page.getByRole(name==='画布'?'main':name==='任务坞'?'region':'complementary',{name})).toBeVisible()
  const lib=await page.getByRole('complementary',{name:'资产库'}).boundingBox(),canvas=await page.getByRole('main',{name:'画布'}).boundingBox(),insp=await page.getByRole('complementary',{name:'参数栏'}).boundingBox(),dock=await page.getByRole('region',{name:'任务坞'}).boundingBox()
  check('0.3.2 flow: library left of the canvas, parameters below the canvas, tasks at the bottom',lib.x+lib.width<=canvas.x+1&&insp.y>=canvas.y+canvas.height-1&&dock.y>=insp.y+insp.height-1)
  check('five studio tabs incl. source → part',(await page.locator('.tw-steps button').allTextContents()).join('|').includes('来源 → 部件')&&await page.locator('.tw-steps button').count()===5)
  check('header is a single compact row',(await page.locator('.tw-appbar').boundingBox()).height<70)
  // Library filter (REQ-049)
  const library=page.getByRole('complementary',{name:'资产库'})
  await library.getByRole('group',{name:'资产筛选'}).getByRole('button',{name:/^部件/}).click()
  await expect(library.locator('.tw-image-tile')).toHaveCount(2)
  check('parts filter shows local crops and AI extractions',(await library.locator('.tw-pick-caption strong').allTextContents()).sort().join(',')==='AI外套,头发裁剪')
  await page.reload();await expect(library.getByRole('group',{name:'资产筛选'}).getByRole('button',{name:/^部件/})).toHaveAttribute('aria-pressed','true');check('library filter survives reload (UI preference only)',true)
  await library.getByRole('group',{name:'资产筛选'}).getByRole('button',{name:/^3D/}).click();await expect(library.locator('.tw-lib-model')).toHaveCount(1);check('3D filter lists downloaded models with preview/download',await library.getByRole('link',{name:'下载模型：头发模型'}).count()===1)
  await library.getByRole('group',{name:'资产筛选'}).getByRole('button',{name:/^全部/}).click()
  await library.getByPlaceholder('搜索名称…').fill('立绘');await expect(library.locator('.tw-image-tile')).toHaveCount(2);await library.getByPlaceholder('搜索名称…').fill('')
  check('library search filters by name',true)
  // Relation page (REQ-051)
  await page.locator('.tw-steps button').nth(4).click()
  const rel=page.getByRole('region',{name:'来源与部件对应关系'});await expect(rel).toBeVisible()
  const groupA=rel.locator(`[data-root-id="${A.id}"]`)
  await expect(groupA.locator('.tw-rel-row')).toHaveCount(2)
  check('source A groups its crop and AI extraction',(await groupA.locator('.tw-rel-meta strong').allTextContents()).sort().join(',')==='AI外套,头发裁剪')
  check('crop row shows its finished 3D model with preview',await groupA.locator(`[data-asset-id="${crop.id}"]`).getByText(/部件 · 云端成功/).count()===1&&await groupA.getByRole('button',{name:'3D 预览：头发模型'}).count()===1)
  check('source B shows as its own empty group',await rel.locator(`[data-root-id="${B.id}"]`).getByText('还没有从这张图裁出的部件').count()===1)
  await page.screenshot({path:path.join(evidence,'v030-relations.png'),fullPage:false})
  await groupA.getByRole('checkbox',{name:'加入建模：头发裁剪'}).check()
  await groupA.getByRole('button',{name:'设为整张拆件图：立绘A'}).click() // 0.3.3 REQ-072
  await expect(groupA.getByRole('button',{name:'设为整张拆件图：立绘A'})).toBeDisabled()
  await page.getByRole('button',{name:'去统一建模页审阅（1 个任务）'}).click()
  await expect(page.getByLabel('整张拆件图',{exact:true})).toHaveValue(A.id)
  await expect(page.getByRole('button',{name:'审阅建模 · 1 个任务'})).toBeEnabled()
  check('relation checkboxes and split sheet carry into the modeling page (no submit)',calls.length===0&&service.store.snapshot(p.id).jobs.filter(j=>j.status==='awaiting_approval').length===0)
  await page.screenshot({path:path.join(evidence,'v030-model.png'),fullPage:false})
  // Crop from the relation page: origin strip only shows source + its crops.
  await page.locator('.tw-steps button').nth(4).click();await groupA.getByRole('button',{name:'裁剪：立绘A'}).click()
  await expect(page.getByLabel('裁剪画布',{exact:true}).locator('img')).toHaveAttribute('alt','立绘A')
  const strip=page.getByLabel('原图与已裁部件');await expect(strip.locator('.tw-image-tile')).toHaveCount(2)
  check('crop origin strip shows the source and its crops only',true)
  await page.screenshot({path:path.join(evidence,'v030-crop.png'),fullPage:false})
  await strip.getByRole('button',{name:'切换裁剪来源：头发裁剪'}).click();await expect(page.locator('.tw-origin-bar')).toBeVisible()
  await page.getByRole('button',{name:'↩ 换回原图「立绘A」'}).click();await expect(page.getByLabel('裁剪画布',{exact:true}).locator('img')).toHaveAttribute('alt','立绘A')
  check('origin strip switches source and back',true)
  // Library click on the crop page sets the crop source.
  await library.getByRole('button',{name:'选择图片：立绘B',exact:true}).click({position:{x:10,y:10}});await expect(page.getByLabel('裁剪画布',{exact:true}).locator('img')).toHaveAttribute('alt','立绘B')
  check('library click on the crop page switches the crop source',true)
  // Task dock collapse persists (REQ-048)
  await page.locator('.tw-dock-toggle').click();await expect(page.locator('.tw-dock-body')).toHaveCount(0)
  await page.reload();await expect(page.getByRole('heading',{name:'资产库'})).toBeVisible();await expect(page.locator('.tw-dock-body')).toHaveCount(0)
  check('collapsed task dock is remembered',JSON.parse(await page.evaluate(()=>localStorage.getItem('tripo-studio-layout-v1'))).dock===false)
  await page.locator('.tw-dock-toggle').click();await expect(page.locator('.tw-dock-body .tw-job')).toHaveCount(2)
  check('dock lists tasks with counts',await page.locator('.tw-dock-head').innerText().then(t=>t.includes('完成 2')))
  await page.screenshot({path:path.join(evidence,'v030-desktop.png'),fullPage:false})
  // Dark theme screenshot
  await page.getByLabel('工作台主题').selectOption('dark');await page.locator('.tw-steps button').nth(0).click()
  await page.screenshot({path:path.join(evidence,'v030-desktop-dark.png'),fullPage:false});await page.getByLabel('工作台主题').selectOption('light')
  // Narrow DSH slot (0.3.2 REQ-062): same vertical flow, library as a drawer that closes after picking.
  await page.setViewportSize({width:760,height:900});await page.waitForTimeout(200)
  check('narrow slot has no pane switcher; canvas, parameters and tasks all rendered',await page.getByRole('navigation',{name:'窄屏区域切换'}).count()===0&&await page.getByRole('main',{name:'画布'}).isVisible()&&await page.getByRole('complementary',{name:'参数栏'}).isVisible()&&await page.getByRole('region',{name:'任务坞'}).isVisible())
  await expect(page.getByRole('complementary',{name:'资产库'})).toHaveCount(0)
  await page.locator('.tw-lib-toggle').click();await expect(library).toBeVisible();await expect(library).toHaveAttribute('data-mode','overlay')
  await library.getByRole('button',{name:'选择图片：立绘B',exact:true}).click({position:{x:10,y:10}});await expect(page.getByRole('complementary',{name:'资产库'})).toHaveCount(0)
  check('narrow drawer closes after picking an asset',true)
  await page.screenshot({path:path.join(evidence,'v030-narrow-760.png'),fullPage:true})
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200)
  check('390px layout has no horizontal overflow',await page.evaluate(()=>{const el=document.querySelector('.tw-root');return el.scrollWidth<=el.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1}))
  await page.screenshot({path:path.join(evidence,'v030-mobile-390.png'),fullPage:true})
  check('no supplier calls, page errors or external requests',calls.length===0&&errors.length===0&&external.length===0)
} catch(e){failures.push(e.message);console.error(e);const pg=browser?.contexts()[0]?.pages()[0];if(pg)await pg.screenshot({path:path.join(evidence,'v030-ui-failure.png'),fullPage:true}).catch(()=>{})}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true})}
fs.writeFileSync(path.join(evidence,'v030-ui-results.json'),JSON.stringify({passed,failures,errors,external,calls,realProviderCalls:0},null,2)+'\n')
console.log(JSON.stringify({passed:passed.length,failed:failures.length}));if(failures.length||errors.length||external.length)process.exitCode=1
