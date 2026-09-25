// v0.2.10 end-to-end browser checks: real local HTTP service + fake CN provider.
// All IDs, credentials and outputs are isolated fixtures. NO real cloud calls.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import zlib from 'node:zlib'
import {fileURLToPath} from 'node:url'
import {chromium,expect} from '@playwright/test'
import {JobService} from '../server/service.js'
import {createHandler} from '../server/routes.js'
import {hostRouter} from '../tests/fixtures/host-router.mjs'
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const evidence=path.join(root,'..','validation','v0.3.2');fs.mkdirSync(evidence,{recursive:true})
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v0210-ui-'))
const fixture=fs.readFileSync(path.join(root,'tests/fixtures/reference.png'))
function triangleGlb(){
 const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteLength:36,target:34962}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,0],max:[1,2,0]}]}
 const json=Buffer.from(JSON.stringify(doc).padEnd(Math.ceil(Buffer.byteLength(JSON.stringify(doc))/4)*4,' '))
 const binary=Buffer.from(new Float32Array([-1,0,0,1,0,0,0,2,0]).buffer),b=Buffer.alloc(28+json.length+binary.length)
 b.write('glTF');b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(json.length,12);b.writeUInt32LE(0x4e4f534a,16);json.copy(b,20);b.writeUInt32LE(binary.length,20+json.length);b.writeUInt32LE(0x004e4942,24+json.length);binary.copy(b,28+json.length);return b
}
function solidPng(w,h){
 const crc=(data)=>{let c=~0;for(const byte of data){c^=byte;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (~c)>>>0}
 const chunk=(tag,payload)=>{const typ=Buffer.from(tag),out=Buffer.alloc(12+payload.length);out.writeUInt32BE(payload.length);typ.copy(out,4);payload.copy(out,8);out.writeUInt32BE(crc(out.subarray(4,-4)),out.length-4);return out}
 const head=Buffer.alloc(13);head.writeUInt32BE(w);head.writeUInt32BE(h,4);head[8]=8;head[9]=2
 const raw=Buffer.alloc((w*3+1)*h,255);for(let y=0;y<h;y++)raw[y*(w*3+1)]=0
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])
}
const created=[],queried=[],cloud=new Map(),manualTypes={task_importA:'image_to_model',task_importB:'image_to_model',task_importC:'image_to_model',task_imgA:'text_to_image',task_failedA:'image_to_image'}
let failNext=false
const client={
 async upload(){return 'file_fake_v0210'},
 async create(kind,params){created.push({kind,params});if(failNext){failNext=false;throw Object.assign(Error('模拟云端确定性拒绝'),{definitive:true,code:'MOCK_REJECTED'})}const id=`task_created_${created.length}`;cloud.set(id,kind.replaceAll('-','_').replace('model_convert','convert'));return {task_id:id}},
 async task(id){queried.push(id);const type=manualTypes[id]||cloud.get(id);if(!type)throw Error('模拟云端没有此任务');const status=id==='task_failedA'?'failed':type==='convert'?'queued':'success';return {task_id:id,type,status,progress:status==='success'?100:10,credits_consumed:0,...(status==='success'?{output:type==='image_to_model'?{model_url:'https://cdn.tripo3d.ai/fake.glb'}:{generated_image_url:'https://cdn.tripo3d.ai/fake.png'}}:{})}},
 async balance(){return {balance:0,frozen:0}},
}
const service=new JobService({directory:path.join(temp,'data'),key:'FAKE_V0210_LOCAL_ONLY',enabled:true,client,downloader:async url=>url.endsWith('.glb')?triangleGlb():fixture})
const handler=createHandler({service}),routing=hostRouter(handler)
const allowed=new Map([['/scripts/preview.html',['scripts/preview.html','text/html']],['/lib/client-v0.3.2.js',['lib/client-v0.3.2.js','text/javascript']],['/node_modules/react/umd/react.development.js',['node_modules/react/umd/react.development.js','text/javascript']],['/node_modules/react-dom/umd/react-dom.development.js',['node_modules/react-dom/umd/react-dom.development.js','text/javascript']]])
const server=http.createServer((req,res)=>{const route=routing.match(req.url);if(route)return route.handler(req,res);const file=allowed.get(new URL(req.url,'http://localhost').pathname);if(!file){res.statusCode=404;return res.end()}res.setHeader('content-type',file[1]);res.end(fs.readFileSync(path.join(root,file[0])))})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const base=`http://127.0.0.1:${server.address().port}`
let browser;const passed=[],failures=[],errors=[],external=[]
function check(name,ok){(ok?passed:failures).push(name);console.log(`${ok?'PASS':'FAIL'} ${name}`)}
try{
 browser=await chromium.launch({...(process.env.TRIPO_TEST_BROWSER?{executablePath:process.env.TRIPO_TEST_BROWSER}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']})
 const page=await browser.newPage({viewport:{width:1380,height:1000}})
  await page.addInitScript(()=>{try{const k='tripo-studio-layout-v1',v=JSON.parse(localStorage.getItem(k)||'{}');if(v.lib===undefined)localStorage.setItem(k,JSON.stringify({...v,lib:true}))}catch{}}) // 0.3.2: library defaults to a collapsed rail; these checks need it open
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(base))external.push(r.url())})
 await page.goto(`${base}/scripts/preview.html`)
 check('renamed main tab',await page.getByRole('tab',{name:'创作',exact:true}).count()===1)
 await page.getByRole('button',{name:'创建本地项目',exact:true}).click()
 const projectId=Object.keys(service.store.state.projects)[0]
 await expect(page.getByRole('heading',{name:'资产库'})).toBeVisible()
 await page.locator('.tw-steps button').nth(3).click()
 async function manual(id){
  await page.getByLabel('手动添加云端 task_id').fill(id);await page.getByRole('checkbox',{name:/确认这是当前国内站账户/}).check()
  await page.getByRole('button',{name:/查询并加入当前项目/}).click()
  const found=service.store.snapshot(projectId).jobs.find(j=>j.taskId===id)
  await expect(page.locator(`[data-job-id="${found.id}"]`)).toBeVisible()
  return found
 }
 const a=await manual('task_importA'),assetA=service.store.snapshot(projectId).assets.find(x=>x.sourceJobId===a.id)
 check('GET-only import creates local model without paid POST',Boolean(assetA)&&created.length===0&&queried.includes('task_importA'))
 const cardA=page.locator(`[data-job-id="${a.id}"]`)
 await cardA.getByRole('button',{name:'删除成功记录'}).click();await expect(cardA).toContainText('默认保留全部本地资产')
 await cardA.getByRole('button',{name:/确认删除本地记录/}).click();await expect(cardA).toHaveCount(0)
 check('success removal defaults to preserving local asset',Boolean(service.store.state.assets[assetA.id])&&!service.store.state.jobs[a.id])
 const b=await manual('task_importB')
 const c=await manual('task_importC'),assetC=service.store.snapshot(projectId).assets.find(x=>x.sourceJobId===c.id),cardC=page.locator(`[data-job-id="${c.id}"]`)
 await cardC.getByRole('button',{name:'删除成功记录'}).click();await cardC.getByRole('checkbox',{name:/同时删除该任务/}).check();await cardC.getByRole('button',{name:/确认删除本地记录及产出资产/}).click()
 check('optional confirmed output removal deletes only unreferenced local output',!service.store.state.assets[assetC.id]&&Boolean(service.store.state.jobs[b.id]))
 const image=await manual('task_imgA'),imageCard=page.locator(`[data-job-id="${image.id}"]`)
 await imageCard.getByRole('button',{name:/放大图片/}).click();await expect(page.getByRole('dialog',{name:/放大图片/})).toBeVisible()
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:/放大图片/})).toHaveCount(0)
 check('task image magnifies and closes without cloud request',created.length===0)
 const failed=await manual('task_failedA'),failCard=page.locator(`[data-job-id="${failed.id}"]`)
 await failCard.getByRole('button',{name:'删除失败记录'}).click();await expect(failCard).toContainText('仅删除本机记录')
 await failCard.getByRole('button',{name:/确认删除本地记录/}).click();await expect(failCard).toHaveCount(0)
 check('failed task warning matches actual local-only deletion',!service.store.state.jobs[failed.id]&&created.length===0)
 await page.locator('.tw-steps button').nth(0).click()
 await page.getByLabel('导入参考图',{exact:true}).setInputFiles(path.join(root,'tests/fixtures/reference.png'))
 await expect(page.getByRole('status')).toContainText('图片已保存')
 const local=service.store.snapshot(projectId).assets.find(x=>x.label==='reference'&&!x.sourceJobId)
 const grid=page.locator('.tw-image-tile').filter({hasText:local.label})
 await grid.hover();await grid.getByRole('button',{name:/放大图片/}).click();await expect(page.getByRole('dialog',{name:/放大图片/})).toBeVisible()
 await page.keyboard.press('Escape')
 await grid.getByRole('button',{name:/删除参考图/}).click();await expect(page.getByRole('dialog',{name:'删除参考图确认'})).toBeVisible()
 await page.getByRole('button',{name:'保留图片'}).click();check('reference removal can be cancelled',Boolean(service.store.state.assets[local.id]))
 await grid.getByRole('button',{name:/删除参考图/}).click();await page.getByRole('button',{name:'确认删除本机图片'}).click();await expect(grid).toHaveCount(0)
 check('unreferenced local image can be removed explicitly',!service.store.state.assets[local.id]&&created.length===0)
 await page.locator('.tw-steps button').nth(1).click()
 const large=solidPng(4000,2600)
 await page.getByLabel('裁剪换张图片').setInputFiles({name:'large-scene.png',mimeType:'image/png',buffer:large})
 await expect(page.getByRole('status')).toContainText('图片已保存')
 await expect(page.locator('.tw-crop')).toBeVisible()
 const dims=await page.locator('.tw-crop').evaluate(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height,parent:el.parentElement.getBoundingClientRect().width}))
 check('large crop stays proportional and fits viewport',dims.w<=dims.parent+1&&Math.abs(dims.h/dims.w-2600/4000)<.02)
 await page.getByRole('button',{name:'手动套索框选'}).click()
 const r=await page.locator('.tw-crop').boundingBox()
 const xy=(x,y)=>[r.x+r.width*x,r.y+r.height*y]
 const pts=[[.25,.25],[.75,.25],[.75,.75],[.25,.75],[.25,.25]]
 await page.mouse.move(...xy(...pts[0]));await page.mouse.down()
 for(const point of pts.slice(1))await page.mouse.move(...xy(...point),{steps:8})
 await page.mouse.up();await page.getByRole('button',{name:'保存当前裁剪'}).click()
 await expect(page.getByRole('status')).toContainText('裁剪已保存')
 const cropped=service.store.snapshot(projectId).assets.at(-1)
 check('manual lasso creates square local part without paid call',cropped.width===cropped.height&&cropped.label==='头发'&&created.length===0)
 await page.screenshot({path:path.join(evidence,'v0210-lasso.png'),fullPage:true})
 await page.locator('.tw-steps button').nth(2).click()
 await page.getByLabel('Tripo 几何模型').selectOption('v2.5-20250123')
 check('v2.5 hides unsupported detailed/quad fields',await page.getByLabel('几何质量').isDisabled()&&await page.getByLabel('网格拓扑').isDisabled())
 await page.getByLabel('Tripo 几何模型').selectOption('v3.1-20260211')
 await page.getByLabel('几何质量').selectOption('detailed')
 await page.getByLabel('目标面数').fill('1750000')
 await page.getByLabel('网格拓扑').selectOption('quad')
 check('quad selection clamps face cap to official 150k',Number(await page.getByLabel('目标面数').inputValue())===150000)
 await page.getByLabel('贴图',{exact:true}).selectOption('off')
 check('texture off also disables PBR',await page.getByLabel('PBR 材质').isDisabled()&&!await page.getByLabel('PBR 材质').isChecked())
 await page.getByLabel('整体建模来源').selectOption(cropped.id)
 await page.getByRole('button',{name:'保存建模计划'}).click()
 await page.reload();await page.locator('.tw-steps button').nth(2).click()
 check('model choices persist across reload',await page.getByLabel('网格拓扑').inputValue()==='quad'&&await page.getByLabel('贴图',{exact:true}).inputValue()==='off')
 await page.getByRole('button',{name:/审阅整体建模/}).click()
 const approval=page.getByRole('dialog',{name:'收费任务确认'})
 const quad=JSON.parse(await approval.locator('pre').innerText())
 const tone=await approval.locator('.tw-dialog').evaluate(el=>[...getComputedStyle(el).backgroundColor.matchAll(/\d+/g)].slice(0,3).map(m=>Number(m[0])))
 check('quad request is FBX without texture and approval is neutral',quad.quad===true&&quad.face_limit===150000&&quad.pbr===false&&!('texture_quality'in quad)&&Math.max(...tone)-Math.min(...tone)<12&&created.length===0)
 await approval.getByRole('button',{name:'取消并丢弃草稿'}).click()
 await page.getByLabel('网格拓扑').selectOption('tri')
 await page.getByRole('button',{name:/审阅整体建模/}).click()
 await approval.getByRole('checkbox').check();await approval.getByRole('button',{name:/确认上传并提交 1 个任务/}).click()
 await page.getByRole('button',{name:'刷新任务（只查询，不重提）'}).click()
 const model=service.store.snapshot(projectId).jobs.find(j=>j.kind==='image-to-model'&&j.status==='success'&&j.label==='整体打底模型')
 check('model generation sends approved advanced parameters once',Boolean(model)&&created.length===1&&created[0].params.model==='v3.1-20260211'&&created[0].params.texture===false&&created[0].params.quad===false)
 await page.locator('.tw-steps button').nth(2).click()
 const originalJobs=await page.getByLabel('转换来源任务').locator('option').allTextContents()
 check('conversion inputs include only successful generation jobs',originalJobs.some(s=>s.includes('task_importB'))&&!originalJobs.some(s=>s.includes('task_importA')))
 await page.getByLabel('转换来源任务').selectOption(b.id)
 await page.getByLabel('目标导出格式').selectOption('FBX')
 await page.getByRole('checkbox',{name:/转换为四边面 FBX/}).check()
 await page.getByRole('button',{name:/审阅并单独确认格式转换/}).click()
 const conv=JSON.parse(await approval.locator('pre').innerText())
 check('format conversion requires a separate paid approval',conv.format==='FBX'&&conv.quad===true&&conv.input_job===b.id&&created.length===1)
 await approval.getByRole('checkbox').check();await approval.getByRole('button',{name:/确认上传并提交 1 个任务/}).click()
 check('conversion calls provider once with task ID, never auto after modeling',created.length===2&&created[1].kind==='model-convert'&&created[1].params.input==='task_importB'&&created[1].params.format==='FBX')
 await page.locator('.tw-steps button').nth(0).click();const editPanel=page.getByRole('region',{name:'图生图改写与三视图'});await editPanel.getByLabel('改写提示词').fill('角色编辑版本');await editPanel.getByRole('button',{name:/生成改写图/}).click()
 await approval.getByRole('checkbox').check();failNext=true
 await approval.getByRole('button',{name:/确认上传并提交 1 个任务/}).click()
 await expect(page.getByRole('region',{name:'任务坞'}).locator('.tw-jobs')).toBeVisible() // 0.3.0: dock opens instead of page jump
 await expect(page.locator('.tw-job').filter({hasText:'图生图改写'}).first()).toContainText('失败')
 check('definitive failed paid submit reveals the task dock; no automatic retry',created.length===3&&created[2].kind==='image-to-image')
 await page.getByRole('tab',{name:'3D 预览'}).click()
 const pick=page.locator('input[type=file][accept=".glb,.gltf,.fbx,.obj,.stl"]')
 await pick.setInputFiles({name:'local-tri.obj',mimeType:'text/plain',buffer:Buffer.from('v -1 0 0\nv 1 0 0\nv 0 2 0\nf 1 2 3\n')})
 await expect(page.locator('.tps-vtop strong')).toContainText('local-tri')
 const stl=Buffer.alloc(134);stl.writeUInt32LE(1,80);for(const [i,v] of [[0,0],[1,0],[2,1],[3,-1],[4,0],[5,0],[6,1],[7,0],[8,2],[9,0],[10,0],[11,0]])stl.writeFloatLE(v,84+i*4)
 await pick.setInputFiles({name:'one-triangle.stl',mimeType:'application/octet-stream',buffer:stl})
 await expect(page.locator('.tps-vtop strong')).toContainText('one-triangle')
 const vector=Buffer.from(new Float32Array([-1,0,0,1,0,0,0,2,0]).buffer)
 const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:36,uri:'data:application/octet-stream;base64,'+vector.toString('base64')}],bufferViews:[{buffer:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,0],max:[1,2,0]}]}
 await pick.setInputFiles({name:'local-tri.gltf',mimeType:'model/gltf+json',buffer:Buffer.from(JSON.stringify(doc))})
 await expect(page.locator('.tps-vtop strong')).toContainText('local-tri')
 check('OBJ, STL and self-contained GLTF preview locally',await page.locator('.tps-vfoot').innerText().then(s=>s.includes('1 三角面')))
 if(process.env.TRIPO_TEST_FBX_FILE){await pick.setInputFiles(process.env.TRIPO_TEST_FBX_FILE);await expect(page.locator('.tps-vtop strong')).toContainText('vCube');check('local FBX file previews without external requests',await page.locator('.tps-vfoot').innerText().then(s=>s.includes('三角面')))}
 await page.screenshot({path:path.join(evidence,'v0210-preview-formats.png'),fullPage:true})
 check('no unhandled browser errors or external contacts',errors.length===0&&external.length===0)
} catch(e){failures.push(e.message);console.error(e);const page=browser?.contexts()[0]?.pages()[0];if(page)await page.screenshot({path:path.join(evidence,'v0210-ui-failure.png'),fullPage:true}).catch(()=>{})}
finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true})}
fs.writeFileSync(path.join(evidence,'v0210-ui-results.json'),JSON.stringify({transport:'fake CN provider + real local routes',passed,failures,errors,external,paidCalls:created.length},null,2)+'\n')
console.log(`v0.2.10 UI: ${passed.length} passed, ${failures.length} failed; FAKE provider calls ${created.length}`)
if(failures.length)process.exitCode=1
