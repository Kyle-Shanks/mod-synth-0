import { engine } from './engine/EngineController'
import { getModule } from './modules/registry'
import './modules/registry'  // ensure modules are registered

async function main() {
  await engine.initialize()

  engine.onEvent((event) => {
    console.log('[engine event]', event)
  })

  // create a button to start audio (browser requires user gesture)
  const btn = document.createElement('button')
  btn.textContent = 'start audio'
  btn.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:24px;padding:16px 32px;cursor:pointer;background:#7c6af7;color:#e8e8ec;border:none;border-radius:4px;font-family:monospace'
  document.body.style.cssText = 'margin:0;background:#0d0d0f'
  document.body.appendChild(btn)

  btn.addEventListener('click', async () => {
    await engine.resume()
    btn.remove()

    const vcoDef = getModule('vco')!
    const outDef = getModule('output')!

    // add vco
    engine.addModule({
      id: 'vco-1',
      definitionId: 'vco',
      params: { frequency: 440, detune: 0, pulseWidth: 0.5 },
      state: { phase: 0 },
      position: { x: 0, y: 0 }
    }, vcoDef)

    // add output
    engine.addModule({
      id: 'out-1',
      definitionId: 'output',
      params: { gain: 0.5 },
      state: {},
      position: { x: 3, y: 0 }
    }, outDef)

    // connect vco sine → output left + right
    engine.addCable({ id: 'cable-1', from: { moduleId: 'vco-1', portId: 'sine' }, to: { moduleId: 'out-1', portId: 'left' } })
    engine.addCable({ id: 'cable-2', from: { moduleId: 'vco-1', portId: 'sine' }, to: { moduleId: 'out-1', portId: 'right' } })

    console.log('patch connected — you should hear a 440hz sine wave')

    // test: change frequency after 2 seconds
    setTimeout(() => {
      engine.setParam('vco-1', 'frequency', 880)
      console.log('frequency changed to 880hz')
    }, 2000)
  })
}

main()
