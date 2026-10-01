import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {resolveDataDirectory, legacyDataDirectory, hostTarget, dshHome, officialCliCandidates} from '../shared/host-paths.js'

const env = {APPDATA: path.join('C:', 'Users', 'u', 'AppData', 'Roaming')}
const homedir = path.join('C:', 'Users', 'u')

test('explicit data dir wins', () => {
  assert.equal(resolveDataDirectory({env: {...env, TRIPO_STUDIO_DATA_DIR: 'X:/data'}, homedir, exists: () => true}), 'X:/data')
})
test('existing legacy root is kept so both desktops share projects', () => {
  const legacy = legacyDataDirectory({env, homedir})
  assert.equal(legacy, path.join(env.APPDATA, 'dsh-desktop', 'tripo-studio'))
  assert.equal(resolveDataDirectory({env, homedir, exists: p => p === legacy}), legacy)
})
test('fresh install goes under DSH_HOME', () => {
  assert.equal(resolveDataDirectory({env, homedir, exists: () => false}), path.join(homedir, '.dsh', 'tripo-studio'))
  assert.equal(resolveDataDirectory({env: {...env, DSH_HOME: 'D:/h'}, homedir, exists: () => false}), path.join('D:/h', 'tripo-studio'))
})
test('install targets', () => {
  const c = hostTarget('community', {env, homedir})
  assert.equal(c.profile, path.join(env.APPDATA, 'dsh-desktop', 'harness', 'profiles', 'web'))
  assert.equal(c.process, 'DSH Desktop.exe')
  const o = hostTarget('official', {env, homedir})
  assert.equal(o.profile, path.join(dshHome({env, homedir}), 'profiles', 'desktop'))
  assert.equal(o.process, 'DeepSeek Harness.exe')
  assert.throws(() => hostTarget('nope', {env, homedir}))
  assert.throws(() => hostTarget('community', {env: {}, homedir}))
})
test('official CLI override comes first', () => {
  assert.equal(officialCliCandidates({env: {DSH_OFFICIAL_CLI: 'D:/x/dsh.cmd'}})[0], 'D:/x/dsh.cmd')
})
