import { engine } from './engine/EngineController'
import { getModule } from './modules/registry'
import './modules/registry'  // ensure modules are registered

// scope buffer: 4 bytes for write index (Int32) + 2048 floats of scope data
const SCOPE_BUFFER_SIZE = 2048
const scopeSAB = new SharedArrayBuffer(4 + SCOPE_BUFFER_SIZE * 4)
const scopeWriteIndex = new Int32Array(scopeSAB, 0, 1)
const scopeData = new Float32Array(scopeSAB, 4)

async function main() {
  await engine.initialize()

  engine.onEvent((event) => {
    if (event.type === 'ERROR') console.error('[engine error]', event.message)
  })

  // create a button to start audio (browser requires user gesture)
  const btn = document.createElement('button')
  btn.textContent = 'start audio'
  btn.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:24px;padding:16px 32px;cursor:pointer;background:#7c6af7;color:#e8e8ec;border:none;border-radius:4px;font-family:monospace'
  document.body.style.cssText = 'margin:0;background:#0d0d0f;color:#e8e8ec;font-family:monospace'
  document.body.appendChild(btn)

  btn.addEventListener('click', async () => {
    await engine.resume()
    btn.remove()
    buildCanonicalPatch()
  })
}

function buildCanonicalPatch() {
  const vcoDef     = getModule('vco')!
  const vcfDef     = getModule('vcf')!
  const vcaDef     = getModule('vca')!
  const mixerDef   = getModule('mixer')!
  const adsrDef    = getModule('adsr')!
  const buttonDef  = getModule('pushbutton')!
  const scopeDef   = getModule('scope')!
  const outDef     = getModule('output')!

  // --- add modules ---

  engine.addModule({
    id: 'btn-1', definitionId: 'pushbutton',
    params: {}, state: { gateHigh: false, triggerSamplesRemaining: 0, _gateEvents: [] },
    position: { x: 0, y: 0 }
  }, buttonDef)

  engine.addModule({
    id: 'adsr-1', definitionId: 'adsr',
    params: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.5 },
    state: { stage: 'idle', currentLevel: 0, samplesInStage: 0, gateWasHigh: false },
    position: { x: 2, y: 0 }
  }, adsrDef)

  engine.addModule({
    id: 'vco-1', definitionId: 'vco',
    params: { frequency: 220, detune: 0, pulseWidth: 0.5 },
    state: { phase: 0 },
    position: { x: 0, y: 3 }
  }, vcoDef)

  engine.addModule({
    id: 'vcf-1', definitionId: 'vcf',
    params: { cutoff: 400, resonance: 0.6, mode: 0, envAmount: 0.8 },
    state: { z1: 0, z2: 0 },
    position: { x: 4, y: 3 }
  }, vcfDef)

  engine.addModule({
    id: 'vca-1', definitionId: 'vca',
    params: { gain: 0 },
    state: {},
    position: { x: 6, y: 0 }
  }, vcaDef)

  engine.addModule({
    id: 'mixer-1', definitionId: 'mixer',
    params: { level1: 0.8, level2: 0.8, level3: 0.8, level4: 0.8, master: 0.8 },
    state: {},
    position: { x: 8, y: 0 }
  }, mixerDef)

  engine.addModule({
    id: 'scope-1', definitionId: 'scope',
    params: { timeScale: 1 },
    state: { writeIndex: 0, scopeBuffer: null, writeIndexBuffer: null },
    position: { x: 10, y: 0 }
  }, scopeDef)

  engine.addModule({
    id: 'out-1', definitionId: 'output',
    params: { gain: 0.6 },
    state: {},
    position: { x: 12, y: 0 }
  }, outDef)

  // --- connect cables ---
  // canonical patch:
  //   [push button] →gate→ [adsr] →cv→ [vca] → [mixer] → [scope]
  //                            ↓                              ↓
  //                        cv→ [vcf] ←audio← [vco]        [output]
  //                            ↓
  //                          [vca]

  // button gate → adsr gate
  engine.addCable({ id: 'c1', from: { moduleId: 'btn-1', portId: 'gate' }, to: { moduleId: 'adsr-1', portId: 'gate' } })

  // adsr envelope → vca cv (amplitude envelope)
  engine.addCable({ id: 'c2', from: { moduleId: 'adsr-1', portId: 'envelope' }, to: { moduleId: 'vca-1', portId: 'cv' } })

  // adsr envelope → vcf envelope (filter sweep)
  engine.addCable({ id: 'c3', from: { moduleId: 'adsr-1', portId: 'envelope' }, to: { moduleId: 'vcf-1', portId: 'envelope' } })

  // vco saw → vcf audio input
  engine.addCable({ id: 'c4', from: { moduleId: 'vco-1', portId: 'saw' }, to: { moduleId: 'vcf-1', portId: 'audio' } })

  // vcf out → vca audio input
  engine.addCable({ id: 'c5', from: { moduleId: 'vcf-1', portId: 'out' }, to: { moduleId: 'vca-1', portId: 'audio' } })

  // vca out → mixer in1
  engine.addCable({ id: 'c6', from: { moduleId: 'vca-1', portId: 'out' }, to: { moduleId: 'mixer-1', portId: 'in1' } })

  // mixer out → scope in
  engine.addCable({ id: 'c7', from: { moduleId: 'mixer-1', portId: 'out' }, to: { moduleId: 'scope-1', portId: 'in' } })

  // mixer out → output left + right
  engine.addCable({ id: 'c8', from: { moduleId: 'mixer-1', portId: 'out' }, to: { moduleId: 'out-1', portId: 'left' } })
  engine.addCable({ id: 'c9', from: { moduleId: 'mixer-1', portId: 'out' }, to: { moduleId: 'out-1', portId: 'right' } })

  // --- send scope buffer ---
  engine.setScopeBuffer('scope-1', scopeSAB)

  // --- UI ---
  buildTestUI()
}

