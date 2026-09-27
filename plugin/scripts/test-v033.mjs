// 0.3.3 (REQ-067～072): unified modelling with 主要/次要/基准 = 绿/蓝/红, split-sheet covers, 文生图/图生图 tabs,
// balance next to the batch estimate and usage backfill. Real local HTTP, isolated data, fake supplier (GET only).
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
const evidence=path.join(root,'..','validation','v0.3.3');fs.mkdirSync(evidence,{recursive:true})
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v033-ui-')),calls=[]
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
const usageRows=[]
const client={
  balance:async()=>{calls.push(['balance']);return {balance:123.456,frozen:7}},
  usage:async()=>{calls.push(['usage']);return usageRows},
  task:async id=>{calls.push(['task',id]);throw Error('NO TASK QUERY EXPECTED')},create:async()=>{calls.push(['create']);throw Error('NO PAID SUBMIT EXPECTED')},upload:async()=>{calls.push(['upload']);throw Error('NO UPLOAD EXPECTED')}}
const service=new JobService({directory:temp,key:'FAKE_LOCAL_V033',enabled:true,client}),s=service.store
const p=s.newProject('0.3.3隔离测试')
const A=s.addAsset(p.id,png,{label:'拆件图A'})
const part=(label,priority)=>s.addAsset(p.id,png,{label,priority,sourceAssetId:A.id})
const hair=part('头发','high'),shoes=part('鞋子','normal'),socks=part('长袜','normal'),body=part('身体','base')
const B=s.addAsset(p.id,png,{label:'立绘B'})
s.updateProject(p.id,{revision:0,draft:{selectedAsset:A.id}})
const params=id=>({input_asset:id,model:'v3.1-20260211',face_limit:50000,texture:true,pbr:true})
// A finished split-sheet task that covers 鞋子 (REQ-067/072), with a fake task id the usage record will match.
const sheetJob=service.prepare(p.id,{kind:'image-to-model',role:'sheet',priority:'normal',label:'整张拆件图「拆件图A」',covers:[shoes.id],params:params(A.id)})
const sheetModel=s.addAsset(p.id,glb,{label:'拆件图A模型',kind:'model',format:'glb',sourceJobId:sheetJob.id})
Object.assign(s.job(p.id,sheetJob.id),{status:'success',taskId:'task_fake_sheet01',downloadStatus:'downloaded',assetIds:[sheetModel.id],tracking:false})
usageRows.push({task_id:'task_fake_sheet01',type:'image_to_model',credits_consumed:30,created_at:'2026-09-27T00:00:00Z'},{task_id:'task_other_account',type:'text_to_image',credits_consumed:10,created_at:'2026-09-27T00:00:00Z'})
s.save()
const handler=createHandler({service}),router=hostRouter(handler)
const allowed=new Map([['/scripts/preview.html',['scripts/preview.html','text/html']],['/lib/client-v0.3.3.js',['lib/client-v0.3.3.js','text/javascript']],['/node_modules/react/umd/react.development.js',['node_modules/react/umd/react.development.js','text/javascript']],['/node_modules/react-dom/umd/react-dom.development.js',['node_modules/react-dom/umd/react-dom.development.js','text/javascript']]])
const server=http.createServer((req,res)=>{const route=router.match(req.url);if(route)return route.handler(req,res);const file=allowed.get(new URL(req.url,'http://localhost').pathname);if(!file){res.statusCode=404;return res.end()}res.setHeader('content-type',file[1]);res.end(fs.readFileSync(path.join(root,file[0])))})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const base=`http://127.0.0.1:${server.address().port}`,passed=[],failures=[],errors=[],external=[]
let browser,page
const check=(name,ok)=>{(ok?passed:failures).push(name);console.log(`${ok?'PASS':'FAIL'} ${name}`)}
const paid=()=>calls.filter(c=>['create','upload','task'].includes(c[0])).length
try {
  browser=await chromium.launch({...(process.env.TRIPO_TEST_BROWSER?{executablePath:process.env.TRIPO_TEST_BROWSER}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']})
  page=await browser.newPage({viewport:{width:1440,height:1000}})
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',route=>{const u=route.request().url();if(/^https?:/.test(u)&&!u.startsWith(base+'/')){external.push(u);return route.abort()}return route.continue()})
  await page.goto(base+'/scripts/preview.html');await expect(page.locator('.tw-steps')).toBeVisible()
  const upgrade=page.locator('.tw-upgrade');if(await upgrade.count())await upgrade.getByRole('button',{name:'知道了'}).click()
  const dialog=page.getByRole('dialog',{name:'收费任务确认'})

  // REQ-069: 文生图 / 图生图 are two explicit tabs; the button says which one runs.
  const tabs=page.getByRole('tablist',{name:'生成方式'}),textTab=tabs.getByRole('tab',{name:/文生图/}),imageTab=tabs.getByRole('tab',{name:/图生图/})
  await expect(textTab).toHaveAttribute('aria-selected','true')
  check('文生图 is the default tab and its button names the mode',await page.getByRole('button',{name:'文生图 · 生成 1 张 · 先确认',exact:true}).count()===1&&await page.getByRole('button',{name:/^图生图 · /}).count()===0)
  check('canvas states that 文生图 ignores the selected image',await page.locator('.tw-gen-mode-note').innerText().then(t=>t.includes('文生图模式')&&t.includes('不使用这张图')))
  await page.getByLabel('角色提示词').fill('完整成年角色，干净背景')
  await page.getByRole('button',{name:'文生图 · 生成 1 张 · 先确认',exact:true}).click();await expect(dialog).toBeVisible()
  const t2i=JSON.parse(await dialog.locator('pre').innerText())
  check('文生图 approval says no image is uploaded and has no input_asset',await dialog.innerText().then(t=>t.includes('文生图 · 只用提示词')&&t.includes('不上传任何图片'))&&!('input_asset' in t2i))
  await dialog.getByRole('button',{name:'取消并丢弃草稿'}).click();await expect(dialog).toHaveCount(0)
  await imageTab.click();await expect(imageTab).toHaveAttribute('aria-selected','true')
  check('图生图 tab names the input image and swaps the footer buttons',await imageTab.innerText().then(t=>t.includes('拆件图A'))&&await page.getByRole('button',{name:'图生图 · 生成改写图 · 先确认',exact:true}).count()===1&&await page.getByRole('button',{name:/^文生图 · /}).count()===0)
  check('go-bar summary follows the mode',await page.getByRole('region',{name:'吸底快捷操作'}).count()===0||await page.getByRole('region',{name:'吸底快捷操作'}).innerText().then(t=>t.includes('图生图')))
  await page.screenshot({path:path.join(evidence,'v033-image-to-image-tab.png'),fullPage:false})
  await page.getByRole('button',{name:'图生图 · 生成改写图 · 先确认',exact:true}).click();await expect(dialog).toBeVisible()
  const i2i=JSON.parse(await dialog.locator('pre').innerText())
  check('图生图 approval shows the input thumbnail and input_asset',i2i.input_asset===A.id&&await dialog.locator('.tw-approval-input img').count()===1&&await dialog.innerText().then(t=>t.includes('图生图 · 以参考图为输入')&&t.includes('图生图输入图：拆件图A')))

  // REQ-071: balance next to the batch estimate; one explicit GET, never automatic.
  check('balance is not queried automatically',!calls.some(c=>c[0]==='balance'))
  const est=dialog.getByRole('group',{name:'余额与参考积分'})
  check('approval shows a reference-credit total for the batch',await est.innerText().then(t=>/本批参考积分：\d+/.test(t)&&t.includes('未查询')))
  await est.getByRole('button',{name:'查询余额（不提交）'}).click()
  await expect(est).toContainText('账户可用 123.46')
  check('balance query shows available, frozen and remaining after this batch',await est.innerText().then(t=>t.includes('冻结 7')&&t.includes('提交后约剩'))&&calls.filter(c=>c[0]==='balance').length===1)
  await page.screenshot({path:path.join(evidence,'v033-approval-balance.png'),fullPage:false})
  await dialog.getByRole('button',{name:'取消并丢弃草稿'}).click();await expect(dialog).toHaveCount(0)
  check('app bar pill shows the queried balance',await page.locator('.tw-balance-pill').innerText().then(t=>t.includes('123.46')))

  // REQ-067: one modelling page, colour = how it is built.
  const steps=await page.locator('.tw-steps button').allTextContents()
  check('step 3 is the unified modelling page',steps.some(t=>t.includes('统一建模'))&&!steps.some(t=>t.includes('整体与部件建模')))
  await page.locator('.tw-steps button').nth(2).click()
  const legend=page.getByLabel('建模角色图例')
  check('legend maps 主要=绿, 次要=蓝, 基准=红',await legend.innerText().then(t=>t.includes('主要 · 绿色')&&t.includes('次要 · 蓝色')&&t.includes('基准 · 红色')))
  const badge=async label=>page.locator('.tw-role-card').filter({hasText:label}).locator('.tw-role-badge').evaluate(el=>getComputedStyle(el).backgroundColor)
  check('role badges are green / blue / red',await badge('头发')==='rgb(47, 138, 79)'&&await badge('鞋子')==='rgb(47, 111, 191)'&&await badge('身体')==='rgb(194, 65, 47)')
  for(const n of ['头发','鞋子','长袜','身体'])await page.getByRole('checkbox',{name:`加入建模：${n}`}).check()
  await expect(page.getByLabel('整张拆件图',{exact:true})).toHaveValue(A.id)
  check('split sheet is inferred from the crop source of the 次要 parts',await page.locator('.tw-sheet-plan').innerText().then(t=>t.includes('已自动推断')&&t.includes('覆盖 2 个已勾选次要部件')))
  const summary=page.getByLabel('本次建模任务')
  check('summary counts sheet(次要×2) + 主要 1 + 基准 1 = 3 tasks',await summary.innerText().then(t=>t.includes('3')&&t.includes('拆件图 1（次要 2）')&&t.includes('主要 1')&&t.includes('基准 1')))
  await page.screenshot({path:path.join(evidence,'v033-unified-plan.png'),fullPage:true})
  await page.getByRole('button',{name:'审阅建模 · 3 个任务',exact:true}).click();await expect(dialog).toBeVisible()
  await expect(dialog.locator('article')).toHaveCount(3)
  const drafts=service.store.snapshot(p.id).jobs.filter(j=>j.status==='awaiting_approval'&&j.kind==='image-to-model')
  const sheetDraft=drafts.find(j=>j.role==='sheet')
  check('one sheet draft covers exactly the two 次要 parts; 主要/基准 are separate drafts',drafts.length===3&&sheetDraft?.params.input_asset===A.id&&[...sheetDraft.covers].sort().join()===[shoes.id,socks.id].sort().join()&&drafts.some(j=>j.params.input_asset===hair.id&&j.priority==='high')&&drafts.some(j=>j.params.input_asset===body.id&&j.priority==='base'))
  check('approval explains the sheet task',await dialog.innerText().then(t=>t.includes('整张拆件图 · 代替 2 个次要部件')))
  await dialog.getByRole('button',{name:'取消并丢弃草稿'}).click();await expect(dialog).toHaveCount(0)
  // Re-tag 长袜 as 主要 with the green/blue/red switch: it leaves the sheet and becomes its own task.
  const socksCard=page.locator('.tw-role-card').filter({hasText:'长袜'})
  await socksCard.getByRole('button',{name:'主要',exact:true}).click();await expect(socksCard).toHaveAttribute('data-role','high')
  check('role switch persists the priority and re-plans (sheet + 3 individual = 4)',service.store.state.assets[socks.id].priority==='high'&&await page.getByRole('button',{name:'审阅建模 · 4 个任务',exact:true}).count()===1)
  check('no paid calls while planning',paid()===0)

  // REQ-072: source → parts page speaks the same colours and shows the covering sheet task.
  await page.locator('.tw-steps button').nth(4).click()
  const rel=page.getByRole('region',{name:'来源与部件对应关系'}),groupA=rel.locator(`[data-root-id="${A.id}"]`)
  check('the split sheet group is marked',await groupA.evaluate(el=>el.classList.contains('is-sheet'))&&await groupA.getByRole('button',{name:'设为整张拆件图：拆件图A'}).isDisabled())
  const shoesRow=groupA.locator(`[data-asset-id="${shoes.id}"]`)
  check('次要 part shows the sheet model that covers it',await shoesRow.getAttribute('data-role')==='normal'&&await shoesRow.innerText().then(t=>t.includes('随整张拆件图建模')&&t.includes('整张拆件图 · 次要×1')))
  check('relation rows carry the same role switch',await groupA.getByRole('group',{name:'头发建模角色'}).count()===1)
  await groupA.getByRole('group',{name:'身体建模角色'}).getByRole('button',{name:'次要',exact:true}).click()
  await expect(groupA.locator(`[data-asset-id="${body.id}"]`)).toHaveAttribute('data-role','normal')
  check('re-tagging on the relation page updates the plan button',await page.getByRole('button',{name:'去统一建模页审阅（3 个任务）'}).count()===1)
  await page.screenshot({path:path.join(evidence,'v033-relations.png'),fullPage:true})
  check('task card names the kind and role',await page.locator(`[data-job-id="${sheetJob.id}"]`).innerText().then(t=>t.includes('图生3D · 整张拆件图 · 次要×1')))

  // REQ-071: usage record backfills real credits (GET /account/usage, read-only).
  await page.getByRole('button',{name:'连接设置',exact:true}).click()
  await page.getByRole('button',{name:'同步实扣积分（用量记录）'}).click()
  await expect(page.locator('.tw-usage-line')).toContainText('匹配本项目 1 个任务')
  check('usage sync writes creditsConsumed from the usage record',service.store.state.jobs[sheetJob.id].creditsConsumed===30&&service.store.state.jobs[sheetJob.id].creditsSource==='usage')
  await expect(page.locator(`[data-job-id="${sheetJob.id}"]`)).toContainText('（来自用量记录）')
  check('only balance/usage GETs reached the fake supplier',paid()===0&&calls.every(c=>['balance','usage'].includes(c[0])))
  check('no page errors or external requests',errors.length===0&&external.length===0)
} catch(e){failures.push(e.message);console.error(e);if(page)await page.screenshot({path:path.join(evidence,'v033-ui-failure.png'),fullPage:true}).catch(()=>{})}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true})}
fs.writeFileSync(path.join(evidence,'v033-ui-results.json'),JSON.stringify({passed,failures,errors,external,calls,realProviderCalls:0},null,2)+'\n')
console.log(JSON.stringify({passed:passed.length,failed:failures.length}));if(failures.length||errors.length||external.length)process.exitCode=1
