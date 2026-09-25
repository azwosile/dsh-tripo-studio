// Run on the target Windows host without booting DSH or modifying its profile.
import {createRequire} from 'node:module'
import {pathToFileURL, fileURLToPath} from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as plugin from '../index.js'
const appModules = process.env.DSH_APP_NODE_MODULES || (process.platform === 'win32' ? 'D:/DeepSeek Harness/DSH Desktop/resources/app/node_modules' : null)
const require_ = createRequire(appModules ? path.join(appModules, '..', 'package.json') : import.meta.url)
const cordisPath = require_.resolve('@deepseek-ai/cordis')
const {Context, resolveConfig} = await import(pathToFileURL(cordisPath))
console.log('Cordis runtime:', cordisPath)
assert.throws(() => resolveConfig({Config: {demoMode: {type: 'boolean', default: true}}}, {}), /validate/)
console.log('PASS: old Config reproduces reported validate crash')
assert.deepEqual(resolveConfig(plugin, {demoMode: false}), {demoMode: false})
assert.throws(() => resolveConfig(plugin, {demoMode: 'wrong'}), /demoMode/)
console.log('PASS: corrected Standard Schema validates with actual runtime')
const ctx = new Context(); let active = 0
ctx.provide('webServer', {register(route) { assert.equal(route.path, '/dsh-tripo-studio'); assert.equal(route.kind, 'prefix'); active++; return () => active-- }})
const fiber = ctx.plugin(plugin, {demoMode: false})
await new Promise(r => setTimeout(r, 80)); assert.equal(active, 1)
fiber.dispose(); await new Promise(r => setTimeout(r, 20)); assert.equal(active, 0)
console.log('PASS: actual Cordis activation and disposer lifecycle')
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const bundle = fs.readFileSync(path.join(root, pkg.exports['./client']), 'utf8')
assert.ok(bundle.includes('window.__ModuleLoader__.load'))
for (const [, external] of bundle.matchAll(/\brequire\(["']([^"']+)["']\)/g)) assert.equal(external, 'react')
assert.equal(/\bimport\(/.test(bundle), false)
console.log('PASS: release module boundary (host React only, no runtime CDN/dynamic imports)')
console.log('NOTE: this is a runtime contract test, NOT an Electron GUI or paid API end-to-end test.')
