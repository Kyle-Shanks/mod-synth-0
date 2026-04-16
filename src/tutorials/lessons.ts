import {
  countRootModules,
  ensureCable,
  ensureModule,
  firstModuleByDefinition,
  hasCable,
} from './helpers'
import type {
  TutorialLesson,
  TutorialRuntime,
  TutorialValidationResult,
} from './model'

function inRange(value: number | undefined, min: number, max: number): boolean {
  if (value === undefined) return false
  return value >= min && value <= max
}

function getModule(runtime: TutorialRuntime, moduleId: string | null) {
  if (!moduleId) return null
  return runtime.modules[moduleId] ?? null
}

function ok(): TutorialValidationResult {
  return { ok: true }
}

function fail(hint: string): TutorialValidationResult {
  return { ok: false, hint }
}

function hasConnection(
  runtime: TutorialRuntime,
  fromDefIds: string[],
  toDefIds: string[],
  toPortId: string,
  fromPortId?: string,
): boolean {
  for (const cable of Object.values(runtime.cables)) {
    const from = runtime.modules[cable.from.moduleId]
    const to = runtime.modules[cable.to.moduleId]
    if (!from || !to) continue
    if (!fromDefIds.includes(from.definitionId)) continue
    if (!toDefIds.includes(to.definitionId)) continue
    if (cable.to.portId !== toPortId) continue
    if (fromPortId && cable.from.portId !== fromPortId) continue
    return true
  }
  return false
}

