// Local install is explicit, reversible, and never runs the global pnpm resolver.
// Default: inspection only. Apply only after DSH is closed and the user approves.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {hostTarget, resolveDataDirectory} from '../shared/host-paths.js'

// --target=official installs into the official DeepSeek Harness desktop via its bundled CLI.
// Default (--target=community) keeps the historical DSH Desktop (dataelement) flow unchanged.
const targetName = process.argv.find(a => a.startsWith('--target='))?.slice(9) || 'community'
if (targetName === 'official') { const {runOfficial} = await import('./install-official.mjs'); await runOfficial(); process.exit(0) }

const PACKAGE = 'dsh-tripo-studio'
const normalizePath = value => path.toNamespacedPath(path.resolve(value)).toLowerCase()
const source = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const apply = process.argv.includes('--apply') && !process.argv.includes('--dry-run')
const target = hostTarget(targetName)
const harness = target.harness
const profile = target.profile, profileFile = path.join(profile, 'package.json')
const installed = path.join(harness, 'plugins', PACKAGE), link = path.join(profile, 'node_modules', PACKAGE)
const req = createRequire(path.join(profile, 'noop.js'))
const original = fs.readFileSync(profileFile, 'utf8'), pkg = JSON.parse(original)
const meta = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'))
if (!Array.isArray(pkg.dsh?.profile?.bundles) || !pkg.dependencies) throw new Error('DSH profile 结构不符合预期，未作任何修改')
const plugin = await import(pathToFileURL(path.join(source, 'index.js')))
const {resolveConfig} = await import(pathToFileURL(req.resolve('@deepseek-ai/cordis')))
resolveConfig(plugin, {demoMode: false})
for (const file of ['lib/client-v0.3.4.js', 'server/routes.js', 'shared/contracts.js', 'cordis.patch.yml']) if (!fs.existsSync(path.join(source, file))) throw new Error(`发布闭包缺失：${file}`)
// 0.3.0 REQ-053: user data lives outside the plugin folder and is never copied over, moved or deleted.
const dataDirectory = resolveDataDirectory()
const inside = (child, parent) => { const r = path.relative(normalizePath(parent), normalizePath(child)); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)) }
if (inside(dataDirectory, installed) || inside(installed, dataDirectory) || inside(dataDirectory, source)) throw new Error('用户数据目录与插件目录重叠，已停止以免覆盖项目数据')
const dataIndexes = () => {
  const list = [path.join(dataDirectory, 'state.json'), path.join(dataDirectory, 'storage-location.json')]
  try { const c = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'storage-location.json'), 'utf8')); if (c?.version === 1 && typeof c.directory === 'string') list.push(path.join(c.directory, 'state.json')) } catch { /* default root only */ }
  return list.filter(f => fs.existsSync(f) && fs.lstatSync(f).isFile())
}
let oldLink = null
try { oldLink = fs.lstatSync(link) } catch (e) { if (e.code !== 'ENOENT') throw e }
// DSH 0.10.0 profiles use pnpm nodeLinker=hoisted: after any market install the junction is replaced by a
// real copy of plugins/dsh-tripo-studio. Accept that copy only when it is provably ours, and back it up.
const pnpmCopy = Boolean(oldLink && !oldLink.isSymbolicLink() && oldLink.isDirectory() && pkg.dependencies[PACKAGE] === `file:../../plugins/${PACKAGE}` &&
  (() => { try { return JSON.parse(fs.readFileSync(path.join(link, 'package.json'), 'utf8')).name === PACKAGE } catch { return false } })())
if (oldLink && !pnpmCopy && (!oldLink.isSymbolicLink() || normalizePath(path.resolve(path.dirname(link), fs.readlinkSync(link))) !== normalizePath(installed))) throw new Error('现有包链接/目录不归此安装器所有，已停止以免覆盖其他内容')
if (pkg.dependencies[PACKAGE] && pkg.dependencies[PACKAGE] !== `file:../../plugins/${PACKAGE}`) throw new Error('profile 中存在其他来源的同名插件，需人工确认，未覆盖')
console.log(JSON.stringify({mode: apply ? 'APPLY' : 'DRY_RUN', version: meta.version, source, destination: installed, profile: profileFile,
  changes: ['备份旧插件与 profile', '额外备份项目索引 state.json（不含图片/模型/密钥）', '安装本插件发布闭包', '只修改本插件的依赖与 bundle', '创建指向安装目录的 junction'],
  userData: {directory: dataDirectory, preserved: true, indexesToSnapshot: dataIndexes().length, note: '项目、图片、模型、任务与密钥保留在原位置；新版本首次启动会先自动备份 state.json 再写入'},
  excludes: ['不安装依赖', '不修改 pnpm lockfile', '不调整其他插件', '不读取 Key', '不请求 Tripo', '不移动或删除用户数据']}, null, 2))
