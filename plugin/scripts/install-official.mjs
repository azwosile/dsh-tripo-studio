// Install / uninstall for the official DeepSeek Harness desktop (deepseek-ai/deepseek-harness apps/desktop).
// Uses the official, supported path: the desktop's bundled CLI
//   dsh plugin --profile desktop add|remove <package>
// which keeps the profile write lock and the host's compatibility checks.
// Default is inspection only; --apply writes, and only after the desktop is fully closed.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {hostTarget, resolveDataDirectory, officialCliCandidates} from '../shared/host-paths.js'

const PACKAGE = 'dsh-tripo-studio'
const RELEASE = ['index.js', 'lib', 'server', 'shared', 'client-src', 'scripts', 'cordis.patch.yml', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'package.json', 'package-lock.json']
const normalizePath = value => path.toNamespacedPath(path.resolve(value)).toLowerCase()
const inside = (child, parent) => { const r = path.relative(normalizePath(parent), normalizePath(child)); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)) }

export async function runOfficial({uninstall = false, argv = process.argv} = {}) {
  const apply = argv.includes('--apply') && !argv.includes('--dry-run')
  const source = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const target = hostTarget('official')
  const profileFile = path.join(target.profile, 'package.json')
  if (!fs.existsSync(profileFile)) throw new Error(`官方桌面端 profile 未初始化：${target.profile}。请先启动一次 DeepSeek Harness 再完全退出。`)
  const dshArg = argv.find(a => a.startsWith('--dsh='))?.slice(6)
  const cli = [dshArg, ...officialCliCandidates()].filter(Boolean).find(p => fs.existsSync(p))
  if (!cli) throw new Error('找不到官方桌面端自带的 dsh.cmd。请用 --dsh=<安装目录>\\resources\\runtime\\cli\\bin\\dsh.cmd 指定，或设置 DSH_OFFICIAL_CLI。')
  const original = fs.readFileSync(profileFile, 'utf8'), pkg = JSON.parse(original)
  if (!Array.isArray(pkg.dsh?.profile?.bundles)) throw new Error('官方 profile 结构不符合预期，未作任何修改')
  const installed = path.join(target.plugins, PACKAGE)
  const spec = `file:${installed.replace(/\\/g, '/')}`
  const current = pkg.dependencies?.[PACKAGE]
  const ours = !current || current.replace(/\\/g, '/').toLowerCase() === spec.toLowerCase()
  if (!ours) throw new Error(`官方 profile 中已存在其他来源的 ${PACKAGE}（${current}），需人工确认，未覆盖`)
  const dataDirectory = resolveDataDirectory()
  if (!uninstall) {
    for (const file of ['lib/client-v0.3.4.js', 'server/routes.js', 'shared/contracts.js', 'shared/host-paths.js', 'cordis.patch.yml']) if (!fs.existsSync(path.join(source, file))) throw new Error(`发布闭包缺失：${file}`)
    if (inside(dataDirectory, installed) || inside(installed, dataDirectory) || inside(dataDirectory, source)) throw new Error('用户数据目录与插件目录重叠，已停止以免覆盖项目数据')
  }
  const meta = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'))
  console.log(JSON.stringify({mode: apply ? 'APPLY' : 'DRY_RUN', action: uninstall ? 'uninstall' : 'install', target: target.label, version: meta.version,
    cli, profile: profileFile, destination: installed, spec, alreadyInstalled: Boolean(current),
    userData: {directory: dataDirectory, preserved: true, note: '与社区版共用同一数据根目录（若已存在），项目/模型/密钥不复制不移动；请勿让两个桌面端同时运行本插件'},
    changes: uninstall ? ['备份 profile package.json / cordis.patch.yml', `dsh plugin --profile desktop remove ${PACKAGE}`, '保留插件文件与用户数据']
      : ['备份 profile package.json / cordis.patch.yml', '将发布闭包复制到 local-plugins（旧版本移入备份）', `dsh plugin --profile desktop add ${spec}`]}, null, 2))
  if (!apply) { console.log(`预检通过；未写入任何文件。完全退出 DeepSeek Harness 后运行：node scripts/${uninstall ? 'uninstall' : 'install'}-local.mjs --target=official --apply`); return }
  if (process.platform !== 'win32') throw new Error('实际安装仅支持 Windows')
  const tasks = execFileSync('tasklist.exe', ['/FI', `IMAGENAME eq ${target.process}`, '/FO', 'CSV', '/NH'], {encoding: 'utf8'})
  if (tasks.toLowerCase().includes(`"${target.process.toLowerCase()}"`)) throw new Error(`请先从托盘完全退出 ${target.process}（关闭窗口只会隐藏）。安装器不会强行结束进程。`)
  const runCli = (...args) => execFileSync('cmd.exe', ['/d', '/s', '/c', `"${[`"${cli}"`, ...args.map(a => `"${a}"`)].join(' ')}"`], {encoding: 'utf8', windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'pipe']})
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = path.join(target.backups, `${uninstall ? 'uninstall-' : ''}${stamp}-${randomUUID().slice(0, 8)}`)
  fs.mkdirSync(backup, {recursive: true})
  fs.writeFileSync(path.join(backup, 'desktop-profile-package.json'), original)
  const patchFile = path.join(target.profile, 'cordis.patch.yml')
  if (fs.existsSync(patchFile)) fs.copyFileSync(patchFile, path.join(backup, 'desktop-profile-cordis.patch.yml'))
  if (uninstall) {
    if (!current) { console.log('官方 profile 中未安装本插件；无需操作。'); return }
    console.log(runCli('plugin', '--profile', 'desktop', 'remove', PACKAGE))
    console.log(`已从官方桌面端移除本插件。插件文件保留在 ${installed}，用户数据保留在 ${dataDirectory}。备份：${backup}`)
    return
  }
  const stage = `${installed}.stage-${randomUUID()}`
  let movedOld = false, movedStage = false
  try {
    fs.mkdirSync(stage, {recursive: true})
    for (const name of RELEASE) { const from = path.join(source, name); if (fs.existsSync(from)) fs.cpSync(from, path.join(stage, name), {recursive: true, errorOnExist: true}) }
    if (fs.existsSync(installed)) { fs.renameSync(installed, path.join(backup, 'previous-plugin')); movedOld = true }
    fs.renameSync(stage, installed); movedStage = true
    // pnpm copies file: directories; remove first on upgrade so the new files are really picked up.
    if (current) runCli('plugin', '--profile', 'desktop', 'remove', PACKAGE)
    console.log(runCli('plugin', '--profile', 'desktop', 'add', spec))
    const after = JSON.parse(fs.readFileSync(profileFile, 'utf8'))
    if (!after.dependencies?.[PACKAGE] || !after.dsh?.profile?.bundles?.includes(PACKAGE)) throw new Error('dsh plugin add 完成但 profile 未登记本插件')
    console.log(`安装完成 v${meta.version} → 官方桌面端。备份：${backup}`)
    console.log('请重新打开 DeepSeek Harness，检查侧栏 Tripo Studio 入口、工作台与连接设置。')
  } catch (error) {
    fs.writeFileSync(profileFile, original)
    if (movedStage) fs.renameSync(installed, path.join(backup, 'failed-new-plugin'))
    if (movedOld) fs.renameSync(path.join(backup, 'previous-plugin'), installed)
    console.error(`安装失败，已恢复 profile package.json 与旧插件目录；如 node_modules 状态异常，可运行 "${cli}" plugin --profile desktop install 修复。`)
    throw error
  }
}
