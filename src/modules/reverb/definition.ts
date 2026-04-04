import type { ModuleDefinition } from '../../engine/types'

interface ReverbState {
  initialized: boolean
  _lastMode: number
  // ─── Freeverb ──────────────────────────────────────────────────────────────
  c0: Float32Array | null
  c1: Float32Array | null
  c2: Float32Array | null
  c3: Float32Array | null
  c4: Float32Array | null
  c5: Float32Array | null
  c6: Float32Array | null
  c7: Float32Array | null
  ci0: number
  ci1: number
  ci2: number
  ci3: number
  ci4: number
  ci5: number
  ci6: number
  ci7: number
  cf0: number
  cf1: number
  cf2: number
  cf3: number // per-comb damp filter states
  cf4: number
  cf5: number
  cf6: number
  cf7: number
  a0: Float32Array | null
  a1: Float32Array | null
  a2: Float32Array | null
  a3: Float32Array | null
  ai0: number
  ai1: number
  ai2: number
  ai3: number
  // ─── Dattorro plate ────────────────────────────────────────────────────────
  pdBuf: Float32Array | null
  pdIdx: number // pre-delay
  bwState: number // bandwidth filter state
  id0: Float32Array | null
  id1: Float32Array | null // input diffusion allpass
  id2: Float32Array | null
  id3: Float32Array | null
  idi0: number
  idi1: number
  idi2: number
  idi3: number
  mapLBuf: Float32Array | null
  mapLIdx: number
  mapLLen: number // tank: mod allpass L
  mapRBuf: Float32Array | null
  mapRIdx: number
  mapRLen: number // tank: mod allpass R
  ldLBuf: Float32Array | null
  ldLIdx: number // tank: long delay L
  ldRBuf: Float32Array | null
  ldRIdx: number // tank: long delay R
  dfL: number
  dfR: number // tank: damp filter states
  dapLBuf: Float32Array | null
  dapLIdx: number // tank: decay allpass L
  dapRBuf: Float32Array | null
  dapRIdx: number // tank: decay allpass R
  sdLBuf: Float32Array | null
  sdLIdx: number // tank: short delay L
  sdRBuf: Float32Array | null
  sdRIdx: number // tank: short delay R
  lfoPhase: number
  tankL: number
  tankR: number // cross-feed accumulators
  dtModDepth: number
  [key: string]: unknown
}

export const ReverbDefinition: ModuleDefinition<
  {
    audio: { type: 'audio'; default: 0; label: 'in' }
  },
  {
    out: { type: 'audio'; default: 0; label: 'out' }
  },
  {
    mode: {
      type: 'select'
      default: 0
      options: ['room', 'plate']
      label: 'mode'
    }
    mix: { type: 'float'; min: 0; max: 1; default: 0.3; label: 'mix' }
    decay: {
      type: 'float'
      min: 0.1
      max: 10
      default: 2
      label: 'decay'
      unit: 's'
    }
    damping: { type: 'float'; min: 0; max: 1; default: 0.5; label: 'damp' }
  },
  ReverbState
