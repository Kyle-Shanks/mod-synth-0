export const WAVETABLE_BANK_OPTIONS = [
  'classic',
  'hollow',
  'digital',
  'vocal',
] as const

export type WavetableBank = [
  Float32Array,
  Float32Array,
  Float32Array,
  Float32Array,
  Float32Array,
]

export function createWavetableBanks(
  tableSize: number,
): WavetableBank[] {
  const twoPi = 2 * Math.PI

  function createBankF32(): WavetableBank {
    return [
      new Float32Array(tableSize),
      new Float32Array(tableSize),
      new Float32Array(tableSize),
      new Float32Array(tableSize),
      new Float32Array(tableSize),
    ]
  }

  const classic = createBankF32()
  const hollow = createBankF32()
  const digital = createBankF32()
  const vocal = createBankF32()

  for (let i = 0; i < tableSize; i++) {
    const phase = i / tableSize
    const rad = phase * twoPi

    // classic: familiar analog-ish shapes with richer final harmonic table.
    classic[0][i] = Math.sin(rad)
    classic[1][i] = 1 - 4 * Math.abs(phase - 0.5)
    classic[2][i] = 2 * phase - 1
    classic[3][i] = phase < 0.42 ? 1 : -1
    classic[4][i] =
      (Math.sin(rad) * 0.62 +
        Math.sin(rad * 2 + 0.35) * 0.3 +
        Math.sin(rad * 3 + 1.17) * 0.2 +
        Math.sin(rad * 5 + 0.73) * 0.14) /
      1.26

    // hollow: odd-heavy and notch-like spectra for airy/scooped tones.
    hollow[0][i] = Math.sin(rad)
    hollow[1][i] =
      (Math.sin(rad) * 0.85 +
        Math.sin(rad * 3) * 0.32 +
        Math.sin(rad * 5) * 0.18) /
      1.35
    hollow[2][i] =
      (Math.sin(rad * 2) * 0.78 +
        Math.sin(rad * 4 + 0.2) * 0.35 +
        Math.sin(rad * 6 + 0.7) * 0.2) /
      1.33
    hollow[3][i] =
      (Math.sin(rad) * 0.7 -
        Math.sin(rad * 2) * 0.48 +
        Math.sin(rad * 5 + 0.5) * 0.25) /
      1.43
    hollow[4][i] =
      (Math.sin(rad) * 0.85 +
        Math.sin(rad * 7 + 1.1) * 0.25 +
        Math.sin(rad * 9 + 0.4) * 0.14) /
      1.24

    // digital: stepped/folded shapes for brighter and edgier timbres.
    const quantStep = 16
    const quantPhase = Math.floor(phase * quantStep) / quantStep
    digital[0][i] = Math.sin(rad)
    digital[1][i] = Math.sin(quantPhase * twoPi)
    digital[2][i] = Math.tanh((2 * phase - 1) * 4)
    digital[3][i] = Math.sin(rad + Math.sin(rad * 4) * 1.1)
    digital[4][i] = Math.max(-1, Math.min(1, (2 * phase - 1) * 3))

    // vocal: formant-ish combinations that read like vowel-like spectra.
    const formantA =
      Math.sin(rad) * 0.8 +
      Math.sin(rad * 3 + 0.2) * 0.38 +
      Math.sin(rad * 5 + 0.6) * 0.22
    const formantE =
      Math.sin(rad) * 0.74 +
      Math.sin(rad * 2 + 0.5) * 0.34 +
      Math.sin(rad * 7 + 0.9) * 0.25
    const formantI =
      Math.sin(rad) * 0.7 +
      Math.sin(rad * 4 + 0.25) * 0.35 +
      Math.sin(rad * 9 + 0.4) * 0.2
    const formantO =
      Math.sin(rad) * 0.85 +
      Math.sin(rad * 2 + 0.15) * 0.28 +
      Math.sin(rad * 3 + 0.52) * 0.2
    const formantU =
      Math.sin(rad) * 0.92 +
      Math.sin(rad * 2 + 0.05) * 0.24 +
      Math.sin(rad * 4 + 0.4) * 0.14
    vocal[0][i] = formantA / 1.4
    vocal[1][i] = formantE / 1.33
    vocal[2][i] = formantI / 1.3
    vocal[3][i] = formantO / 1.33
    vocal[4][i] = formantU / 1.3
  }

  return [classic, hollow, digital, vocal]
}
