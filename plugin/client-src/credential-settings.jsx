import React from 'react'
import {TRIPO_API_BASE} from '../shared/site.js'

export function CredentialSettings({status,busy,onSave,onClear,onBalance,balance,usage,onUsage}) {
  const [key,setKey]=React.useState(''),[visible,setVisible]=React.useState(false)
  const [paid,setPaid]=React.useState(false),[remember,setRemember]=React.useState(false),[confirmClear,setConfirmClear]=React.useState(false)
  const canPersist=Boolean(status?.credentials?.canPersist)
  React.useEffect(()=>{setPaid(Boolean(status?.paidEnabled));setRemember(canPersist);setConfirmClear(false)},[status,canPersist])
  const forget=()=>{setKey('');setVisible(false)}
  const source={environment:'启动环境变量',saved:'Windows 加密保存',session:'仅本次运行',cleared:'已清除',unavailable:'加密配置不可用',none:'未配置'}[status?.credentials?.source] || '未配置'
  return <section className="tw-settings tw-credentials" aria-label="Tripo API 密钥设置">
    <h3>Tripo API 连接设置 · 国内站</h3>
    <p>固定国内站：<code>{TRIPO_API_BASE}</code>。请使用 <a href="https://developers.tripo3d.com/zh/keys" target="_blank" rel="noopener noreferrer">国内站控制台</a> 创建的 API Key。</p>
    <p className="tw-note">升级后请重新填写国内站密钥。旧国际站密钥、环境变量与收费开关不会沿用；历史任务不会跨站查询，本地项目和已下载资产保留。</p>
    <p>状态：<strong>{status?.keyConfigured?'密钥已配置（不代表已验证）':'未配置可用密钥'}</strong> · {source} · {status?.paidEnabled?'收费开关已启用':'收费开关关闭'}</p>
    {status?.credentials?.storageError && <p className="tw-danger">已保存的配置无法解密，已停止使用；不会悄悄回退到环境变量。可重新输入覆盖或确认清除。</p>}
    <form onSubmit={e=>{e.preventDefault();void onSave({...(key.trim()?{key:key.trim()}:{}),paidEnabled:paid,remember}).finally(forget)}}>
      <label htmlFor="tripo-api-key">Tripo API 密钥</label>
      <div className="tw-key-row">
        <input id="tripo-api-key" name="tripo-api-key" type={visible?'text':'password'} value={key} maxLength={4096}
          placeholder={status?.keyConfigured?'留空保持当前密钥；输入以替换':'在此粘贴国内站 Tripo API Key'} autoComplete="new-password" spellCheck={false}
          autoCapitalize="none" disabled={busy||!status} onChange={e=>{setKey(e.target.value);setPaid(false)}}/>
        <button type="button" disabled={busy||!key} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?'隐藏密钥':'显示密钥'}</button>
      </div>
      <label className="tw-key-option"><input type="checkbox" checked={remember} disabled={busy||!canPersist} onChange={e=>setRemember(e.target.checked)}/>在本机加密保存，重启后继续使用</label>
      <small>{canPersist?'使用 Windows 当前用户 DPAPI；保存文件不含明文密钥。同一 Windows 用户权限下的程序仍可能访问密钥。':'当前环境不能使用 Windows 加密保存；可仅在本次后端运行期间使用，不会降级明文存盘。'}</small>
      {!remember&&<small>仅本次运行：重启会恢复国内站加密配置或国内站专用环境变量，不会覆盖先前保存的设置。</small>}
      <label className="tw-key-option"><input type="checkbox" checked={paid} disabled={busy||!status} onChange={e=>setPaid(e.target.checked)}/>我确认启用收费生成（仍需逐笔审批）</label>
      <div className="tw-actions"><button className="tw-primary" type="submit" disabled={busy||!status||(!key.trim()&&!status.keyConfigured)}>保存连接设置</button>
        <button type="button" disabled={busy||!status?.keyConfigured} onClick={onBalance}>查询余额（不提交生成）</button></div>
    </form>
    {balance&&<p className="tw-balance-line">余额：{balance.balance??'未知'} / 冻结：{balance.frozen??'未知'}{balance.checkedAt?`（查询于 ${new Date(balance.checkedAt).toLocaleTimeString()}）`:''}。余额不是费用报价；冻结额度是运行中任务预占的积分。</p>}
    {/* 0.3.3 REQ-071: GET /account/usage backfills real credits for this project's tasks. Read-only, never submits. */}
    <div className="tw-actions"><button type="button" disabled={busy||!status?.keyConfigured||!onUsage} onClick={onUsage} title={onUsage?'':'请先打开一个项目'}>同步实扣积分（用量记录）</button></div>
    {usage&&<p className="tw-usage-line">用量记录 {usage.total} 条 · 匹配本项目 {usage.matched} 个任务 · 更新 {usage.updated} 个 · 本项目已记录实扣合计 {usage.projectTotal}</p>}
    <p className="tw-note">保存本身不会请求 Tripo，也不会上传参考图；只有你点击查询余额或确认任务时才连接服务。密钥不写入浏览器存储、项目或导出清单，保存尝试后输入框会清空。不要把密钥发到聊天或截图中。</p>
    <div className="tw-actions"><button type="button" disabled={busy||!status} onClick={()=>setConfirmClear(!confirmClear)}>清除密钥</button></div>
    {confirmClear&&<div className="tw-key-clear"><p>清除会关闭国内站收费并停用当前凭据，同时删除已保存的国内站密钥内容；旧国际站配置保持不变；重启也不会回退使用环境变量。不会取消云端已提交任务或保证退款。</p>
      <div className="tw-actions"><button type="button" disabled={busy} onClick={()=>{void onClear().finally(forget)}}>确认清除并关闭收费</button><button type="button" disabled={busy} onClick={()=>setConfirmClear(false)}>取消清除</button></div></div>}
  </section>
}

export const credentialCss=`
.tw-shell .tw-key-row{display:flex;align-items:center;gap:10px;margin-bottom:14px;min-width:0}
.tw-shell .tw-key-row input{flex:1;min-width:0;margin:0;font-family:ui-monospace,monospace}
.tw-shell .tw-key-row button{flex:none}
.tw-shell .tw-key-option{display:flex;align-items:flex-start;gap:9px;margin:12px 0 8px}
.tw-shell .tw-key-option input{flex:none;margin-top:4px;accent-color:var(--tps-accent)}
.tw-shell .tw-key-clear{border:1px solid var(--tps-border);border-radius:8px;padding:12px;background:var(--tps-base)}
.tw-shell .tw-credentials small{overflow-wrap:anywhere}
@container tripo-workbench (max-width:480px){.tw-shell .tw-key-row{flex-wrap:wrap}.tw-shell .tw-key-row input{flex-basis:100%}}
`
