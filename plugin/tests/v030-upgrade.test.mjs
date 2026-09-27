// 0.3.0: plugin updates keep user data (REQ-052/053) and the relation view is derived read-only (REQ-051).
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {Store, APP_VERSION} from '../server/store.js'
import {JobService} from '../server/service.js'
import {buildRelations, parentOf, jobCounts} from '../client-src/relations.js'

const png = fs.readFileSync(new URL('./fixtures/reference.png', import.meta.url))
const temp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tripo-v030-')); t.after(() => fs.rmSync(d, {recursive: true, force: true})); return d }
const backups = dir => fs.existsSync(path.join(dir, 'backups')) ? fs.readdirSync(path.join(dir, 'backups')).sort() : []

function legacyState(dir) {
  // A 0.2.12 data folder: real asset file + records + a field this version does not know about.
  const s = new Store(dir, {appVersion: '0.2.12'})
  const p = s.newProject('旧版项目')
  const a = s.addAsset(p.id, png, {label: '旧立绘'})
  s.updateProject(p.id, {revision: p.revision, draft: {prompt: '旧提示词', wholeAsset: a.id}})
  s.state.futureField = {keep: true}
  s.state.projects[p.id].draft.fromNewerVersion = '保留我'
  s.state.jobs['00000000-0000-4000-8000-000000000001'] = {id: '00000000-0000-4000-8000-000000000001', site: 'cn', projectId: p.id, kind: 'image-to-model', status: 'success', params: {input_asset: a.id}, assetIds: []}
  delete s.state.appVersion
  s.save()
  return {p, a, raw: fs.readFileSync(path.join(dir, 'state.json'))}
}

test('0.3.3 opens 0.2.12 data without loss and keeps a verbatim backup first', t => {
  const dir = temp(t), {p, a, raw} = legacyState(dir), fileBefore = fs.readFileSync(path.join(dir, 'files', a.file))
  const s = new Store(dir)
  assert.equal(APP_VERSION, '0.3.3')
  assert.equal(s.state.appVersion, '0.3.3')
  assert.deepEqual(s.upgrade && {from: s.upgrade.from, to: s.upgrade.to}, {from: 'legacy', to: '0.3.3'})
  const list = backups(dir)
  assert.equal(list.length, 1)
  assert.match(list[0], /^state-legacy-to-0\.3\.3-.+\.json$/)
  assert.ok(fs.readFileSync(path.join(dir, 'backups', list[0])).equals(raw), 'backup must be byte-identical to the pre-upgrade index')
  assert.equal(s.state.projects[p.id].name, '旧版项目')
  assert.equal(s.state.projects[p.id].draft.prompt, '旧提示词')
  assert.equal(s.state.assets[a.id].label, '旧立绘')
  assert.equal(Object.keys(s.state.jobs).length, 1)
  assert.deepEqual(s.state.futureField, {keep: true})
  assert.ok(fs.readFileSync(path.join(dir, 'files', a.file)).equals(fileBefore), 'asset files are never rewritten')
  assert.equal(s.state.upgradeHistory.at(-1).to, '0.3.3')
})

test('re-opening the same version makes no further backup; older app versions are recorded by name', t => {
  const dir = temp(t)
  legacyState(dir)
  new Store(dir); new Store(dir)
  assert.equal(backups(dir).length, 1)
  const s = new Store(dir, {appVersion: '0.3.4'})
  assert.equal(s.upgrade.from, '0.3.3')
  assert.equal(backups(dir).length, 2)
})

test('saving a draft keeps keys written by other plugin versions', t => {
  const dir = temp(t), {p} = legacyState(dir), s = new Store(dir)
  const next = s.updateProject(p.id, {revision: s.project(p.id).revision, draft: {prompt: '新提示词', notAllowed: 1}})
  assert.equal(next.draft.prompt, '新提示词')
  assert.equal(next.draft.fromNewerVersion, '保留我')
  assert.equal(next.draft.notAllowed, undefined)
})

test('backup pruning only removes its own oldest copies', t => {
  const dir = temp(t)
  legacyState(dir)
  fs.mkdirSync(path.join(dir, 'backups'), {recursive: true})
  fs.writeFileSync(path.join(dir, 'backups', 'user-note.txt'), 'keep')
  for (let i = 0; i < 5; i++) new Store(dir, {appVersion: `9.0.${i}`, keepBackups: 3})
  const list = backups(dir)
  assert.ok(list.includes('user-note.txt'))
  assert.equal(list.filter(n => n.startsWith('state-')).length, 3)
})