if (!apply) { console.log('预检通过；未写入任何文件。关闭 DSH 后，可由用户运行 node scripts/install-local.mjs --apply'); process.exit(0) }
if (process.platform !== 'win32') throw new Error('实际安装仅支持 Windows')
const tasks = execFileSync('tasklist.exe', ['/FI', 'IMAGENAME eq DSH Desktop.exe', '/FO', 'CSV', '/NH'], {encoding: 'utf8'})
if (/"DSH Desktop\.exe"/i.test(tasks)) throw new Error('请先正常退出 DSH Desktop。安装器不会强行结束用户进程。')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backup = path.join(harness, 'plugins', 'tripo-studio-backups', `${stamp}-${randomUUID().slice(0, 8)}`)
const stage = `${installed}.stage-${randomUUID()}`
fs.mkdirSync(backup, {recursive: true})
fs.writeFileSync(path.join(backup, 'web-profile-package.json'), original)
// Snapshot small JSON indexes only (never files/ or secrets/) so a rollback can pair plugin + data.
const snapshot = path.join(backup, 'user-data-indexes')
for (const [i, file] of dataIndexes().entries()) { fs.mkdirSync(snapshot, {recursive: true}); fs.copyFileSync(file, path.join(snapshot, `${i}-${path.basename(file)}`), fs.constants.COPYFILE_EXCL) }
if (fs.existsSync(snapshot)) fs.writeFileSync(path.join(snapshot, 'README.txt'), '安装前的项目索引副本；图片、模型与密钥未复制，仍在原数据目录。\n')
let movedOld = false, movedStage = false, newLink = false, modifiedProfile = false, movedCopy = false
try {
  fs.mkdirSync(stage, {recursive: true})
  for (const name of ['index.js', 'lib', 'server', 'shared', 'client-src', 'scripts', 'cordis.patch.yml', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'tests', 'package.json', 'package-lock.json']) {
    const from = path.join(source, name)
    if (fs.existsSync(from)) fs.cpSync(from, path.join(stage, name), {recursive: true, errorOnExist: true})
  }
  // Copy source completely before renaming: this also works when invoked from
  // the currently installed copy, without deleting its running script.
  if (fs.existsSync(installed)) { fs.renameSync(installed, path.join(backup, 'previous-plugin')); movedOld = true }
  fs.renameSync(stage, installed); movedStage = true
  if (pnpmCopy) { fs.renameSync(link, path.join(backup, 'profile-pnpm-copy')); movedCopy = true }
  if (!oldLink || pnpmCopy) { fs.symlinkSync(installed, link, 'junction'); newLink = true }
  if (!pkg.dsh.profile.bundles.includes(PACKAGE)) pkg.dsh.profile.bundles.push(PACKAGE)
  pkg.dependencies[PACKAGE] = `file:../../plugins/${PACKAGE}`
  const eol = original.includes('\r\n') ? '\r\n' : '\n', temp = `${profileFile}.tripo-${randomUUID()}.tmp`
  fs.writeFileSync(temp, `${JSON.stringify(pkg, null, 2).replace(/\n/g, eol)}${eol}`)
  fs.renameSync(temp, profileFile); modifiedProfile = true
  const installedMeta = JSON.parse(fs.readFileSync(req.resolve(`${PACKAGE}/package.json`), 'utf8'))
  if (installedMeta.version !== meta.version) throw new Error('安装后版本解析不匹配')
  console.log(`安装完成 v${meta.version}。备份：${backup}`)
  console.log('尚未自动启动 DSH，尚未完成真实 GUI 验收。启动后请检查侧栏、工作台和卸载清理。')
  console.log('若宿主再次报告其他插件的 lockfile integrity 问题，请修复对应插件；不要关闭完整性检查。')
} catch (error) {
  if (modifiedProfile) fs.writeFileSync(profileFile, original)
  if (newLink) fs.unlinkSync(link)
  if (movedCopy) fs.renameSync(path.join(backup, 'profile-pnpm-copy'), link)
  if (movedStage) fs.renameSync(installed, path.join(backup, 'failed-new-plugin'))
  if (movedOld) fs.renameSync(path.join(backup, 'previous-plugin'), installed)
  // Keep staging/failed output for inspection; never delete an unknown directory.
  throw error
}
