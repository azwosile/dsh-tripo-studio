// 0.4.0: 浏览器级双站隔离、DSH Web 登录和退出。全部使用模拟供应商。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import {fileURLToPath} from 'node:url'
import {chromium,expect} from '@playwright/test'
import {createHandler} from '../server/routes.js'
import {JobService} from '../server/service.js'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const out=path.resolve(root,'..','validation','v0.4.0');fs.mkdirSync(out,{recursive:true})
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-v040-ui-'))
const token='FAKE_WEB_TEST_ACCESS_ONLY_'.repeat(3),calls=[],errors=[],external=[],checks=[]
const check=(name,ok)=>{checks.push({name,ok});console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)throw Error(name)}
const service=new JobService({directory:temp,key:'',enabled:false,clientFactory:(key,site)=>({create:async()=>{calls.push({key,site,op:'create'});throw Error('不允许真实生成')},task:async()=>{calls.push({key,site,op:'task'});throw Error('不允许云端查询')}})})
let handler,browser,page
const allowed=new Map([['/scripts/preview.html',['scripts/preview.html','text/html']],['/lib/client-v0.4.0.js',['lib/client-v0.4.0.js','text/javascript']],['/node_modules/react/umd/react.development.js',['node_modules/react/umd/react.development.js','text/javascript']],['/node_modules/react-dom/umd/react-dom.development.js',['node_modules/react-dom/umd/react-dom.development.js','text/javascript']]])
const server=http.createServer((req,res)=>{if(req.url.startsWith('/dsh-tripo-studio/'))return handler(req,res);const file=allowed.get(new URL(req.url,'http://localhost').pathname);if(!file){res.statusCode=404;return res.end()}res.setHeader('content-type',file[1]);res.end(fs.readFileSync(path.join(root,file[0])))})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const base=`http://127.0.0.1:${server.address().port}`
handler=createHandler({service,accessMode:'web',allowedOrigins:[base],webToken:token})
try {
 browser=await chromium.launch({...(process.env.TRIPO_TEST_BROWSER?{executablePath:process.env.TRIPO_TEST_BROWSER}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']})
 page=await browser.newPage({viewport:{width:1440,height:1000}})
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',r=>{const url=r.request().url();if(/^https?:/.test(url)&&!url.startsWith(base+'/')){external.push(url);return r.abort()}return r.continue()})
 await page.goto(base+'/scripts/preview.html')
 const login=page.getByLabel('DSH Web 访问口令',{exact:true});await expect(login).toBeVisible()
 check('未经 Web 登录，新建项目保持禁用',await page.getByRole('button',{name:'＋ 新建项目'}).isDisabled())
 await login.fill('wrong-test-token');await page.getByRole('button',{name:'登录工作台',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Web 访问口令无效')
 check('错误口令没有建立会话',await page.context().cookies().then(c=>!c.some(x=>x.name==='tripo_studio_session')))
 await login.fill(token);await page.getByRole('button',{name:'登录工作台',exact:true}).click();await expect(page.getByRole('button',{name:'＋ 新建项目'})).toBeEnabled()
 const cookie=(await page.context().cookies()).find(c=>c.name==='tripo_studio_session')
 check('登录建立 HttpOnly / Strict Cookie（仅测试回环 HTTP）',cookie?.httpOnly===true&&cookie.sameSite==='Strict')
 await page.getByRole('button',{name:'连接设置',exact:true}).click()
 const settings=page.getByRole('region',{name:'Tripo API 密钥设置'});await expect(settings).toBeVisible()
 await settings.getByLabel('Tripo API 密钥',{exact:true}).fill('FAKE_CN_BROWSER_ONLY')
 await settings.getByLabel('我确认启用收费生成（仍需逐笔审批）').check()
 await settings.getByRole('button',{name:'保存连接设置',exact:true}).click();await expect(settings).toContainText('收费开关已启用')
 await settings.getByLabel('Tripo API 站点',{exact:true}).selectOption('international')
 check('仅选择选项不会立即切站',service.site==='cn'&&service.key==='FAKE_CN_BROWSER_ONLY')
 await settings.getByRole('button',{name:'确认切换站点并关闭收费',exact:true}).click();await expect(page.locator('.tw-brand')).toContainText('国际站')
 await expect(settings).toContainText('https://openapi.tripo3d.ai/v3');await expect(settings).toContainText('未配置可用密钥')
 check('国际站没有继承国内站密钥，且收费已关闭',service.key===''&&service.enabled===false)
 await settings.getByLabel('Tripo API 密钥',{exact:true}).fill('FAKE_INT_BROWSER_ONLY')
 await settings.getByRole('button',{name:'保存连接设置',exact:true}).click();await expect(settings).toContainText('密钥已配置')
 await settings.getByLabel('Tripo API 站点',{exact:true}).selectOption('cn');await settings.getByRole('button',{name:'确认切换站点并关闭收费',exact:true}).click();await expect(page.locator('.tw-brand')).toContainText('国内站')
 check('切回国内站只恢复本次运行对应密钥，收费仍关闭',service.key==='FAKE_CN_BROWSER_ONLY'&&service.enabled===false)
 check('密钥和 Web 口令没有写入浏览器存储',await page.evaluate(()=>!JSON.stringify({local:{...localStorage},session:{...sessionStorage}}).includes('FAKE_')))
 await page.getByRole('button',{name:'＋ 新建项目'}).click();await expect(page.getByLabel('当前项目',{exact:true})).toContainText('角色项目')
 check('登录后可以创建服务器项目，无供应商调用',Object.keys(service.store.state.projects).length===1&&calls.length===0)
 await page.screenshot({path:path.join(out,'v040-site-web.png')})
 await page.getByRole('button',{name:'退出 Web 会话',exact:true}).click();await expect(login).toBeVisible()
 check('退出清除 Cookie 并禁用项目操作',!(await page.context().cookies()).some(c=>c.name==='tripo_studio_session')&&await page.getByRole('button',{name:'＋ 新建项目'}).isDisabled())
 check('浏览器无脚本错误、无外部请求、无供应商调用',errors.length===0&&external.length===0&&calls.length===0)
} catch(error) {checks.push({name:'浏览器测试完成',ok:false,error:error.message});console.error(error);if(page)await page.screenshot({path:path.join(out,'v040-failure.png')}).catch(()=>{})}
finally {await browser?.close();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true})}
const result={version:'0.4.0',generatedAt:new Date().toISOString(),passed:checks.filter(x=>x.ok).length,failed:checks.filter(x=>!x.ok).length,checks,errors,external,providerCalls:calls,disclaimer:'模拟供应商；未消耗积分，非原生 DSH Web 完整应用验收。'}
fs.writeFileSync(path.join(out,'v040-results.json'),JSON.stringify(result,null,2)+'\n')
if(result.failed)process.exitCode=1
