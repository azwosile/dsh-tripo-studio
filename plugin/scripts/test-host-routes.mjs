// Real installed DSH WebServer + Cordis, on an ephemeral loopback port.
// Does NOT launch DSH Desktop, use its profile, or access existing credentials.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import * as plugin from '../index.js'
const modules=process.env.DSH_APP_NODE_MODULES || (process.platform==='win32'?'D:/DeepSeek Harness/DSH Desktop/resources/app/node_modules':null)
if(!modules)throw Error('Set DSH_APP_NODE_MODULES to an actual installed DSH runtime; this test does not substitute a mock.')
const req=createRequire(path.join(modules,'..','package.json'))
const {Context}=await import(pathToFileURL(req.resolve('@deepseek-ai/cordis')))
const {WebServer}=await import(pathToFileURL(req.resolve('@deepseek-ai/dsh-host-webserver')))
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-real-host-'))
process.env.TRIPO_STUDIO_DATA_DIR=dir
process.env.TRIPO_CN_API_KEY=''
process.env.TRIPO_CN_ENABLE_PAID='0'
const ctx=new Context();let serverFiber,pluginFiber,fallback
const wait=async predicate=>{for(let n=0;n<200;n++){if(predicate())return;await new Promise(r=>setTimeout(r,20))}throw Error('Cordis lifecycle timeout')}
try{
 serverFiber=ctx.plugin(WebServer,{host:'127.0.0.1',port:0,compression:'none',compressionLevel:6,compressionThresholdBytes:1024})
 await wait(()=>ctx.webServer?.port)
 const server=ctx.webServer,base=`http://127.0.0.1:${server.port}`
 fallback=server.registerFallback((req,res)=>{res.setHeader('content-type','text/html');res.end('<html>DSH fallback fixture</html>')})
 const legacy=server.register({kind:'prefix',path:'/dsh-tripo-studio/',handler:(req,res)=>res.end('should not match')})
 let response=await fetch(base+'/dsh-tripo-studio/status',{headers:{'x-tripo-studio':'1'}})
 assert.match(response.headers.get('content-type'),/text\/html/);await response.text();legacy()
 console.log('PASS: reproduces 0.2.3 HTML fallback through actual DSH WebServer')
 pluginFiber=ctx.plugin(plugin,{demoMode:false})
 await wait(()=>server.match('/dsh-tripo-studio/status'))
 assert.equal(server.match('/dsh-tripo-studio-evil/status'),undefined)
 response=await fetch(base+'/dsh-tripo-studio/status',{headers:{'x-tripo-studio':'1'}})
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/json/)
 const status=await response.json();assert.equal(status.version,'0.3.2');assert.equal(status.keyConfigured,false);assert.equal(status.paidEnabled,false)
 assert.equal(status.site,'cn');assert.equal(status.apiBase,'https://openapi.tripo3d.com/v3')
 assert.match(status.csrfToken,/^[a-f0-9]{64}$/)
 console.log('PASS: fixed plugin status reaches real handler without any API key')
 const headers={'x-tripo-studio':'1','content-type':'application/json','x-tripo-csrf':status.csrfToken}
 response=await fetch(base+'/dsh-tripo-studio/projects',{method:'POST',headers,body:JSON.stringify({name:'Real host fixture'})})
 assert.equal(response.status,201);const project=await response.json();assert.ok(project.id)
 console.log('PASS: creates local project through actual host routing without credentials or payment')
 response=await fetch(base+'/dsh-tripo-studio/credentials',{method:'PUT',headers,body:JSON.stringify({key:'TEST-ONLY-NOT-A-REAL-TRIPO-KEY',remember:false,paidEnabled:false})})
 assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.keyConfigured,true);assert.equal(saved.paidEnabled,false);assert.ok(!JSON.stringify(saved).includes('TEST-ONLY'))
 console.log('PASS: credential save reaches handler; no plaintext readback; paid remains disabled')
 response=await fetch(base+'/dsh-tripo-studio/credentials',{method:'DELETE',headers:{...headers,'x-tripo-csrf':''},body:'{"confirm":true}'})
 assert.equal(response.status,403);await response.text()
 response=await fetch(base+'/dsh-tripo-studio/status',{headers:{'x-tripo-studio':'1',origin:'https://evil.invalid'}})
 assert.equal(response.status,403);await response.text()
 console.log('PASS: CSRF and cross-origin guards still reject through actual host')
 response=await fetch(base+'/dsh-tripo-studio/credentials',{method:'DELETE',headers,body:'{"confirm":true}'})
 assert.equal(response.status,200);assert.equal((await response.json()).keyConfigured,false)
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'secrets','connection-cn.json'),'utf8')).cleared,true)
 pluginFiber.dispose();await wait(()=>!server.match('/dsh-tripo-studio/status'));pluginFiber=null
 console.log('PASS: clear uses isolated test directory; disposing plugin unregisters route')
 console.log('Actual DSH host routes: 6 checks passed; no real provider requests; not an Electron GUI acceptance.')
}finally{
 pluginFiber?.dispose();fallback?.();serverFiber?.dispose()
 await new Promise(r=>setTimeout(r,100));fs.rmSync(dir,{recursive:true,force:true})
}
