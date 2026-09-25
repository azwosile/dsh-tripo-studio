import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PALETTE_DEFAULTS,APPEARANCE_KEY,CONTROL_PRESETS,normalizeAppearance,normalizeControls,migrateAppearance} from '../client-src/appearance-settings.js'

test('appearance v2 defaults survive corrupt or partial storage',()=>{
  for(const value of [null,undefined,{},[],false,'bad',{theme:'wrong',surface:'transparent'}])
    assert.deepEqual(normalizeAppearance(value),{...PALETTE_DEFAULTS,version:2,opacity:92,textColor:'',theme:'host',surface:'glass',controls:{...CONTROL_PRESETS.standard}})
})
test('independent control dimensions clamp to usable bounds',()=>{
  assert.deepEqual(normalizeControls({height:999,fontSize:999,gap:999,panelWidth:9999}),{height:56,fontSize:18,gap:16,panelWidth:420})
  assert.deepEqual(normalizeControls({height:-1,fontSize:0,gap:-1,panelWidth:0}),{height:28,fontSize:11,gap:4,panelWidth:220})
})
test('non-finite and string values fall back; finite values round',()=>{
  assert.deepEqual(normalizeControls({height:Infinity,fontSize:NaN,gap:'12',panelWidth:null}),{...CONTROL_PRESETS.standard})
  assert.equal(normalizeControls({height:40.7}).height,41)
})
test('v1 migration preserves own theme but not the removed sizer mode',()=>{
  const legacy=Object.freeze({theme:'dark',surface:'solid',sizing:'follow'})
  assert.deepEqual(migrateAppearance(null,legacy),{...PALETTE_DEFAULTS,version:2,opacity:92,textColor:'',theme:'dark',surface:'solid',controls:{...CONTROL_PRESETS.standard}})
  assert.equal(legacy.sizing,'follow')
})
test('valid v2 settings take precedence without mutating preset objects',()=>{
  const controls=Object.freeze({...CONTROL_PRESETS.spacious})
  assert.deepEqual(migrateAppearance({theme:'light',controls},{theme:'dark'}),{...PALETTE_DEFAULTS,version:2,opacity:92,textColor:'',theme:'light',surface:'glass',controls:{...controls}})
  assert.equal(CONTROL_PRESETS.standard.height,36)
  assert.equal(APPEARANCE_KEY,'tripo-studio:appearance:v2')
})
test('appearance implementation has no companion key, global or polling dependency',()=>{
  const src=fs.readFileSync(new URL('../client-src/appearance.js',import.meta.url),'utf8')
  assert.doesNotMatch(src,/__DCS__|dsh-controls-sizer|setInterval|SIZER_KEY/)
})
