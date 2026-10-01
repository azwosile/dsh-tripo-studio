// 0.3.1 (REQ-056～061): multi-column task cards, 3D reference images, 3D library, direct-model relation row,
// glass part cards, hair preset and the demo-free 3D preview page. Real local HTTP, isolated data and a fake
// supplier that must never be called. The GLB fixtures are real one-triangle meshes so thumbnails can render.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {fileURLToPath} from 'node:url'
import {chromium,expect} from '@playwright/test'
import {JobService} from '../server/service.js'
import {createHandler} from '../server/routes.js'
import {hostRouter} from '../tests/fixtures/host-router.mjs'
import {partPrompt,HAIR_PROMPT,isHairPart} from '../shared/contracts.js'
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const evidence=path.join(root,'..','validation','v0.3.5');fs.mkdirSync(evidence,{recursive:true})
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v031-ui-')),calls=[]
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
const p=s.newProject('0.3.1隔离测试')
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
const allowed=new Map([['/scripts/preview.html',['scripts/preview.html','text/html']],['/lib/client-v0.3.5.js',['lib/client-v0.3.5.js','text/javascript']],['/node_modules/react/umd/react.development.js',['node_modules/react/umd/react.development.js','text/javascript']],['/node_modules/react-dom/umd/react-dom.development.js',['node_modules/react-dom/umd/react-dom.development.js','text/javascript']]])
const server=http.createServer((req,res)=>{const route=router.match(req.url);if(route)return route.handler(req,res);const file=allowed.get(new URL(req.url,'http://localhost').pathname);if(!file){res.statusCode=404;return res.end()}res.setHeader('content-type',file[1]);res.end(fs.readFileSync(path.join(root,file[0])))})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const base=`http://127.0.0.1:${server.address().port}`,passed=[],failures=[],errors=[],external=[]
let browser
const check=(name,ok)=>{(ok?passed:failures).push(name);console.log(`${ok?'PASS':'FAIL'} ${name}`)}
try {
  // REQ-061 hair preset (pure function; other part prompts unchanged).
  check('hair parts use the dedicated whole-hairstyle preset',isHairPart('头发')&&isHairPart('发型')&&isHairPart('Hair')&&partPrompt('头发')===HAIR_PROMPT&&HAIR_PROMPT.includes('发型'))
  check('non-hair parts keep the generic extraction prompt',!isHairPart('外套')&&partPrompt('外套').includes('「外套」')&&partPrompt('外套')!==HAIR_PROMPT)
  browser=await chromium.launch({...(process.env.TRIPO_TEST_BROWSER?{executablePath:process.env.TRIPO_TEST_BROWSER}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']})
  const page=await browser.newPage({viewport:{width:1440,height:1000}})
  await page.addInitScript(()=>{try{const k='tripo-studio-layout-v1',v=JSON.parse(localStorage.getItem(k)||'{}');if(v.lib===undefined)localStorage.setItem(k,JSON.stringify({...v,lib:true}))}catch{}}) // 0.3.2: library defaults to a collapsed rail; these checks need it open
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',route=>{const u=route.request().url();if(/^https?:/.test(u)&&!u.startsWith(base+'/')){external.push(u);return route.abort()}return route.continue()})
  await page.goto(base+'/scripts/preview.html');await expect(page.getByRole('heading',{name:'资产库'})).toBeVisible()
  const upgrade=page.locator('.tw-upgrade');if(await upgrade.count())await upgrade.getByRole('button',{name:'知道了'}).click()
  check('tab is renamed to 3D 预览 (no offline demo wording)',await page.getByRole('tab',{name:'3D 预览',exact:true}).count()===1&&await page.getByText('离线演示').count()===0)
  // REQ-058 library: no "recent assets"; a 3D section with thumbnails.
  const library=page.getByRole('complementary',{name:'资产库'})
  check('library no longer shows a recent-assets list',await page.getByText('最近资产').count()===0)
  await library.getByRole('group',{name:'资产筛选'}).getByRole('button',{name:/^3D/}).click();await expect(library.locator('.tw-lib-model')).toHaveCount(2)
  check('3D library tiles each carry a reference thumbnail, preview and download',await library.locator('.tw-lib-model .tw-model-thumb').count()===2&&await library.getByRole('button',{name:'3D 预览：整体直出模型'}).count()===1&&await library.getByRole('link',{name:'下载模型：头发部件模型'}).count()===1)
  await expect(library.locator('.tw-lib-model .tw-model-thumb[data-thumb=ready]')).toHaveCount(2,{timeout:20000})
  check('thumbnails are rendered locally from the downloaded GLB',await library.locator('.tw-lib-model .tw-model-thumb img').count()===2)
  await library.getByRole('group',{name:'资产筛选'}).getByRole('button',{name:/^全部/}).click()
  // REQ-056 task dock: several cards per row.
  const dock=page.getByRole('region',{name:'任务坞'});await expect(dock.locator('.tw-job')).toHaveCount(3)
  const boxes=await dock.locator('.tw-job').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width}}))
  check('task dock lays out at least two cards per row on a wide window',boxes.filter(b=>Math.abs(b.y-boxes[0].y)<2).length>=2&&boxes.every(b=>b.w>=280))
  // REQ-058 3D reference image on successful model tasks.
  const refDirect=dock.getByRole('group',{name:'3D 参考图：整体直出'})
  await refDirect.scrollIntoViewIfNeeded() // 0.3.2: tasks sit at the page bottom; thumbnails render when scrolled into view
  await expect(refDirect.locator('.tw-model-thumb[data-thumb=ready]')).toHaveCount(1,{timeout:20000})
  check('model task shows input image → 3D reference image',await refDirect.getByRole('button',{name:'放大建模输入图：立绘A'}).count()===1)
  check('failed local save shows a retry hint instead of a thumbnail',await dock.getByRole('group',{name:'3D 参考图：下载失败部件'}).getByText('下载失败 · 重试保存后显示').count()===1)
  await page.screenshot({path:path.join(evidence,'v031-dock.png'),fullPage:false})
  // REQ-059 / REQ-060 relation page.
  await page.locator('.tw-steps button').nth(4).click()
  const rel=page.getByRole('region',{name:'来源与部件对应关系'}),groupA=rel.locator(`[data-root-id="${A.id}"]`)
  const directRow=groupA.locator('.tw-rel-direct')
  await expect(directRow).toHaveCount(1)
  check('uncropped original shows its directly-built model row',await directRow.getByText(/未裁剪 · 直接用此图建模/).count()===1&&await directRow.getByRole('button',{name:'3D 预览：整体直出模型'}).count()===1)
  check('direct model is not duplicated under the crop row',await groupA.locator(`[data-asset-id="${crop.id}"]`).getByRole('button',{name:'3D 预览：整体直出模型'}).count()===0&&await groupA.locator(`[data-asset-id="${crop.id}"]`).getByRole('button',{name:'3D 预览：头发部件模型'}).count()===1)
  const surface=await page.locator('.tw-shell').getAttribute('data-surface')
  const partStyle=await groupA.locator('.tw-rel-part').first().evaluate(el=>{const c=getComputedStyle(el);return {bf:c.backdropFilter||c.webkitBackdropFilter,bg:c.backgroundColor}})
  check('part cards use the translucent glass surface',surface!=='glass'||(partStyle.bf&&partStyle.bf!=='none'&&!/^rgb\(/.test(partStyle.bg)))
  await page.screenshot({path:path.join(evidence,'v031-relations.png'),fullPage:false})
  // REQ-057 3D preview page.
  await page.getByRole('tab',{name:'3D 预览',exact:true}).click()
  const assets=page.getByRole('region',{name:'3D 资产'});await expect(assets.locator('.tps-3d-card')).toHaveCount(2)
  check('preview opens empty: no demo samples, export disabled',await page.locator('.tps-stage-empty').count()===1&&await page.getByRole('button',{name:'导出 GLB',exact:true}).isDisabled()&&await page.getByText(/示例|演示生成/).count()===0)
  await assets.getByRole('button',{name:'在查看器中打开：头发部件模型'}).click()
  await expect(page.locator('.tps-vtop strong')).toContainText('头发部件模型')
  await expect(page.locator('.tps-vfoot')).toContainText('1 三角面')
  check('clicking a 3D asset loads it into the viewer',await page.getByRole('button',{name:'导出 GLB',exact:true}).isEnabled())
  await assets.getByLabel('搜索 3D 资产').fill('整体');await expect(assets.locator('.tps-3d-card')).toHaveCount(1)
  check('3D asset search filters by name',true);await assets.getByLabel('搜索 3D 资产').fill('')
  await expect(assets.locator('.tw-model-thumb[data-thumb=ready]')).toHaveCount(2,{timeout:20000})
  await page.screenshot({path:path.join(evidence,'v031-preview.png'),fullPage:false})
  // Clicking a task's 3D reference image opens that model in the preview page.
  await page.getByRole('tab',{name:'创作',exact:true}).click()
  await dock.getByRole('group',{name:'3D 参考图：整体直出'}).locator('button.tw-model-thumb').click()
  await expect(page.locator('.tps-vtop strong')).toContainText('整体直出模型')
  check('task reference thumbnail opens the model in 3D 预览',true)
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200)
  check('390px preview page has no horizontal overflow',await page.locator('.tps-grid').evaluate(el=>el.scrollWidth<=el.clientWidth+1)&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  await page.getByRole('tab',{name:'创作',exact:true}).click();await page.waitForTimeout(200)
  check('390px studio has no horizontal overflow',await page.evaluate(()=>{const el=document.querySelector('.tw-root');return el.scrollWidth<=el.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1}))
  check('no supplier calls, page errors or external requests',calls.length===0&&errors.length===0&&external.length===0)
} catch(e){failures.push(e.message);console.error(e);const pg=browser?.contexts()[0]?.pages()[0];if(pg)await pg.screenshot({path:path.join(evidence,'v031-ui-failure.png'),fullPage:true}).catch(()=>{})}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true})}
fs.writeFileSync(path.join(evidence,'v031-ui-results.json'),JSON.stringify({passed,failures,errors,external,calls,realProviderCalls:0},null,2)+'\n')
console.log(JSON.stringify({passed:passed.length,failed:failures.length}));if(failures.length||errors.length||external.length)process.exitCode=1
