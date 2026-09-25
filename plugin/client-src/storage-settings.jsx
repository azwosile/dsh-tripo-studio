import React from 'react'
import {FloatingPanel} from './floating-panel.jsx'
export function StorageSettings({storage,busy,blocked,api,onChanged}) {
 const [pending,setPending]=React.useState(null),[working,setWorking]=React.useState(false),[error,setError]=React.useState('')
 const choose=async useDefault=>{setWorking(true);setError('');setPending(null);try{const p=await api(useDefault?'/storage/default':'/storage/choose','POST',{});if(!p.cancelled)setPending(p)}catch(e){setError(e.message)}finally{setWorking(false)}}
 return <FloatingPanel label="项目文件夹" title="统一项目根目录">
  <p>当前：<code className="tw-storage-path">{storage?.directory||'当前环境仅提供默认存储'}</code></p>
  <p>新根目录中每项目使用独立资产子目录，项目与任务索引保存在根目录。只切换位置，不迁移、不合并、不删除旧项目；返回默认目录可查看旧项目。密钥仍保存在原安全目录。</p>
  <div className="tw-actions"><button disabled={busy||blocked||working||!storage?.canChoose} onClick={()=>choose(false)}>选择根目录…</button><button disabled={busy||blocked||working||!storage||storage.isDefault} onClick={()=>choose(true)}>返回默认目录…</button></div>
  {blocked&&<p>请先关闭审批确认；已有草稿需在任务页丢弃。</p>}
  {working&&<p role="status">正在处理目录选择；请查看Windows文件夹选择窗口（最多等待3分钟）。</p>}
  {error&&<p role="alert">{error}</p>}
  {pending&&<section className="tw-storage-confirm"><strong>确认切换至</strong><p className="tw-storage-path">{pending.directory}</p><p>当前项目选择将清空。旧目录内容完整保留；运行中任务须先暂停跟踪，待审批草稿须先丢弃。确认有效期5分钟。</p><button disabled={working||busy||blocked} onClick={async()=>{setWorking(true);setError('');try{const s=await api('/storage','PUT',{selectionToken:pending.selectionToken,confirm:true});setPending(null);await onChanged(s)}catch(e){setPending(null);setError(e.message)}finally{setWorking(false)}}}>确认切换项目根目录</button><button disabled={working} onClick={()=>setPending(null)}>取消目录切换</button></section>}
 </FloatingPanel>
}
