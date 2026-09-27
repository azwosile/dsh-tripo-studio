import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
const PACKAGE = 'dsh-tripo-studio'
const normalizePath = value => path.toNamespacedPath(path.resolve(value)).toLowerCase()
const apply = process.argv.includes('--apply') && !process.argv.includes('--dry-run')
if (!process.env.APPDATA) throw new Error('APPDATA 未设置')
const harness = path.join(process.env.APPDATA, 'dsh-desktop', 'harness'), profile = path.join(harness, 'profiles', 'web')
const file = path.join(profile, 'package.json'), link = path.join(profile, 'node_modules', PACKAGE)
const installed = path.join(harness, 'plugins', PACKAGE), raw = fs.readFileSync(file, 'utf8'), pkg = JSON.parse(raw)
if (pkg.dependencies?.[PACKAGE] && pkg.dependencies[PACKAGE] !== `file:../../plugins/${PACKAGE}`) throw new Error('依赖来源已经改变，停止卸载以免移除别人的配置')
let stat
try { stat = fs.lstatSync(link) } catch (e) { if (e.code !== 'ENOENT') throw e }
// DSH 0.10.0 (pnpm nodeLinker=hoisted) may have replaced the junction with a real copy of this plugin.
const pnpmCopy = Boolean(stat && !stat.isSymbolicLink() && stat.isDirectory() && (() => { try { return JSON.parse(fs.readFileSync(path.join(link, 'package.json'), 'utf8')).name === PACKAGE } catch { return false } })())
if (stat && !pnpmCopy && (!stat.isSymbolicLink() || normalizePath(path.resolve(path.dirname(link), fs.readlinkSync(link))) !== normalizePath(installed))) throw new Error('链接不属于本插件，未删除')
console.log('只移除本插件的 bundle、依赖和 junction；保留插件文件、项目资产、备份和其他配置。')
if (!apply) { console.log('DRY_RUN：未修改。关闭 DSH 后运行 node scripts/uninstall-local.mjs --apply'); process.exit(0) }
if (process.platform !== 'win32') throw new Error('仅支持 Windows')
const tasks = execFileSync('tasklist.exe', ['/FI', 'IMAGENAME eq DSH Desktop.exe', '/FO', 'CSV', '/NH'], {encoding: 'utf8'})
if (/"DSH Desktop\.exe"/i.test(tasks)) throw new Error('请先正常退出 DSH Desktop')
const backup = path.join(harness, 'plugins', 'tripo-studio-backups', `uninstall-${Date.now()}`)
fs.mkdirSync(backup, {recursive: true}); fs.writeFileSync(path.join(backup, 'web-profile-package.json'), raw)
if (Array.isArray(pkg.dsh?.profile?.bundles)) pkg.dsh.profile.bundles = pkg.dsh.profile.bundles.filter(n => n !== PACKAGE)
if (pkg.dependencies) delete pkg.dependencies[PACKAGE]
const eol = raw.includes('\r\n') ? '\r\n' : '\n', temp = `${file}.tripo-uninstall.tmp`
fs.writeFileSync(temp, `${JSON.stringify(pkg, null, 2).replace(/\n/g, eol)}${eol}`); fs.renameSync(temp, file)
if (pnpmCopy) fs.renameSync(link, path.join(backup, 'profile-pnpm-copy'))
else if (stat) fs.unlinkSync(link)
console.log(`已停用本插件。备份：${backup}。没有运行 pnpm 或恢复整份旧 profile。`)
