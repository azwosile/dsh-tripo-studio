import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto'
import {CredentialStore,windowsProtector,validateKey} from '../server/credentials.js'
import {JobService} from '../server/service.js'
import {createHandler} from '../server/routes.js'
import {redact} from '../server/tripo.js'
const A='test-only-account-A-not-a-real-key',B='test-only-account-B-not-a-real-key'
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-credentials-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir}
// Test seam only. Production always uses Windows DPAPI, not this fixture cipher.
function protector(){const secret=randomBytes(32);return {supported:true,protect:b=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',secret,iv);const encrypted=Buffer.concat([c.update(b),c.final()]);return Buffer.concat([iv,c.getAuthTag(),encrypted])},unprotect:b=>{const c=createDecipheriv('aes-256-gcm',secret,b.subarray(0,12));c.setAuthTag(b.subarray(12,28));return Buffer.concat([c.update(b.subarray(28)),c.final()])}}}
const params={kind:'text-to-image',params:{prompt:'成年角色完整全身',model:'chat_image_2.5_flare',size:'1024x1536',quality:'low'}}
test('credential validation never repeats submitted values',()=>{
  assert.equal(validateKey(' '+A+' '),A)
  for(const k of ['',null,'bad\nkey','x'.repeat(4097)])assert.throws(()=>validateKey(k),e=>e.code==='INVALID_CREDENTIAL'&&!e.message.includes('bad\nkey'))
})
test('secure persistence round-trips without plaintext in file or project state',t=>{
  const dir=fixture(t),vault=new CredentialStore(dir,{protector:protector()});let network=0
  const make=()=>new JobService({directory:dir,key:'environment-fallback',enabled:false,credentialStore:vault,clientFactory:key=>({key,create(){network++;throw Error('unexpected')}})})
  const service=make(),status=service.configureCredentials({key:A,paidEnabled:false,remember:true})
  assert.equal(status.keyConfigured,true);assert.equal(status.paidEnabled,false);assert.equal(status.credentials.source,'saved');assert.ok(!JSON.stringify(status).includes(A))
  assert.ok(!fs.readFileSync(vault.file,'utf8').includes(A));assert.ok(!JSON.stringify(service.store.state).includes(A))
  const restored=make();assert.equal(restored.key,A);assert.equal(restored.enabled,false);assert.equal(network,0)
})
test('session-only configuration does not overwrite the saved credential',t=>{
  const dir=fixture(t),vault=new CredentialStore(dir,{protector:protector()});vault.save(A,false);const before=fs.readFileSync(vault.file)
  const service=new JobService({directory:dir,credentialStore:vault});service.configureCredentials({key:B,paidEnabled:true,remember:false})
  assert.equal(service.key,B);assert.equal(service.credentialSource,'session');assert.deepEqual(fs.readFileSync(vault.file),before)
  assert.equal(new JobService({directory:dir,credentialStore:vault}).key,A)
})
test('clear disables runtime and persisted key and blocks environment fallback after restart',t=>{
  const dir=fixture(t),vault=new CredentialStore(dir,{protector:protector()});vault.save(A,true)
  const s=new JobService({directory:dir,key:B,enabled:true,credentialStore:vault});s.clearCredentials()
  assert.equal(s.key,'');assert.equal(s.enabled,false)
  assert.deepEqual(JSON.parse(fs.readFileSync(vault.file,'utf8')),{version:2,site:'cn',cleared:true})
  const again=new JobService({directory:dir,key:B,enabled:true,credentialStore:vault});assert.equal(again.key,'');assert.equal(again.enabled,false)
})
test('corrupt secure storage fails closed without overwriting or using environment key',t=>{
  const dir=fixture(t),vault=new CredentialStore(dir,{protector:protector()});fs.mkdirSync(vault.directory);fs.writeFileSync(vault.file,'corrupt')
  const s=new JobService({directory:dir,key:A,enabled:true,credentialStore:vault});assert.equal(s.key,'');assert.equal(s.enabled,false);assert.equal(s.status().credentials.storageError,true)
  assert.equal(fs.readFileSync(vault.file,'utf8'),'corrupt')
})
test('unsupported or failed encryption cannot save plaintext or change runtime credentials',t=>{
  const dir=fixture(t),vault=new CredentialStore(dir,{protector:{supported:false}}),s=new JobService({directory:dir,key:A,enabled:false,credentialStore:vault})
  assert.throws(()=>s.configureCredentials({key:B,paidEnabled:true,remember:true}),e=>e.code==='SECURE_STORAGE_UNAVAILABLE')
  assert.equal(s.key,A);assert.equal(s.enabled,false);assert.equal(fs.existsSync(vault.file),false)
  s.configureCredentials({key:B,paidEnabled:false,remember:false});assert.equal(s.key,B)
})
test('changed key invalidates old approvals; busy service blocks configuration',async t=>{
  const dir=fixture(t),s=new JobService({directory:dir,key:A,enabled:true});const p=s.store.newProject('Account guard'),job=s.prepare(p.id,params)
  s.configureCredentials({key:B,paidEnabled:true,remember:false})
  await assert.rejects(()=>s.submit(p.id,job.id,job.approvalHash),e=>e.code==='ACCOUNT_CHANGED')
  s.locks.add('running-operation');assert.throws(()=>s.clearCredentials(),e=>e.code==='CREDENTIAL_BUSY');assert.equal(s.key,B)
  s.locks.clear();s.refreshing.set('project',Promise.resolve());assert.throws(()=>s.configureCredentials({key:A,paidEnabled:true,remember:false}),e=>e.code==='CREDENTIAL_BUSY')
})
test('DPAPI transport uses stdin only and sanitizes child-process failures',()=>{
  let args,options
  const p=windowsProtector({platform:'win32',run:(exe,a,o)=>{args=a;options=o;return Buffer.from('fake-cipher').toString('base64')}})
  p.protect(Buffer.from(A));assert.ok(!JSON.stringify(args).includes(A));assert.equal(options.input,Buffer.from(A).toString('base64'))
  const broken=windowsProtector({platform:'win32',run:()=>{throw Error('PowerShell stderr: '+A)}})
  assert.throws(()=>broken.protect(Buffer.from(A)),e=>e.code==='SECURE_STORAGE_FAILED'&&!e.message.includes(A))
})
test('redaction occurs before truncating a long credential',()=>{
  const key='plain-test-'+('X'.repeat(2000)),text=redact('provider echoed '+key,key)
  assert.equal(text,'provider echoed [REDACTED]');assert.ok(!text.includes('XXXXX'))
})
test('real Windows DPAPI encrypts and decrypts under current user',{skip:process.platform!=='win32'},t=>{
  const dir=fixture(t),vault=new CredentialStore(dir);vault.save(A,false)
  assert.ok(!fs.readFileSync(vault.file,'utf8').includes(A));assert.equal(vault.load().key,A);vault.clear();assert.equal(vault.load().key,'')
})
test('HTTP credentials require same origin + CSRF, never return secrets, and block in-flight changes',async t=>{
  const directory=fixture(t),vault=new CredentialStore(directory,{protector:protector()});let release,started
  const begun=new Promise(r=>started=r)
  const s=new JobService({directory,key:'',enabled:false,credentialStore:vault,clientFactory:key=>({balance:async()=>{started();await new Promise(r=>release=r);throw Error('provider echo '+key)}})})
  const server=http.createServer(createHandler({service:s}));await new Promise(r=>server.listen(0,'127.0.0.1',r))
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r))})
  const base=`http://127.0.0.1:${server.address().port}/dsh-tripo-studio`;let csrf=''
  const req=async(p,method='GET',body,headers={})=>{const r=await fetch(base+p,{method,headers:{'x-tripo-studio':'1','content-type':'application/json','x-tripo-csrf':csrf,...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}}
  const body={key:A,paidEnabled:false,remember:true}
  assert.equal((await req('/credentials','PUT',body)).status,403)
  csrf=(await req('/status')).body.csrfToken
  assert.equal((await req('/credentials','PUT',body,{origin:'https://evil.invalid'})).status,403)
  assert.equal((await req('/credentials','PUT',body,{'x-forwarded-for':'1.1.1.1'})).status,403)
  assert.equal((await req('/credentials','PUT',body,{'x-tripo-studio':''})).status,403)
  assert.equal((await req('/credentials','GET')).status,405)
  assert.equal((await req('/credentials','PUT',{...body,key:'x'.repeat(9000)})).status,413)
  const saved=await req('/credentials','PUT',body);assert.equal(saved.status,200);assert.ok(!JSON.stringify(saved).includes(A))
  assert.equal((await req('/status')).body.paidEnabled,false)
  const pending=req('/balance');await begun
  assert.equal((await req('/credentials','PUT',{...body,key:B})).status,409)
  assert.equal(s.key,A);release();const error=await pending;assert.ok(!JSON.stringify(error).includes(A));assert.match(error.body.error,/REDACTED/)
  assert.equal((await req('/credentials','DELETE',{})).status,400)
  assert.equal((await req('/credentials','DELETE',{confirm:true})).status,200)
  assert.equal((await req('/status')).body.keyConfigured,false)
})