test('a fresh data folder is stamped with the version and has nothing to back up', t => {
  const dir = temp(t), s = new Store(dir)
  s.newProject('新项目')
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).appVersion, '0.3.3')
  assert.equal(s.upgrade, null)
  assert.deepEqual(backups(dir), [])
})

test('unsupported index formats are still refused without touching the file', t => {
  const dir = temp(t), file = path.join(dir, 'state.json'), raw = JSON.stringify({version: 2, projects: {}, assets: {}, jobs: {}})
  fs.writeFileSync(file, raw)
  assert.throws(() => new Store(dir), /本地状态格式不支持/)
  assert.equal(fs.readFileSync(file, 'utf8'), raw)
  assert.deepEqual(backups(dir), [])
})

test('status reports 0.3.3 and the one-time upgrade notice without secrets', t => {
  const dir = temp(t)
  legacyState(dir)
  const service = new JobService({directory: dir, credentialStore: {load: () => null, canPersist: false}})
  const status = service.status()
  assert.equal(status.version, '0.3.3')
  assert.equal(status.upgrade.to, '0.3.3')
  assert.ok(!status.upgrade.backup.includes(path.sep))
  assert.equal(status.keyConfigured, false)
})

test('relations group local crops and AI extractions under their source and attach 3D jobs', () => {
  const img = (id, extra = {}) => ({id, kind: 'image', label: id, ...extra})
  const images = [img('A'), img('B'), img('crop1', {sourceAssetId: 'A'}), img('ai1', {sourceJobId: 'j-ai'}), img('crop2', {sourceAssetId: 'crop1'}), img('orphan', {sourceAssetId: 'gone'})]
  const jobs = [
    {id: 'j-ai', kind: 'image-to-image', status: 'success', params: {input_asset: 'A'}},
    {id: 'j-m1', kind: 'image-to-model', role: 'part', status: 'success', params: {input_asset: 'crop1'}, assetIds: ['m1']},
    {id: 'j-cv', kind: 'model-convert', status: 'running', params: {input_job: 'j-m1', format: 'FBX'}},
    {id: 'j-hidden', kind: 'image-to-model', status: 'failed', hidden: true, params: {input_asset: 'crop1'}},
  ]
  const assets = [...images, {id: 'm1', kind: 'model', format: 'glb', label: 'm1'}]
  const groups = buildRelations(images, jobs, assets)
  assert.deepEqual(groups.map(g => g.root.id), ['A', 'B', 'orphan'])
  const a = groups[0]
  assert.deepEqual(a.parts.map(p => [p.asset.id, p.depth, p.via]), [['crop1', 1, 'crop'], ['crop2', 2, 'crop'], ['ai1', 1, 'ai']])
  const m = a.modelJobs('crop1')
  assert.equal(m.length, 1, 'hidden jobs are not shown')
  assert.deepEqual(m[0].models.map(x => x.id), ['m1'])
  assert.equal(m[0].converts[0].job.params.format, 'FBX')
  assert.equal(parentOf(img('x', {sourceAssetId: 'x'}), new Map(), new Set(['x'])), null)
})

test('relation cycles cannot hang the view', () => {
  const images = [{id: 'P', kind: 'image', label: 'P', sourceAssetId: 'Q'}, {id: 'Q', kind: 'image', label: 'Q', sourceAssetId: 'P'}]
  const groups = buildRelations(images, [], images)
  assert.deepEqual(groups.map(g => g.root.id).sort(), ['P', 'Q'])
})

test('task dock counts only visible current-site jobs', () => {
  const c = jobCounts([
    {site: 'cn', status: 'running'}, {site: 'cn', status: 'failed'}, {site: 'cn', status: 'success', downloadStatus: 'download_failed'},
    {site: 'cn', status: 'awaiting_approval'}, {site: 'cn', status: 'success', hidden: true}, {site: 'international', status: 'running'},
  ])
  assert.deepEqual(c, {running: 1, failed: 2, done: 1, drafts: 1})
})
