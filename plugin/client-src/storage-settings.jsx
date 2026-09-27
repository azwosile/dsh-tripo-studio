import React from 'react'
import {FloatingPanel} from './floating-panel.jsx'
// 0.3.3 REQ-068: the switch used to "do nothing" because a non-empty folder was rejected and the confirm box sat
// below the fold. Now a non-empty folder is offered a dedicated subfolder, the confirm box is scrolled into view,
// and the panel shows whether the choice was written to disk (so it survives a DSH restart).
export function StorageSettings({storage,busy,blocked,api,onChanged}) {
 const [pending,setPending]=React.useState(null),[working,setWorking]=React.useState(''),[error,setError]=React.useState(''),[done,setDone]=React.useState('')
 const confirmRef=React.useRef(null)
 React.useEffect(()=>{if(pending&&confirmRef.current){confirmRef.current.scrollIntoView?.({block:'nearest'});confirmRef.current.querySelector('button')?.focus()}},[pending])
 const choose=async useDefault=>{setWorking('pick');setError('');setDone('');setPending(null);try{const p=await api(useDefault?'/storage/default':'/storage/choose','POST',{});if(p.cancelled)setError('已取消选择，项目根目录未改变。');else setPending(p)}catch(e){setError(e.message)}finally{setWorking('')}}
 const apply=async()=>{setWorking('apply');setError('');try{const s=await api('/storage','PUT',{selectionToken:pending.selectionToken,confirm:true});setPending(null);const st=s.storage||{};setDone(st.persistedMatches===false?`已切换到 ${st.directory}，但配置文件未确认写入；重启后可能回到 ${st.persisted||'默认目录'}。`:`已切换并保存为默认启动目录，重启后仍使用：${st.directory}`);await onChanged(s)}catch(e){setPending(null);setError(e.message)}finally{setWorking('')}}
 const saved=storage?.persisted
 return <FloatingPanel label="项目文件夹" title="统一项目根目录">
  <p>当前：<code className="tw-storage-path">{storage?.directory||'当前环境仅提供默认存储'}</code></p>
  {storage&&<p className={storage.persistedMatches===false?'tw-danger':'tw-note'}>{storage.persistedMatches===false?`注意：启动配置记录的是 ${saved||'默认目录'}，与当前不一致；重启 DSH 后会使用配置中的目录。`:storage.isDefault?'正在使用默认目录（未设置自定义根目录）。':'已保存为默认启动目录，重启后仍使用。'}</p>}
  <p>新根目录中每项目使用独立资产子目录，项目与任务索引保存在根目录。只切换位置，不迁移、不合并、不删除旧项目；返回默认目录可查看旧项目。选择已有文件的文件夹时，会在其中新建「Tripo Studio 项目」子文件夹，不会动原有文件。密钥仍保存在原安全目录。</p>
  <div className="tw-actions"><button disabled={busy||blocked||working||!storage?.canChoose} onClick={()=>choose(false)}>选择根目录…</button><button disabled={busy||blocked||working||!storage||storage.isDefault} onClick={()=>choose(true)}>返回默认目录…</button></div>
  {blocked&&<p>请先关闭审批确认；已有草稿需在任务页丢弃。</p>}
  {working==='pick'&&<p role="status">正在处理目录选择；请查看Windows文件夹选择窗口（窗口已置顶，最多等待3分钟）。</p>}
  {error&&<p role="alert">{error}</p>}
  {done&&!error&&<p className="tw-storage-done">{done}</p>}
  {pending&&<section ref={confirmRef} className="tw-storage-confirm" aria-label="确认切换项目根目录"><strong>确认切换至</strong><p className="tw-storage-path">{pending.directory}</p>
   {pending.subfolder&&<p className="tw-note">你选择的「{pending.picked}」里已有其他文件，为避免混在一起，将{pending.create?'新建':'使用'}子文件夹「{pending.directory.split(/[\\/]/).pop()}」作为项目根目录{pending.create?'（点确认后才创建）':''}。</p>}
   <p>当前项目选择将清空，切换后自动打开新目录中的第一个项目。旧目录内容完整保留；运行中任务须先暂停跟踪，待审批草稿须先丢弃。确认有效期5分钟。</p><button disabled={working||busy||blocked} onClick={apply}>确认切换项目根目录</button><button disabled={working} onClick={()=>setPending(null)}>取消目录切换</button></section>}
 </FloatingPanel>
}
