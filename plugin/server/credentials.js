// Credentials never belong in project state or browser storage. Windows DPAPI
// binds persisted ciphertext to the current Windows user. No plaintext fallback.
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {fail} from './store.js'
import {TRIPO_SITE} from '../shared/site.js'

export function validateKey(value) {
  if (typeof value !== 'string' || value.length > 4096) fail('密钥格式无效（最多 4096 个字符）',400,'INVALID_CREDENTIAL')
  const key=value.trim()
  if (!key || !/^[\x21-\x7e]+$/.test(key)) fail('请输入有效密钥，不要包含空白或换行',400,'INVALID_CREDENTIAL')
  return key
}
export function windowsProtector({platform=process.platform,run=execFileSync}={}) {
  const supported=platform==='win32'
  function transform(bytes,operation) {
    if(!supported) fail('此系统不支持 Windows 加密保存，请选择仅本次运行',503,'SECURE_STORAGE_UNAVAILABLE')
    // Only this fixed program is in argv. Sensitive data is supplied via stdin;
    // error output is never forwarded to the UI, logs, or thrown Error message.
    const script=`$ErrorActionPreference='Stop'; try { Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); $r=[Security.Cryptography.ProtectedData]::${operation}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r)) } catch { exit 1 }`
    try {
      const exe=path.win32.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe')
      const out=run(exe,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{
        input:bytes.toString('base64'),encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:65536,stdio:['pipe','pipe','pipe'],
      }).trim()
      if(!/^[A-Za-z0-9+/]+={0,2}$/.test(out)) throw new Error('invalid output')
      return Buffer.from(out,'base64')
    } catch { fail('Windows 加密存储操作失败；未保存密钥。请检查当前用户权限或选择仅本次运行',503,'SECURE_STORAGE_FAILED') }
  }
  return {supported,protect:bytes=>transform(bytes,'Protect'),unprotect:bytes=>transform(bytes,'Unprotect')}
}
export class CredentialStore {
  constructor(directory,{protector=windowsProtector()}={}) {
    this.directory=path.join(directory,'secrets')
    // Never read, decrypt, overwrite or migrate the legacy international file.
    this.file=path.join(this.directory,'connection-cn.json')
    this.protector=protector
  }
  get canPersist(){return this.protector.supported}
  load() {
    if(!fs.existsSync(this.file)) return null
    try {
      if(fs.statSync(this.file).size>32768) throw new Error('too large')
      const record=JSON.parse(fs.readFileSync(this.file,'utf8'))
      if(record.version!==2 || record.site!==TRIPO_SITE) throw new Error('unsupported site')
      if(record.cleared===true) return {key:'',paidEnabled:false,source:'cleared'}
      if(record.provider!=='windows-dpapi-current-user'||typeof record.ciphertext!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(record.ciphertext)) throw new Error('invalid')
      const plain=this.protector.unprotect(Buffer.from(record.ciphertext,'base64'))
      try {
        const value=JSON.parse(plain.toString('utf8'))
        if(value.site!==TRIPO_SITE || typeof value.paidEnabled!=='boolean') throw new Error('invalid')
        return {key:validateKey(value.key),paidEnabled:value.paidEnabled,source:'saved'}
      } finally {plain.fill(0)}
    } catch {
      // Fail closed: never silently use environment credentials after a corrupt
      // or foreign-user encrypted file. Preserve it for explicit replace/clear.
      return {key:'',paidEnabled:false,source:'unavailable',storageError:true}
    }
  }
  write(record) {
    let temp
    try {
      fs.mkdirSync(this.directory,{recursive:true,mode:0o700})
      temp=path.join(this.directory,`.connection-${randomUUID()}.tmp`)
      fs.writeFileSync(temp,JSON.stringify(record)+'\n',{flag:'wx',mode:0o600})
      fs.renameSync(temp,this.file)
    } catch { fail('本机密钥设置写入失败，原设置未变更',503,'CREDENTIAL_WRITE_FAILED') }
    finally {if(temp)try{fs.unlinkSync(temp)}catch{/* renamed or already absent */}}
  }
  save(key,paidEnabled) {
    if(!this.canPersist) fail('本机加密保存不可用，请选择仅本次运行',503,'SECURE_STORAGE_UNAVAILABLE')
    const plain=Buffer.from(JSON.stringify({site:TRIPO_SITE,key:validateKey(key),paidEnabled}))
    let encrypted
    try {encrypted=this.protector.protect(plain)} finally {plain.fill(0)}
    this.write({version:2,site:TRIPO_SITE,provider:'windows-dpapi-current-user',ciphertext:encrypted.toString('base64')})
  }
  clear() {
    // This contains NO secret. The tombstone also prevents environment fallback
    // from unexpectedly re-enabling an account after the user clicks Clear.
    this.write({version:2,site:TRIPO_SITE,cleared:true})
  }
}
