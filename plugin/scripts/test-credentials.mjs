// UI integration with real local routes and a fake upstream. No real API key.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import {fileURLToPath} from 'node:url'
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto'
import {chromium,expect} from '@playwright/test'
import {JobService} from '../server/service.js'
import {CredentialStore} from '../server/credentials.js'
import {createHandler} from '../server/routes.js'
import {hostRouter} from '../tests/fixtures/host-router.mjs'
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const evidence=path.join(root,'..','validation','v0.3.2');fs.mkdirSync(evidence,{recursive:true})
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-key-ui-')),secret=randomBytes(32),TEST_KEY='local-test-placeholder-not-a-real-Tripo-key'
const protector={supported:true,protect:b=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',secret,iv),data=Buffer.concat([c.update(b),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data])},unprotect:b=>{const d=createDecipheriv('aes-256-gcm',secret,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()])}}
let balances=0,submissions=0,queries=0,refreshRequests=0,statusFallback=true
const vault=new CredentialStore(tmp,{protector})
const service=new JobService({directory:tmp,key:'',enabled:false,credentialStore:vault,clientFactory:()=>({task:async()=>{queries++;throw Error('legacy task must not query')},balance:async()=>{balances++;return {balance:123,frozen:0}},create:async()=>{submissions++;throw Error('no generation expected')}})})
const handler=createHandler({service}),allowed=new Map([
 ['/scripts/preview.html','scripts/preview.html'],['/lib/client-v0.3.2.js','lib/client-v0.3.2.js'],
 ['/node_modules/react/umd/react.development.js','node_modules/react/umd/react.development.js'],
 ['/node_modules/react-dom/umd/react-dom.development.js','node_modules/react-dom/umd/react-dom.development.js'],
])
const routing=hostRouter(handler)
const server=http.createServer((req,res)=>{
 if(req.url.endsWith('/refresh'))refreshRequests++
 if(statusFallback && req.url==='/dsh-tripo-studio/status'){res.setHeader('content-type','text/html');return res.end('<html>PRIVATE-HOST-FALLBACK</html>')}
 const route=routing.match(req.url);if(route)return route.handler(req,res)
 const file=allowed.get(new URL(req.url,'http://localhost').pathname);if(!file){res.statusCode=404;return res.end()}
 res.setHeader('content-type',file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');res.end(fs.readFileSync(path.join(root,file)))
})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`
let browser;const passed=[],failures=[],errors=[],external=[],responses=[]
async function check(name,fn){await fn();passed.push(name);console.log('PASS',name)}
try{
 browser=await chromium.launch({...(process.env.TRIPO_TEST_BROWSER?{executablePath:process.env.TRIPO_TEST_BROWSER}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']})
 const page=await browser.newPage({viewport:{width:1320,height:1000}})
 page.on('pageerror',e=>errors.push(e.message))
 page.on('response',r=>{if(r.url().includes('/dsh-tripo-studio/'))responses.push(r.text().catch(()=>''))})
 await page.route('**/*',r=>{if(/^https?:/.test(r.request().url())&&!r.request().url().startsWith(base)){external.push(r.request().url());return r.abort()}return r.continue()})
 await page.goto(base+'/scripts/preview.html')
 await page.getByRole('button',{name:'连接设置',exact:true}).click()
 await check('fixed China endpoint and credential isolation are explained',async()=>{
  const settings=page.getByRole('region',{name:'Tripo API 密钥设置'});await expect(settings).toContainText('https://openapi.tripo3d.com/v3');await expect(settings).toContainText('旧国际站密钥');await expect(settings.getByRole('link',{name:'国内站控制台'})).toHaveAttribute('href','https://developers.tripo3d.com/zh/keys')
 })
 const region=page.getByRole('region',{name:'Tripo API 密钥设置'}),key=page.getByLabel('Tripo API 密钥',{exact:true}),save=page.getByRole('button',{name:'保存连接设置',exact:true})
 await check('HTML fallback explains backend failure and safely disables dependent controls',async()=>{
  await expect(page.getByRole('alert')).toContainText('HTTP 200');await expect(page.getByRole('alert')).toContainText('路由')
  await expect(page.getByRole('alert')).not.toContainText('PRIVATE-HOST-FALLBACK')
  await expect(key).toBeDisabled();await expect(page.getByLabel('我确认启用收费生成（仍需逐笔审批）')).toBeDisabled();await expect(page.getByRole('button',{name:/新建项目/})).toBeDisabled()
  await page.screenshot({path:path.join(evidence,'backend-reconnect-error.png'),fullPage:true,animations:'disabled'})
 })
 await check('retry restores controls without refresh, credentials or payment',async()=>{
  statusFallback=false;await page.getByRole('button',{name:'重新连接',exact:true}).click();await expect(key).toBeEnabled()
  await expect(page.getByRole('button',{name:/新建项目/})).toBeEnabled();await expect(page.getByRole('alert')).toHaveCount(0)
  const paid=page.getByLabel('我确认启用收费生成（仍需逐笔审批）');await paid.check();await expect(paid).toBeChecked();await paid.uncheck()
  if(balances||submissions||service.key)throw Error('unexpected connection side effect')
 })
 await check('password entry available before creating a project; empty save disabled',async()=>{await expect(key).toHaveAttribute('type','password');await expect(key).toBeEnabled();await expect(save).toBeDisabled()})
 await check('API key supports focus and clipboard paste',async()=>{
  await page.context().grantPermissions(['clipboard-read','clipboard-write'])
  await page.evaluate(value=>navigator.clipboard.writeText(value),TEST_KEY);await key.focus();await page.keyboard.press('Control+V');await expect(key).toHaveValue(TEST_KEY)
 })
 await check('local project can be created before saving a key',async()=>{
  await page.getByRole('button',{name:/新建项目/}).click();await expect(page.getByLabel('当前项目')).not.toHaveValue('')
  if(service.key||service.enabled||Object.keys(service.store.state.projects).length!==1||submissions)throw Error('project required credentials')
 })
 await check('visibility toggle does not require a server roundtrip',async()=>{await page.getByRole('button',{name:'显示密钥',exact:true}).click();await expect(key).toHaveAttribute('type','text');await page.getByRole('button',{name:'隐藏密钥',exact:true}).click();await expect(key).toHaveAttribute('type','password')})
 await check('paid generation defaults off and saving issues zero upstream calls',async()=>{
  await expect(page.getByLabel('我确认启用收费生成（仍需逐笔审批）')).not.toBeChecked()
  await save.click();await expect(page.getByRole('status')).toContainText('连接设置已保存');await expect(key).toHaveValue('')
  if(service.key!==TEST_KEY||service.enabled||balances||submissions)throw Error('unexpected save side effect')
  if(fs.readFileSync(vault.file,'utf8').includes(TEST_KEY))throw Error('plaintext file')
 })
 await check('balance query is explicit and does not submit generation',async()=>{
  await page.getByRole('button',{name:'查询余额（不提交生成）',exact:true}).click();await expect(region).toContainText('123')
  if(balances!==1||submissions!==0)throw Error('unexpected upstream request')
 })
 await check('paid switch can enable saved key without resending it',async()=>{
  await page.getByLabel('我确认启用收费生成（仍需逐笔审批）').check();await save.click();await expect(region).toContainText('收费开关已启用')
  if(!service.enabled||service.key!==TEST_KEY||submissions!==0)throw Error('enable side effect')
 })
 await check('secret absent from returned JSON and browser persistent storage',async()=>{
  const texts=await Promise.all(responses);if(texts.some(s=>s.includes(TEST_KEY)))throw Error('secret response')
  const storage=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));if(storage.includes(TEST_KEY))throw Error('browser stored secret')
  if(JSON.stringify(service.store.state).includes(TEST_KEY))throw Error('project state leak')
 })
 await page.getByLabel('工作台主题').selectOption('dark')
 await page.screenshot({path:path.join(evidence,'api-key-settings-desktop.png'),fullPage:true,animations:'disabled'})
 await check('reload shows status only and never repopulates password',async()=>{
  await page.reload();await page.getByRole('button',{name:'连接设置',exact:true}).click();await expect(region).toContainText('密钥已配置');await expect(key).toHaveValue('')
 })
 await check('clear requires confirmation; cancel preserves key',async()=>{
  await page.getByRole('button',{name:'清除密钥',exact:true}).click();if(service.key!==TEST_KEY)throw Error('cleared prematurely')
  await page.getByRole('button',{name:'取消清除',exact:true}).click();if(service.key!==TEST_KEY)throw Error('cancel cleared')
 })
 await check('confirmed clear disables payments, clears durable key and blocks old environment fallback',async()=>{
  await page.getByRole('button',{name:'清除密钥',exact:true}).click();await page.getByRole('button',{name:'确认清除并关闭收费',exact:true}).click()
  await expect(region).toContainText('未配置可用密钥');await expect(page.getByRole('button',{name:'查询余额（不提交生成）',exact:true})).toBeDisabled()
  if(service.key||service.enabled)throw Error('clear runtime')
  const restart=new JobService({directory:tmp,key:'environment-should-not-return',enabled:true,credentialStore:vault})
  if(restart.key||restart.enabled)throw Error('environment re-enabled')
 })
 await check('narrow and night layouts keep settings accessible',async()=>{
  await page.setViewportSize({width:390,height:844});await expect(key).toBeVisible()
  if(await page.locator('.tw-root').evaluate(el=>el.scrollWidth>el.clientWidth+1))throw Error('overflow')
  await page.screenshot({path:path.join(evidence,'api-key-settings-mobile.png'),fullPage:true,animations:'disabled'})
 })
 await check('legacy jobs are visible but cannot be submitted, queried or retried in CN UI',async()=>{
  const project=Object.values(service.store.state.projects)[0]
  for(const status of ['awaiting_approval','queued','success']){
   const job=service.prepare(project.id,{kind:'text-to-image',label:'Legacy '+status,params:{prompt:'fixture'}}),raw=service.store.state.jobs[job.id]
   delete raw.site;raw.status=status;if(status!=='awaiting_approval')raw.taskId='task_legacy';if(status==='success')raw.downloadStatus='download_failed'
  }
  service.store.save();refreshRequests=0
  await page.setViewportSize({width:1320,height:1000});await page.reload();await page.getByRole('button',{name:'交付与导入'}).click()
  await expect(page.locator('.tw-job')).toHaveCount(3);await expect(page.getByText('历史任务已隔离：',{exact:false})).toHaveCount(3)
  await expect(page.getByRole('button',{name:/审阅 .* 个未提交草稿/})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'重试保存输出（不重新生成）',exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:/恢复跟踪|停止跟踪/})).toHaveCount(0)
  await page.waitForTimeout(6500);if(refreshRequests||queries||submissions)throw Error('legacy auto polling')
  await page.getByRole('button',{name:'刷新任务（只查询，不重提）',exact:true}).click();await expect(page.locator('.tw-job')).toHaveCount(3)
  if(queries||submissions)throw Error('legacy provider traffic')
  await page.screenshot({path:path.join(evidence,'legacy-site-isolation.png'),fullPage:true,animations:'disabled'})
 })
 await check('no real provider traffic, generation requests or unhandled errors',async()=>{if(external.length||submissions||queries||errors.length)throw Error(JSON.stringify({external,submissions,errors}))})
}catch(e){failures.push(e.message);console.error(e)}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true})}
fs.writeFileSync(path.join(evidence,'credentials-ui-results.json'),JSON.stringify({scope:'real local routes; test-only encryption provider and fake Tripo upstream; real DPAPI tested separately on Windows',passed,failures,errors,external,paidApiCalls:0},null,2)+'\n')
console.log(`Credentials UI: ${passed.length} passed, ${failures.length} failed`);if(failures.length)process.exitCode=1
