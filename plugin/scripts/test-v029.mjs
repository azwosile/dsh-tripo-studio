// Full browser workflow against the REAL local HTTP routes and a FAKE Tripo
// transport. No API key, no external API calls, and no real generation credits.
import fs from 'node:fs'
import {randomUUID} from 'node:crypto'
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
const evidence = path.join(root, '..', 'validation','v0.3.2'); fs.mkdirSync(evidence, {recursive: true})
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
  async create(kind,params){const task_id=randomUUID();calls.push({kind,params});tasks.set(task_id,kind);return {task_id}},
  async task(id){return {task_id:id,type:(tasks.get(id)||'text-to-image').replaceAll('-','_'),status:'success',progress:100,credits_consumed:0,output:tasks.get(id)==='image-to-model'?{model_url:'https://cdn.tripo3d.ai/mock.glb'}:{generated_image_url:'https://cdn.tripo3d.ai/mock.png'}}},
  async balance(){return {balance:0,frozen:0}},
}
const service = new JobService({directory:path.join(temporary,'data'),key:'FAKE_TEST_KEY_NOT_REAL',enabled:true,client,downloader:async url=>url.endsWith('.glb')?triangleGlb():fixture})
const pickedDirectory=path.join(temporary,'chosen');fs.mkdirSync(pickedDirectory)
const storageManager=new ProjectLocation(service.store.directory,{picker:async()=>pickedDirectory,platform:'win32'})
const handler = createHandler({service,storageManager})
const allowed = new Map([
  ['/scripts/preview.html',['scripts/preview.html','text/html']],
  ['/lib/client-v0.3.2.js',['lib/client-v0.3.2.js','text/javascript']],
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
 page.on('pageerror',e=>pageErrors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(base))external.push(r.url())})
 await page.goto(`${base}/scripts/preview.html`);await page.getByRole('button',{name:'创建本地项目',exact:true}).click()
 const projectId=Object.keys(service.store.state.projects)[0]
 await page.getByLabel('角色提示词').fill('长'.repeat(1801));await page.getByRole('button',{name:'生成 1 张 · 先确认',exact:true}).click()
 await expect(page.getByRole('alert')).toContainText('1800');check('Flare 1801-character prompt rejected before approval or paid POST',calls.length===0)
 await page.getByLabel('角色提示词').fill('测试成年角色');await page.getByLabel('导入参考图',{exact:true}).setInputFiles(path.join(root,'tests/fixtures/reference.png'))
 await expect(page.getByRole('region',{name:'图生图改写与三视图'})).toBeVisible()
 const edit=page.getByRole('region',{name:'图生图改写与三视图'})
 await edit.getByLabel('改写图像模型',{exact:true}).selectOption('seedream_v5');await edit.getByLabel('改写提示词').fill('把外衣改成蓝色，保留其他细节')
 await edit.getByRole('button',{name:'生成改写图 · 先确认'}).click()
 let modal=page.getByRole('dialog',{name:'收费任务确认'});await expect(modal).toBeVisible()
 let params=JSON.parse(await modal.locator('pre').innerText());check('rewrite approval contains reference, selected model and independent edit prompt',params.input_asset&&params.model==='seedream_v5'&&params.prompt.includes('蓝色')&&!params.quality&&calls.length===0)
 await modal.getByRole('checkbox').check();await modal.getByRole('button',{name:'确认上传并提交 1 个任务'}).click()
 await page.getByRole('button',{name:'刷新任务（只查询，不重提）',exact:true}).click()
 const rewrite=page.locator('.tw-job').filter({hasText:'图生图改写'})
 await expect(rewrite.locator('.tw-task-output img')).toHaveCount(1);check('UUID created task is retained; output shown in its own task card',calls.length===1&&service.store.snapshot(projectId).jobs.some(j=>j.taskId?.length===36&&j.downloadStatus==='downloaded'))
 await expect(rewrite.locator('.tw-job-model')).toContainText('seedream_v5')
 await rewrite.getByRole('button',{name:'刷新此任务（不重新生成）'}).click();check('individual refresh does not create a second generation',calls.length===1)
 await page.locator('.tw-steps button').nth(0).click();await edit.getByLabel('图像编辑操作').selectOption('views');await edit.getByLabel('改写图像模型',{exact:true}).selectOption('chat_image_2.5_sunburst');await edit.getByLabel('改写输出尺寸').fill('2048x1152')
 await edit.getByRole('button',{name:'生成一张三视图 · 先确认'}).click();params=JSON.parse(await modal.locator('pre').innerText())
 check('three-view sheet is one reviewed image-to-image job, not three paid tasks',await modal.locator('article').count()===1&&params.prompt.includes('背面')&&params.prompt.includes('同一张图')&&params.size==='2048x1152'&&calls.length===1)
 await modal.getByRole('button',{name:'取消并丢弃草稿'}).click();await page.getByRole('button',{name:'保存提示词',exact:true}).click();await expect(page.getByRole('status')).toContainText('已保存')
 await page.reload();await expect(page.getByLabel('图像编辑操作')).toHaveValue('views');await expect(page.getByLabel('改写输出尺寸')).toHaveValue('2048x1152');check('editing mode and model settings restore from project draft',service.store.project(projectId).draft.editMode==='views')
 await page.screenshot({path:path.join(evidence,'v029-image-edit.png'),fullPage:true})
 await page.locator('.tw-steps button').nth(1).click();await page.getByLabel('拆图方式').selectOption('sheet');await expect(page.getByLabel('部件名称',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'AI 提取此部件 · 先确认'})).toHaveCount(0)
 check('whole split sheet hides component name and single-part action',true)
 await page.getByRole('button',{name:'生成整张拆件图 · 先确认'}).click();await expect(modal.locator('pre')).toContainText('拆解设定图');await modal.getByRole('button',{name:'取消并丢弃草稿'}).click()
 await page.getByLabel('拆图方式').selectOption('part');await expect(page.getByLabel('部件名称',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'生成整张拆件图 · 先确认'})).toHaveCount(0);check('single-part mode shows name and only the corresponding generation action',true)
 await page.getByLabel('裁剪 x',{exact:true}).fill('10');await page.getByRole('button',{name:'撤回裁剪编辑'}).click();await expect(page.getByLabel('裁剪 x',{exact:true})).toHaveValue('0');check('crop coordinate change can be undone',true)
 await page.getByRole('button',{name:'从图片取背景色'}).click();await page.locator('.tw-crop').click({position:{x:2,y:2}});await expect(page.getByRole('button',{name:'从图片取背景色'})).toBeVisible();check('image background eyedropper completes without generation',calls.length===1)
 await page.getByLabel('裁剪背景色').fill('#12ab34');await expect(page.locator('.tw-crop')).toHaveCSS('background-color','rgb(18, 171, 52)')
 const originalId=await page.getByLabel('拆件来源',{exact:true}).inputValue();await page.getByRole('button',{name:'保存当前裁剪',exact:true}).click();await expect(page.getByRole('status')).toContainText('裁剪已保存')
 const cropped=service.store.snapshot(projectId).assets.at(-1)
 const color=await page.evaluate(async url=>{const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.drawImage(im,0,0);return [...x.getImageData(0,0,1,1).data]},cropped.url)
 check('chosen padding color is written into saved PNG, not just preview CSS',color.slice(0,3).join(',')==='18,171,52')
 await page.getByRole('button',{name:'撤回裁剪编辑'}).click();await expect(page.getByLabel('拆件来源',{exact:true})).toHaveValue(originalId);check('undo save returns to source image without deleting saved assets',service.store.snapshot(projectId).assets.some(a=>a.id===cropped.id))
 await page.getByLabel('裁剪换张图片').setInputFiles(path.join(root,'tests/fixtures/reference.png'));await expect(page.getByRole('status')).toContainText('图片已保存');check('replace image imports locally without any cloud POST',calls.length===1)
 await page.screenshot({path:path.join(evidence,'v029-crop-tools.png'),fullPage:true})
 // Regression fixtures are inserted into temporary local store only; never touch user tasks.
 const lost=service.prepare(projectId,{kind:'image-to-image',label:'恢复测试图',params:{input_asset:originalId,prompt:'测试'}});service.store.job(projectId,lost.id).status='submission_unknown';service.store.job(projectId,lost.id).error='创建响应没有有效 task_id'
 const lostId='3b2b6e28-80cb-48c9-9d32-0275ecb7ba49';tasks.set(lostId,'image-to-image')
 const failed=service.prepare(projectId,{kind:'text-to-image',label:'删除测试失败记录',params:{prompt:'测试'}});service.store.job(projectId,failed.id).status='failed';service.store.save()
 await page.reload();await page.locator('.tw-steps button').nth(3).click()
 const card=page.locator(`[data-job-id="${lost.id}"]`);await expect(card).toContainText('提交结果未知');await card.getByLabel('恢复用云端 task_id').fill(lostId)
 await expect(card.getByRole('button',{name:'关联并刷新（不重新生成）'})).toBeDisabled();await card.getByRole('checkbox').check();await card.getByRole('button',{name:'关联并刷新（不重新生成）'}).click()
 await expect(card).toContainText('云端成功');await expect(card.locator('.tw-task-output img')).toHaveCount(1);await expect(card).not.toContainText('创建响应没有有效 task_id');check('unknown UUID recovery downloads existing output with explicit association and zero new generation',calls.length===1)
 const failedCard=page.locator(`[data-job-id="${failed.id}"]`);await failedCard.getByRole('button',{name:'删除失败记录',exact:true}).click();check('delete requires a separate confirmation',Boolean(service.store.state.jobs[failed.id]))
 await failedCard.getByRole('button',{name:'确认删除本地记录'}).click();await expect(failedCard).toHaveCount(0);check('confirmed failed task disappears but outputs remain',!service.store.state.jobs[failed.id]&&service.store.snapshot(projectId).assets.length>=4)
 await page.screenshot({path:path.join(evidence,'v029-task-output-recovery.png'),fullPage:true})
 await page.locator('.tw-steps button').nth(0).click();await page.getByRole('button',{name:'界面外观',exact:true}).click()
 // Set existing persisted appearance through the real form.
 await page.getByLabel('普通控件背景不透明度').fill('0');await page.getByRole('button',{name:'关闭界面配色与毛玻璃'}).click()
 const alpha=async selector=>page.locator(selector).first().evaluate(el=>{const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.fillStyle=getComputedStyle(el).backgroundColor;x.fillRect(0,0,1,1);return x.getImageData(0,0,1,1).data[3]})
 check('official pricing link follows zero control opacity',await alpha('.tw-price-note a')===0)
 await page.getByRole('button',{name:'连接设置',exact:true}).click();check('connection panel ordinary buttons follow zero control opacity',await alpha('.tw-key-row button')===0)
 check('image-generation main canvas is transparent',await alpha('.tw-root')===0)
 await page.getByRole('button',{name:'Tips · Prompt / size',exact:true}).first().click();const tips=page.locator('dialog[open]')
 const links=page.locator('dialog[open] .tw-doc-links a');await expect(links).toHaveCount(2)
 const boxes=await links.evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}}));check('documentation/pricing links do not overlap',boxes[0].right<=boxes[1].left||boxes[0].bottom<=boxes[1].top)
 await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:900});await page.screenshot({path:path.join(evidence,'v029-mobile.png'),fullPage:true})
 check('mobile layout stays within panel width',await page.locator('.tw-root').evaluate(e=>e.scrollWidth<=e.clientWidth+1))
 // 0.3.2: narrow slots use the same vertical flow; parameters sit below the canvas
 await page.getByRole('button',{name:'生成一张三视图 · 先确认'}).click();await modal.getByRole('checkbox').check();await modal.getByRole('button',{name:'确认上传并提交 1 个任务'}).click()
 await page.getByRole('button',{name:'刷新任务（只查询，不重提）',exact:true}).click();const views=page.locator('.tw-job').filter({hasText:'角色三视图排版'}).filter({hasText:'云端成功'});await expect(views.locator('.tw-task-output img')).toHaveCount(1)
 check('confirmed three-view sheet produces exactly one image job and local result',calls.length===2&&calls[1].kind==='image-to-image'&&calls[1].params.prompt.includes('同一张图'))
 const modelJob=service.prepare(projectId,{kind:'image-to-model',label:'模型产出卡测试',params:{input_asset:originalId}});await service.submit(projectId,modelJob.id,modelJob.approvalHash);await service.refresh(projectId);await page.getByRole('button',{name:'刷新任务（只查询，不重提）',exact:true}).click()
 const modelCard=page.locator(`[data-job-id="${modelJob.id}"]`);await expect(modelCard.locator('.tw-task-output')).toContainText('GLB');await expect(modelCard.getByRole('button',{name:'3D 预览',exact:true})).toBeVisible();await expect(modelCard.getByRole('link',{name:'下载模型'})).toBeVisible()
 check('model result belongs to its task card with local preview and download',calls.length===3)
 check('no external provider requests and no browser exceptions',external.length===0&&pageErrors.length===0)
} catch(error) {failures.push(error.stack);console.error(error.stack)}
finally {
 await browser?.close();await new Promise(r=>server.close(r));fs.rmSync(temporary,{recursive:true,force:true})
 fs.writeFileSync(path.join(evidence,'v029-ui-results.json'),JSON.stringify({passed,failures,pageErrors,external,paidCalls:'mock only',realProviderCalls:0},null,2)+'\n')
 console.log(`v029 UI: ${passed.length} passed, ${failures.length} failed`);if(failures.length)process.exitCode=1
}
