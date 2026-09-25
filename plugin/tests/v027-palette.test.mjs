import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeAppearance,PALETTE_DEFAULTS,onColor} from '../client-src/appearance-settings.js'
import {desktopInset} from '../client-src/titlebar-glass.js'
test('0.2.9 additive preferences preserve existing v2 settings',()=>{
 const a=normalizeAppearance({theme:'dark',opacity:60,textColor:'#abcdef',controls:{height:44}})
 for(const [k,v]of Object.entries(PALETTE_DEFAULTS))assert.equal(a[k],v)
 assert.equal(a.opacity,60);assert.equal(a.controls.height,44);assert.equal(a.textColor,'#abcdef')
})
test('palette only accepts six-digit colors, finite bounded blur and boolean switch',()=>{
 const a=normalizeAppearance({baseColor:'red;display:none',toolbarColor:'#ABC123',accentColor:'#12',blur:999,titlebarGlass:'false'})
 assert.equal(a.baseColor,'');assert.equal(a.toolbarColor,'#abc123');assert.equal(a.accentColor,'');assert.equal(a.blur,40);assert.equal(a.titlebarGlass,true)
 assert.equal(normalizeAppearance({blur:-1,titlebarGlass:false}).blur,4)
 assert.equal(normalizeAppearance({blur:NaN}).blur,20)
 assert.equal(normalizeAppearance({titlebarGlass:false}).titlebarGlass,false)
})
test('accent foreground chooses readable dark/light',()=>{assert.equal(onColor('#ffffff'),'#102018');assert.equal(onColor('#000000'),'#ffffff')})
test('titlebar inset needs explicit finite value and respects zero',()=>{
 for(const s of ['', '?dsh-desktop-titlebar-inset=0','?dsh-desktop-titlebar-inset=invalid'])assert.equal(desktopInset(s),0)
 assert.equal(desktopInset('?dsh-desktop-titlebar-inset=36'),36)
 assert.equal(desktopInset('?dsh-desktop-titlebar-inset=999'),96)
})
