import {build} from 'esbuild'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const result = await build({
  absWorkingDir: root, entryPoints: ['client-src/main.jsx'], bundle: true, write: false,
  format: 'cjs', platform: 'browser', target: 'chrome120', minify: true,
  jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
  external: ['react'], define: {'process.env.NODE_ENV': '"production"'}, legalComments: 'eof',
})
const code = result.outputFiles[0].text
const externals = [...code.matchAll(/\brequire\(["']([^"']+)["']\)/g)].map(m => m[1])
if (!externals.includes('react') || externals.some(id => id !== 'react') || /\bimport\(/.test(code)) throw new Error(`Unexpected module boundary: ${externals}`)
await mkdir(join(root, 'lib'), {recursive: true})
const envelope = `/* dsh-tripo-studio 0.3.2 — generated; host React only, no dynamic imports. */\nwindow.__ModuleLoader__.load({id:"dsh-tripo-studio",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${code}\nreturn module.exports;}});\n`
await writeFile(join(root, 'lib/client-v0.3.2.js'), envelope)
console.log(`Built lib/client-v0.3.2.js: ${Buffer.byteLength(envelope)} bytes; external modules: ${[...new Set(externals)]}`)
// A self-contained preview uses the exact built plugin bundle. It has no API
// backend: local demo/GLB preview works, paid workflows stay disabled.
const react = await readFile(join(root, 'node_modules/react/umd/react.production.min.js'), 'utf8')
const reactDom = await readFile(join(root, 'node_modules/react-dom/umd/react-dom.production.min.js'), 'utf8')
let html = await readFile(join(root, 'scripts/preview.html'), 'utf8')
const safe = s => s.replace(/<\/script/gi, '<\\/script')
html = html.replace('<script src="../node_modules/react/umd/react.development.js"></script>', () => `<script>${safe(react)}</script>`)
  .replace('<script src="../node_modules/react-dom/umd/react-dom.development.js"></script>', () => `<script>${safe(reactDom)}</script>`)
  .replace('<script src="../lib/client-v0.3.2.js"></script>', () => `<script>${safe(envelope)}</script>`)
  .replace('</head>', `<script>window.__TRIPO_OFFLINE__=true;</script></head>`)
  .replace('本地校验页：直接加载 lib/client-v0.3.2.js，用桩 ctx 注册槽位后渲染，不经过 DSH', '离线预览 · 真实生图/项目保存请在 DSH 中使用插件 · 预览并不等于宿主验收')
await writeFile(join(root, '..', 'Tripo-Studio-Workbench-v0.3.2.html'), html)
console.log('Built offline preview: Tripo-Studio-Workbench-v0.3.2.html')
