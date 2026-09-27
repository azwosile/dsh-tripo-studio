import fs from 'node:fs'
import path from 'node:path'
import {randomBytes,randomUUID} from 'node:crypto'
import {Store,fail} from './store.js'
import {chooseNativeFolder} from './folder-picker.js'
const MARKER='.tripo-studio-root.json'
export const SUBFOLDER='Tripo Studio 项目'
// No arbitrary client path: the sole authority to select paths is the native picker.
export class ProjectLocation {
 constructor(directory,{picker=chooseNativeFolder,platform=process.platform,now=()=>Date.now()}={}) {
  this.defaultDirectory=path.resolve(directory);this.config=path.join(this.defaultDirectory,'storage-location.json');this.picker=picker;this.platform=platform;this.now=now;this.pending=null;this.picking=false
  this.current=this.defaultDirectory
  if(fs.existsSync(this.config)) {
   let c;try{c=JSON.parse(fs.readFileSync(this.config,'utf8'))}catch{fail('项目目录配置损坏；未回退或覆盖，请检查存储设置',503,'STORAGE_CONFIG_INVALID')}
   if(c.version!==1||typeof c.directory!=='string')fail('项目目录配置不支持',503,'STORAGE_CONFIG_INVALID')
   if(path.resolve(c.directory)!==this.defaultDirectory)this.current=this.validate(c.directory,false)
  }
 }
 canonical(value) {
  if(typeof value!=='string'||value.length>2048||!path.isAbsolute(value)||value.includes('\0'))fail('目录路径无效',400,'INVALID_DIRECTORY')
  if(this.platform==='win32'&&!/^[A-Za-z]:[\\/]/.test(value))fail('仅允许本机磁盘目录，不支持网络路径',400,'INVALID_DIRECTORY')
  const resolved=path.resolve(value),root=path.parse(resolved).root
  if(resolved===root)fail('不能使用磁盘根目录',400,'INVALID_DIRECTORY')
  let part=root
  for(const segment of path.relative(root,resolved).split(path.sep)){part=path.join(part,segment);const st=fs.lstatSync(part);if(st.isSymbolicLink()||!st.isDirectory())fail('目录不能包含符号链接、junction或文件',400,'INVALID_DIRECTORY')}
  return fs.realpathSync(resolved)
 }
 validate(value,allowEmpty=true) {
  const dir=this.canonical(value),rel=path.relative(this.defaultDirectory,dir),reverse=path.relative(dir,this.defaultDirectory)
  if(!rel||(!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel))||(!reverse.startsWith('..'+path.sep)&&!path.isAbsolute(reverse)))fail('请选择独立于默认数据和凭据目录的位置',400,'INVALID_DIRECTORY')
  const marker=path.join(dir,MARKER)
  if(fs.existsSync(marker)) {
   if(fs.lstatSync(marker).isSymbolicLink())fail('项目目录标记不能为链接')
   let m;try{m=JSON.parse(fs.readFileSync(marker,'utf8'))}catch{fail('项目目录标记损坏；未覆盖')}
   if(m.owner!=='dsh-tripo-studio'||m.version!==1||m.layout!=='project-folders')fail('目标不是受支持的Tripo项目根目录')
   for(const name of ['state.json','projects']){const p=path.join(dir,name);if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())fail('项目索引或目录不能为链接')}
  } else if(!allowEmpty||fs.readdirSync(dir).length)fail('请选择空文件夹或已有Tripo项目根；不会覆盖其他文件',409,'DIRECTORY_NOT_EMPTY')
  return dir
 }
 // 0.3.3 REQ-068: report what storage-location.json really says, so "it resets after restart" is diagnosable.
 persisted(){try{const c=JSON.parse(fs.readFileSync(this.config,'utf8'));return typeof c?.directory==='string'?c.directory:null}catch{return null}}
 status(){const saved=this.persisted();return {directory:this.current,isDefault:this.current===this.defaultDirectory,layout:this.current===this.defaultDirectory?'legacy':'project-folders',canChoose:this.platform==='win32',persisted:saved??this.defaultDirectory,persistedMatches:(saved?path.resolve(saved):this.defaultDirectory)===this.current}}
 // A non-empty, non-Tripo folder is never written into directly: propose one new child folder instead.
 subfolderFor(parent) {
  for(let i=1;i<=20;i++){
   const name=i===1?SUBFOLDER:`${SUBFOLDER} ${i}`,dir=path.join(parent,name)
   if(!fs.existsSync(dir))return {directory:dir,create:true}
   try{return {directory:this.validate(dir),create:false}}catch{/* occupied by something else: try the next name */}
  }
  fail('所选文件夹内已有多个同名子文件夹，请选择空文件夹或已有Tripo项目根',409,'DIRECTORY_NOT_EMPTY')
 }
 openStore(){return new Store(this.current,{projectFolders:this.current!==this.defaultDirectory})}
 async choose(useDefault=false) {
  if(this.picking)fail('目录选择窗口已打开',409,'STORAGE_BUSY')
  this.picking=true;this.pending=null
  try {
   const picked=useDefault?this.defaultDirectory:await this.picker()
   if(!picked)return {cancelled:true}
   let dir=this.defaultDirectory,create=false,pickedDir=null
   if(!useDefault){
    pickedDir=this.canonical(picked)
    try{dir=this.validate(pickedDir)}
    catch(error){if(error.code!=='DIRECTORY_NOT_EMPTY')throw error;({directory:dir,create}=this.subfolderFor(pickedDir))}
   }
   this.pending={token:randomBytes(32).toString('hex'),directory:dir,expires:this.now()+300000,isDefault:useDefault,create,parent:pickedDir}
   return {selectionToken:this.pending.token,directory:dir,isDefault:useDefault,expiresInSeconds:300,...(create||(pickedDir&&pickedDir!==dir)?{picked:pickedDir,subfolder:true,create}:{})}
  } finally {this.picking=false}
 }
 apply(body) {
  if(!body||body.confirm!==true||Object.keys(body).some(k=>!['selectionToken','confirm'].includes(k))||typeof body.selectionToken!=='string'||!this.pending||body.selectionToken!==this.pending.token||this.now()>this.pending.expires)fail('目录选择已失效，请重新选择并确认',409,'DIRECTORY_CONFIRM_REQUIRED')
  const candidate=this.pending;this.pending=null
  if(candidate.create){
   // Only the reviewed child of the reviewed parent is created; never recursive, never over an existing entry.
   const parent=this.canonical(candidate.parent)
   if(parent!==candidate.parent||path.dirname(candidate.directory)!==parent)fail('目录选择已变化，请重新选择',409,'DIRECTORY_CONFIRM_REQUIRED')
   if(fs.existsSync(candidate.directory))fail('子文件夹已被其他程序创建，请重新选择',409,'DIRECTORY_CONFIRM_REQUIRED')
   fs.mkdirSync(candidate.directory)
  }
  const dir=candidate.isDefault?this.defaultDirectory:this.validate(candidate.directory)
  if(!candidate.isDefault&&!fs.existsSync(path.join(dir,MARKER)))fs.writeFileSync(path.join(dir,MARKER),JSON.stringify({owner:'dsh-tripo-studio',version:1,layout:'project-folders'})+'\n',{flag:'wx'})
  const next=new Store(dir,{projectFolders:!candidate.isDefault})
  fs.mkdirSync(this.defaultDirectory,{recursive:true})
  const temp=this.config+'.'+randomUUID()+'.tmp'
  try{fs.writeFileSync(temp,JSON.stringify({version:1,directory:dir})+'\n',{flag:'wx'});fs.renameSync(temp,this.config)}finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
  // Read back what was written: a switch that would not survive a restart must fail loudly here.
  const saved=this.persisted()
  if(!saved||path.resolve(saved)!==dir)fail('目录配置写入后读回不一致，未切换',500,'STORAGE_CONFIG_INVALID')
  this.current=dir;return next
 }
}