> = {
  id: 'reverb',
  name: 'reverb',
  category: 'fx',
  width: 3,
  height: 4,

  inputs: {
    audio: { type: 'audio', default: 0, label: 'in' },
  },
  outputs: {
    out: { type: 'audio', default: 0, label: 'out' },
  },
  params: {
    mode: {
      type: 'select',
      default: 0,
      options: ['room', 'plate'],
      label: 'mode',
    },
    mix: { type: 'float', min: 0, max: 1, default: 0.3, label: 'mix' },
    decay: {
      type: 'float',
      min: 0.1,
      max: 10,
      default: 2,
      label: 'decay',
      unit: 's',
    },
    damping: { type: 'float', min: 0, max: 1, default: 0.5, label: 'damp' },
  },

  initialize(): ReverbState {
    return {
      initialized: false,
      _lastMode: -1,
      c0: null,
      c1: null,
      c2: null,
      c3: null,
      c4: null,
      c5: null,
      c6: null,
      c7: null,
      ci0: 0,
      ci1: 0,
      ci2: 0,
      ci3: 0,
      ci4: 0,
      ci5: 0,
      ci6: 0,
      ci7: 0,
      cf0: 0,
      cf1: 0,
      cf2: 0,
      cf3: 0,
      cf4: 0,
      cf5: 0,
      cf6: 0,
      cf7: 0,
      a0: null,
      a1: null,
      a2: null,
      a3: null,
      ai0: 0,
      ai1: 0,
      ai2: 0,
      ai3: 0,
      pdBuf: null,
      pdIdx: 0,
      bwState: 0,
      id0: null,
      id1: null,
      id2: null,
      id3: null,
      idi0: 0,
      idi1: 0,
      idi2: 0,
      idi3: 0,
      mapLBuf: null,
      mapLIdx: 0,
      mapLLen: 0,
      mapRBuf: null,
      mapRIdx: 0,
      mapRLen: 0,
      ldLBuf: null,
      ldLIdx: 0,
      ldRBuf: null,
      ldRIdx: 0,
      dfL: 0,
      dfR: 0,
      dapLBuf: null,
      dapLIdx: 0,
      dapRBuf: null,
      dapRIdx: 0,
      sdLBuf: null,
      sdLIdx: 0,
      sdRBuf: null,
      sdRIdx: 0,
      lfoPhase: 0,
      tankL: 0,
      tankR: 0,
      dtModDepth: 0,
    }
  },

  process(inputs, outputs, params, state, context) {
    const sampleRate = context.sampleRate
    const mode = Math.round(params.mode)

    // ── init or re-init on mode switch ──────────────────────────────────────
    if (!state.initialized || (state._lastMode as number) !== mode) {
      if (mode === 0) {
        // Freeverb: 8 parallel comb filters + 4 series allpass
        // Delay lengths from the canonical Freeverb implementation, scaled for sample rate
        const s = sampleRate / 44100
        state.c0 = new Float32Array(Math.round(1557 * s))
        state.c1 = new Float32Array(Math.round(1617 * s))
        state.c2 = new Float32Array(Math.round(1491 * s))
        state.c3 = new Float32Array(Math.round(1422 * s))
        state.c4 = new Float32Array(Math.round(1277 * s))
        state.c5 = new Float32Array(Math.round(1356 * s))
        state.c6 = new Float32Array(Math.round(1188 * s))
        state.c7 = new Float32Array(Math.round(1116 * s))
        state.ci0 = 0
        state.ci1 = 0
        state.ci2 = 0
        state.ci3 = 0
        state.ci4 = 0
        state.ci5 = 0
        state.ci6 = 0
        state.ci7 = 0
        state.cf0 = 0
        state.cf1 = 0
        state.cf2 = 0
        state.cf3 = 0
        state.cf4 = 0
        state.cf5 = 0
        state.cf6 = 0
        state.cf7 = 0
        state.a0 = new Float32Array(Math.round(225 * s))
        state.a1 = new Float32Array(Math.round(556 * s))
        state.a2 = new Float32Array(Math.round(441 * s))
        state.a3 = new Float32Array(Math.round(341 * s))
        state.ai0 = 0
        state.ai1 = 0
        state.ai2 = 0
        state.ai3 = 0
      } else {
        // Dattorro plate reverb — delay lengths scaled from the 29761 Hz reference rate
        const s = sampleRate / 29761
        const modDepth = Math.round(16 * s)
        // Pre-delay: 10ms
        state.pdBuf = new Float32Array(Math.round(0.01 * sampleRate))
        state.pdIdx = 0
        state.bwState = 0
        // Input diffusion allpass delays: 142, 107, 379, 277 samples @ 29761 Hz
        state.id0 = new Float32Array(Math.round(142 * s))
        state.id1 = new Float32Array(Math.round(107 * s))
        state.id2 = new Float32Array(Math.round(379 * s))
        state.id3 = new Float32Array(Math.round(277 * s))
        state.idi0 = 0
        state.idi1 = 0
        state.idi2 = 0
        state.idi3 = 0
        // Tank modulated allpass — extra allocation to cover full LFO excursion
        state.mapLLen = Math.round(672 * s)
        state.mapLBuf = new Float32Array(
          (state.mapLLen as number) + modDepth + 4,
        )
        state.mapLIdx = 0
        state.mapRLen = Math.round(908 * s)
        state.mapRBuf = new Float32Array(
          (state.mapRLen as number) + modDepth + 4,
        )
        state.mapRIdx = 0
        // Tank long delays: 4453, 4217 samples @ 29761 Hz
        state.ldLBuf = new Float32Array(Math.round(4453 * s))
        state.ldLIdx = 0
        state.ldRBuf = new Float32Array(Math.round(4217 * s))
        state.ldRIdx = 0
        state.dfL = 0
        state.dfR = 0
        // Tank decay allpass delays: 1800, 2656 samples @ 29761 Hz
        state.dapLBuf = new Float32Array(Math.round(1800 * s))
        state.dapLIdx = 0
        state.dapRBuf = new Float32Array(Math.round(2656 * s))
        state.dapRIdx = 0
        // Tank short delays: 3720, 3163 samples @ 29761 Hz
        state.sdLBuf = new Float32Array(Math.round(3720 * s))
        state.sdLIdx = 0
        state.sdRBuf = new Float32Array(Math.round(3163 * s))
        state.sdRIdx = 0
        state.lfoPhase = 0
        state.tankL = 0
        state.tankR = 0
        state.dtModDepth = modDepth
      }
      state._lastMode = mode
      state.initialized = true
    }

    const mix = params.mix
    const dry = 1 - mix
    const damp = params.damping

    if (mode === 0) {
      // ═══════════════════════════════════════════════════════════════════════
      //  ROOM  —  Freeverb: 8 parallel comb filters + 4 series allpass
      //  Fixed damping filter state (one per comb) gives a warm, dense room.
      // ═══════════════════════════════════════════════════════════════════════
      const c0 = state.c0 as Float32Array
      const c1 = state.c1 as Float32Array
      const c2 = state.c2 as Float32Array
      const c3 = state.c3 as Float32Array
      const c4 = state.c4 as Float32Array
      const c5 = state.c5 as Float32Array
      const c6 = state.c6 as Float32Array
      const c7 = state.c7 as Float32Array
      const a0 = state.a0 as Float32Array
      const a1 = state.a1 as Float32Array
      const a2 = state.a2 as Float32Array
      const a3 = state.a3 as Float32Array

      // RT60 feedback coefficient: -60 dB in params.decay seconds
      const avgDelay =
        (c0.length +
          c1.length +
          c2.length +
          c3.length +
          c4.length +
          c5.length +
          c6.length +
          c7.length) *
        0.125
      const feedback = Math.pow(0.001, avgDelay / (params.decay * sampleRate))
      const dA = damp // one-pole LP coefficient (damping)
      const dB = 1 - damp // passthrough fraction

      for (let i = 0; i < 128; i++) {
        const rawIn = inputs.audio[i] ?? 0
        const inp = rawIn

        let combSum = 0
        let idx: number, del: number, y: number

        idx = state.ci0 as number
        del = c0[idx]!
        y = del * dB + (state.cf0 as number) * dA
        state.cf0 = y
        c0[idx] = inp + y * feedback
        state.ci0 = (idx + 1) % c0.length
        combSum += del

        idx = state.ci1 as number
        del = c1[idx]!
        y = del * dB + (state.cf1 as number) * dA
        state.cf1 = y
        c1[idx] = inp + y * feedback
        state.ci1 = (idx + 1) % c1.length
        combSum += del

        idx = state.ci2 as number
        del = c2[idx]!
        y = del * dB + (state.cf2 as number) * dA
        state.cf2 = y
        c2[idx] = inp + y * feedback
        state.ci2 = (idx + 1) % c2.length
        combSum += del

        idx = state.ci3 as number
        del = c3[idx]!
        y = del * dB + (state.cf3 as number) * dA
        state.cf3 = y
        c3[idx] = inp + y * feedback
        state.ci3 = (idx + 1) % c3.length
        combSum += del

        idx = state.ci4 as number
        del = c4[idx]!
        y = del * dB + (state.cf4 as number) * dA
        state.cf4 = y
        c4[idx] = inp + y * feedback
        state.ci4 = (idx + 1) % c4.length
        combSum += del

        idx = state.ci5 as number
        del = c5[idx]!
        y = del * dB + (state.cf5 as number) * dA
        state.cf5 = y
        c5[idx] = inp + y * feedback
        state.ci5 = (idx + 1) % c5.length
        combSum += del

        idx = state.ci6 as number
        del = c6[idx]!
        y = del * dB + (state.cf6 as number) * dA
        state.cf6 = y
        c6[idx] = inp + y * feedback
        state.ci6 = (idx + 1) % c6.length
        combSum += del

        idx = state.ci7 as number
        del = c7[idx]!
        y = del * dB + (state.cf7 as number) * dA
        state.cf7 = y
        c7[idx] = inp + y * feedback
        state.ci7 = (idx + 1) % c7.length
        combSum += del

        combSum *= 0.125 // average 8 combs

        // 4 series allpass diffusers (g = 0.5 each)
        let ai: number, ad: number, as_: number

        ai = state.ai0 as number
        ad = a0[ai]!
        as_ = combSum + ad * 0.5
        a0[ai] = as_
        combSum = ad - as_ * 0.5
        state.ai0 = (ai + 1) % a0.length

        ai = state.ai1 as number
        ad = a1[ai]!
        as_ = combSum + ad * 0.5
        a1[ai] = as_
        combSum = ad - as_ * 0.5
        state.ai1 = (ai + 1) % a1.length

        ai = state.ai2 as number
        ad = a2[ai]!
        as_ = combSum + ad * 0.5
        a2[ai] = as_
        combSum = ad - as_ * 0.5
        state.ai2 = (ai + 1) % a2.length

        ai = state.ai3 as number
        ad = a3[ai]!
        as_ = combSum + ad * 0.5
        a3[ai] = as_
        combSum = ad - as_ * 0.5
        state.ai3 = (ai + 1) % a3.length

        outputs.out[i] = rawIn * dry + combSum * mix
      }
    } else {
      // ═══════════════════════════════════════════════════════════════════════
      //  PLATE  —  Dattorro (1997): input diffusion + modulated cross-coupled tank
      //  Modulated delay lines prevent metallic resonances; richer, lusher tail.
      // ═══════════════════════════════════════════════════════════════════════
      const pdBuf = state.pdBuf as Float32Array
      const id0 = state.id0 as Float32Array
      const id1 = state.id1 as Float32Array
      const id2 = state.id2 as Float32Array
      const id3 = state.id3 as Float32Array
      const mapLBuf = state.mapLBuf as Float32Array
      const mapRBuf = state.mapRBuf as Float32Array
      const ldLBuf = state.ldLBuf as Float32Array
      const ldRBuf = state.ldRBuf as Float32Array
      const dapLBuf = state.dapLBuf as Float32Array
      const dapRBuf = state.dapRBuf as Float32Array
      const sdLBuf = state.sdLBuf as Float32Array
      const sdRBuf = state.sdRBuf as Float32Array
      const mapLLen = state.mapLLen as number
      const mapRLen = state.mapRLen as number
      const mapLBufLen = mapLBuf.length
      const mapRBufLen = mapRBuf.length
      const ldLLen = ldLBuf.length
      const ldRLen = ldRBuf.length
      const dapLLen = dapLBuf.length
      const dapRLen = dapRBuf.length
      const sdLLen = sdLBuf.length
      const sdRLen = sdRBuf.length
      const modDepth = state.dtModDepth as number

      // bandwidth: damp=0 → full spectrum, damp=1 → very dark
      const bandwidth = 1 - damp * 0.97

      // RT60 decay mapped to a per-loop tank attenuation coefficient
      const avgLoop =
        (mapLLen +
          ldLLen +
          dapLLen +
          sdLLen +
          mapRLen +
          ldRLen +
          dapRLen +
          sdRLen) *
        0.5
      const loopDecay = Math.pow(0.001, avgLoop / (params.decay * sampleRate))
      const decayCoeff = Math.max(0.1, Math.min(0.97, loopDecay))

      // LFO: 0.5 Hz, modulates tank allpass delays to break up resonances
      const lfoInc = 0.5 / sampleRate
      const twoPi = 6.283185307

      // Output tap offsets — from Dattorro's original tap table, scaled to sample rate
      const dtS = sampleRate / 29761
      const t1o = Math.min(Math.round(266 * dtS), ldRLen - 1) // from ldR
      const t2o = Math.min(Math.round(2974 * dtS), ldRLen - 1) // from ldR
      const t3o = Math.min(Math.round(1990 * dtS), ldLLen - 1) // from ldL (negate)
      const t4o = Math.min(Math.round(353 * dtS), ldLLen - 1) // from ldL
      const t5o = Math.min(Math.round(3627 * dtS), ldLLen - 1) // from ldL
      const t6o = Math.min(Math.round(2111 * dtS), ldRLen - 1) // from ldR (negate)

      for (let i = 0; i < 128; i++) {
        const rawIn = inputs.audio[i] ?? 0

        // Pre-delay
        const pdIdx = state.pdIdx as number
        const pdOut = pdBuf[pdIdx]!
        pdBuf[pdIdx] = rawIn
        state.pdIdx = (pdIdx + 1) % pdBuf.length

        // Bandwidth filter (one-pole LP on input — controls HF content entering the tank)
        const bwS =
          (state.bwState as number) +
          (pdOut - (state.bwState as number)) * bandwidth
        state.bwState = bwS

        // Input diffusion: 4 allpass stages (g = 0.75, 0.75, 0.625, 0.625)
        let ai: number, ad: number, as_: number, sig: number

        ai = state.idi0 as number
        ad = id0[ai]!
        as_ = bwS + ad * 0.75
        id0[ai] = as_
        sig = ad - as_ * 0.75
        state.idi0 = (ai + 1) % id0.length

        ai = state.idi1 as number
        ad = id1[ai]!
        as_ = sig + ad * 0.75
        id1[ai] = as_
        sig = ad - as_ * 0.75
        state.idi1 = (ai + 1) % id1.length

        ai = state.idi2 as number
        ad = id2[ai]!
        as_ = sig + ad * 0.625
        id2[ai] = as_
        sig = ad - as_ * 0.625
        state.idi2 = (ai + 1) % id2.length

        ai = state.idi3 as number
        ad = id3[ai]!
        as_ = sig + ad * 0.625
        id3[ai] = as_
        sig = ad - as_ * 0.625
        state.idi3 = (ai + 1) % id3.length

        // Advance LFO
        const newLfoPhase = ((state.lfoPhase as number) + lfoInc) % 1
        state.lfoPhase = newLfoPhase
        const lfo = Math.sin(newLfoPhase * twoPi)

        // Pre-compute both tank inputs using PREVIOUS cross-feed values (correct topology)
        const tankInL = sig + (state.tankR as number) * decayCoeff
        const tankInR = sig + (state.tankL as number) * decayCoeff

        // ── Left tank ──────────────────────────────────────────────────────
        // Modulated allpass L (LFO shifts delay +modDepth to +modDepth)
        const mapLModDelay = mapLLen + lfo * modDepth
        const mapLFloor = Math.floor(mapLModDelay)
        const mapLFrac = mapLModDelay - mapLFloor
        const mapLWIdx = state.mapLIdx as number
        const mapLR0 =
          (((mapLWIdx - mapLFloor) % mapLBufLen) + mapLBufLen) % mapLBufLen
        const mapLR1 = (mapLR0 - 1 + mapLBufLen) % mapLBufLen
        const mapLDel =
          mapLBuf[mapLR0]! * (1 - mapLFrac) + mapLBuf[mapLR1]! * mapLFrac
        const mapLS = tankInL + mapLDel * 0.7
        mapLBuf[mapLWIdx] = mapLS
        state.mapLIdx = (mapLWIdx + 1) % mapLBufLen
        const mapLOut = mapLDel - mapLS * 0.7

        // Long delay L
        const ldLWIdx = state.ldLIdx as number
        const ldLOut = ldLBuf[ldLWIdx]!
        ldLBuf[ldLWIdx] = mapLOut
        state.ldLIdx = (ldLWIdx + 1) % ldLLen

        // Damp filter L (LP in feedback loop controls HF decay rate)
        const dfL =
          (state.dfL as number) + (ldLOut - (state.dfL as number)) * bandwidth
        state.dfL = dfL

        // Decay allpass L (g = 0.5)
        const dapLWIdx = state.dapLIdx as number
        const dapLDel = dapLBuf[dapLWIdx]!
        const dapLS = dfL + dapLDel * 0.5
        dapLBuf[dapLWIdx] = dapLS
        state.dapLIdx = (dapLWIdx + 1) % dapLLen

        // Short delay L
        const sdLWIdx = state.sdLIdx as number
        const sdLOut = sdLBuf[sdLWIdx]!
        sdLBuf[sdLWIdx] = dapLDel - dapLS * 0.5
        state.sdLIdx = (sdLWIdx + 1) % sdLLen
        state.tankL = sdLOut // feeds right tank next sample

        // ── Right tank ─────────────────────────────────────────────────────
        // Modulated allpass R (opposite LFO phase for stereo decorrelation)
        const mapRModDelay = mapRLen - lfo * modDepth
        const mapRFloor = Math.floor(mapRModDelay)
        const mapRFrac = mapRModDelay - mapRFloor
        const mapRWIdx = state.mapRIdx as number
        const mapRR0 =
          (((mapRWIdx - mapRFloor) % mapRBufLen) + mapRBufLen) % mapRBufLen
        const mapRR1 = (mapRR0 - 1 + mapRBufLen) % mapRBufLen
        const mapRDel =
          mapRBuf[mapRR0]! * (1 - mapRFrac) + mapRBuf[mapRR1]! * mapRFrac
        const mapRS = tankInR + mapRDel * 0.7
        mapRBuf[mapRWIdx] = mapRS
        state.mapRIdx = (mapRWIdx + 1) % mapRBufLen
        const mapROut = mapRDel - mapRS * 0.7

        // Long delay R
        const ldRWIdx = state.ldRIdx as number
        const ldROut = ldRBuf[ldRWIdx]!
        ldRBuf[ldRWIdx] = mapROut
        state.ldRIdx = (ldRWIdx + 1) % ldRLen

        // Damp filter R
        const dfR =
          (state.dfR as number) + (ldROut - (state.dfR as number)) * bandwidth
        state.dfR = dfR

        // Decay allpass R (g = 0.5)
        const dapRWIdx = state.dapRIdx as number
        const dapRDel = dapRBuf[dapRWIdx]!
        const dapRS = dfR + dapRDel * 0.5
        dapRBuf[dapRWIdx] = dapRS
        state.dapRIdx = (dapRWIdx + 1) % dapRLen

        // Short delay R
        const sdRWIdx = state.sdRIdx as number
        const sdROut = sdRBuf[sdRWIdx]!
        sdRBuf[sdRWIdx] = dapRDel - dapRS * 0.5
        state.sdRIdx = (sdRWIdx + 1) % sdRLen
        state.tankR = sdROut // feeds left tank next sample

        // ── Multi-tap mono output ──────────────────────────────────────────
        // Six taps pulled from both long delays give a full, rich mono output.
        // Polarities follow Dattorro's original stereo tap table.
        const curLdLIdx = state.ldLIdx as number
        const curLdRIdx = state.ldRIdx as number

        const ot1 =
          ldRBuf[(((curLdRIdx - 1 - t1o + ldRLen) % ldRLen) + ldRLen) % ldRLen]!
        const ot2 =
          ldRBuf[(((curLdRIdx - 1 - t2o + ldRLen) % ldRLen) + ldRLen) % ldRLen]!
        const ot3 =
          ldLBuf[(((curLdLIdx - 1 - t3o + ldLLen) % ldLLen) + ldLLen) % ldLLen]! // –
        const ot4 =
          ldLBuf[(((curLdLIdx - 1 - t4o + ldLLen) % ldLLen) + ldLLen) % ldLLen]!
        const ot5 =
          ldLBuf[(((curLdLIdx - 1 - t5o + ldLLen) % ldLLen) + ldLLen) % ldLLen]!
        const ot6 =
          ldRBuf[(((curLdRIdx - 1 - t6o + ldRLen) % ldRLen) + ldRLen) % ldRLen]! // –

        const wetOut = (ot1 + ot2 + ot4 + ot5 - ot3 - ot6) * (1 / 6)

        outputs.out[i] = rawIn * dry + wetOut * mix
      }
    }
  },
}
