// Host-neutral paths shared by the plugin entry and the local installers.
// Supported hosts: the community DSH Desktop (dataelement/dsh-desktop) and the
// official DeepSeek Harness desktop (deepseek-ai/deepseek-harness apps/desktop).
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

// Official desktop: `$DSH_HOME` (default ~/.dsh) owns profiles/desktop.
export function dshHome({env = process.env, homedir = os.homedir()} = {}) {
  return env.DSH_HOME || path.join(homedir, '.dsh')
}

// Pre-0.3.3-compat data root used by every earlier release (community desktop layout).
export function legacyDataDirectory({env = process.env, homedir = os.homedir()} = {}) {
  return path.join(env.APPDATA || path.join(homedir, '.local', 'share'), 'dsh-desktop', 'tripo-studio')
}

// Data root resolution, in order:
//   1. TRIPO_STUDIO_DATA_DIR (explicit override)
//   2. the legacy root when it already exists, so upgrades and a switch between
//      the community and official desktop keep reading the same projects/keys
//   3. $DSH_HOME/tripo-studio for fresh installs (host-neutral)
export function resolveDataDirectory({env = process.env, homedir = os.homedir(), exists = fs.existsSync} = {}) {
  if (env.TRIPO_STUDIO_DATA_DIR) return env.TRIPO_STUDIO_DATA_DIR
  const legacy = legacyDataDirectory({env, homedir})
  if (exists(legacy)) return legacy
  return path.join(dshHome({env, homedir}), 'tripo-studio')
}

// Local install targets. `community` keeps the historical layout byte-for-byte.
export function hostTarget(name, {env = process.env, homedir = os.homedir()} = {}) {
  if (name === 'community') {
    if (!env.APPDATA) throw new Error('APPDATA 未设置；community 目标仅面向 Windows DSH Desktop（dataelement）')
    const harness = path.join(env.APPDATA, 'dsh-desktop', 'harness')
    return {name, label: 'DSH Desktop（社区版）', process: 'DSH Desktop.exe', harness,
      profile: path.join(harness, 'profiles', 'web'), plugins: path.join(harness, 'plugins'),
      backups: path.join(harness, 'plugins', 'tripo-studio-backups')}
  }
  if (name === 'official') {
    const home = dshHome({env, homedir})
    return {name, label: 'DeepSeek Harness（官方桌面端）', process: 'DeepSeek Harness.exe', home,
      profile: path.join(home, 'profiles', 'desktop'), plugins: path.join(home, 'local-plugins'),
      backups: path.join(home, 'local-plugins', 'tripo-studio-backups')}
  }
  throw new Error(`未知安装目标：${name}（可选 community | official）`)
}

// The official desktop ships its own CLI next to the app; there is no global default path.
export function officialCliCandidates({env = process.env} = {}) {
  const list = []
  if (env.DSH_OFFICIAL_CLI) list.push(env.DSH_OFFICIAL_CLI)
  const rel = ['resources', 'runtime', 'cli', 'bin', 'dsh.cmd']
  if (env.LOCALAPPDATA) list.push(path.join(env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness', ...rel))
  if (env.ProgramFiles) list.push(path.join(env.ProgramFiles, 'DeepSeek Harness', ...rel))
  return list
}