export const TUTORIAL_LESSONS: TutorialLesson[] = [
  {
    id: 'first-voice',
    title: 'first voice',
    summary: 'build the smallest audible patch from scratch.',
    completionMessage:
      'congrats, you built your first complete signal path. you learned the core modular idea: sources do nothing until they are routed into a destination. try swapping sine for saw or pulse and retuning the oscillator to hear how much character you can get from one simple patch.',
    mode: 'beginner',
    steps: [
      {
        id: 'add-vco',
        action: 'add a vco module.',
        why: 'a vco generates the raw waveform we can hear.',
        hints: ['press space, type "vco", then hit enter.'],
        demo: 'open the palette with space, search for vco, and place it near the center.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, 'vco')
            ? ok()
            : fail('drop a vco onto the rack first.')
        },
        autoPerform(runtime) {
          ensureModule(runtime, 'vco', { x: 6, y: 6 })
        },
        focus(runtime) {
          const vcoId = firstModuleByDefinition(runtime, 'vco')
          return vcoId ? [{ kind: 'module', moduleId: vcoId }] : []
        },
      },
      {
        id: 'add-output',
        action: 'add an output module.',
        why: 'output is the final sink that sends audio to your speakers.',
        hints: ['you only need one output module per patch.'],
        demo: 'open the palette again and add output to the right of the vco.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, 'output')
            ? ok()
            : fail('add an output module so we can hear the signal.')
        },
        autoPerform(runtime) {
          ensureModule(runtime, 'output', { x: 12, y: 6 })
        },
        focus(runtime) {
          const outputId = firstModuleByDefinition(runtime, 'output')
          return outputId ? [{ kind: 'module', moduleId: outputId }] : []
        },
      },
      {
        id: 'connect-left',
        action: 'connect vco `sin` to output `left`.',
        why: 'this creates the first audible signal path.',
        hints: ['drag from `sin` on vco to `left` on output.'],
        demo: 'click-hold on the vco sine output, drag, then release on output left.',
        validate(runtime) {
          const vcoId = firstModuleByDefinition(runtime, 'vco')
          const outputId = firstModuleByDefinition(runtime, 'output')
          if (!vcoId || !outputId)
            return fail('make sure both vco and output exist first.')
          return hasCable(runtime, vcoId, 'sine', outputId, 'left')
            ? ok()
            : fail('patch from vco sine to output left.')
        },
        autoPerform(runtime) {
          const vcoId = ensureModule(runtime, 'vco', { x: 6, y: 6 })
          const outputId = ensureModule(runtime, 'output', { x: 12, y: 6 })
          if (!vcoId || !outputId) return
          ensureCable(
            runtime,
            { moduleId: vcoId, portId: 'sine' },
            { moduleId: outputId, portId: 'left' },
          )
        },
        focus(runtime) {
          const vcoId = firstModuleByDefinition(runtime, 'vco')
          const outputId = firstModuleByDefinition(runtime, 'output')
          if (!vcoId || !outputId) return []
          return [
            { kind: 'port', moduleId: vcoId, portId: 'sine' },
            { kind: 'port', moduleId: outputId, portId: 'left' },
          ]
        },
      },
      {
        id: 'connect-right',
        action: 'connect vco `sin` to output `right`.',
        why: 'mirroring to right gives centered stereo playback.',
        hints: ['you can fan one output jack to multiple destinations.'],
        demo: 'drag a second cable from vco sine into output right.',
        validate(runtime) {
          const vcoId = firstModuleByDefinition(runtime, 'vco')
          const outputId = firstModuleByDefinition(runtime, 'output')
          if (!vcoId || !outputId)
            return fail('you still need vco and output on the rack.')
          return hasCable(runtime, vcoId, 'sine', outputId, 'right')
            ? ok()
            : fail('patch a second cable from vco sine to output right.')
        },
        autoPerform(runtime) {
          const vcoId = ensureModule(runtime, 'vco', { x: 6, y: 6 })
          const outputId = ensureModule(runtime, 'output', { x: 12, y: 6 })
          if (!vcoId || !outputId) return
          ensureCable(
            runtime,
            { moduleId: vcoId, portId: 'sine' },
            { moduleId: outputId, portId: 'right' },
          )
        },
        focus(runtime) {
          const vcoId = firstModuleByDefinition(runtime, 'vco')
          const outputId = firstModuleByDefinition(runtime, 'output')
          if (!vcoId || !outputId) return []
          return [
            { kind: 'port', moduleId: vcoId, portId: 'sine' },
            { kind: 'port', moduleId: outputId, portId: 'right' },
          ]
        },
      },
      {
        id: 'tune-frequency',
        action: 'set vco `freq` into the 110–330 hz range.',
        why: 'working in this range makes pitch movement easier to hear.',
        hints: ['drag the vco freq knob; hold shift for fine control.'],
        demo: 'hover the vco frequency knob and drag until the readout is around 220 hz.',
        validate(runtime) {
          const vcoId = firstModuleByDefinition(runtime, 'vco')
          const vco = getModule(runtime, vcoId)
          if (!vco) return fail('add a vco first.')
          return inRange(vco.params.frequency, 110, 330)
            ? ok()
            : fail('set vco frequency between 110 and 330 hz.')
        },
        autoPerform(runtime) {
          const vcoId = ensureModule(runtime, 'vco', { x: 6, y: 6 })
          if (!vcoId) return
          runtime.setParam(vcoId, 'frequency', 220)
        },
        focus(runtime) {
          const vcoId = firstModuleByDefinition(runtime, 'vco')
          return vcoId
            ? [{ kind: 'param', moduleId: vcoId, paramId: 'frequency' }]
            : []
        },
      },
    ],
  },
  {
    id: 'envelope-shaping',
    title: 'envelope shaping',
    summary: 'shape amplitude with gate + adsr + vca.',
    completionMessage:
      'great job, you just patched a classic subtractive voice architecture. you learned how gate timing drives an envelope, and how that envelope controls loudness through a vca. experiment by changing attack and release ranges and by varying the vca response to find snappy plucks, pads, and swells.',
    mode: 'beginner',
    steps: [
      {
        id: 'add-keyboard',
        action: 'add a keyboard module.',
        why: 'keyboard provides playable gate and pitch control.',
        hints: ['select the keyboard module, then click it to arm.'],
        demo: 'add keyboard near the bottom left so it is easy to select while patching.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, 'keyboard')
            ? ok()
            : fail('add a keyboard module.')
        },
        autoPerform(runtime) {
          const keyboardId = ensureModule(runtime, 'keyboard', { x: 2, y: 11 })
          if (!keyboardId) return
          runtime.setSelectedModule(keyboardId)
        },
        focus(runtime) {
          const keyboardId = firstModuleByDefinition(runtime, 'keyboard')
          return keyboardId ? [{ kind: 'module', moduleId: keyboardId }] : []
        },
      },
      {
        id: 'add-adsr',
        action: 'add an adsr module.',
        why: 'adsr turns gate timing into smooth amplitude motion.',
        hints: ['adsr lives in the envelope category.'],
        demo: 'place adsr between keyboard and vca area.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, 'adsr')
            ? ok()
            : fail('add an adsr module.')
        },
        autoPerform(runtime) {
          ensureModule(runtime, 'adsr', { x: 8, y: 6 })
        },
      },
      {
        id: 'add-vca',
        action: 'add a vca module.',
        why: 'the vca is the volume gate controlled by the envelope.',
        hints: ['vca is in dynamics.'],
        demo: 'drop vca to the right of adsr.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, 'vca')
            ? ok()
            : fail('add a vca module.')
        },
        autoPerform(runtime) {
          ensureModule(runtime, 'vca', { x: 13, y: 6 })
        },
      },
      {
        id: 'add-vco',
        action: 'add a vco module.',
        why: 'the vco will be the voice source we shape.',
        hints: ['you can reuse patterns from the first voice lesson.'],
        demo: 'add vco to the left of vca so the signal path reads left to right.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, 'vco')
            ? ok()
            : fail('add a vco module.')
        },
        autoPerform(runtime) {
          ensureModule(runtime, 'vco', { x: 9, y: 11 })
        },
      },
      {
        id: 'add-output',
        action: 'add an output module.',
        why: 'we still need a final destination for the shaped signal.',
        hints: ['output can sit to the far right.'],
        demo: 'place output next to vca.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, 'output')
            ? ok()
            : fail('add an output module.')
        },
        autoPerform(runtime) {
          ensureModule(runtime, 'output', { x: 18, y: 6 })
        },
      },
      {
        id: 'gate-to-adsr',
        action: 'connect keyboard `gate` to adsr `gate`.',
        why: 'this tells adsr when a note starts and ends.',
        hints: ['click the keyboard first so it becomes armed.'],
        demo: 'patch keyboard gate output into adsr gate input.',
        validate(runtime) {
          const keyboardId = firstModuleByDefinition(runtime, 'keyboard')
          const adsrId = firstModuleByDefinition(runtime, 'adsr')
          if (!keyboardId || !adsrId)
            return fail('add keyboard and adsr first.')
          return hasCable(runtime, keyboardId, 'gate', adsrId, 'gate')
            ? ok()
            : fail('connect keyboard gate to adsr gate.')
        },
        autoPerform(runtime) {
          const keyboardId = ensureModule(runtime, 'keyboard', { x: 2, y: 11 })
          const adsrId = ensureModule(runtime, 'adsr', { x: 8, y: 6 })
          if (!keyboardId || !adsrId) return
          runtime.setSelectedModule(keyboardId)
          ensureCable(
            runtime,
            { moduleId: keyboardId, portId: 'gate' },
            { moduleId: adsrId, portId: 'gate' },
          )
        },
        focus(runtime) {
          const keyboardId = firstModuleByDefinition(runtime, 'keyboard')
          const adsrId = firstModuleByDefinition(runtime, 'adsr')
          if (!keyboardId || !adsrId) return []
          return [
            { kind: 'port', moduleId: keyboardId, portId: 'gate' },
            { kind: 'port', moduleId: adsrId, portId: 'gate' },
          ]
        },
      },
      {
        id: 'cv-to-freq',
        action: 'connect keyboard `cv` to vco `v/oct`.',
        why: 'this adjusts the frequency of the vco based on the keyboard output.',
        hints: ['click the keyboard first so it becomes armed.'],
        demo: 'patch keyboard cv output into vco frequency input.',
        validate(runtime) {
          const keyboardId = firstModuleByDefinition(runtime, 'keyboard')
          const vcoId = firstModuleByDefinition(runtime, 'vco')
          if (!keyboardId || !vcoId) return fail('add keyboard and vco first.')
          return hasCable(runtime, keyboardId, 'cv', vcoId, 'frequency')
            ? ok()
            : fail('connect keyboard cv to vco frequency.')
        },
        autoPerform(runtime) {
          const keyboardId = ensureModule(runtime, 'keyboard', { x: 2, y: 11 })
          const vcoId = ensureModule(runtime, 'vco', { x: 9, y: 11 })
          if (!keyboardId || !vcoId) return
          runtime.setSelectedModule(keyboardId)
          ensureCable(
            runtime,
            { moduleId: keyboardId, portId: 'cv' },
            { moduleId: vcoId, portId: 'frequency' },
          )
        },
        focus(runtime) {
          const keyboardId = firstModuleByDefinition(runtime, 'keyboard')
          const vcoId = firstModuleByDefinition(runtime, 'vco')
          if (!keyboardId || !vcoId) return []
          return [
            { kind: 'port', moduleId: keyboardId, portId: 'cv' },
            { kind: 'port', moduleId: vcoId, portId: 'frequency' },
          ]
        },
      },
      {
        id: 'adsr-to-vca',
        action: 'connect adsr `out` to vca `gain`.',
        why: 'envelope voltage now controls loudness over time.',
        hints: ['patch from the adsr out jack to the vca gain jack.'],
        demo: 'patch adsr out directly into vca gain.',
        validate(runtime) {
          const adsrId = firstModuleByDefinition(runtime, 'adsr')
          const vcaId = firstModuleByDefinition(runtime, 'vca')
          if (!adsrId || !vcaId) return fail('add adsr and vca first.')
          return hasCable(runtime, adsrId, 'envelope', vcaId, 'gain')
            ? ok()
            : fail('connect adsr out to vca gain.')
        },
        autoPerform(runtime) {
          const adsrId = ensureModule(runtime, 'adsr', { x: 8, y: 6 })
          const vcaId = ensureModule(runtime, 'vca', { x: 13, y: 6 })
          if (!adsrId || !vcaId) return
          ensureCable(
            runtime,
            { moduleId: adsrId, portId: 'envelope' },
            { moduleId: vcaId, portId: 'gain' },
          )
        },
        focus(runtime) {
          const adsrId = firstModuleByDefinition(runtime, 'adsr')
          const vcaId = firstModuleByDefinition(runtime, 'vca')
          if (!adsrId || !vcaId) return []
          return [
            { kind: 'port', moduleId: adsrId, portId: 'envelope' },
            { kind: 'port', moduleId: vcaId, portId: 'gain' },
          ]
        },
      },
      {
        id: 'voice-to-vca',
        action: 'connect vco `sin` to vca `in`.',
        why: 'this routes the raw oscillator through the amplifier.',
        hints: ['patch from the vco sin jack to the vca in jack.'],
        demo: 'patch vco sine into vca in.',
        validate(runtime) {
          const vcoId = firstModuleByDefinition(runtime, 'vco')
          const vcaId = firstModuleByDefinition(runtime, 'vca')
          if (!vcoId || !vcaId) return fail('add vco and vca first.')
          return hasCable(runtime, vcoId, 'sine', vcaId, 'audio')
            ? ok()
            : fail('connect vco sine to vca in.')
        },
        autoPerform(runtime) {
          const vcoId = ensureModule(runtime, 'vco', { x: 9, y: 11 })
          const vcaId = ensureModule(runtime, 'vca', { x: 13, y: 6 })
          if (!vcoId || !vcaId) return
          ensureCable(
            runtime,
            { moduleId: vcoId, portId: 'sine' },
            { moduleId: vcaId, portId: 'audio' },
          )
        },
        focus(runtime) {
          const vcoId = firstModuleByDefinition(runtime, 'vco')
          const vcaId = firstModuleByDefinition(runtime, 'vca')
          if (!vcoId || !vcaId) return []
          return [
            { kind: 'port', moduleId: vcoId, portId: 'sine' },
            { kind: 'port', moduleId: vcaId, portId: 'audio' },
          ]
        },
      },
      {
        id: 'vca-to-output-left',
        action: 'connect vca `out` to output `left`.',
        why: 'this completes the shaped audio path.',
        hints: [
          'if you already hear sound in one side, patch right after this too.',
        ],
        demo: 'drag vca out to output left.',
        validate(runtime) {
          const vcaId = firstModuleByDefinition(runtime, 'vca')
          const outputId = firstModuleByDefinition(runtime, 'output')
          if (!vcaId || !outputId) return fail('add vca and output first.')
          return hasCable(runtime, vcaId, 'out', outputId, 'left')
            ? ok()
            : fail('connect vca out to output left.')
        },
        autoPerform(runtime) {
          const vcaId = ensureModule(runtime, 'vca', { x: 13, y: 6 })
          const outputId = ensureModule(runtime, 'output', { x: 18, y: 6 })
          if (!vcaId || !outputId) return
          ensureCable(
            runtime,
            { moduleId: vcaId, portId: 'out' },
            { moduleId: outputId, portId: 'left' },
          )
        },
        focus(runtime) {
          const vcaId = firstModuleByDefinition(runtime, 'vca')
          const outputId = firstModuleByDefinition(runtime, 'output')
          if (!vcaId || !outputId) return []
          return [
            { kind: 'port', moduleId: vcaId, portId: 'out' },
            { kind: 'port', moduleId: outputId, portId: 'left' },
          ]
        },
      },
      {
        id: 'vca-to-output-right',
        action: 'connect vca `out` to output `right`.',
        why: 'dual connection gives centered stereo output.',
        hints: ['fan out the same vca jack to both output channels.'],
        demo: 'add one more cable from vca out to output right.',
        validate(runtime) {
          const vcaId = firstModuleByDefinition(runtime, 'vca')
          const outputId = firstModuleByDefinition(runtime, 'output')
          if (!vcaId || !outputId) return fail('add vca and output first.')
          return hasCable(runtime, vcaId, 'out', outputId, 'right')
            ? ok()
            : fail('connect vca out to output right.')
        },
        autoPerform(runtime) {
          const vcaId = ensureModule(runtime, 'vca', { x: 13, y: 6 })
          const outputId = ensureModule(runtime, 'output', { x: 18, y: 6 })
          if (!vcaId || !outputId) return
          ensureCable(
            runtime,
            { moduleId: vcaId, portId: 'out' },
            { moduleId: outputId, portId: 'right' },
          )
        },
        focus(runtime) {
          const vcaId = firstModuleByDefinition(runtime, 'vca')
          const outputId = firstModuleByDefinition(runtime, 'output')
          if (!vcaId || !outputId) return []
          return [
            { kind: 'port', moduleId: vcaId, portId: 'out' },
            { kind: 'port', moduleId: outputId, portId: 'right' },
          ]
        },
      },
      {
        id: 'reduce-gain',
        action: 'set vca `gain` near 0.',
        why: 'this will allow the envelope to shape the amplitude properly.',
        hints: ['this will control the floor of the envelope modulation.'],
        demo: 'turn the gain knob down to 0 or very close to it.',
        validate(runtime) {
          const vcaId = firstModuleByDefinition(runtime, 'vca')
          const vca = getModule(runtime, vcaId)
          if (!vca) return fail('add a vca first.')
          return inRange(vca.params.gain, 0, 0.05)
            ? ok()
            : fail('set vca gain close to zero (0.00 to 0.05).')
        },
        autoPerform(runtime) {
          const vcaId = ensureModule(runtime, 'vca', { x: 13, y: 6 })
          if (!vcaId) return
          runtime.setParam(vcaId, 'gain', 0.0)
        },
        focus(runtime) {
          const vcaId = firstModuleByDefinition(runtime, 'vca')
          return vcaId
            ? [{ kind: 'param', moduleId: vcaId, paramId: 'gain' }]
            : []
        },
      },
      {
        id: 'shape-attack',
        action: 'set adsr `atk` to 0.05–0.20 s.',
        why: 'a slower attack makes the envelope shape obvious and musical.',
        hints: ['small numbers are snappier; larger numbers feel softer.'],
        demo: 'turn the attack knob until it sits around 0.08 s.',
        validate(runtime) {
          const adsrId = firstModuleByDefinition(runtime, 'adsr')
          const adsr = getModule(runtime, adsrId)
          if (!adsr) return fail('add an adsr first.')
          return inRange(adsr.params.attack, 0.05, 0.2)
            ? ok()
            : fail('set adsr attack between 0.05 and 0.20 seconds.')
        },
        autoPerform(runtime) {
          const adsrId = ensureModule(runtime, 'adsr', { x: 8, y: 6 })
          if (!adsrId) return
          runtime.setParam(adsrId, 'attack', 0.08)
        },
        focus(runtime) {
          const adsrId = firstModuleByDefinition(runtime, 'adsr')
          return adsrId
            ? [{ kind: 'param', moduleId: adsrId, paramId: 'attack' }]
            : []
        },
      },
    ],
  },
  {
    id: 'clock-sequencer',
    title: 'clock + sequencer',
    summary: 'clock a sequencer and drive pitch automatically.',
    completionMessage:
      'nice work, your patch now has a timing backbone and automated pitch movement. you learned how clock pulses advance sequence steps and how cv maps to oscillator pitch. try new bpm ranges, swing, and step values to move from tight loops to more human-feeling grooves.',
    mode: 'beginner',
    steps: [
      {
        id: 'add-clock',
        action: 'add a clock module.',
        why: 'the clock provides stable timing for sequencing.',
        hints: ['clock is under control modules.'],
        demo: 'place clock near the top-left of the rack.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, 'clock')
            ? ok()
            : fail('add a clock module.')
        },
        autoPerform(runtime) {
          ensureModule(runtime, 'clock', { x: 3, y: 4 })
        },
      },
      {
        id: 'add-sequencer',
        action: 'add a seq module.',
        why: 'sequencer steps produce a moving pitch line.',
        hints: ['look for `seq` in the control category.'],
        demo: 'place sequencer to the right of clock.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, 'sequencer')
            ? ok()
            : fail('add a seq module.')
        },
        autoPerform(runtime) {
          ensureModule(runtime, 'sequencer', { x: 9, y: 4 })
        },
      },
      {
        id: 'add-vco',
        action: 'add a vco module.',
        why: 'the sequencer needs a voice to control.',
        hints: ['vco pitch input is labeled v/oct.'],
        demo: 'drop vco below the sequencer.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, 'vco')
            ? ok()
            : fail('add a vco module.')
        },
        autoPerform(runtime) {
          ensureModule(runtime, 'vco', { x: 12, y: 10 })
        },
      },
      {
        id: 'add-output',
        action: 'add an output module.',
        why: 'we need a destination for the sequenced tone.',
        hints: ['one output module is enough.'],
        demo: 'place output to the right of vco.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, 'output')
            ? ok()
            : fail('add an output module.')
        },
        autoPerform(runtime) {
          ensureModule(runtime, 'output', { x: 18, y: 10 })
        },
      },
      {
        id: 'clock-to-seq',
        action: 'connect clock `gate` to seq `clock`.',
        why: 'each gate edge advances the sequencer by one step.',
        hints: ['patch from clock gate into seq clock.'],
        demo: 'patch from clock gate output into sequencer clock input.',
        validate(runtime) {
          const clockId = firstModuleByDefinition(runtime, 'clock')
          const seqId = firstModuleByDefinition(runtime, 'sequencer')
          if (!clockId || !seqId) return fail('add clock and seq first.')
          return hasCable(runtime, clockId, 'gate', seqId, 'clock')
            ? ok()
            : fail('connect clock gate to seq clock.')
        },
        autoPerform(runtime) {
          const clockId = ensureModule(runtime, 'clock', { x: 3, y: 4 })
          const seqId = ensureModule(runtime, 'sequencer', { x: 9, y: 4 })
          if (!clockId || !seqId) return
          ensureCable(
            runtime,
            { moduleId: clockId, portId: 'gate' },
            { moduleId: seqId, portId: 'clock' },
          )
        },
        focus(runtime) {
          const clockId = firstModuleByDefinition(runtime, 'clock')
          const seqId = firstModuleByDefinition(runtime, 'sequencer')
          if (!clockId || !seqId) return []
          return [
            { kind: 'port', moduleId: clockId, portId: 'gate' },
            { kind: 'port', moduleId: seqId, portId: 'clock' },
          ]
        },
      },
      {
        id: 'seq-to-vco',
        action: 'connect seq `out` to vco `v/oct`.',
        why: 'this turns sequencer cv into oscillator pitch.',
        hints: ['patch seq out to the vco v/oct input.'],
        demo: 'patch sequencer cv output into vco v/oct input.',
        validate(runtime) {
          const seqId = firstModuleByDefinition(runtime, 'sequencer')
          const vcoId = firstModuleByDefinition(runtime, 'vco')
          if (!seqId || !vcoId) return fail('add seq and vco first.')
          return hasCable(runtime, seqId, 'cv', vcoId, 'frequency')
            ? ok()
            : fail('connect sequencer out to vco v/oct.')
        },
        autoPerform(runtime) {
          const seqId = ensureModule(runtime, 'sequencer', { x: 9, y: 4 })
          const vcoId = ensureModule(runtime, 'vco', { x: 12, y: 10 })
          if (!seqId || !vcoId) return
          ensureCable(
            runtime,
            { moduleId: seqId, portId: 'cv' },
            { moduleId: vcoId, portId: 'frequency' },
          )
        },
        focus(runtime) {
          const seqId = firstModuleByDefinition(runtime, 'sequencer')
          const vcoId = firstModuleByDefinition(runtime, 'vco')
          if (!seqId || !vcoId) return []
          return [
            { kind: 'port', moduleId: seqId, portId: 'cv' },
            { kind: 'port', moduleId: vcoId, portId: 'frequency' },
          ]
        },
      },
      {
        id: 'vco-to-output',
        action: 'connect vco `sin` to output `left` and `right`.',
        why: 'we can now hear the sequenced pitch movement.',
        hints: ['fan one vco sin output to both output inputs.'],
        demo: 'connect vco sine to output left and right.',
        validate(runtime) {
          const vcoId = firstModuleByDefinition(runtime, 'vco')
          const outputId = firstModuleByDefinition(runtime, 'output')
          if (!vcoId || !outputId) return fail('add vco and output first.')
          return hasCable(runtime, vcoId, 'sine', outputId, 'left') &&
            hasCable(runtime, vcoId, 'sine', outputId, 'right')
            ? ok()
            : fail('connect vco sine to output left and right.')
        },
        autoPerform(runtime) {
          const vcoId = ensureModule(runtime, 'vco', { x: 12, y: 10 })
          const outputId = ensureModule(runtime, 'output', { x: 18, y: 10 })
          if (!vcoId || !outputId) return
          ensureCable(
            runtime,
            { moduleId: vcoId, portId: 'sine' },
            { moduleId: outputId, portId: 'left' },
          )
          ensureCable(
            runtime,
            { moduleId: vcoId, portId: 'sine' },
            { moduleId: outputId, portId: 'right' },
          )
        },
        focus(runtime) {
          const vcoId = firstModuleByDefinition(runtime, 'vco')
          const outputId = firstModuleByDefinition(runtime, 'output')
          if (!vcoId || !outputId) return []
          return [
            { kind: 'port', moduleId: vcoId, portId: 'sine' },
            { kind: 'port', moduleId: outputId, portId: 'left' },
            { kind: 'port', moduleId: outputId, portId: 'right' },
          ]
        },
      },
      {
        id: 'set-bpm',
        action: 'set clock `bpm` between 90 and 160.',
        why: 'mid tempos make step motion easy to perceive.',
        hints: ['try around 120 bpm to start.'],
        demo: 'adjust the clock bpm knob until it lands near 120.',
        validate(runtime) {
          const clockId = firstModuleByDefinition(runtime, 'clock')
          const clock = getModule(runtime, clockId)
          if (!clock) return fail('add a clock first.')
          return inRange(clock.params.bpm, 90, 160)
            ? ok()
            : fail('set clock bpm in the 90–160 range.')
        },
        autoPerform(runtime) {
          const clockId = ensureModule(runtime, 'clock', { x: 3, y: 4 })
          if (!clockId) return
          runtime.setParam(clockId, 'bpm', 120)
        },
        focus(runtime) {
          const clockId = firstModuleByDefinition(runtime, 'clock')
          return clockId
            ? [{ kind: 'param', moduleId: clockId, paramId: 'bpm' }]
            : []
        },
      },
      {
        id: 'set-step-variation',
        action: 'change seq step 2 so it differs from step 1 by at least 0.2.',
        why: 'varying step voltages is what creates a melodic pattern.',
        hints: ['turn the `2` knob until it is clearly different from `1`.'],
        demo: 'set step1 near 0 and step2 around +0.6 for a clear jump.',
        validate(runtime) {
          const seqId = firstModuleByDefinition(runtime, 'sequencer')
          const seq = getModule(runtime, seqId)
          if (!seq) return fail('add a sequencer first.')
          const step1 = seq.params.step1
          const step2 = seq.params.step2
          if (step1 === undefined || step2 === undefined) {
            return fail('step params are missing on sequencer.')
          }
          return Math.abs(step2 - step1) >= 0.2
            ? ok()
            : fail('set step 2 so it differs from step 1 by at least 0.2.')
        },
        autoPerform(runtime) {
          const seqId = ensureModule(runtime, 'sequencer', { x: 9, y: 4 })
          if (!seqId) return
          runtime.setParam(seqId, 'step1', 0)
          runtime.setParam(seqId, 'step2', 0.6)
        },
        focus(runtime) {
          const seqId = firstModuleByDefinition(runtime, 'sequencer')
          if (!seqId) return []
          return [
            { kind: 'param', moduleId: seqId, paramId: 'step1' },
            { kind: 'param', moduleId: seqId, paramId: 'step2' },
          ]
        },
      },
    ],
  },
  {
    id: 'feedback-safely',
    title: 'feedback safely',
    summary: 'build a feedback patch and keep it controlled.',
    completionMessage:
      'excellent, you created a controlled feedback network. you learned that feedback is most musical when you place level control in the loop, and you used a vca to keep repeats stable. experiment by nudging delay time and feedback gain together to explore everything from subtle resonance to evolving textures.',
    mode: 'beginner',
    steps: [
      {
        id: 'add-resonator',
        action: 'add a resonator module.',
        why: 'resonator gives us a bright source to feed into the loop.',
        hints: ['resonator is in source modules.'],
        demo: 'place resonator near the left-center of the rack.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, 'resonator')
            ? ok()
            : fail('add a resonator module.')
        },
        autoPerform(runtime) {
          ensureModule(runtime, 'resonator', { x: 4, y: 8 })
        },
      },
      {
        id: 'add-button',
        action: 'add a button module.',
        why: 'button gives you manual trigger pulses to excite the resonator.',
        hints: ['look for `button` in control modules.'],
        demo: 'place button to the left of resonator.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, 'pushbutton')
            ? ok()
            : fail('add a button module.')
        },
        autoPerform(runtime) {
          ensureModule(runtime, 'pushbutton', { x: 1, y: 8 })
        },
      },
      {
        id: 'add-mixer',
        action: 'add a mixer module.',
        why: 'mixer will combine dry resonator and delayed signal.',
        hints: ['the 4-channel mixer is in utility modules.'],
        demo: 'place mixer to the right side of the rack.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, 'mixer')
            ? ok()
            : fail('add a mixer module.')
        },
        autoPerform(runtime) {
          ensureModule(runtime, 'mixer', { x: 18, y: 7 })
        },
      },
      {
        id: 'add-delay',
        action: 'add a delay module.',
        why: 'this will be the feedback path core.',
        hints: ['use the regular `delay` module (not feedback delay).'],
        demo: 'place delay between resonator and mixer.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, 'delay')
            ? ok()
            : fail('add a delay module.')
        },
        autoPerform(runtime) {
          ensureModule(runtime, 'delay', { x: 10, y: 8 })
        },
      },
      {
        id: 'add-vca',
        action: 'add a vca module.',
        why: 'vca controls how much delayed signal is fed back.',
        hints: ['vca is in dynamics modules.'],
        demo: 'place vca to the right of delay.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, 'vca')
            ? ok()
            : fail('add a vca module.')
        },
        autoPerform(runtime) {
          ensureModule(runtime, 'vca', { x: 14, y: 8 })
        },
      },
      {
        id: 'add-output',
        action: 'add an output module.',
        why: 'output is the final sink for hearing the mixed result.',
        hints: ['place output at the far right.'],
        demo: 'drop output to the right of mixer.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, 'output')
            ? ok()
            : fail('add an output module.')
        },
        autoPerform(runtime) {
          ensureModule(runtime, 'output', { x: 25, y: 8 })
        },
      },
      {
        id: 'button-to-resonator-excite',
        action: 'connect button `trig` to resonator `excite`.',
        why: 'button presses now pluck the resonator.',
        hints: ['patch the button trig output into resonator excite.'],
        demo: 'patch button trig into resonator excite.',
        validate(runtime) {
          const buttonId = firstModuleByDefinition(runtime, 'pushbutton')
          const resonatorId = firstModuleByDefinition(runtime, 'resonator')
          if (!buttonId || !resonatorId)
            return fail('add button and resonator first.')
          return hasCable(runtime, buttonId, 'trigger', resonatorId, 'excite')
            ? ok()
            : fail('connect button trig to resonator excite.')
        },
        autoPerform(runtime) {
          const buttonId = ensureModule(runtime, 'pushbutton', { x: 1, y: 8 })
          const resonatorId = ensureModule(runtime, 'resonator', { x: 4, y: 8 })
          if (!buttonId || !resonatorId) return
          ensureCable(
            runtime,
            { moduleId: buttonId, portId: 'trigger' },
            { moduleId: resonatorId, portId: 'excite' },
          )
        },
        focus(runtime) {
          const buttonId = firstModuleByDefinition(runtime, 'pushbutton')
          const resonatorId = firstModuleByDefinition(runtime, 'resonator')
          if (!buttonId || !resonatorId) return []
          return [
            { kind: 'port', moduleId: buttonId, portId: 'trigger' },
            { kind: 'port', moduleId: resonatorId, portId: 'excite' },
          ]
        },
      },
      {
        id: 'resonator-to-mixer',
        action: 'connect resonator `out` to mixer `in 1`.',
        why: 'this is the dry path in the final mix.',
        hints: ['patch resonator out into mixer in 1.'],
        demo: 'patch resonator out into mixer in 1.',
        validate(runtime) {
          const resonatorId = firstModuleByDefinition(runtime, 'resonator')
          const mixerId = firstModuleByDefinition(runtime, 'mixer')
          if (!resonatorId || !mixerId)
            return fail('add resonator and mixer first.')
          return hasCable(runtime, resonatorId, 'out', mixerId, 'in1')
            ? ok()
            : fail('connect resonator out to mixer in 1.')
        },
        autoPerform(runtime) {
          const resonatorId = ensureModule(runtime, 'resonator', { x: 4, y: 8 })
          const mixerId = ensureModule(runtime, 'mixer', { x: 18, y: 7 })
          if (!resonatorId || !mixerId) return
          ensureCable(
            runtime,
            { moduleId: resonatorId, portId: 'out' },
            { moduleId: mixerId, portId: 'in1' },
          )
        },
        focus(runtime) {
          const resonatorId = firstModuleByDefinition(runtime, 'resonator')
          const mixerId = firstModuleByDefinition(runtime, 'mixer')
          if (!resonatorId || !mixerId) return []
          return [
            { kind: 'port', moduleId: resonatorId, portId: 'out' },
            { kind: 'port', moduleId: mixerId, portId: 'in1' },
          ]
        },
      },
      {
        id: 'resonator-to-delay',
        action: 'connect resonator `out` to delay `in`.',
        why: 'this feeds resonator signal into the delay line.',
        hints: ['patch resonator out into delay in.'],
        demo: 'patch resonator out into delay in.',
        validate(runtime) {
          const resonatorId = firstModuleByDefinition(runtime, 'resonator')
          const delayId = firstModuleByDefinition(runtime, 'delay')
          if (!resonatorId || !delayId)
            return fail('add resonator and delay first.')
          return hasCable(runtime, resonatorId, 'out', delayId, 'audio')
            ? ok()
            : fail('connect resonator out to delay in.')
        },
        autoPerform(runtime) {
          const resonatorId = ensureModule(runtime, 'resonator', { x: 4, y: 8 })
          const delayId = ensureModule(runtime, 'delay', { x: 10, y: 8 })
          if (!resonatorId || !delayId) return
          ensureCable(
            runtime,
            { moduleId: resonatorId, portId: 'out' },
            { moduleId: delayId, portId: 'audio' },
          )
        },
        focus(runtime) {
          const resonatorId = firstModuleByDefinition(runtime, 'resonator')
          const delayId = firstModuleByDefinition(runtime, 'delay')
          if (!resonatorId || !delayId) return []
          return [
            { kind: 'port', moduleId: resonatorId, portId: 'out' },
            { kind: 'port', moduleId: delayId, portId: 'audio' },
          ]
        },
      },
      {
        id: 'delay-to-vca',
        action: 'connect delay `out` to vca `in`.',
        why: 'the delayed signal now passes through a controllable amplifier.',
        hints: ['patch delay out into vca in.'],
        demo: 'patch delay out into vca in.',
        validate(runtime) {
          const delayId = firstModuleByDefinition(runtime, 'delay')
          const vcaId = firstModuleByDefinition(runtime, 'vca')
          if (!delayId || !vcaId) return fail('add delay and vca first.')
          return hasCable(runtime, delayId, 'out', vcaId, 'audio')
            ? ok()
            : fail('connect delay out to vca in.')
        },
        autoPerform(runtime) {
          const delayId = ensureModule(runtime, 'delay', { x: 10, y: 8 })
          const vcaId = ensureModule(runtime, 'vca', { x: 14, y: 8 })
          if (!delayId || !vcaId) return
          ensureCable(
            runtime,
            { moduleId: delayId, portId: 'out' },
            { moduleId: vcaId, portId: 'audio' },
          )
          runtime.setParam(vcaId, 'gain', 0.4)
        },
        focus(runtime) {
          const delayId = firstModuleByDefinition(runtime, 'delay')
          const vcaId = firstModuleByDefinition(runtime, 'vca')
          if (!delayId || !vcaId) return []
          return [
            { kind: 'port', moduleId: delayId, portId: 'out' },
            { kind: 'port', moduleId: vcaId, portId: 'audio' },
          ]
        },
      },
      {
        id: 'vca-back-to-delay',
        action: 'connect vca `out` back to delay `in`.',
        why: 'this creates a feedback path with gain control in the loop.',
        hints: [
          'the loop cable should be accepted and marked as feedback-safe.',
        ],
        demo: 'patch vca out back into delay in to close the loop.',
        validate(runtime) {
          const delayId = firstModuleByDefinition(runtime, 'delay')
          const vcaId = firstModuleByDefinition(runtime, 'vca')
          if (!delayId || !vcaId) return fail('add delay and vca first.')
          const hasLoopCable = hasCable(runtime, vcaId, 'out', delayId, 'audio')
          if (!hasLoopCable) return fail('connect vca out back into delay in.')

          const feedbackBetweenDelayAndVca = Object.entries(
            runtime.cables,
          ).some(([cableId, cable]) => {
            if (!runtime.feedbackCableIds.has(cableId)) return false
            const isDelayToVca =
              cable.from.moduleId === delayId &&
              cable.from.portId === 'out' &&
              cable.to.moduleId === vcaId &&
              cable.to.portId === 'audio'
            const isVcaToDelay =
              cable.from.moduleId === vcaId &&
              cable.from.portId === 'out' &&
              cable.to.moduleId === delayId &&
              cable.to.portId === 'audio'
            return isDelayToVca || isVcaToDelay
          })
          return feedbackBetweenDelayAndVca
            ? ok()
            : fail(
                'feedback loop exists, but it is not marked as feedback yet.',
              )
        },
        autoPerform(runtime) {
          const delayId = ensureModule(runtime, 'delay', { x: 10, y: 8 })
          const vcaId = ensureModule(runtime, 'vca', { x: 14, y: 8 })
          if (!delayId || !vcaId) return
          ensureCable(
            runtime,
            { moduleId: vcaId, portId: 'out' },
            { moduleId: delayId, portId: 'audio' },
          )
          runtime.setParam(vcaId, 'gain', 0.4)
        },
        focus(runtime) {
          const delayId = firstModuleByDefinition(runtime, 'delay')
          const vcaId = firstModuleByDefinition(runtime, 'vca')
          if (!delayId || !vcaId) return []
          return [
            { kind: 'port', moduleId: vcaId, portId: 'out' },
            { kind: 'port', moduleId: delayId, portId: 'audio' },
          ]
        },
      },
      {
        id: 'delay-to-mixer',
        action: 'connect delay `out` to mixer `in 2`.',
        why: 'this adds the wet delayed signal into the final mix.',
        hints: ['patch delay out into mixer in 2.'],
        demo: 'patch delay out into mixer in 2.',
        validate(runtime) {
          const delayId = firstModuleByDefinition(runtime, 'delay')
          const mixerId = firstModuleByDefinition(runtime, 'mixer')
          if (!delayId || !mixerId) return fail('add delay and mixer first.')
          return hasCable(runtime, delayId, 'out', mixerId, 'in2')
            ? ok()
            : fail('connect delay out to mixer in 2.')
        },
        autoPerform(runtime) {
          const delayId = ensureModule(runtime, 'delay', { x: 10, y: 8 })
          const mixerId = ensureModule(runtime, 'mixer', { x: 18, y: 7 })
          if (!delayId || !mixerId) return
          ensureCable(
            runtime,
            { moduleId: delayId, portId: 'out' },
            { moduleId: mixerId, portId: 'in2' },
          )
        },
        focus(runtime) {
          const delayId = firstModuleByDefinition(runtime, 'delay')
          const mixerId = firstModuleByDefinition(runtime, 'mixer')
          if (!delayId || !mixerId) return []
          return [
            { kind: 'port', moduleId: delayId, portId: 'out' },
            { kind: 'port', moduleId: mixerId, portId: 'in2' },
          ]
        },
      },
      {
        id: 'mixer-to-output-stereo',
        action: 'connect mixer `out` to output `left` and `right`.',
        why: 'sending the mix to both channels keeps playback centered.',
        hints: ['fan one mixer output jack to both output inputs.'],
        demo: 'patch mixer out to output left, then add a second cable to output right.',
        validate(runtime) {
          const mixerId = firstModuleByDefinition(runtime, 'mixer')
          const outputId = firstModuleByDefinition(runtime, 'output')
          if (!mixerId || !outputId) return fail('add mixer and output first.')
          return hasCable(runtime, mixerId, 'out', outputId, 'left') &&
            hasCable(runtime, mixerId, 'out', outputId, 'right')
            ? ok()
            : fail('connect mixer out to both output left and right.')
        },
        autoPerform(runtime) {
          const mixerId = ensureModule(runtime, 'mixer', { x: 18, y: 7 })
          const outputId = ensureModule(runtime, 'output', { x: 25, y: 8 })
          if (!mixerId || !outputId) return
          ensureCable(
            runtime,
            { moduleId: mixerId, portId: 'out' },
            { moduleId: outputId, portId: 'left' },
          )
          ensureCable(
            runtime,
            { moduleId: mixerId, portId: 'out' },
            { moduleId: outputId, portId: 'right' },
          )
        },
        focus(runtime) {
          const mixerId = firstModuleByDefinition(runtime, 'mixer')
          const outputId = firstModuleByDefinition(runtime, 'output')
          if (!mixerId || !outputId) return []
          return [
            { kind: 'port', moduleId: mixerId, portId: 'out' },
            { kind: 'port', moduleId: outputId, portId: 'left' },
            { kind: 'port', moduleId: outputId, portId: 'right' },
          ]
        },
      },
    ],
  },
  {
    id: 'subpatch-macros',
    title: 'subpatch macros',
    summary: 'wrap a tiny chain and expose a macro knob.',
    completionMessage:
      'congrats, you turned a patch fragment into a reusable module. you learned how subpatch io and macros let you hide complexity while keeping expressive controls on the surface. try exposing two or three related parameters as macros and duplicate the container to build a small personal utility library.',
    mode: 'beginner',
    steps: [
      {
        id: 'add-container',
        action: 'add a subpatch container.',
        why: 'containers let you package modules into reusable macro blocks.',
        hints: ['use the command palette entry named `subpatch`.'],
        demo: 'create a new subpatch container at the center of the rack.',
        validate(runtime) {
          return firstModuleByDefinition(runtime, '__subpatch__')
            ? ok()
            : fail('add a subpatch container first.')
        },
        autoPerform(runtime) {
          if (firstModuleByDefinition(runtime, '__subpatch__')) return
          const defId = runtime.createDefinition('macro lab')
          runtime.addSubpatchContainer(defId, { x: 8, y: 7 })
        },
      },
      {
        id: 'enter-subpatch',
        action: 'enter the subpatch by double-clicking its header.',
        why: 'drilling in lets you edit the internal graph directly.',
        hints: ['you can also exit later with esc.'],
        demo: 'double-click the container header to open its internal patch view.',
        validate(runtime) {
          return runtime.subpatchContext.length > 0
            ? ok()
            : fail('double-click the container header to enter the subpatch.')
        },
        autoPerform(runtime) {
          if (runtime.subpatchContext.length > 0) return
          const containerId = firstModuleByDefinition(runtime, '__subpatch__')
          if (!containerId) return
          const container = runtime.modules[containerId]
          if (!container || container.definitionId !== '__subpatch__') return
          const def =
            runtime.definitions[
              (container as { subpatchDefinitionId?: string })
                .subpatchDefinitionId ?? ''
            ]
          if (!def) return
          runtime.enterSubpatch(containerId, def.id, def.name)
        },
      },
      {
        id: 'add-sub-in',
        action: 'inside the subpatch, add an `in` proxy module.',
        why: 'proxy modules define the exposed container ports.',
        hints: [
          'inside subpatch mode, the internal `in` module appears in palette.',
        ],
        demo: 'add subpatch input near the left side of the internal canvas.',
        validate(runtime) {
          if (runtime.subpatchContext.length === 0)
            return fail('enter the subpatch first.')
          return firstModuleByDefinition(runtime, 'subpatch-input')
            ? ok()
            : fail('add a subpatch input module (`in`).')
        },
        autoPerform(runtime) {
          if (runtime.subpatchContext.length === 0) return
          ensureModule(runtime, 'subpatch-input', { x: 2, y: 5 })
        },
      },
      {
        id: 'add-vcf',
        action: 'add a vcf inside the subpatch.',
        why: 'we need a real target module for a macro parameter.',
        hints: ['vcf gives us a useful cutoff macro to expose.'],
        demo: 'add vcf in the middle of the internal patch.',
        validate(runtime) {
          if (runtime.subpatchContext.length === 0)
            return fail('enter the subpatch first.')
          return firstModuleByDefinition(runtime, 'vcf')
            ? ok()
            : fail('add a vcf module inside the subpatch.')
        },
        autoPerform(runtime) {
          if (runtime.subpatchContext.length === 0) return
          ensureModule(runtime, 'vcf', { x: 7, y: 5 })
        },
      },
      {
        id: 'add-sub-out',
        action: 'add an `out` proxy module inside the subpatch.',
        why: 'this exposes the processed result back on the container face.',
        hints: ['you now have both sides of the container io.'],
        demo: 'add subpatch output near the right side of the internal canvas.',
        validate(runtime) {
          if (runtime.subpatchContext.length === 0)
            return fail('enter the subpatch first.')
          return firstModuleByDefinition(runtime, 'subpatch-output')
            ? ok()
            : fail('add a subpatch output module (`out`).')
        },
        autoPerform(runtime) {
          if (runtime.subpatchContext.length === 0) return
          ensureModule(runtime, 'subpatch-output', { x: 14, y: 5 })
        },
      },
      {
        id: 'wire-in-to-vcf',
        action: 'connect `in.out` to `vcf.in`.',
        why: 'the container input now feeds your internal processor.',
        hints: ['subpatch input module output port is `out`.'],
        demo: 'patch from subpatch input out to vcf in.',
        validate(runtime) {
          if (runtime.subpatchContext.length === 0)
            return fail('enter the subpatch first.')
          const inId = firstModuleByDefinition(runtime, 'subpatch-input')
          const vcfId = firstModuleByDefinition(runtime, 'vcf')
          if (!inId || !vcfId) return fail('add subpatch input and vcf first.')
          return hasCable(runtime, inId, 'out', vcfId, 'audio')
            ? ok()
            : fail('connect in.out to vcf.in.')
        },
        autoPerform(runtime) {
          const inId = ensureModule(runtime, 'subpatch-input', { x: 2, y: 5 })
          const vcfId = ensureModule(runtime, 'vcf', { x: 7, y: 5 })
          if (!inId || !vcfId) return
          ensureCable(
            runtime,
            { moduleId: inId, portId: 'out' },
            { moduleId: vcfId, portId: 'audio' },
          )
        },
        focus(runtime) {
          if (runtime.subpatchContext.length === 0) return []
          const inId = firstModuleByDefinition(runtime, 'subpatch-input')
          const vcfId = firstModuleByDefinition(runtime, 'vcf')
          if (!inId || !vcfId) return []
          return [
            { kind: 'port', moduleId: inId, portId: 'out' },
            { kind: 'port', moduleId: vcfId, portId: 'audio' },
          ]
        },
      },
      {
        id: 'wire-vcf-to-out',
        action: 'connect `vcf.out` to `out.in`.',
        why: 'this routes the processed signal to the container output.',
        hints: ['patch from vcf out to the out proxy input.'],
        demo: 'patch from vcf out to subpatch output in.',
        validate(runtime) {
          if (runtime.subpatchContext.length === 0)
            return fail('enter the subpatch first.')
          const vcfId = firstModuleByDefinition(runtime, 'vcf')
          const outId = firstModuleByDefinition(runtime, 'subpatch-output')
          if (!vcfId || !outId)
            return fail('add vcf and subpatch output first.')
          return hasCable(runtime, vcfId, 'out', outId, 'in')
            ? ok()
            : fail('connect vcf.out to out.in.')
        },
        autoPerform(runtime) {
          const vcfId = ensureModule(runtime, 'vcf', { x: 7, y: 5 })
          const outId = ensureModule(runtime, 'subpatch-output', {
            x: 14,
            y: 5,
          })
          if (!vcfId || !outId) return
          ensureCable(
            runtime,
            { moduleId: vcfId, portId: 'out' },
            { moduleId: outId, portId: 'in' },
          )
        },
        focus(runtime) {
          if (runtime.subpatchContext.length === 0) return []
          const vcfId = firstModuleByDefinition(runtime, 'vcf')
          const outId = firstModuleByDefinition(runtime, 'subpatch-output')
          if (!vcfId || !outId) return []
          return [
            { kind: 'port', moduleId: vcfId, portId: 'out' },
            { kind: 'port', moduleId: outId, portId: 'in' },
          ]
        },
      },
      {
        id: 'expose-cutoff-macro',
        action: 'expose vcf cutoff as a macro knob.',
        why: 'macros let you control internals from the container surface.',
        hints: ['right-click the cutoff knob and choose `expose as macro`.'],
        demo: 'open the knob context menu on cutoff, then expose it.',
        validate(runtime) {
          const ctx =
            runtime.subpatchContext[runtime.subpatchContext.length - 1]
          if (!ctx) return fail('enter the subpatch first.')
          const def = runtime.definitions[ctx.definitionId]
          if (!def) return fail('subpatch definition not found.')
          return def.macros.some((macro) => macro.targetParamId === 'cutoff')
            ? ok()
            : fail('expose the vcf cutoff knob as a macro.')
        },
        autoPerform(runtime) {
          const ctx =
            runtime.subpatchContext[runtime.subpatchContext.length - 1]
          if (!ctx) return
          const def = runtime.definitions[ctx.definitionId]
          const vcfId = firstModuleByDefinition(runtime, 'vcf')
          if (!def || !vcfId) return
          const macroId = `macro-${vcfId}-cutoff`
          if (def.macros.some((macro) => macro.id === macroId)) return
          runtime.addMacro(def.id, {
            id: macroId,
            label: 'cutoff',
            targetModuleId: vcfId,
            targetParamId: 'cutoff',
          })
        },
      },
      {
        id: 'exit-subpatch',
        action: 'exit back to the root rack.',
        why: 'you can now use the macro from the container face.',
        hints: ['press esc or click the breadcrumb.'],
        demo: 'leave the subpatch so you can see the new macro knob on the container.',
        validate(runtime) {
          return runtime.subpatchContext.length === 0
            ? ok()
            : fail('exit the subpatch to continue.')
        },
        autoPerform(runtime) {
          if (runtime.subpatchContext.length === 0) return
          runtime.exitSubpatch()
        },
      },
      {
        id: 'turn-macro',
        action: 'turn the new macro knob on the container.',
        why: 'this confirms macro control routes to the internal parameter.',
        hints: ['macro state stores per container instance.'],
        demo: 'adjust the container macro away from its default to verify wiring.',
        validate(runtime) {
          const containerId = firstModuleByDefinition(runtime, '__subpatch__')
          const container = runtime.modules[containerId ?? ''] as
            | {
                subpatchDefinitionId?: string
                macroValues?: Record<string, number>
              }
            | undefined
          if (!containerId || !container || !container.subpatchDefinitionId) {
            return fail('add a subpatch container first.')
          }
          const def = runtime.definitions[container.subpatchDefinitionId]
          if (!def) return fail('subpatch definition not found.')
          const macro = def.macros.find((item) => item.targetParamId === 'cutoff')
          if (!macro) return fail('expose a cutoff macro first.')
          const targetModule = def.modules[macro.targetModuleId]
          const defaultValue = targetModule?.params?.[macro.targetParamId]
          if (defaultValue === undefined) {
            return fail('macro target parameter could not be resolved.')
          }
          const value = container.macroValues?.[macro.id]
          return value !== undefined && Math.abs(value - defaultValue) > 0.001
            ? ok()
            : fail(
                'turn the container macro knob so it moves away from default.',
              )
        },
        autoPerform(runtime) {
          const containerId = firstModuleByDefinition(runtime, '__subpatch__')
          const container = runtime.modules[containerId ?? ''] as
            | { subpatchDefinitionId?: string }
            | undefined
          if (!containerId || !container || !container.subpatchDefinitionId)
            return
          const def = runtime.definitions[container.subpatchDefinitionId]
          const macro = def?.macros.find(
            (item) => item.targetParamId === 'cutoff',
          )
          if (!macro) return
          runtime.setMacroValue(containerId, macro.id, 2600)
        },
      },
    ],
  },
  {
    id: 'veteran-kick-voice',
    title: 'challenge: kick voice in 6 modules',
    summary: 'build a playable kick-like voice using 6 modules or fewer.',
    completionMessage:
      'strong finish, you solved a musical goal under tight constraints. you learned how much voice design can be achieved with careful routing and envelope intent rather than module count. experiment with different source and envelope pairings to shape harder attacks, longer tails, or dirtier body tones.',
    mode: 'veteran',
    steps: [
      {
        id: 'goal',
        action: 'goal: patch a kick-style voice in 6 modules or fewer.',
        why: 'constraints force clear architecture and reusable technique.',
        hints: [
          'required structure: source -> vca -> output, plus envelope -> vca.gain.',
          'use ad, ar, or adsr as your envelope source.',
        ],
        demo: 'example compact chain: clock -> ad, vco -> vca, ad -> vca.gain, vca -> output.',
        validate(runtime) {
          if (runtime.subpatchContext.length > 0) {
            return fail(
              'exit any subpatch first; this challenge checks the root rack.',
            )
          }
          const moduleCount = countRootModules(runtime)
          if (moduleCount === 0) return fail('start by adding a few modules.')
          if (moduleCount > 6)
            return fail('keep it tight: use 6 modules or fewer.')

          const hasVcaChain =
            hasConnection(runtime, ['vca'], ['output'], 'left', 'out') ||
            hasConnection(runtime, ['vca'], ['output'], 'right', 'out')
          if (!hasVcaChain)
            return fail('route vca out into output left or right.')

          const hasSourceIntoVca = hasConnection(
            runtime,
            ['vco', 'fmop', 'pluck', 'resonator', 'noise'],
            ['vca'],
            'audio',
          )
          if (!hasSourceIntoVca)
            return fail('feed a source module into vca audio input.')

          const hasEnvToVca = hasConnection(
            runtime,
            ['ad', 'ar', 'adsr'],
            ['vca'],
            'gain',
          )
          if (!hasEnvToVca)
            return fail('connect an envelope output into vca gain.')

          const hasGateToEnv = hasConnection(
            runtime,
            ['clock', 'pushbutton', 'keyboard', 'sequencer', 'euclidean'],
            ['ad', 'ar', 'adsr'],
            'gate',
          )
          if (!hasGateToEnv)
            return fail(
              'drive your envelope gate from a timing/control source.',
            )

          return ok()
        },
        autoPerform(runtime) {
          const clockId = ensureModule(runtime, 'clock', { x: 3, y: 4 })
          const adId = ensureModule(runtime, 'ad', { x: 8, y: 4 })
          const vcoId = ensureModule(runtime, 'vco', { x: 8, y: 10 })
          const vcaId = ensureModule(runtime, 'vca', { x: 13, y: 8 })
          const outputId = ensureModule(runtime, 'output', { x: 18, y: 8 })
          if (!clockId || !adId || !vcoId || !vcaId || !outputId) return

          ensureCable(
            runtime,
            { moduleId: clockId, portId: 'trigger' },
            { moduleId: adId, portId: 'gate' },
          )
          ensureCable(
            runtime,
            { moduleId: adId, portId: 'out' },
            { moduleId: vcaId, portId: 'gain' },
          )
          ensureCable(
            runtime,
            { moduleId: adId, portId: 'out' },
            { moduleId: vcoId, portId: 'frequency' },
          )
          ensureCable(
            runtime,
            { moduleId: vcoId, portId: 'sine' },
            { moduleId: vcaId, portId: 'audio' },
          )
          ensureCable(
            runtime,
            { moduleId: vcaId, portId: 'out' },
            { moduleId: outputId, portId: 'left' },
          )
          ensureCable(
            runtime,
            { moduleId: vcaId, portId: 'out' },
            { moduleId: outputId, portId: 'right' },
          )
          runtime.setParam(vcoId, 'frequency', 55)
          runtime.setParam(vcaId, 'gain', 0)
        },
      },
    ],
  },
  {
    id: 'veteran-clocked-melody',
    title: 'challenge: clocked melody rig',
    summary: 'build a clocked mono melody patch in 8 modules or fewer.',
    completionMessage:
      'great challenge clear, your patch has a complete melodic control chain. you learned to balance clocking, pitch sequencing, articulation, and output routing while staying compact. experiment by changing articulation strategy, adding quantization, or introducing modulation while keeping the module budget lean.',
    disabled: true,
    mode: 'veteran',
    steps: [
      {
        id: 'goal',
        action: 'goal: create a clocked melody rig in 8 modules or fewer.',
        why: 'this mirrors practical live-patching constraints.',
        hints: [
          'required backbone: clock -> seq -> vco -> vca -> output.',
          'for articulation, patch seq gate to vca gain directly or via envelope.',
        ],
        demo: 'a minimal solution is clock + seq + vco + vca + output with five cables.',
        validate(runtime) {
          if (runtime.subpatchContext.length > 0) {
            return fail(
              'exit any subpatch first; this challenge checks the root rack.',
            )
          }
          const moduleCount = countRootModules(runtime)
          if (moduleCount === 0)
            return fail('add modules to begin the challenge.')
          if (moduleCount > 8)
            return fail('trim the patch to 8 modules or fewer.')

          const hasClockToSeq = hasConnection(
            runtime,
            ['clock'],
            ['sequencer'],
            'clock',
            'gate',
          )
          if (!hasClockToSeq)
            return fail('connect clock gate to sequencer clock.')

          const hasSeqPitch = hasConnection(
            runtime,
            ['sequencer'],
            ['vco'],
            'frequency',
            'cv',
          )
          if (!hasSeqPitch) return fail('connect sequencer out to vco v/oct.')

          const hasVoicePath = hasConnection(runtime, ['vco'], ['vca'], 'audio')
          if (!hasVoicePath) return fail('route vco into vca audio input.')

          const hasAmpToOut =
            hasConnection(runtime, ['vca'], ['output'], 'left', 'out') ||
            hasConnection(runtime, ['vca'], ['output'], 'right', 'out')
          if (!hasAmpToOut)
            return fail('route vca out into output left or right.')

          const hasArticulation =
            hasConnection(runtime, ['sequencer'], ['vca'], 'gain', 'gate') ||
            hasConnection(runtime, ['adsr', 'ad', 'ar'], ['vca'], 'gain')

          if (!hasArticulation) {
            return fail(
              'add articulation: seq gate -> vca.gain or envelope -> vca.gain.',
            )
          }

          return ok()
        },
        autoPerform(runtime) {
          const clockId = ensureModule(runtime, 'clock', { x: 3, y: 4 })
          const seqId = ensureModule(runtime, 'sequencer', { x: 9, y: 4 })
          const vcoId = ensureModule(runtime, 'vco', { x: 10, y: 10 })
          const vcaId = ensureModule(runtime, 'vca', { x: 15, y: 10 })
          const outputId = ensureModule(runtime, 'output', { x: 19, y: 9 })
          if (!clockId || !seqId || !vcoId || !vcaId || !outputId) return

          ensureCable(
            runtime,
            { moduleId: clockId, portId: 'gate' },
            { moduleId: seqId, portId: 'clock' },
          )
          ensureCable(
            runtime,
            { moduleId: seqId, portId: 'cv' },
            { moduleId: vcoId, portId: 'frequency' },
          )
          ensureCable(
            runtime,
            { moduleId: seqId, portId: 'gate' },
            { moduleId: vcaId, portId: 'gain' },
          )
          ensureCable(
            runtime,
            { moduleId: vcoId, portId: 'sine' },
            { moduleId: vcaId, portId: 'audio' },
          )
          ensureCable(
            runtime,
            { moduleId: vcaId, portId: 'out' },
            { moduleId: outputId, portId: 'left' },
          )
          runtime.setParam(seqId, 'step1', -0.2)
          runtime.setParam(seqId, 'step2', 0.4)
          runtime.setParam(seqId, 'step3', 0.1)
        },
      },
    ],
  },
  {
    id: 'veteran-subpatch-utility',
    title: 'challenge: macro utility container',
    summary: 'build a reusable subpatch utility with io + macro control.',
    completionMessage:
      'well done, you built a reusable abstraction instead of a one-off patch. you learned how exposed io and macros turn internal graphs into instruments you can repatch quickly at the root level. experiment by adding more exposed ports and macro mappings so one container can cover multiple performance roles.',
    disabled: true,
    mode: 'veteran',
    steps: [
      {
        id: 'goal',
        action:
          'goal: make a subpatch with exposed in/out + one macro, then use it from root.',
        why: 'this is the core workflow for reusable macro modules.',
        hints: [
          'inside the container: add `in`, a processor, and `out`.',
          'expose at least one macro and connect the container in the root patch.',
        ],
        demo: 'example: in -> vcf -> out with cutoff exposed as a macro, then patch noise through it.',
        validate(runtime) {
          if (runtime.subpatchContext.length > 0) {
            return fail('exit any subpatch first; validation happens at root.')
          }
          const containerId = firstModuleByDefinition(runtime, '__subpatch__')
          if (!containerId) return fail('add a subpatch container.')
          const container = runtime.modules[containerId] as {
            subpatchDefinitionId?: string
          }
          if (!container?.subpatchDefinitionId)
            return fail('container definition is missing.')
          const def = runtime.definitions[container.subpatchDefinitionId]
          if (!def) return fail('container definition not found.')

          if (def.exposedInputs.length < 1)
            return fail(
              'expose at least one container input using an `in` proxy.',
            )
          if (def.exposedOutputs.length < 1)
            return fail(
              'expose at least one container output using an `out` proxy.',
            )
          if (def.macros.length < 1)
            return fail(
              'expose at least one macro knob from inside the subpatch.',
            )

          const hasRootCable = Object.values(runtime.cables).some(
            (cable) =>
              cable.from.moduleId === containerId ||
              cable.to.moduleId === containerId,
          )
          if (!hasRootCable)
            return fail(
              'use the container in root by patching at least one cable to it.',
            )

          return ok()
        },
        autoPerform(runtime) {
          let containerId = firstModuleByDefinition(runtime, '__subpatch__')
          if (!containerId) {
            const defId = runtime.createDefinition('macro utility')
            containerId = runtime.addSubpatchContainer(defId, { x: 9, y: 7 })
          }
          if (!containerId) return

          const container = runtime.modules[containerId] as {
            subpatchDefinitionId?: string
          }
          if (!container?.subpatchDefinitionId) return
          const def = runtime.definitions[container.subpatchDefinitionId]
          if (!def) return

          runtime.enterSubpatch(containerId, def.id, def.name)

          const inId = ensureModule(runtime, 'subpatch-input', { x: 2, y: 5 })
          const vcfId = ensureModule(runtime, 'vcf', { x: 7, y: 5 })
          const outId = ensureModule(runtime, 'subpatch-output', {
            x: 13,
            y: 5,
          })
          if (inId && vcfId) {
            ensureCable(
              runtime,
              { moduleId: inId, portId: 'out' },
              { moduleId: vcfId, portId: 'audio' },
            )
          }
          if (vcfId && outId) {
            ensureCable(
              runtime,
              { moduleId: vcfId, portId: 'out' },
              { moduleId: outId, portId: 'in' },
            )
          }

          const currentCtx =
            runtime.subpatchContext[runtime.subpatchContext.length - 1]
          const currentDef = currentCtx
            ? runtime.definitions[currentCtx.definitionId]
            : null
          if (currentDef && vcfId) {
            const macroId = `macro-${vcfId}-cutoff`
            if (!currentDef.macros.some((macro) => macro.id === macroId)) {
              runtime.addMacro(currentDef.id, {
                id: macroId,
                label: 'cutoff',
                targetModuleId: vcfId,
                targetParamId: 'cutoff',
              })
            }
          }

          runtime.exitSubpatch()

          const noiseId = ensureModule(runtime, 'noise', { x: 3, y: 9 })
          const outputId = ensureModule(runtime, 'output', { x: 19, y: 8 })
          const freshContainer = runtime.modules[containerId] as {
            subpatchDefinitionId?: string
          }
          const freshDef = freshContainer?.subpatchDefinitionId
            ? runtime.definitions[freshContainer.subpatchDefinitionId]
            : null
          if (!noiseId || !outputId || !freshDef) return
          if (freshDef.exposedInputs.length > 0) {
            ensureCable(
              runtime,
              { moduleId: noiseId, portId: 'white' },
              { moduleId: containerId, portId: 'sp_in_0' },
            )
          }
          if (freshDef.exposedOutputs.length > 0) {
            ensureCable(
              runtime,
              { moduleId: containerId, portId: 'sp_out_0' },
              { moduleId: outputId, portId: 'left' },
            )
          }
        },
      },
    ],
  },
]

export function getTutorialLesson(id: string): TutorialLesson | null {
  const lesson = TUTORIAL_LESSONS.find((item) => item.id === id) ?? null
  if (!lesson || lesson.disabled) return null
  return lesson
}

export function getLessonsForMode(
  mode: TutorialLesson['mode'],
): TutorialLesson[] {
  return TUTORIAL_LESSONS.filter(
    (lesson) => lesson.mode === mode && !lesson.disabled,
  )
}
