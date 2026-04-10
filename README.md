# Mod Synth 0

A browser-based modular synthesizer. Build patches by connecting modules with virtual cables, the same way you would with a hardware Eurorack system.

---

## Running the Project

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Click **Start** to initialize the audio context (required by the browser before any sound can play).

### Requirements

- A browser with `AudioWorklet` support (Chrome, Edge, Firefox, Safari 14.1+)
- `SharedArrayBuffer` is required for display analyzer modules (`scope`, `freq spectrum`, `tuner`, and `xy scope`). The dev server is configured with the necessary `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers.

---

## What It Is

Modular synthesis works by connecting individual signal-processing modules together. Each module does one thing: oscillate, filter, amplify, generate an envelope, display a waveform, and more. The patch you build determines the sound.

This instrument runs entirely in the browser. There is no server. Patches autosave to LocalStorage and can be exported and imported as JSON files.

---

## Adding Modules

- Press `space` or `/` anywhere in the rack

This opens the command palette. It defaults to the `all` tab, and you can switch tabs for `common`, `most used`, or specific module categories, then press `enter` to place the highlighted module at your cursor position.

Type in the search field at any time to search across all modules by name, category, or id.

---

## Patching

- **Drag from any output port** to start drawing a cable
- **Release on an input port** to complete the connection
- Cables are color-coded by signal type
- **Right-click any cable** to disconnect it
- **Drag an existing cable's input end** to re-patch it

### Connection Rules

- Audio <-> cv: allowed. Since all signals are the same data type under the hood (`Float32Array` at audio rate), mixing them enables audio-rate modulation and other expressive techniques.
- Gate <-> trigger: allowed. Both carry on/off signals and are electrically compatible.
- Audio/cv -> gate/trigger: not allowed. These signal families are logically incompatible.

---

## Modules

There are **52 user-visible modules** in the command palette. While drilled into a subpatch, you also get 2 internal proxy modules (`in`, `out`) used to expose container ports.

### Source

- **vco** - audio-rate oscillator with `sine`, `saw`, and `pulse` outputs, plus v/oct, fm, and pulse-width modulation inputs.
- **wavetable vco** - morphing wavetable oscillator with bank cycling (`classic`, `hollow`, `digital`, `vocal`), live wavetable display that follows wave-position modulation, v/oct + fm inputs, and a `mult` control (`1-4`) that multiplies waveform cycles (harmonic/octave shift behavior).
- **lfo** - low-frequency modulator with `sine`, `saw`, `pulse`, and `triangle` cv outputs and cv-modulatable rate.
- **chaos** - lorenz-attractor chaos source with correlated `x`, `y`, `z` cv outputs.
- **noise** - white, pink, and brown noise outputs.
- **fm op** - single fm operator with ratio, index, self-feedback, and phase-modulation input.
- **pluck** - karplus-strong plucked-string voice with trigger excitation, v/oct pitch, and optional external excitation audio.
- **resonator** - resonant string/body model excited by trigger or audio, with pitch cv support.

### Control

- **button** - manual gate + 4ms trigger generator.
- **clock** - integer bpm clock (`20-1000`) with swing, reset, gate output, and 4ms trigger output.
- **clock div** - clock divider with integer division factor (`2-10`), reset, and output activity indicator.
- **euclid** - euclidean trigger sequencer with `steps`, `pulses`, `offset`, accent output, and output activity indicator.
- **seq** - 8-step pitch/gate sequencer with per-step pitch and gate length.
- **keyboard** - computer-keyboard note entry (`a w s e d f t g y h u j k`, octave via `z`/`x`) with pitch, gate, and trigger outs.
- **cv** - constant cv source (`-1` to `+1`).
- **chord dice** - generated 4-chord progression source with clock step input and root transposition input.

### Envelope

- **adsr** - attack/decay/sustain/release envelope with gate input.
- **ar** - attack/release envelope with `eoc` trigger output at release end.
- **ad** - attack/decay one-shot envelope with `eoc` trigger output.

### Filter

- **vcf** - multimode state-variable filter (lowpass, highpass, bandpass) with cv-modulated cutoff/resonance and envelope input.

### Dynamics

- **vca** - cv-controlled amplifier for amplitude shaping (`gain` sets base level; cv adds modulation on top).
- **compressor** - compressor with sidechain input, threshold/ratio/attack/release/makeup/knee/mix controls, and gain-reduction cv output.
- **env flwr** - envelope follower that converts audio level into cv with attack/release control.

### FX

- **reverb** - algorithmic reverb with `room` and `plate` modes plus mix/decay/damping control.
- **granulator** - live-input granular processor with `hybrid/ambient/glitch` modes, freeze gate, position/pitch cv, reverse/jitter/shape controls, tone+feedback shaping, crush texture, and dry/wet mix.
- **feedback delay** - delay with cv time modulation, feedback, tone filtering, and wet/dry mix.
- **tape delay** - character delay with wow/flutter modulation, tone, drive, feedback, and mix.
- **flanger** - flanger/chorus module with rate, depth, feedback, and mix.
- **wavefold** - wavefolder with gain, symmetry, and fold cv input.
- **ring mod** - ring modulator with dry/wet mix.
- **crush** - bitcrusher with bit-depth and sample-rate reduction.
- **dist** - multi-mode distortion (`soft`, `hard`, `fuzz`) with drive, tone, and output level.

### Utility

- **mixer** - 4-channel mixer with per-channel level and mute, master level, master mute, and dual output metering.
- **mult** - 1-to-4 cv splitter.
- **atten** - attenuverter for cv scaling and inversion.
- **s&h** - sample-and-hold (sample cv on trigger, hold until next trigger).
- **quant** - cv quantizer for musical scales.
- **octave** - octave transposer for v/oct cv.
- **chord** - chord voice generator from one root cv input (four v/oct outputs).
- **panner** - constant-power mono-to-stereo panner with cv input.
- **prob gate** - probabilistic gate router with pass and skip outputs.
- **comparator** - compares two cv inputs and outputs `gt`, `lt`, `eq` gates.
- **logic** - gate logic (`and`, `or`, `xor`, `not`).
- **slew** - rise/fall slew limiter for cv smoothing and glide.
- **delay** - clean delay line with cv-modulated delay time (no feedback stage).
- **mute** - one-button audio mute utility.
- **note** - text note panel saved with the patch.
- **output** - final stereo output module (left/right in, meter, master level).

### Display

- **scope** - real-time waveform scope.
- **freq spectrum** - log-frequency spectrum analyzer.
- **tuner** - note + cents tuner display.
- **xy scope** - x/y oscilloscope for lissajous-style signal visualization with `scale` and `fade` controls (`fade` controls trail persistence).

---

## Subpatches

Subpatches let you group related modules into a reusable, named container. The container appears as a single panel on the rack with exposed ports and optional macro knobs.

**Creating a subpatch**

- Select two or more modules -> right-click empty rack space -> **Group as subpatch** (wraps the selection into a container, preserving internal cables)
- Open the command palette -> **subpatch** (creates an empty container you can drill into and build from scratch)

**Editing a subpatch**

- **Double-click** a container to drill into it. The breadcrumb at the top shows the current context; click any segment or press `esc` to exit.
- Inside the subpatch, add modules normally with `space` or `/`.
- **Exposing ports**: place an **in** or **out** module inside the subpatch. Its ports appear on the container face. Click the label to rename; click the type badge to cycle audio -> cv -> gate -> trigger.
- **Exposing macros**: right-click any knob while inside a subpatch -> **Expose as macro**. A macro knob appears on the container face. Right-click again -> **Remove macro** to unexpose it.

**Library + reuse**

- **Save subpatch to library**: right-click a subpatch container -> **Save to library**
- **Insert saved subpatch**: click **Presets** in the top bar, search, then click or press `enter` to insert
- **Delete saved preset**: open **Presets**, then click the `✕` next to an entry
- **Ungroup a container**: right-click a subpatch container -> **Ungroup**

**Linked instances**

All instances of the same subpatch definition share the same internal structure. Editing the internals of one (while drilled in) updates all instances when you exit.

**Naming**

Double-click the name in the container header to rename it.

---

## Tutorials

Click **tutorials** in the top bar to open guided lessons directly in the rack (shown at root level; hidden while drilled into a subpatch).

- **Two modes**
  - `beginner`: strict, step-by-step guidance
  - `veteran`: challenge goals with looser validation
- **Built-in lesson pack (6 active)**
  - beginner: `first voice`, `envelope shaping`, `clock + sequencer`, `feedback safely`, `subpatch macros`
  - veteran: `challenge: kick voice in 6 modules`
- **Step behavior**
  - each step asks for one action (add module, cable connection, param range, etc.)
  - progress auto-validates from live store state
  - each step includes contextual hints, **show me** guidance text, and **try for me** auto-perform
- **Spotlight guidance**
  - active tutorial steps highlight relevant modules, ports, and controls in-place

Starting a lesson clears the current patch after confirmation.
Lesson completion badges are saved in LocalStorage.

---

## Controls

| Action                    | How                                                  |
| ------------------------- | ---------------------------------------------------- |
| Add module                | `space` or `/` on rack                               |
| Delete selected modules   | `delete` or `backspace`                              |
| Select module             | Click on it                                          |
| Select multiple modules   | Click-drag empty rack area                           |
| Add to selection          | Hold `shift` while marquee-selecting                 |
| Copy selected modules     | `cmd/ctrl + c`                                       |
| Paste modules             | `cmd/ctrl + v`                                       |
| Undo                      | `cmd/ctrl + z` or top bar `↩`                        |
| Redo                      | `cmd/ctrl + shift + z` or top bar `↪`                |
| Move module(s)            | Drag selected module header                          |
| Drag a cable              | Mousedown on any port                                |
| Disconnect a cable        | Right-click the cable                                |
| Rename patch              | Click the patch name in the top bar                  |
| New patch                 | Top bar -> New                                       |
| Export patch              | Top bar -> Export                                    |
| Import patch              | Top bar -> Import                                    |
| Open subpatch presets     | Top bar -> Presets                                   |
| Settings                  | Gear icon in the top bar                             |
| Zoom in/out               | Pinch trackpad or `cmd/ctrl + scroll`                |
| Reset zoom                | Click zoom percent in the top bar                    |
| Group modules as subpatch | Select >=2 modules -> right-click empty space        |
| Ungroup subpatch          | Right-click subpatch container -> Ungroup            |
| Enter subpatch            | Double-click container header                        |
| Exit subpatch             | `esc` or click breadcrumb                            |
| Expose port in subpatch   | Add **in** / **out** module while drilled in         |
| Expose knob as macro      | Right-click knob while drilled in -> Expose as macro |
| Save subpatch preset      | Right-click subpatch container -> Save to library    |

---

## Settings

- **Cable tautness** - controls how much cables sag between ports (`0` = loose, `1` = taut)
- **Tooltips** - toggle port tooltips on hover
- **Theme** - 11 themes total: base (`dark`, `light`), dark variants (`forest`, `abyss`, `volcanic`), light variants (`braun`), stylized variants (`synthwave`, `ice`, `arcade`), and monochrome variants (`slate`, `paper`)

---

## Tech Stack

- React + TypeScript
- Vite
- Zustand (state management)
- Web Audio API / AudioWorklet (audio processing)
- SVG (cable rendering)