function buildTestUI() {
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);text-align:center;font-size:14px'

  // status
  const status = document.createElement('div')
  status.textContent = 'press and hold SPACE to trigger envelope'
  status.style.cssText = 'margin-bottom:12px;color:#7c6af7'
  container.appendChild(status)

  // gate indicator
  const indicator = document.createElement('div')
  indicator.style.cssText = 'width:20px;height:20px;border-radius:50%;border:2px solid #2a2a2e;margin:0 auto 12px;transition:background 50ms'
  container.appendChild(indicator)

  // scope readout
  const scopeInfo = document.createElement('div')
  scopeInfo.style.cssText = 'font-size:11px;color:#2a2a2e'
  container.appendChild(scopeInfo)

  document.body.appendChild(container)

  // keyboard gate control
  let gateHigh = false

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault()
      gateHigh = true
      engine.setGate('btn-1', 'gate', 1)
      indicator.style.background = '#7c6af7'
      status.textContent = 'gate ON — envelope attacking'
    }
  })

  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      e.preventDefault()
      gateHigh = false
      engine.setGate('btn-1', 'gate', 0)
      indicator.style.background = 'transparent'
      status.textContent = 'gate OFF — envelope releasing'
    }
  })

  // scope monitoring
  setInterval(() => {
    const writeIdx = Atomics.load(scopeWriteIndex, 0)
    // read a few recent samples
    const recentIdx = (writeIdx - 1 + SCOPE_BUFFER_SIZE) % SCOPE_BUFFER_SIZE
    const sample = scopeData[recentIdx] ?? 0
    const peak = Math.abs(sample)
    scopeInfo.textContent = `scope: writeIdx=${writeIdx} sample=${sample.toFixed(4)} peak=${peak.toFixed(4)} gate=${gateHigh ? 'ON' : 'OFF'}`
  }, 200)
}

main()
