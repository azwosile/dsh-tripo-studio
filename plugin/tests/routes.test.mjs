import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHandler} from '../server/routes.js'
const png = fs.readFileSync(new URL('./fixtures/reference.png', import.meta.url))
test('same-origin HTTP routes: CSRF, host, proxy, local import, project scope, paid disabled', async t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tripo-http-test-'))
  const server=http.createServer(createHandler({directory,key:'',enabled:false}))
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(directory,{recursive:true,force:true})})
  const base=`http://127.0.0.1:${server.address().port}/dsh-tripo-studio`
  let csrf=''
  const req=(url,{method='GET',body,headers={}}={})=>new Promise((resolve,reject)=>{
    // Use raw HTTP so the Host-header attack is genuinely sent. Fetch may
    // silently replace Host with the URL host, which would invalidate the test.
    const request=http.request(base+url,{method,headers:{'x-tripo-studio':'1','content-type':'application/json',...(csrf?{'x-tripo-csrf':csrf}:{}),...headers}},response=>{
      const chunks=[];response.on('data',c=>chunks.push(c));response.on('end',()=>{
        const bytes=Buffer.concat(chunks)
        resolve({status:response.statusCode,data:String(response.headers['content-type']).includes('application/json')?JSON.parse(bytes):bytes})
      })
    });request.on('error',reject);request.end(body!==undefined?JSON.stringify(body):undefined)
  })
  assert.equal((await req('/status',{headers:{origin:'https://evil.example'}})).status,403)
  assert.equal((await req('/status',{headers:{host:'evil.example'}})).status,403)
  assert.equal((await req('/status',{headers:{'x-forwarded-for':'8.8.8.8'}})).status,403)
  assert.equal((await req('/status',{headers:{'x-tripo-studio':''}})).status,403)
  assert.equal((await req('/projects',{method:'POST',body:{name:'Test'}})).status,403)
  const status=await req('/status');csrf=status.data.csrfToken
  assert.equal(status.data.keyConfigured,false)
  const p=await req('/projects',{method:'POST',body:{name:'Test'}});assert.equal(p.status,201)
  const id=p.data.id
  const a=await req(`/projects/${id}/files`,{method:'POST',body:{label:'hair',dataUrl:`data:image/png;base64,${png.toString('base64')}`}})
  assert.equal(a.status,201);assert.equal(a.data.width,256)
  assert.equal((await req(`/assets/${a.data.id}?project=${id}`)).data.byteLength,png.length)
  const other=(await req('/projects',{method:'POST',body:{name:'Other'}})).data.id
  assert.equal((await req(`/assets/${a.data.id}?project=${other}`)).status,404)
  const draft=await req(`/projects/${id}/prepare`,{method:'POST',body:{kind:'image-to-model',params:{input_asset:a.data.id}}})
  assert.equal(draft.status,201)
  assert.equal((await req(`/projects/${id}/jobs/${draft.data.id}/submit`,{method:'POST',body:{approvalHash:draft.data.approvalHash}})).status,503)
  const manifest=await req(`/projects/${id}/manifest`)
  assert.equal(manifest.data.jobs[0].approvalHash,undefined)
  assert.equal(manifest.data.assets[0].file,undefined)
  assert.equal((await req(`/projects/${id}/files`,{method:'POST',body:{dataUrl:'data:image/svg+xml;base64,aaaa'}})).status,400)
})
