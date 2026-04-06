# modular synth

a browser-based modular synthesizer. build patches by connecting modules with virtual cables, the same way you would with a hardware eurorack system.

---

## running the project

```bash
npm install
npm run dev
```

open `http://localhost:5173`. click **start** to initialize the audio context (required by the browser before any sound can play).

### requirements

- a browser with `AudioWorklet` support (chrome, edge, firefox, safari 14.1+)
- `SharedArrayBuffer` is required for display analyzer modules (`scope`, `freq spectrum`, `tuner`, and `xy scope`). the dev server is configured with the necessary `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers.

---

## what it is

modular synthesis works by connecting individual signal-processing modules together. each module does one thing — oscillate, filter, amplify, generate an envelope, display a waveform — and you decide how they connect. the patch you build determines the sound.

this instrument runs entirely in the browser. there is no server. patches autosave to localstorage and can be exported and imported as json files.

---

## adding modules

- press `space` or `/` anywhere in the rack
- or right-click on an empty area of the rack

this opens a command palette. type to search by name or category, then press `enter` to place the module at your cursor position.

---

## patching

- **drag from any output port** to start drawing a cable
- **release on an input port** to complete the connection
- cables are color-coded by signal type: violet for audio, green for cv, red for gate, amber for trigger
- **right-click any cable** to disconnect it
- **drag an existing cable's input end** to re-patch it

### connection rules

- audio ↔ cv: allowed. since all signals are the same data type under the hood (float32 arrays at audio rate), mixing them enables audio-rate modulation and other expressive techniques
- gate ↔ trigger: allowed. both carry on/off signals and are electrically compatible
- audio/cv → gate/trigger: not allowed. these signal families are logically incompatible

---

## modules

### oscillators and generators

**vco** — voltage controlled oscillator. outputs sine, sawtooth, and pulse waveforms simultaneously. frequency is set by knob and modulated via v/oct cv input. fm input for frequency modulation. pulse width can be modulated with the `pw` cv input.

**lfo** — low frequency oscillator. same waveforms as the vco but operates below audio rate (0.01hz–100hz). outputs are cv-typed so they patch naturally to filter cutoffs, vca gains, and other modulation targets.

**noise** — white, pink, and brown noise generator. useful for percussion, wind textures, and randomization.

**fm op** — fm operator module. implements a single sinusoidal carrier with phase modulation input, a frequency ratio parameter, modulation index, and operator self-feedback. chain two or more fm ops together to build dx7-style fm synthesis algorithms. the panel displays the ratio as n:1 and previews the resulting waveform shape.

**pluck** — enhanced karplus-strong string synthesizer. position controls where along the string the excitation happens (suppressing different harmonics). brightness shapes the initial spectral content. stiffness adds inharmonicity via an allpass filter in the feedback loop. the panel shows an animated visualization of the harmonic overtones. a custom audio input can replace the noise burst excitation.

### filters and dynamics

**vcf** — voltage controlled filter. state variable filter with lowpass, highpass, and bandpass modes. cutoff and resonance are both cv-modulatable. envelope input for filter sweeps.

**vca** — voltage controlled amplifier. multiplies the audio input by a cv signal. essential for shaping amplitude with an envelope.

**mixer** — 4-channel audio mixer with individual level faders and a master level control.

**compressor** — dynamic range compressor with threshold, ratio, attack, release, makeup gain, soft knee, and parallel compression mix. a sidechain input enables ducking and pumping effects. the panel displays a live transfer curve and a gain reduction meter. the gr output emits a cv signal tracking the compression amount.

### envelopes and modulation

**adsr** — attack/decay/sustain/release envelope generator. triggered by a gate input. outputs a 0–1 envelope on `out` for shaping amplitude or filter cutoff. supports retrigger from the current level on rapid re-attack.

**ar** — attack/release envelope generator. always gate-driven: rise during held gate, then release on gate-low. outputs envelope on `out` and a 10ms `eoc` trigger when the release finishes.

**ad** — attack/decay one-shot envelope generator. starts on gate rising edge, runs through attack then decay, and emits a 10ms `eoc` trigger at end of cycle.

**attenuverter** — scales and inverts cv signals. useful for controlling the depth and polarity of modulation.

**sample & hold** — captures a cv value when triggered and holds it until the next trigger. use with noise or an lfo to generate random stepped cv.

**quantizer** — snaps a continuous cv pitch signal to the nearest note in a selectable musical scale.

**octave** — transposes incoming v/oct cv by integer octaves. useful for quickly shifting melodies and keyboard/sequencer lines up or down.

**chord** — takes a single root v/oct input and outputs four v/oct signals tuned to a chord above it. chord type is selectable (maj, min, dom7, maj7, min7, dim, aug, sus2, sus4). octave offset and spread controls adjust voicing. the panel shows a one-octave piano keyboard with the active chord notes highlighted.

**panner** — constant-power stereo panner. mono audio in, pan modulation input, separate left and right outputs. the panel shows a semicircular arc with a glowing indicator dot.

**prob gate** — probabilistic gate. on each rising gate edge, a random number is checked against the probability knob. gates that pass are forwarded; blocked gates fire the skip output instead. useful for adding variation to sequences without changing the clock grid.

### sequencing and timing

**clock** — generates regular gate pulses at a bpm-derived rate. includes reset input, swing amount, a trigger output, and a selectable divided gate output.

**sequencer** — 8-step pitch + gate sequencer. advances one step per clock pulse. each step has its own pitch value (set by fader) and a configurable gate length.

**push button** — a manual trigger. hold for a sustained gate output; each press also fires a 10ms trigger pulse on a separate port. useful for manually triggering envelopes during performance.

**keyboard** — computer keyboard to pitch/gate converter. select the module to arm it, then play notes with `a w s e d f t g y h u j k`. use `z` / `x` to shift octaves. the panel highlights the currently held key and shows the active octave. outputs pitch on `out`, a held gate, and a 10ms trigger pulse on note-on.

### effects

**reverb** — convolution reverb. mix control blends the dry signal with the reverberated signal.

**delay** — delay line with time control and cv modulation input.

**feedback delay** — delay with a feedback loop. tone control shapes the frequency of each repeat; soft saturation in the feedback path adds subtle warmth at high settings.

**tape delay** — warm delay with tape character. wow/flutter adds pitch instability to repeats; drive saturates the feedback path for degraded, lo-fi repeats. echo animation shows spinning reels and diminishing echo dots.

### utility and display

**cv** — constant control-voltage source with a single knob outputting from -1 to 1.

**scope** — waveform display. connects to any signal port and displays the last few milliseconds of signal in real time. a timescale knob zooms the display.

**freq spectrum** — real-time spectral display. connects to any signal port and shows a continuously updated frequency-energy curve, with a panel toggle for `normal`/`high` quality analysis.

**output** — the final module in any patch. routes audio to the browser's audio output. has a master volume knob and a peak meter. one output module is typically sufficient for a complete patch.

---

## controls

| action                  | how                                   |
| ----------------------- | ------------------------------------- |
| add module              | `space` or `/` or right-click on rack |
| delete selected modules | `delete` or `backspace`               |
| select module           | click on it                           |
| select multiple modules | click-drag empty rack area            |
| move module(s)          | drag selected module header           |
| drag a cable            | mousedown on any port                 |
| disconnect a cable      | right-click the cable                 |
| rename patch            | click the patch name in the top bar   |
| new patch               | top bar → new                         |
| export patch            | top bar → export                      |
| import patch            | top bar → import                      |
| settings                | gear icon in the top bar              |

---

## settings

- **cable tautness** — controls how much cables sag between ports (0 = taut, 1 = loose)
- **tooltips** — toggle port tooltips on hover
- **theme** — dark, light, and synthwave themes

---

## tech stack

- react + typescript
- vite
- zustand (state management)
- web audio api / audioworklet (audio processing)
- svg (cable rendering)
