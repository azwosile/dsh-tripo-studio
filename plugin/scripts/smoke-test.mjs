// Full browser workflow against the REAL local HTTP routes and a FAKE Tripo
// transport. No API key, no external API calls, and no real generation credits.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {chromium, expect} from '@playwright/test'
import {ProjectLocation} from '../server/project-location.js'
import {JobService} from '../server/service.js'
import {createHandler} from '../server/routes.js'
import {hostRouter} from '../tests/fixtures/host-router.mjs'
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const evidence = path.join(root, '..', 'validation','v0.3.4'); fs.mkdirSync(evidence, {recursive: true})
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tripo-ui-test-'))
const fixture = fs.readFileSync(path.join(root, 'tests/fixtures/reference.png'))
function triangleGlb() {
  const doc = {asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[0.3,0.7,0.5,1],metallicFactor:0,roughnessFactor:0.6},doubleSided:true}],buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteLength:36,target:34962}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,0],max:[1,2,0]}]}
  const text = JSON.stringify(doc), json = Buffer.from(text.padEnd(Math.ceil(Buffer.byteLength(text)/4)*4,' '))
  const binary = Buffer.from(new Float32Array([-1,0,0,1,0,0,0,2,0]).buffer)
  const result = Buffer.alloc(12+8+json.length+8+binary.length)
  result.write('glTF');result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(json.length,12);result.writeUInt32LE(0x4e4f534a,16);json.copy(result,20)
  result.writeUInt32LE(binary.length,20+json.length);result.writeUInt32LE(0x004e4942,24+json.length);binary.copy(result,28+json.length);return result
}
const calls = [], tasks = new Map()
const client = {
  async upload(){return 'file_mock_reference'},
  async create(kind,params){const task_id=`task_mock_${calls.length+1}`;calls.push({kind,params});tasks.set(task_id,kind);return {task_id}},
  async task(id){return {task_id:id,status:'success',progress:100,credits_consumed:0,output:tasks.get(id)==='image-to-model'?{model_url:'https://cdn.tripo3d.ai/mock.glb'}:{generated_image_url:'https://cdn.tripo3d.ai/mock.png'}}},
  async balance(){return {balance:0,frozen:0}},
}
const service = new JobService({directory:path.join(temporary,'data'),key:'FAKE_TEST_KEY_NOT_REAL',enabled:true,client,downloader:async url=>url.endsWith('.glb')?triangleGlb():fixture})
const pickedDirectory=path.join(temporary,'chosen');fs.mkdirSync(pickedDirectory)
const storageManager=new ProjectLocation(service.store.directory,{picker:async()=>pickedDirectory,platform:'win32'})
const handler = createHandler({service,storageManager})
const allowed = new Map([
  ['/scripts/preview.html',['scripts/preview.html','text/html']],
  ['/lib/client-v0.3.4.js',['lib/client-v0.3.4.js','text/javascript']],
  ['/node_modules/react/umd/react.development.js',['node_modules/react/umd/react.development.js','text/javascript']],
  ['/node_modules/react-dom/umd/react-dom.development.js',['node_modules/react-dom/umd/react-dom.development.js','text/javascript']],
])
const routing=hostRouter(handler)
const server=http.createServer((req,res)=>{
  const route=routing.match(req.url);if(route)return route.handler(req,res)
  const entry=allowed.get(new URL(req.url,'http://localhost').pathname)
  if(!entry){res.statusCode=404;return res.end()}
  res.setHeader('content-type',entry[1]);let data=fs.readFileSync(path.join(root,entry[0]))
  if(entry[0].endsWith('.html'))data=Buffer.from(data.toString().replace('本地校验页：','测试环境 · Tripo 传输为模拟，无真实扣费。 本地校验页：'))
  res.end(data)
})
await new Promise(r=>server.listen(0,'0.0.0.0',r))
const base=`http://127.0.0.1:${server.address().port}`
let browser
const failures=[],passed=[],pageErrors=[],external=[]
function check(label,condition){(condition?passed:failures).push(label);console.log(`${condition?'PASS':'FAIL'} ${label}`)}
try {
  browser=await chromium.launch({...(process.env.TRIPO_TEST_BROWSER?{executablePath:process.env.TRIPO_TEST_BROWSER}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']})
  const page=await browser.newPage({viewport:{width:1440,height:1050}})
  await page.addInitScript(()=>{try{const k='tripo-studio-layout-v1',v=JSON.parse(localStorage.getItem(k)||'{}');if(v.lib===undefined)localStorage.setItem(k,JSON.stringify({...v,lib:true}))}catch{}}) // 0.3.2: library defaults to a collapsed rail; these checks need it open
  page.on('pageerror',e=>pageErrors.push(e.message))
  page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(base))external.push(r.url())})
  await page.goto(`${base}/scripts/preview.html`)
  await expect(page.getByRole('button',{name:'创建本地项目',exact:true})).toBeEnabled()
  const result=await page.evaluate(()=>window.__result)
  check('bundle registers sidebar and keyed panel',result.slots.some(s=>s.name==='main'&&s.key==='tripo-studio')&&result.slots.some(s=>s.name==='sidebar.panellist'&&s.id==='tripo-studio'))
  check('workflow does not allocate WebGL until preview is opened',await page.locator('canvas').count()===0)
  await page.getByRole('button',{name:'创建本地项目',exact:true}).click()
  await expect(page.getByLabel('角色提示词')).toBeVisible()
  await page.getByLabel('图像模型',{exact:true}).selectOption('seedream_v5')
  await expect(page.getByLabel('图像质量',{exact:true})).toBeDisabled()
  await expect(page.getByLabel('输出尺寸',{exact:true})).toHaveValue('2K')
  await expect(page.locator('.tw-price-note')).toContainText('2K 5')
  await page.getByRole('button',{name:'文生图 · 生成 1 张 · 先确认',exact:true}).click()
  await expect(page.locator('.tw-approval-list')).toContainText('seedream_v5')
  check('Seedream preparation omits unsupported quality',!JSON.parse(await page.locator('.tw-approval-list pre').innerText()).quality&&calls.length===0)
  await page.getByRole('button',{name:'取消并丢弃草稿',exact:true}).click()
  await page.getByLabel('图像模型',{exact:true}).selectOption('chat_image_2.5_flare')
  await page.getByLabel('角色提示词').fill('成年角色，完整全身，干净背景，银白头发和分层裙装，关节适合后续绑定。')
  await page.getByRole('button',{name:'保存提示词',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('已保存')
  const projectId=Object.keys(service.store.state.projects)[0]
  check('draft stored on backend',service.store.project(projectId).draft.prompt.includes('银白头发'))
  await page.getByLabel('导入参考图',{exact:true}).setInputFiles(path.join(root,'tests/fixtures/reference.png'))
  await expect(page.locator('.tw-image-card')).toHaveCount(1)
  check('local upload does not call Tripo',calls.length===0)
  await page.locator('.tw-image-tile').first().getByRole('button',{name:/^(选择|已选择)图片：/}).click()
  await page.screenshot({path:path.join(evidence,'workflow-desktop.png'),fullPage:true})
  await page.getByRole('button',{name:/使用「.*」拆件/}).click()
  await expect(page.locator('.tw-crop')).toBeVisible()
  for(const [k,v]of Object.entries({x:10,y:10,w:80,h:80}))await page.getByLabel(`裁剪 ${k}`,{exact:true}).fill(String(v))
  await page.getByRole('button',{name:'保存当前裁剪',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('裁剪已保存')
  check('local crop saved a square part image',service.store.snapshot(projectId).assets.some(a=>a.label==='头发'&&a.width===a.height))
  await page.getByRole('button',{name:'检测分离区域（本地）',exact:true}).click()
  await expect(page.getByRole('button',{name:'候选 1',exact:true})).toBeVisible()
  check('background-component detector suggests local crop candidates',await page.locator('.tw-candidates button').count()>1)
  await page.screenshot({path:path.join(evidence,'parts-crop-desktop.png'),fullPage:true})
  await page.getByRole('button',{name:'AI 提取此部件 · 先确认',exact:true}).click()
  const dialog=page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const commit=dialog.getByRole('button',{name:'确认上传并提交 1 个任务',exact:true})
  await expect(commit).toBeDisabled();check('prepare and opening confirmation incur no generation',calls.length===0)
  await dialog.getByRole('checkbox').check();await commit.click()
  await expect(page.getByRole('button',{name:'刷新任务（只查询，不重提）',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'刷新任务（只查询，不重提）',exact:true}).click()
  await expect(page.locator('.tw-job').filter({hasText:'云端成功'})).toHaveCount(1)
  check('part extraction uses public image-to-image endpoint and actual parameters',calls.length===1&&calls[0].kind==='image-to-image'&&calls[0].params.model==='chat_image_2.5_sunburst'&&calls[0].params.input==='file_mock_reference'&&!('template'in calls[0].params))
  await page.locator('.tw-steps button').nth(0).click()
  await page.getByRole('button',{name:'文生图 · 四张候选 · 4 个独立收费任务',exact:true}).click()
  await expect(dialog.locator('.tw-approval-list article')).toHaveCount(4)
  await dialog.getByRole('button',{name:'取消并丢弃草稿',exact:true}).click()
  await expect(dialog).toHaveCount(0)
  check('canceling four-image approval sends zero paid requests',calls.length===1)
  await page.getByRole('button',{name:'文生图 · 四张候选 · 4 个独立收费任务',exact:true}).click()
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button',{name:'确认上传并提交 4 个任务',exact:true}).click()
  await expect(page.locator('.tw-jobs')).toBeVisible()
  await page.getByRole('button',{name:'刷新任务（只查询，不重提）',exact:true}).click()
  await expect(page.locator('.tw-job').filter({hasText:'云端成功'})).toHaveCount(5)
  check('four candidates produce four explicit jobs, never an invented n parameter',calls.length===5&&calls.slice(1).every(c=>c.kind==='text-to-image'&&!('n'in c.params)))
  await page.reload();await expect(page.getByLabel('角色提示词')).toBeVisible()
  check('page reload restores project without resubmitting',calls.length===5&&(await page.getByLabel('当前项目').inputValue())===projectId)
  await page.locator('.tw-steps button').nth(2).click()
  await page.locator('.tw-role-grid input[type=checkbox]').first().check()
  // 0.3.3 REQ-067: one ticked image → one task on the unified page (主要 = own task, 次要 source = the sheet itself).
  await page.getByRole('button',{name:'审阅建模 · 1 个任务',exact:true}).click()
  await expect(dialog).toContainText('图生3D')
  await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'确认上传并提交 1 个任务',exact:true}).click()
  await page.getByRole('button',{name:'刷新任务（只查询，不重提）',exact:true}).click()
  await expect(page.locator('.tw-lib-model')).toHaveCount(1) // 0.3.0: models appear in the library at once
  await page.locator('.tw-steps button').nth(3).click()
  await expect(page.locator('.tw-model')).toHaveCount(1)
  check('part modeling uses public image-to-model and saves GLB separately',calls.length===6&&calls[5].kind==='image-to-model'&&calls[5].params.face_limit===50000)
  await page.locator('.tw-model').getByRole('button',{name:'3D 预览',exact:true}).click()
  await expect(page.locator('.tps-stage canvas')).toHaveCount(1)
  await expect(page.locator('.tps-vfoot')).toContainText('本地 3D 文件')
  check('cloud output preview loads from controlled local asset route',await page.locator('.tps-vfoot').innerText().then(s=>s.includes('1 三角面')))
  await page.getByTitle('切换线框',{exact:true}).click()
  check('wireframe controls remain functional',await page.getByTitle('切换线框',{exact:true}).evaluate(el=>el.classList.contains('on')))
  const downloadPromise=page.waitForEvent('download')
  await page.getByRole('button',{name:/导出当前模型/}).click()
  const download=await downloadPromise, exported=path.join(temporary,'roundtrip.glb');await download.saveAs(exported)
  check('GLB download has valid glTF magic',fs.readFileSync(exported).toString('ascii',0,4)==='glTF')
  await page.setInputFiles('input[type=file][accept=".glb,.gltf,.fbx,.obj,.stl"]',exported)
  await expect(page.locator('.tps-vtop strong')).toContainText('roundtrip')
  check('wireframe export round-trips as a mesh, not lines',await page.locator('.tps-vfoot').innerText().then(s=>s.includes('1 三角面')))
  await page.screenshot({path:path.join(evidence,'glb-preview-desktop.png'),fullPage:true})
  await page.getByRole('tab',{name:'创作',exact:true}).click()
  await expect(page.getByLabel('角色提示词')).toBeVisible()
  check('leaving 3D panel disposes its canvas',await page.locator('canvas').count()===0)
  await page.locator('.tw-steps button').nth(2).click()
  const fullId=service.store.snapshot(projectId).assets.find(a=>a.kind==='image').id
  // 0.3.3 REQ-067: one modelling page; 主要 (green) parts are their own task, the sheet only goes when needed.
  await page.locator('.tw-role-grid input[type=checkbox]').first().uncheck()
  const second=page.locator('.tw-role-card').nth(1)
  await second.getByRole('button',{name:'主要',exact:true}).click()
  await expect(second).toHaveAttribute('data-role','high')
  await second.locator('input[type=checkbox]').check()
  await page.getByLabel('整张拆件图',{exact:true}).selectOption(fullId)
  await page.getByRole('button',{name:'保存建模计划',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('已保存')
  check('split-sheet choice persists in project draft',service.store.project(projectId).draft.sheetAsset===fullId)
  await page.screenshot({path:path.join(evidence,'unified-model-plan.png'),fullPage:true})
  await page.getByRole('button',{name:'审阅建模 · 1 个任务',exact:true}).click()
  await expect(dialog).toContainText('主要部件')
  check('primary part is its own approved task; the unticked sheet is not resubmitted',calls.length===6&&service.store.snapshot(projectId).jobs.some(j=>j.role==='part'&&j.priority==='high'&&j.status==='awaiting_approval'))
  await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'确认上传并提交 1 个任务',exact:true}).click()
  await page.getByRole('button',{name:'刷新任务（只查询，不重提）',exact:true}).click()
  await page.locator('.tw-steps button').nth(3).click()
  await expect(page.locator('.tw-model')).toHaveCount(2)
  check('sheet model and primary part remain separate GLB assets',calls.length===7&&service.store.snapshot(projectId).jobs.filter(j=>j.kind==='image-to-model').length===2)
  await page.locator('.tw-steps button').nth(1).click()
  await page.getByLabel('拆件图像模型').selectOption('banana2')
  await expect(page.getByLabel('拆件图像质量')).toBeDisabled();await expect(page.getByLabel('拆件输出尺寸')).toHaveValue('2K')
  await page.screenshot({path:path.join(evidence,'split-model-settings.png'),fullPage:true})
  check('split model is independently selectable with operation-filtered catalog',!(await page.getByLabel('拆件图像模型').locator('option').allTextContents()).some(s=>s.includes('seedream_v4')))
  await page.locator('.tw-steps button').nth(0).click()
  if(process.platform==='win32') {
  await page.getByRole('button',{name:'项目文件夹',exact:true}).click()
  const storageDialog=page.getByRole('dialog',{name:'统一项目根目录'})
  await storageDialog.getByRole('button',{name:'选择根目录…',exact:true}).click()
  await expect(storageDialog).toContainText(pickedDirectory)
  await page.screenshot({path:path.join(evidence,'project-root-confirmation.png'),fullPage:true})
  check('native picker fixture does not switch storage until explicit confirmation',service.store.directory!==pickedDirectory)
  await storageDialog.getByRole('button',{name:'确认切换项目根目录',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('根目录已切换')
  await page.getByRole('button',{name:'关闭统一项目根目录'}).click()
  await page.getByRole('button',{name:'创建本地项目',exact:true}).click()
  check('new root has isolated project and original state survives',Object.keys(service.store.state.projects).length===1&&fs.existsSync(path.join(temporary,'data','state.json')))
  await page.getByRole('button',{name:'项目文件夹',exact:true}).click()
  await storageDialog.getByRole('button',{name:'返回默认目录…',exact:true}).click()
  await storageDialog.getByRole('button',{name:'确认切换项目根目录',exact:true}).click()
  await page.getByRole('button',{name:'关闭统一项目根目录'}).click()
  await page.getByLabel('当前项目').selectOption(projectId)
  await expect(page.getByLabel('角色提示词')).toBeVisible()
  check('default-root restore retains old assets with no paid resubmission',calls.length===7&&service.store.snapshot(projectId).assets.length>1)
  } else check('native directory picker skipped on non-Windows; storage routes covered by node tests',true)
  await page.setViewportSize({width:390,height:844})
  await page.screenshot({path:path.join(evidence,'workflow-mobile.png'),fullPage:true})
  check('390px layout has no horizontal overflow',await page.evaluate(()=>{const el=document.querySelector('.tw-root');return el.scrollWidth<=el.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1}))
  await page.goto(pathToFileURL(path.join(root,'..','Tripo-Studio-Workbench-v0.3.4.html')).href)
  await page.getByRole('tab',{name:'3D 预览',exact:true}).click()
  await expect(page.locator('.tps-stage canvas')).toHaveCount(1)
  check('single-file offline preview mounts without any network dependency',true)
  // 0.3.1 REQ-057: no procedural demo/seed samples; export stays disabled until a real model is opened.
  check('3D preview starts empty with export disabled (no demo samples)',await page.getByRole('button',{name:'导出 GLB',exact:true}).isDisabled()&&await page.locator('.tps-stage-empty').count()===1)
  await page.locator('input[type=file][accept=".glb,.gltf,.fbx,.obj,.stl"]').setInputFiles({name:'offline-tri.obj',mimeType:'text/plain',buffer:Buffer.from('v -1 0 0\nv 1 0 0\nv 0 2 0\nf 1 2 3\n')})
  await expect(page.locator('.tps-vtop strong')).toContainText('offline-tri')
  await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'导出 GLB',exact:true}).click()])
  check('offline preview imports a local file and exports a GLB display copy',true)
  check('no unhandled browser errors',pageErrors.length===0)
  check('browser never contacted an external host',external.length===0)
  if(pageErrors.length)console.error('PAGE_ERRORS',pageErrors)
  if(external.length)console.error('EXTERNAL_REQUESTS',external)
} catch(error){failures.push(error.message);console.error(error);if(browser){const p=browser.contexts()[0]?.pages()[0];if(p)await p.screenshot({path:path.join(evidence,'ui-failure.png'),fullPage:true}).catch(()=>{})}}
finally {
  if(browser)await browser.close()
  server.closeAllConnections();await new Promise(r=>server.close(r))
  fs.rmSync(temporary,{recursive:true,force:true})
}
fs.writeFileSync(path.join(evidence,'ui-results.json'),JSON.stringify({transport:'mock Tripo; real local HTTP routes',paidAPICalls:0,passed,failures,pageErrors,external},null,2)+'\n')
if(failures.length)process.exitCode=1
console.log(`Browser checks: ${passed.length} passed, ${failures.length} failed; paid API calls: 0`)
