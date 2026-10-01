// Browser contract/coexistence tests, not an Electron GUI acceptance claim.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import {fileURLToPath} from 'node:url'
import {chromium, expect} from '@playwright/test'
import {JobService} from '../server/service.js'
import {createHandler} from '../server/routes.js'
import {hostRouter} from '../tests/fixtures/host-router.mjs'
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const evidence = path.join(root, '..', 'validation','v0.3.5')
fs.mkdirSync(evidence, {recursive:true})
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tripo-appearance-'))
const handler = createHandler({service:new JobService({directory:temporary, key:'', enabled:false})})
const allowed = new Map([
  ['/scripts/preview.html','scripts/preview.html'], ['/lib/client-v0.3.5.js','lib/client-v0.3.5.js'],
  ['/node_modules/react/umd/react.development.js','node_modules/react/umd/react.development.js'],
  ['/node_modules/react-dom/umd/react-dom.development.js','node_modules/react-dom/umd/react-dom.development.js'],
])
const routing=hostRouter(handler)
const server = http.createServer((req,res) => {
  const route=routing.match(req.url);if(route)return route.handler(req,res)
  const file = allowed.get(new URL(req.url,'http://localhost').pathname)
  if(!file) {res.statusCode=404;return res.end()}
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8')
  res.end(fs.readFileSync(path.join(root,file)))
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const base = `http://127.0.0.1:${server.address().port}`
async function toggleControls(page){const dialog=page.getByRole('dialog',{name:'独立控件尺寸设置'});if(await dialog.isVisible())await page.getByRole('button',{name:'关闭独立控件尺寸设置'}).click();else await page.getByRole('button',{name:'控件尺寸',exact:true}).click()}
const passed=[],failures=[],errors=[],external=[],skipped=[]
let browser
async function check(name,fn) {await fn();passed.push(name);console.log('PASS',name)}
const fixtures = process.env.TRIPO_COMPAT_FIXTURES
const harness = process.env.APPDATA && path.join(process.env.APPDATA,'dsh-desktop','harness','plugins')
const clients = {
  nav: fixtures ? path.join(fixtures,'nav.js') : harness && path.join(harness,'dsh-settings-nav-color','client.js'),
}
const contrast = async (page,selector,back) => page.locator(selector).first().evaluate((el,back) => {
  const rgb=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number)
  const lum=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)
  const a=lum(rgb(getComputedStyle(el).color)),b=lum(rgb(back));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)
},back)
try {
  browser=await chromium.launch({...(process.env.TRIPO_TEST_BROWSER?{executablePath:process.env.TRIPO_TEST_BROWSER}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']})
  const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light'})
  await page.addInitScript(() => {
    window.__testDcsReads=0
    Object.defineProperty(window,'__DCS__',{get(){window.__testDcsReads++;throw Error('Sizer must not be read')}})
    localStorage.setItem('dsh-controls-sizer:v1','external-untouched')
    const start=window.setInterval.bind(window), stop=window.clearInterval.bind(window)
    window.__testIntervals=new Set()
    window.setInterval=(fn,ms,...args)=>{const id=start(fn,ms,...args);if(ms===1000)window.__testIntervals.add(id);return id}
    window.clearInterval=id=>{window.__testIntervals.delete(id);return stop(id)}
  })
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',route=>{
    if(/^https?:/.test(route.request().url())&&!route.request().url().startsWith(base)){external.push(route.request().url());return route.abort()}
    return route.continue()
  })
  await page.goto(`${base}/scripts/preview.html`)
  const shell=page.locator('.tw-shell')
  await check('default host/light renders without companion plugins',async()=>{await expect(shell).toHaveAttribute('data-theme','light');await expect(page.getByLabel('工作台主题')).toBeVisible();await expect(page.locator('.tripo-titlebar-glass')).toHaveCount(0)})
  await page.getByRole('button',{name:'创建本地项目',exact:true}).click()
  await expect(page.getByLabel('角色提示词')).toBeVisible()
  await check('night switch is panel-only, preserves project and prompt',async()=>{
    await page.getByLabel('角色提示词').fill('兼容性验收：保留本地草稿，不调用云端。')
    await page.getByLabel('工作台主题').selectOption('dark')
    await expect(shell).toHaveAttribute('data-theme','dark')
    await expect(page.getByLabel('角色提示词')).toHaveValue('兼容性验收：保留本地草稿，不调用云端。')
    if(await page.locator('body').getAttribute('data-ds-dark-theme')!==null)throw Error('changed host theme')
  })
  await check('night navigation has >=4.5:1 text contrast on panel surface',async()=>{if(await contrast(page,'.tw-nav-tabs button','rgb(32,44,55)')<4.5)throw Error('low contrast')})
  await check('appearance preference survives reload',async()=>{await page.reload();await expect(shell).toHaveAttribute('data-theme','dark')})
  // Reproduce the documented WE 0.7.3 contract, not its media/network engine.
  await page.addStyleTag({content:`body{--dsw-alias-label-primary:#0f1115;--dsw-alias-label-secondary:#40504a;background:repeating-linear-gradient(40deg,#e467aa 0 80px,#91daef 80px 160px)!important}body[data-ds-dark-theme]{--dsw-alias-label-primary:#f9fafb;--dsw-alias-label-secondary:#becbd3}body[data-we-wallpaper]{--dsw-alias-bg-base:transparent;--we-blur:28px;--we-glass-alpha:.03;--we-glass-color:#dd8fac;--we-accent:#67dce7}`})
  await page.evaluate(()=>document.body.setAttribute('data-we-wallpaper','true'))
  await page.getByLabel('工作台主题').selectOption('host')
  await check('host light overrides dark OS preference',async()=>{await page.emulateMedia({colorScheme:'dark'});await expect(shell).toHaveAttribute('data-theme','light')})
  await check('host dark marker updates live; WE transparent base cannot hide header',async()=>{
    await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''))
    await expect(shell).toHaveAttribute('data-theme','dark')
    const css=await page.locator('.tw-topnav').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,blur:getComputedStyle(el).backdropFilter}))
    if(css.bg==='rgba(0, 0, 0, 0)'||!css.blur.includes('20px'))throw Error(JSON.stringify(css))
  })
  await check('explicit light overrides dark host locally',async()=>{await page.getByLabel('工作台主题').selectOption('light');await expect(shell).toHaveAttribute('data-theme','light');if(await contrast(page,'.tw-nav-tabs button','rgb(255,255,255)')<4.5)throw Error('low contrast')})
  await page.screenshot({path:path.join(evidence,'compat-light-wallpaper.png'),fullPage:true,animations:'disabled'})
  await page.getByLabel('工作台主题').selectOption('host')
  await page.screenshot({path:path.join(evidence,'compat-dark-wallpaper.png'),fullPage:true,animations:'disabled'})
  await check('solid mode disables transparency and blur without changing WE',async()=>{
    await page.getByLabel('工作台面板').selectOption('solid')
    const value=await page.locator('.tw-topnav').evaluate(el=>getComputedStyle(el).backdropFilter)
    if(value!=='none')throw Error(value)
    if(await page.locator('body').getAttribute('data-we-wallpaper')!=='true')throw Error('changed wallpaper')
  })
  await page.getByLabel('工作台面板').selectOption('glass')
  await check('scoped theme variables do not redefine host tokens',async()=>{
    const token=await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim())
    if(token!=='transparent')throw Error(token)
  })
  // Load actual installed companions when supplied. They remain outside the
  // release package; no third-party source is redistributed by this test.
  for(const [name,file] of Object.entries(clients)) {
    if(!file||!fs.existsSync(file)){skipped.push(`actual ${name} client not supplied`);continue}
    await page.evaluate(code=>{
      const loader=window.__ModuleLoader__;let registration
      window.__ModuleLoader__={load:r=>{registration=r}}
      try{(0,eval)(code)}finally{window.__ModuleLoader__=loader}
      const plugin=registration.factory(id=>{if(id==='react')return window.React;throw Error(id)})
      const disposers=[]
      plugin.apply({effect:fn=>{const d=fn();if(typeof d==='function')disposers.push(d)},on:()=>{}})
      window.__compatDisposers=(window.__compatDisposers||[]).concat(disposers)
    },fs.readFileSync(file,'utf8'))
    passed.push(`actual installed ${name} client mounts without exception`)
  }
  if(clients.nav&&fs.existsSync(clients.nav))await check('settings-nav-color still wins over hostile global CSS',async()=>{
    await page.addStyleTag({content:'.VOzbGW_navCell,.VOzbGW_navLabel{color:#1f2329!important}.VOzbGW_navCell.VOzbGW_active{color:white!important}'})
    await page.evaluate(()=>{const n=document.createElement('div');n.id='host-nav-probe';n.className='VOzbGW_navCell VOzbGW_active';n.textContent='宿主设置栏验收';document.body.append(n)})
    await expect(page.locator('#host-nav-probe')).toHaveCSS('color','rgb(249, 250, 251)')
    await page.getByLabel('工作台主题').selectOption('light')
    await expect(page.locator('#host-nav-probe')).toHaveCSS('color','rgb(249, 250, 251)')
    await page.evaluate(()=>document.querySelector('#host-nav-probe').remove())
    await page.getByLabel('工作台主题').selectOption('host')
  })
  await check('independent sizing applies four values without reading Sizer',async()=>{
    await toggleControls(page)
    for(const [label,value] of Object.entries({'控件高度':'48','控件字号':'16','控件间距':'12','3D 参数栏宽度':'360'}))await page.getByLabel(label,{exact:true}).fill(value)
    await page.getByRole('button',{name:'应用尺寸',exact:true}).click()
    await expect.poll(()=>shell.evaluate(el=>el.style.getPropertyValue('--tps-control-height'))).toBe('48px')
    await expect.poll(()=>shell.evaluate(el=>el.style.getPropertyValue('--tps-params-width'))).toBe('360px')
    if(await page.evaluate(()=>window.__testDcsReads)!==0)throw Error('read external settings')
    await toggleControls(page)
  })
  await page.getByRole('tab',{name:'3D 预览',exact:true}).click()
  const left=page.getByRole('region',{name:'3D 资产'}) // 0.3.1: preview left column is the 3D asset library
  await check('3D asset column has dark surfaces and readable fields',async()=>{
    await expect(left).toHaveCSS('background-color','rgb(32, 44, 55)')
    const pixel=await left.locator('input.tps-search').evaluate(el=>{const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');ctx.fillStyle=getComputedStyle(el).backgroundColor;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]});if(pixel.some((v,i)=>Math.abs(v-[32,44,55,235][i])>1))throw Error('dark control scrim does not match 92% theme surface: '+pixel)
    await expect(left.locator('input.tps-search')).toHaveCSS('color','rgb(249, 250, 251)')
    await expect(page.getByLabel('搜索 3D 资产')).toHaveCSS('color-scheme','dark')
    if(await contrast(page,'.tps-col.assets3d input.tps-search','rgb(19,28,36)')<4.5)throw Error('low input contrast')
    if(await contrast(page,'.tps-col.assets3d .tps-hint','rgb(32,44,55)')<4.5)throw Error('low hint contrast')
    await expect(left).toHaveCSS('width','360px')
    await expect(page.getByLabel('搜索 3D 资产')).toHaveCSS('min-height','48px')
  })
  await left.locator('input.tps-search').fill('主题切换保留搜索词')
  await check('3D asset column switches light/dark without losing inputs',async()=>{
    await page.getByLabel('工作台主题').selectOption('light')
    await expect(left).toHaveCSS('background-color','rgb(255, 255, 255)')
    await expect(left.locator('input.tps-search')).toHaveCSS('color','rgb(32, 46, 40)')
    await expect(left.locator('input.tps-search')).toHaveValue('主题切换保留搜索词')
    await page.getByLabel('工作台主题').selectOption('dark')
    await expect(left.locator('input.tps-search')).toHaveCSS('color','rgb(237, 244, 247)')
  })
  await page.screenshot({path:path.join(evidence,'left-parameters-night.png'),fullPage:true,animations:'disabled'})
  await check('DSH-sized 680px main slot adapts inside a 1440px window',async()=>{
    await page.evaluate(()=>{document.getElementById('panel').style.flex='0 0 680px'})
    await expect(page.locator('.tps-grid')).toHaveCSS('display','flex')
    const overflow=await page.locator('.tps-grid').evaluate(el=>el.scrollWidth>el.clientWidth+1)
    if(overflow)throw Error('slot overflow')
    await expect(left).toBeVisible()
    await page.screenshot({path:path.join(evidence,'dsh-narrow-slot.png'),fullPage:true,animations:'disabled'})
    await page.evaluate(()=>document.getElementById('panel').style.flex='')
  })
  await check('independent preferences survive reload without external storage changes',async()=>{
    await page.reload()
    await expect(shell).toHaveAttribute('data-theme','dark')
    await expect.poll(()=>shell.evaluate(el=>el.style.getPropertyValue('--tps-control-height'))).toBe('48px')
    if(await page.evaluate(()=>localStorage.getItem('dsh-controls-sizer:v1'))!=='external-untouched')throw Error('changed external state')
  })
  await check('native form rejects invalid values; reset preserves theme',async()=>{
    await toggleControls(page)
    await page.getByLabel('控件高度',{exact:true}).fill('999')
    await page.getByRole('button',{name:'应用尺寸',exact:true}).click()
    await expect.poll(()=>shell.evaluate(el=>el.style.getPropertyValue('--tps-control-height'))).toBe('48px')
    await page.getByRole('button',{name:'重置尺寸',exact:true}).click()
    await expect(shell).toHaveAttribute('data-theme','dark')
    await expect.poll(()=>shell.evaluate(el=>el.style.getPropertyValue('--tps-control-height'))).toBe('36px')
    await page.getByRole('button',{name:'宽松',exact:true}).click()
    await expect.poll(()=>shell.evaluate(el=>el.style.getPropertyValue('--tps-control-height'))).toBe('44px')
    await page.screenshot({path:path.join(evidence,'independent-control-settings.png'),fullPage:true,animations:'disabled'})
    await toggleControls(page)
  })
  for(const width of [390,320,768,1440])await check(`${width}px layout: independent controls and both pages fit`,async()=>{
    await page.setViewportSize({width,height:844})
    await expect(page.getByRole('tab',{name:'创作',exact:true})).toBeInViewport()
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||document.querySelector('.tw-root').scrollWidth>document.querySelector('.tw-root').clientWidth+1))throw Error('workflow horizontal overflow')
    await page.getByRole('tab',{name:'3D 预览',exact:true}).click()
    if(await page.locator('.tps-grid').evaluate(el=>el.scrollWidth>el.clientWidth+1))throw Error('preview horizontal overflow')
    if(width===390)await page.screenshot({path:path.join(evidence,'left-parameters-mobile.png'),fullPage:true,animations:'disabled'})
    await page.getByRole('tab',{name:'创作',exact:true}).click()
  })
  await check('v1 appearance migrates in-browser without importing external dimensions',async()=>{
    await page.evaluate(()=>{
      localStorage.removeItem('tripo-studio:appearance:v2')
      localStorage.setItem('tripo-studio:appearance:v1',JSON.stringify({theme:'dark',surface:'solid',sizing:'follow'}))
    })
    await page.reload()
    await expect(shell).toHaveAttribute('data-theme','dark')
    await expect(shell).toHaveAttribute('data-surface','solid')
    await expect.poll(()=>shell.evaluate(el=>el.style.getPropertyValue('--tps-control-height'))).toBe('36px')
    await page.getByLabel('工作台面板').selectOption('glass')
    if(await page.evaluate(()=>window.__testDcsReads)!==0)throw Error('migration read companion state')
  })
  await check('cross-window own preference updates are applied',async()=>{
    await page.evaluate(()=>{
      const key='tripo-studio:appearance:v2',value=JSON.stringify({theme:'dark',surface:'glass',controls:{height:40,fontSize:14,gap:8,panelWidth:300}})
      localStorage.setItem(key,value);window.dispatchEvent(new StorageEvent('storage',{key,newValue:value}))
    })
    await expect.poll(()=>shell.evaluate(el=>el.style.getPropertyValue('--tps-control-height'))).toBe('40px')
  })
  await check('palette colors update workbench and top navigation and persist',async()=>{
    await page.getByRole('button',{name:'界面外观',exact:true}).click()
    await page.getByLabel('界面底色',{exact:true}).fill('#172b35');await page.getByLabel('顶部栏颜色',{exact:true}).fill('#243e4b');await page.getByLabel('强调色',{exact:true}).fill('#8fdbc8')
    await expect(page.getByRole('dialog',{name:'界面配色与毛玻璃'})).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(shell).toHaveAttribute('data-custom-base','true');await expect(shell).toHaveAttribute('data-custom-top','true')
    await expect.poll(()=>shell.evaluate(e=>getComputedStyle(e).getPropertyValue('--tps-accent').trim())).toBe('#8fdbc8')
    await expect.poll(()=>page.locator('.tw-topnav').evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
    await page.reload();await expect(shell).toHaveAttribute('data-custom-top','true')
    await page.getByRole('button',{name:'界面外观',exact:true}).click();await expect(page.getByLabel('顶部栏颜色',{exact:true})).toHaveValue('#243e4b')
    await page.screenshot({path:path.join(evidence,'palette-controls.png'),fullPage:true})
    await page.getByRole('button',{name:'恢复默认外观',exact:true}).click();await page.keyboard.press('Escape')
    await expect(shell).toHaveAttribute('data-custom-base','false');await expect(shell).toHaveAttribute('data-custom-top','false')
  })
  await check('stylesheet has safe opaque fallback without backdrop-filter support',async()=>{
    await page.evaluate(()=>{
      const sheet=[...document.styleSheets].find(s=>s.ownerNode?.id==='dsh-tripo-studio/styles')
      if(!sheet)throw Error('missing plugin stylesheet')
      for(let i=sheet.cssRules.length-1;i>=0;i--)if(sheet.cssRules[i].type===CSSRule.SUPPORTS_RULE)sheet.deleteRule(i)
    })
    await expect(page.locator('.tw-topnav')).toHaveCSS('backdrop-filter','none')
    if(await page.locator('.tw-topnav').evaluate(el=>getComputedStyle(el).backgroundColor)==='rgba(0, 0, 0, 0)')throw Error('transparent fallback')
  })
  await page.goto(`${base}/scripts/preview.html?dsh-desktop-titlebar-inset=36`)
  await check('desktop titlebar inset avoids native controls at 390, 768, 1440px',async()=>{
    await page.evaluate(()=>{const n=document.createElement('div');n.textContent='⌄  —  □  ×';n.style.cssText='position:fixed;right:0;top:0;width:184px;height:36px;z-index:999999;background:#27303b;color:white;text-align:center';document.body.append(n)})
    await expect.poll(()=>shell.evaluate(el=>parseFloat(el.style.getPropertyValue('--tps-host-inset')))).toBe(36)
    for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});if((await page.locator('.tw-topnav').boundingBox()).y<36)throw Error('caption overlap');if(await page.locator('.tw-topnav').evaluate(el=>el.scrollWidth>el.clientWidth+1))throw Error('toolbar overflow')}
    await page.screenshot({path:path.join(evidence,'titlebar-safe-area.png'),fullPage:true,animations:'disabled'})
  })
  await check('equal connection widths and aligned project controls',async()=>{
    const a=await page.locator('.tw-appbar .tw-pill').boundingBox(),b=await page.getByRole('button',{name:'连接设置',exact:true}).boundingBox()
    if(Math.abs(a.width-b.width)>1)throw Error('header widths differ')
    const c=await page.getByLabel('当前项目').boundingBox(),d=await page.getByRole('button',{name:'＋ 新建项目',exact:true}).boundingBox()
    if(Math.abs(c.y-d.y)>1||Math.abs(c.height-d.height)>1)throw Error('project controls unaligned')
  })
  await check('floating size panel does not move content; six presets and Escape restore focus',async()=>{
    const before=await page.locator('.tw-root').boundingBox();await toggleControls(page);const after=await page.locator('.tw-root').boundingBox()
    if(before.y!==after.y||before.height!==after.height)throw Error('layout shift')
    await expect(page.getByRole('group',{name:'尺寸预设'}).getByRole('button')).toHaveCount(6)
    for(const name of ['极简','紧凑','标准','舒适','宽松','大字','标准'])await page.getByRole('button',{name,exact:true}).click()
    await page.screenshot({path:path.join(evidence,'floating-control-settings.png'),fullPage:true,animations:'disabled'})
    await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'独立控件尺寸设置'})).not.toBeVisible();await expect(page.getByRole('button',{name:'控件尺寸',exact:true})).toBeFocused()
  })
  await check('custom background and text persist and reset without fading foreground',async()=>{
    await page.getByRole('button',{name:'界面外观',exact:true}).click();const slider=page.getByLabel('界面背景不透明度');await slider.focus();await slider.press('End');for(let i=0;i<40;i++)await slider.press('ArrowLeft')
    await page.getByLabel('自定义字体颜色').fill('#ffcc88');await expect(shell).toHaveAttribute('data-custom-opacity','true');await expect(shell).toHaveAttribute('data-custom-text','true');await page.keyboard.press('Escape')
    await expect(page.locator('.tw-nav-tabs button').first()).toHaveCSS('color','rgb(255, 204, 136)');await expect(shell).toHaveCSS('opacity','1')
    await page.screenshot({path:path.join(evidence,'custom-opacity-font.png'),fullPage:true,animations:'disabled'})
    await page.reload();await expect.poll(()=>shell.evaluate(el=>el.style.getPropertyValue('--tps-user-opacity'))).toBe('60%');await expect(page.locator('.tw-nav-tabs button').first()).toHaveCSS('color','rgb(255, 204, 136)')
    await page.getByRole('button',{name:'界面外观',exact:true}).click();await page.getByRole('button',{name:'恢复默认外观',exact:true}).click();await page.keyboard.press('Escape');await expect(shell).toHaveAttribute('data-custom-opacity','false');await expect(shell).toHaveAttribute('data-custom-text','false')
  })
  await check('official model IDs and Prompt-size tips are accessible and accurate',async()=>{
    await expect(page.getByLabel('图像模型',{exact:true}).locator('option').first()).toHaveText('chat_image_2.5_flare · 速度档');await page.getByLabel('图像模型',{exact:true}).selectOption('chat_image_2');await expect(page.getByLabel('图像质量').locator('option')).toHaveCount(3);await page.getByLabel('输出尺寸').fill('1088x1920')
    await page.getByRole('button',{name:'Tips · Prompt / size',exact:true}).click();const tips=page.getByRole('dialog',{name:'Tripo 图像模型与参数提示'})
    for(const text of ['chat_image_2','600英文单词','https://openapi.tripo3d.com/v3','16倍数'])await expect(tips).toContainText(text)
    await page.screenshot({path:path.join(evidence,'model-prompt-size-tips.png'),fullPage:true,animations:'disabled'});await page.keyboard.press('Escape')
    await page.getByRole('button',{name:'02 拆件与裁剪'}).click();await expect(page.getByRole('heading',{name:'拆分立绘',exact:true})).toBeVisible()
  })
  await check('0.2.10 transparent controls, readable options and thick step frame',async()=>{
    await page.locator('.tw-steps button').nth(0).click()
    await page.getByRole('button',{name:'界面外观',exact:true}).click()
    await page.getByLabel('普通控件背景不透明度',{exact:true}).fill('0')
    await page.getByLabel('标题区域背景不透明度',{exact:true}).fill('0')
    await page.getByRole('button',{name:'关闭界面配色与毛玻璃'}).click()
    for(const selector of ['.tw-appbar>button','.tw-steps button','.tw-topnav']) {
      const alpha=await page.locator(selector).first().evaluate(el=>{const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=canvas.height=1;ctx.fillStyle=getComputedStyle(el).backgroundColor;ctx.fillRect(0,0,1,1);return ctx.getImageData(0,0,1,1).data[3]})
      if(alpha!==0)throw Error('background not transparent: '+selector+' '+alpha)
    }
    await expect(page.locator('.tw-steps button[aria-current=step]')).toHaveCSS('border-top-width','2px')
    for(const mode of ['light','dark']) {
      await page.getByLabel('工作台主题').selectOption(mode)
      const readable=await page.getByLabel('图像模型',{exact:true}).locator('option').first().evaluate(el=>{const s=getComputedStyle(el);return s.color!==s.backgroundColor&&s.backgroundColor!=='rgba(0, 0, 0, 0)'})
      if(!readable)throw Error('unreadable option '+mode)
    }
    await page.locator('.tw-steps button').nth(1).click()
    await expect(page.getByLabel('建模角色').locator('option').first()).toHaveCSS('color','rgb(237, 244, 247)')
    await page.locator('.tw-steps button').nth(0).click()
    await page.screenshot({path:path.join(evidence,'transparent-controls.png'),fullPage:true})
    await page.getByRole('button',{name:'界面外观',exact:true}).click()
    await page.getByRole('button',{name:'恢复默认外观',exact:true}).click()
    await expect(page.getByLabel('普通控件背景不透明度')).toHaveValue('92')
    await page.getByRole('button',{name:'关闭界面配色与毛玻璃'}).click()
  })
  await check('appearance uses no sizing polling timer before or after unmount',async()=>{
    if(await page.evaluate(()=>window.__testIntervals.size)!==0)throw Error('unexpected timer count')
    await page.evaluate(()=>window.__tripoPreviewUnmount())
    await expect.poll(()=>page.evaluate(()=>window.__testIntervals.size)).toBe(0)
  })
  await check('no paid submissions/external requests or uncaught browser errors',async()=>{if(errors.length||external.length)throw Error(JSON.stringify({errors,external}))})
  await page.evaluate(()=>window.__compatDisposers?.reverse().forEach(fn=>fn()))
  await check('titlebar glass is scoped, noninteractive, opaque-fallback safe and fully removed',async()=>{
    const chromePage=await browser.newPage({viewport:{width:1440,height:900}})
    chromePage.on('pageerror',e=>errors.push(e.message))
    await chromePage.addInitScript(()=>{document.addEventListener('DOMContentLoaded',()=>document.body.classList.add('dsh-desktop-windows-titlebar-layout'),{once:true})})
    await chromePage.route('**/*',route=>{if(/^https?:/.test(route.request().url())&&!route.request().url().startsWith(base)){external.push(route.request().url());return route.abort()}return route.continue()})
    await chromePage.goto(`${base}/scripts/preview.html?dsh-desktop-titlebar-inset=36`)
    const layer=chromePage.locator('.tripo-titlebar-glass')
    await expect(layer).toBeVisible();await expect(layer).toHaveCSS('pointer-events','none');await expect(layer).toHaveCSS('height','36px')
    await expect(layer).toHaveCSS('backdrop-filter',/blur\(20px\)/)
    await chromePage.evaluate(()=>{const w=document.createElement('div');w.id='titlebar-wallpaper-fixture';w.style.cssText='position:fixed;inset:0;z-index:-1;background:repeating-linear-gradient(40deg,#697087 0 50px,#cfb4ab 50px 100px);pointer-events:none';document.body.prepend(w)})
    await chromePage.getByRole('button',{name:'界面外观',exact:true}).click()
    await chromePage.getByLabel('顶部栏颜色',{exact:true}).fill('#40314f')
    await chromePage.getByLabel('毛玻璃模糊',{exact:true}).focus();await chromePage.getByLabel('毛玻璃模糊',{exact:true}).press('End')
    await expect(layer).toHaveCSS('backdrop-filter',/blur\(40px\)/)
    await chromePage.getByLabel('Tripo 标题栏毛玻璃',{exact:true}).uncheck();await expect(layer).toBeHidden()
    await chromePage.getByLabel('Tripo 标题栏毛玻璃',{exact:true}).check();await expect(layer).toBeVisible();await chromePage.keyboard.press('Escape')
    await chromePage.screenshot({path:path.join(evidence,'tripo-titlebar-glass.png'),fullPage:true})
    await chromePage.evaluate(()=>document.getElementById('panel').style.display='none');await expect(layer).toBeHidden()
    await chromePage.evaluate(()=>document.getElementById('panel').style.display='');await expect(layer).toBeVisible()
    await chromePage.getByRole('tab',{name:'3D 预览',exact:true}).click();await expect(chromePage.locator('.tw-preview-help')).toContainText('不消耗积分')
    await expect(layer).toBeVisible()
    await chromePage.evaluate(()=>document.body.classList.remove('dsh-desktop-windows-titlebar-layout'));await expect(layer).toBeHidden()
    await chromePage.evaluate(()=>document.body.classList.add('dsh-desktop-windows-titlebar-layout'));await expect(layer).toBeVisible()
    await chromePage.evaluate(()=>{const sheet=[...document.styleSheets].find(s=>s.ownerNode?.id==='dsh-tripo-studio/styles');for(let i=sheet.cssRules.length-1;i>=0;i--)if(sheet.cssRules[i].type===CSSRule.SUPPORTS_RULE)sheet.deleteRule(i)})
    await expect(layer).toHaveCSS('backdrop-filter','none');await expect(layer).not.toHaveCSS('background-color','rgba(0, 0, 0, 0)')
    await chromePage.evaluate(()=>window.__tripoPreviewUnmount());await expect(layer).toHaveCount(0)
    await expect(chromePage.locator('body')).toHaveClass(/dsh-desktop-windows-titlebar-layout/)
    await chromePage.goto(`${base}/scripts/preview.html?dsh-desktop-titlebar-inset=0`);await expect(chromePage.locator('.tw-shell')).toBeVisible();await expect(chromePage.locator('.tripo-titlebar-glass')).toHaveCount(0)
    await chromePage.close()
    if(errors.length||external.length)throw Error(JSON.stringify({errors,external}))
  })
} catch(e) {failures.push(e.message);console.error(e)}
finally {await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(temporary,{recursive:true,force:true})}
fs.writeFileSync(path.join(evidence,'compat-results.json'),JSON.stringify({scope:'Chromium contract tests; WE CSS contract, actual optional nav client; independent controls; not Electron or real wallpaper media',paidAPICalls:0,passed,failures,skipped,errors,external},null,2)+'\n')
console.log(`Appearance checks: ${passed.length} passed, ${failures.length} failed, ${skipped.length} skipped`)
if(failures.length)process.exitCode=1
