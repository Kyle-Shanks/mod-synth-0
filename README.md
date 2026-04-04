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
- `SharedArrayBuffer` is required for the scope display module. the dev server is configured with the necessary `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers.

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

**vco** — voltage controlled oscillator. outputs sine, sawtooth, and pulse waveforms simultaneously. frequency is set by knob and modulated via v/oct cv input. fm input for frequency modulation.

**lfo** — low frequency oscillator. same waveforms as the vco but operates below audio rate (0.01hz–100hz). outputs are cv-typed so they patch naturally to filter cutoffs, vca gains, and other modulation targets.

**noise** — white and pink noise generator. useful for percussion, wind textures, and randomization.

### filters and dynamics

**vcf** — voltage controlled filter. state variable filter with lowpass, highpass, and bandpass modes. cutoff and resonance are both cv-modulatable. envelope input for filter sweeps.

**vca** — voltage controlled amplifier. multiplies the audio input by a cv signal. essential for shaping amplitude with an envelope.

**mixer** — 4-channel audio mixer with individual level faders and a master level control.

### envelopes and modulation

**adsr** — attack/decay/sustain/release envelope generator. triggered by a gate input. outputs a 0–1 cv signal that shapes amplitude or filter cutoff over time. supports retrigger from the current level on rapid re-attack.

**attenuverter** — scales and inverts cv signals. useful for controlling the depth and polarity of modulation.

**sample & hold** — captures a cv value when triggered and holds it until the next trigger. use with noise or an lfo to generate random stepped cv.

**quantizer** — snaps a continuous cv pitch signal to the nearest note in a selectable musical scale.

### sequencing and timing

**clock** — generates regular gate pulses at a bpm-derived rate. includes reset input, swing amount, a trigger output, and a selectable divided gate output.

**sequencer** — 8-step cv + gate sequencer. advances one step per clock pulse. each step has its own pitch value (set by fader) and a configurable gate length.

**push button** — a manual trigger. hold for a sustained gate output; each press also fires a 10ms trigger pulse on a separate port. useful for manually triggering envelopes during performance.

### effects

**reverb** — convolution reverb. mix control blends the dry signal with the reverberated signal.

**delay** — delay line with time control and cv modulation input.

### utility and display

**scope** — waveform display. connects to any signal port and displays the last few milliseconds of signal in real time. a timescale knob zooms the display.

**output** — the final module in any patch. routes audio to the browser's audio output. has a master volume knob and a peak meter. one output module is typically sufficient for a complete patch.

---

## controls

| action                 | how                                   |
| ---------------------- | ------------------------------------- |
| add module             | `space` or `/` or right-click on rack |
| delete selected module | `delete` or `backspace`               |
| select module          | click on it                           |
| move module            | drag the module header                |
| drag a cable           | mousedown on any port                 |
| disconnect a cable     | right-click the cable                 |
| rename patch           | click the patch name in the top bar   |
| new patch              | top bar → new                         |
| export patch           | top bar → export                      |
| import patch           | top bar → import                      |
| settings               | gear icon in the top bar              |

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
