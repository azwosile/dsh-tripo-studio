// Only a fixed native dialog program. No user-supplied script or shell string.
// 0.3.3 REQ-068: the dialog is owned by an invisible TopMost form so it opens in front of DSH instead of behind it.
import path from 'node:path'
import {execFile} from 'node:child_process'
import {fail} from './store.js'
export async function chooseNativeFolder({platform=process.platform,run=execFile}={}) {
 if(platform!=='win32')fail('目录选择仅支持Windows DSH；本平台保留默认存储',503,'PICKER_UNAVAILABLE')
 const script=`$ErrorActionPreference='Stop';try{Add-Type -AssemblyName System.Windows.Forms;$d=New-Object System.Windows.Forms.FolderBrowserDialog;$d.Description='选择 Tripo 统一项目根目录（空目录或既有 Tripo 项目根）';$d.ShowNewFolderButton=$true;$o=New-Object System.Windows.Forms.Form;$o.TopMost=$true;$o.ShowInTaskbar=$false;$o.FormBorderStyle='None';$o.StartPosition='CenterScreen';$o.Width=1;$o.Height=1;$o.Opacity=0;$o.Show();$o.Activate();try{if($d.ShowDialog($o) -eq [System.Windows.Forms.DialogResult]::OK){[Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($d.SelectedPath)))}}finally{$o.Close();$o.Dispose();$d.Dispose()}}catch{exit 1}`
 const exe=path.win32.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe')
 return new Promise((resolve,reject)=>run(exe,['-NoLogo','-NoProfile','-STA','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:16384},(error,out)=>{
  if(error)return reject(Object.assign(new Error('目录选择已超时或不可用；未切换项目目录'),{status:503,code:'PICKER_FAILED'}))
  const value=out.trim();if(!value)return resolve(null)
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(value))return reject(new Error('目录选择结果无效'))
  resolve(Buffer.from(value,'base64').toString('utf8'))
 }))
}
