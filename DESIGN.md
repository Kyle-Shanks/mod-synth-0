# modular synth — design & architecture

this document is the authoritative technical reference for anyone working on this project. it describes the architecture as implemented, the invariants that must be maintained, and the reasoning behind key design decisions.

---

## table of contents

1. [project philosophy](#1-project-philosophy)
2. [audio engine architecture](#2-audio-engine-architecture)
3. [module definition api](#3-module-definition-api)
4. [writing a module](#4-writing-a-module)
5. [signal types and connection rules](#5-signal-types-and-connection-rules)
6. [zustand store architecture](#6-zustand-store-architecture)
7. [visual system](#7-visual-system)
8. [patch persistence](#8-patch-persistence)
9. [cross-cutting rules](#9-cross-cutting-rules)
10. [current module list](#10-current-module-list)
11. [known implementation quirks](#11-known-implementation-quirks)
12. [implementation notes](#12-implementation-notes)

---

## 1. project philosophy

### what this is

a browser-based modular synthesizer designed for end users who want to create sounds and music through a visual patching interface. it runs entirely in the browser with no server component.

### design inspirations

the aesthetic sits at the intersection of three references:

- **teenage engineering / op-1** — geometric precision, deliberate placement, technical beauty. every element earns its position.
- **hud / fantasy ui** — the interface feels like instrumentation rather than an app. clinical readouts, dashed construction lines, alive but precise.
- **eurorack faceplate discipline** — elements are placed as if machined onto a panel. the sub-grid is the enforcing structure; nothing is placed arbitrarily.

the guiding principle: **every element feels placed by an engineer, not decorated by a designer.** the result should feel like a real instrument that happens to run in a browser.

### intentional design choices

**all signals are uniform.** audio, cv, gate, and trigger are all `Float32Array(128)` buffers at the audio sample rate. there is no distinction at the data level. this enables audio-rate modulation, feeding audio into cv utilities, and sample-accurate gate timing without any special cases in the engine.

**one audioworklet owns everything.** the web audio api is used only as an output sink. a single `AudioWorkletNode` ("graphprocessornode") runs the entire patch graph, rather than composing web audio nodes. this eliminates the problem of synchronizing two parallel representations of the patch graph and gives every module a uniform api.

**module authors never touch web audio api internals.** writing a module requires only implementing `initialize()` and `process()`. the engine handles threading, buffer management, parameter smoothing, topological sorting, and feedback detection automatically.

**the visual system is as intentional as the audio system.** the ui is an instrument, not a dashboard. design tokens, sub-grid discipline, and the typography choice (major mono display) are not cosmetic — they define the instrument's identity and must be maintained across all new modules.

---

## 2. audio engine architecture

### threading model

```
main thread
├── zustand store       — authoritative source of truth for patch state
├── EngineController    — serializes + sends commands to worklet, receives events
└── react ui            — reads state from store, forwards user actions to store

audioworklet thread (public/GraphProcessor.js)
├── worklet graph       — mirror of patch graph, updated at buffer boundaries
├── topological sorter  — re-runs on topology changes, detects feedback cycles
├── buffer pool         — pre-allocated Float32Array pool, zero gc per audio tick
├── param smoothers     — per-module per-param one-pole lowpass filter (~3ms)
└── module runner       — calls process() in topological order every 128-sample tick
```

### the worklet file

**critical:** `public/GraphProcessor.js` is the actual audioworklet processor loaded at runtime. it is served directly as a static file. the typescript source at `src/engine/worklet/GraphProcessor.ts` exists as a readable reference but is **not compiled and not used at runtime**. any changes to worklet behavior must be made in `public/GraphProcessor.js`, then mirrored into `src/engine/worklet/GraphProcessor.ts`.

### buffer pool

the pool pre-allocates 256 `Float32Array(128)` buffers at worklet startup. every audio tick, buffers are acquired from the pool for module inputs and outputs and returned to the pool after the tick completes. this gives zero heap allocation per audio tick and no garbage collector pauses in the audio thread.

### parameter smoothing

every parameter is smoothed in the worklet before being passed to `process()`. module authors always receive a clean `number`, never a raw step value.

```
smoothed += (target - smoothed) * coeff
// coeff ≈ 1 - e^(-2π × 300 / sampleRate)   (~3ms smoothing window)
```

this is applied transparently — module authors do not need to implement smoothing.

### topological sorting and feedback

on every topology change (module add/remove, cable add/remove), the worklet rebuilds the evaluation order using a depth-first topological sort. when a cycle is detected, the creating cable is marked as a "feedback cable." feedback cables receive a one-buffer delay (~3ms at 44100hz) on the signal. this is the standard approach used by vcv rack and similar systems; it is inaudible for reverb tails, delay feedback, and most modulation feedback use cases.

feedback cables are visually distinguished with a dashed stroke in the ui.

### main thread ↔ worklet communication

**main → worklet** (command queue, applied at buffer boundaries):

```typescript
type EngineCommand =
  | {
      type: 'ADD_MODULE'
      moduleId: string
      definitionId: string
      params: Record<string, number>
      state: Record<string, unknown>
      inputPortIds: string[]
      outputPortIds: string[]
      inputPortTypes: Record<string, string>
      paramDefaults: Record<string, number>
      processFnStr: string
    }
  | { type: 'REMOVE_MODULE'; moduleId: string }
  | { type: 'ADD_CABLE'; cable: SerializedCable & { isFeedback?: boolean } }
  | { type: 'REMOVE_CABLE'; cableId: string }
  | { type: 'SET_PARAM'; moduleId: string; param: string; value: number }
  | {
      type: 'SET_GATE'
      moduleId: string
      portId: string
      value: 0 | 1
      scheduledAt: number
    }
  | {
      type: 'SET_SCOPE_BUFFERS'
      moduleId: string
      scopeBuffer: SharedArrayBuffer
      writeIndexBuffer: SharedArrayBuffer
    }
  | {
      type: 'SET_TUNER_BUFFER'
      moduleId: string
      buffer: SharedArrayBuffer
    }
  | {
      type: 'SET_XYSCOPE_BUFFERS'
      moduleId: string
      xBuffer: SharedArrayBuffer
      yBuffer: SharedArrayBuffer
      writeIndexBuffer: SharedArrayBuffer
    }
  | {
      type: 'SET_INDICATOR_BUFFER'
      moduleId: string
      buffer: SharedArrayBuffer
    }
```

commands are queued on the main thread and applied at the start of each audio buffer. this ensures topology changes take effect at clean buffer boundaries.

gate commands carry an `AudioContext.currentTime` timestamp, allowing the worklet to compute the exact sample offset within the current buffer for sub-buffer timing accuracy.

**worklet → main** (events):

```typescript
type EngineEvent =
  | { type: 'METER'; moduleId: string; portId: string; peak: number }
  | { type: 'READY' }
  | { type: 'ERROR'; message: string }
```

scope-style display data bypasses `postMessage` entirely: display modules like scope and freq spectrum write directly into `SharedArrayBuffer` circular buffers. the main thread reads them in a `requestAnimationFrame` loop with zero allocation. `SharedArrayBuffer` requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers, which are configured in `vite.config.ts`.

---

## 3. module definition api

### the interface

```typescript
// src/engine/types.ts

export type PortType = 'audio' | 'cv' | 'gate' | 'trigger'

export interface PortDefinition {
  type: PortType
  default: number // value used when port is unconnected
  label: string
}

export interface ParamDefinition {
  type: 'float' | 'int' | 'boolean' | 'select'
  min?: number
  max?: number
  default: number
  options?: string[] // for 'select' type only
  label: string
  unit?: string // 'hz', 'db', 'ms', '%', 's', 'ct' — shown in hover display
  curve?: 'linear' | 'log' // 'log' for exponential knob scaling (requires min > 0)
}

export interface ModuleContext {
  sampleRate: number
  bufferSize: number // always 128
}

export interface ModuleDefinition<I, O, P, S> {
  id: string
  name: string
  category:
    | 'source'
    | 'filter'
    | 'envelope'
    | 'dynamics'
    | 'utility'
    | 'fx'
    | 'display'
    | 'control'
  width: number // rack grid units
  height: number // rack grid units
  inputs: I
  outputs: O
  params: P
  initialize(context: ModuleContext): S
  process(
    inputs: { [K in keyof I]: Float32Array },
    outputs: { [K in keyof O]: Float32Array },
    params: { [K in keyof P]: number },
    state: S,
    context: ModuleContext,
  ): void
}
```

### how process() reaches the worklet

when a module is added to the patch, its `process()` function is serialized to a string via `definition.process.toString()` and sent to the worklet via `postMessage`. in the worklet, it is reconstructed with `new Function('return ' + processFnStr)()`.

this is why `process()` must be a fully self-contained function — see section 4 for the constraints this creates.

`initialize()` runs on the main thread only. its return value (the initial state object) is serialized and sent to the worklet as part of the `ADD_MODULE` command. the worklet holds this state and passes it to `process()` on every tick.

---

## 4. writing a module

### minimal example

```typescript
// src/modules/mymodule/definition.ts
import type { ModuleDefinition } from '../../engine/types'

interface MyModuleState {
  phase: number
  [key: string]: unknown // required for worklet state serialization
}

export const MyModuleDefinition: ModuleDefinition<
  { audioIn: { type: 'audio'; default: 0; label: 'in' } },
  { audioOut: { type: 'audio'; default: 0; label: 'out' } },
  { gain: { type: 'float'; min: 0; max: 1; default: 0.5; label: 'gain' } },
  MyModuleState
> = {
  id: 'mymodule',
  name: 'mymod',
  category: 'utility',
  width: 3,
  height: 3,

  inputs: { audioIn: { type: 'audio', default: 0, label: 'in' } },
  outputs: { audioOut: { type: 'audio', default: 0, label: 'out' } },
  params: {
    gain: { type: 'float', min: 0, max: 1, default: 0.5, label: 'gain' },
  },

  initialize() {
    return { phase: 0 }
  },

  process(inputs, outputs, params, _state, _context) {
    for (let i = 0; i < 128; i++) {
      outputs.audioOut[i] = (inputs.audioIn[i] ?? 0) * params.gain
    }
  },
}
```

then register it in `src/modules/registry.ts`:

```typescript
import { MyModuleDefinition } from './mymodule/definition'
// ...
reg(MyModuleDefinition)
```

### the process() serialization constraint

**this is the most important rule for module authors.**

because `process()` is sent to the worklet as a serialized string, it must be a pure function with no references to anything outside its own body. specifically:

- **no imports inside process()** — `import` statements are not part of the function body
- **no closures over module-level variables** — any value referenced inside `process()` must come from its arguments (`inputs`, `outputs`, `params`, `state`, `context`) or be declared as a local variable within the function body
- **no `this` references** — the function is called without a `this` context in the worklet
- **no external utilities** — you cannot call a helper function defined elsewhere in the file. if you need a helper, define it inline as a local function inside `process()`, or inline the logic directly

correct:

```typescript
process(inputs, outputs, params, state, _context) {
  // local constants and helpers are fine
  const twoPi = 2 * Math.PI
  function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

  for (let i = 0; i < 128; i++) {
    outputs.out[i] = clamp(inputs.in[i] ?? 0, -1, 1) * params.gain
  }
}
```

incorrect:

```typescript
const SOME_CONSTANT = 1.414  // ← defined at module scope
import { clamp } from '../../utils'  // ← won't exist in worklet

process(inputs, outputs, params, _state, _context) {
  outputs.out[i] = clamp(inputs.in[i]) * SOME_CONSTANT  // ← both will fail
}
```

### no Float32Array allocation in process()

`process()` must never allocate new `Float32Array` instances. all buffers are managed by the engine's pool. to hold intermediate values, use plain javascript arrays or store pre-allocated arrays in `state` via `initialize()`.

correct:

```typescript
initialize() {
  return { scratchBuffer: new Array(128).fill(0) }
}

process(inputs, outputs, params, state, _context) {
  // use state.scratchBuffer for intermediate work
}
```

incorrect:

```typescript
process(inputs, outputs, params, _state, _context) {
  const temp = new Float32Array(128)  // ← never do this in process()
}
```

### state conventions

the `state` object is the module's persistent memory across buffer ticks. it is initialized by `initialize()` on the main thread and then owned by the worklet.

two special state keys are used by the engine for specific modules:

**`_gateEvents`** — used by the push button module. the worklet populates this with an array of `{ offset: number; value: number; portId: string }` objects when a `SET_GATE` command arrives. the module reads and clears this array inside `process()` to implement sample-accurate gate timing.

**`_indicatorBuffer`** — used by the clock and sequencer modules. the engine injects an `Int32Array` view of a `SharedArrayBuffer` into this state key. the module writes the current step or beat count using `Atomics.store()`, and the main thread reads it in `requestAnimationFrame` to update the visual indicator without polling.

### registering a module

add the import and `reg()` call to `src/modules/registry.ts`. modules are registered once at app startup when the registry module is imported by `App.tsx`.

---

## 5. signal types and connection rules

all four signal types are `Float32Array(128)` buffers at the audio sample rate. the distinction is semantic and informs the cable color and connection validation — not the underlying data format.

| type    | typical range         | use                                                 |
| ------- | --------------------- | --------------------------------------------------- |
| audio   | -1.0 to 1.0           | audio signals (oscillators, filters, vcas)          |
| cv      | typically -2.0 to 2.0 | control voltage (v/oct pitch, modulation depth)     |
| gate    | 0.0 or 1.0            | sustained on/off signal (held while key is pressed) |
| trigger | 0.0 or 1.0            | brief pulse (4ms standard in this project)          |

### trigger pulse width — required standard

**all trigger outputs must emit a 4ms pulse, not a 1-sample pulse.**

a 1-sample trigger (~0.023ms at 44100hz) is too short to be useful. the adsr envelope, for example, detects a rising edge and starts attack, then detects the falling edge 1 sample later and immediately starts release — producing an inaudible ~0.002 amplitude blip. 4ms (~176 samples at 44100hz) is long enough for envelope generators, sample-and-hold, and any other gate/trigger-sensitive module to respond correctly.

implement this with a countdown timer in state:

```typescript
// in initialize():
return { ..., triggerTimer: 0 }

// in process():
const triggerDuration = Math.round(context.sampleRate * 0.004) // 4ms

// when a trigger event occurs:
state.triggerTimer = triggerDuration

// each sample:
if (state.triggerTimer > 0) {
  outputs.myTrigger[i] = 1
  state.triggerTimer--
} else {
  outputs.myTrigger[i] = 0
}
```

the pushbutton, clock, and euclidean modules all follow this pattern. any new module with trigger outputs must do the same.

### connection validation

implemented in `src/components/Port.tsx` (`isValidTarget()`):

- **audio ↔ audio**: allowed
- **cv ↔ cv**: allowed
- **gate ↔ gate**: allowed
- **trigger ↔ trigger**: allowed
- **audio ↔ cv**: **intentionally allowed.** since all signals are physically identical float32 arrays, connecting audio to a cv input (or cv to an audio input) enables audio-rate modulation — vco output into a filter's frequency cv input, for example. the cable renders using the source port's color.
- **gate ↔ trigger**: **intentionally allowed.** gate and trigger signals are semantically different (held vs. brief pulse) but electrically compatible. the cable renders using the source port's color.
- **audio/cv → gate/trigger (or vice versa)**: rejected. the continuous-value nature of audio/cv is logically incompatible with the binary timing semantics of gate/trigger.

do not restrict the audio↔cv or gate↔trigger cross-connections. they are deliberate design decisions that enable expressive patching.

---

## 6. zustand store architecture

the store is composed of six slices in `src/store/`:

### patchSlice

serializable state — saved to localstorage. the canonical representation of the current patch.

```typescript
modules: Record<string, ModuleInstance> // moduleId → {definitionId, position, params, data?}
cables: Record<string, SerializedCable> // cableId → {id, from, to}
feedbackCableIds: Set<string> // which cables have feedback delay
patchName: string
```

all module additions, cable connections, and parameter changes go through patchSlice actions. the actions call into `EngineController` to keep the worklet in sync. **components must never call `EngineController` directly — always go through the store.**

`modules` may also contain `SubpatchContainerInstance` entries (where `definitionId === '__subpatch__'`), which carry extra fields: `subpatchDefinitionId`, `macroValues`, `containerWidth`, `containerHeight`. these entries are handled specially by actions — see the subpatch section below.

### subpatchSlice

subpatch definitions and library — persisted with the patch.

```typescript
definitions: Record<string, SubpatchDefinition> // patch-local definitions (saved with patch)
libraryPresets: Record<string, SubpatchDefinition> // global user library (localStorage)
```

a `SubpatchDefinition` holds the internal module/cable topology shared by all instances:

```typescript
interface SubpatchDefinition {
  id: string
  name: string
  modules: Record<string, ModuleInstance> // internal module map
  cables: Record<string, SerializedCable>
  exposedInputs: ExposedPortDef[] // ordered, derived from subpatch-input modules
  exposedOutputs: ExposedPortDef[] // derived from subpatch-output modules
  macros: MacroDefinition[]
}
```

key actions: `createDefinition`, `addSubpatchContainer`, `groupModulesAsSubpatch`, `refreshExposedPorts`, `syncAllInstances`, `addMacro`, `removeMacro`, `setMacroValue`, `saveDefinitionToLibrary`.

### uiSlice

ephemeral ui state — not persisted.

```typescript
selectedModuleId: string | null
selectedModuleIds: string[]
hoveredPortKey: string | null // 'moduleId:portId'
hoveredCableId: string | null
dragState: CableDragState | null
commandPaletteOpen: boolean
commandPalettePosition: { x: number; y: number } | null
settingsPanelOpen: boolean
moduleClipboard: ModuleClipboardData | null
moduleClipboardPasteCount: number
// subpatch drill-down navigation stack (empty = root)
subpatchContext: SubpatchContextEntry[]  // { instanceId, definitionId, name }
```

`enterSubpatch` injects the definition's modules/cables into `state.modules`/`state.cables` so existing components work unmodified. `exitSubpatch` ejects them and calls `syncAllInstances`.

### settingsSlice

user preferences — persisted to localstorage.

```typescript
themeId: string
cableTautness: number // 0.0 → 1.0
tooltipsEnabled: boolean
```

### engineSlice

audio engine bridge state — not persisted.

```typescript
engineReady: boolean
meterValues: Record<string, number> // 'moduleId:portId' → peak value
```

`meterValues` is written by `App.tsx` which subscribes to `METER` events from the worklet via `engine.onEvent()`.

### tutorialSlice

guided learning state — not persisted in patch json (lesson completion timestamps are stored in localstorage).

```typescript
tutorialPanelOpen: boolean
tutorialMode: 'beginner' | 'veteran'
activeTutorialId: string | null
tutorialStepIndex: number
tutorialHint: string | null
tutorialShowDemo: boolean
tutorialCompletion: Record<string, string> // lessonId → completedAt (iso)
```

lesson definitions live in `src/tutorials/lessons.ts`. each step provides:

- a one-action instruction (`action`, `why`, `hints`, `demo`)
- a validation predicate against live store state (`validate`)
- an optional auto-perform handler (`autoPerform`) used by the "try for me" button
- optional focus targets (`focus`) consumed by the overlay spotlight renderer

`syncTutorialProgress()` auto-advances when step predicates pass. when a lesson completes, `tutorialCompletion[lessonId]` is persisted via `src/tutorials/storage.ts`.

---

## 7. visual system

### typography

**sole typeface: major mono display** (loaded via google fonts). used exclusively in lowercase — the uppercase glyphs are stylized symbols intended for iconographic use only. a consistent size scale is applied via css custom properties:

```
--text-xs: 9px   — port labels, secondary values
--text-sm: 11px  — knob labels, param names, module names
--text-md: 14px  — primary values
--text-lg: 20px  — large display values
--text-xl: 32px  — hero values in display modules
```

### theme system

themes are defined in `src/theme/tokens.ts` and applied via `ThemeProvider.tsx` which injects css custom properties onto `:root`. theme definitions live in `src/theme/*.ts` and are registered in `src/theme/themeRegistry.ts`.

the app currently ships with 11 themes:

- base: `dark`, `light`
- dark variants: `forest`, `abyss`, `volcanic`
- light variants: `braun`
- stylized variants: `synthwave`, `ice`, `arcade`
- monochrome variants: `slate`, `paper`

```typescript
interface Theme {
  shades: {
    shade0: string // background (darkest)
    shade1: string // module panel surface
    shade2: string // inactive elements, borders
    shade3: string // text, highest contrast
  }
  accents: {
    accent0: string // primary — violet, active controls, selections
    accent1: string // secondary — green, cv signals
    accent2: string // tertiary — red, gate/trigger alerts
    accent3: string // amber — warnings, special
  }
  cables: {
    audio: string // violet
    cv: string // green
    gate: string // red
    trigger: string // amber
  }
}
```

**all colors in the ui must reference css custom properties** (e.g., `var(--shade0)`, `var(--accent0)`, `var(--cable-audio)`). never use raw hex values in components.

### css modules policy

component styling is co-located via `*.module.css` files next to each `tsx` file. static/predictable styles should live in css modules, while ts/tsx should only keep runtime-driven exceptions (geometry, high-frequency dom writes, and theme token injection). see `src/styles/CSS_MODULES_GUIDE.md` for the migration conventions and audit commands.
do not use css modules `composes`; when sharing styles, import the shared css module in tsx and apply both class names explicitly.

### rack grid

the rack is a finite, scrollable canvas (`64 × 32` grid units = `3072 × 1536px` at default zoom). modules snap to a 48px grid unit (`GRID_UNIT` in `src/theme/tokens.ts`).

module `width` and `height` are declared in rack grid units. the pixel dimensions are `width * GRID_UNIT` and `height * GRID_UNIT`.

click-drag on empty rack space draws an accent-colored marquee selection box. any module intersecting the box is added to `selectedModuleIds` and rendered with the same accent border used for active selection.

selected modules can be copied and pasted with `cmd/ctrl+c` and `cmd/ctrl+v`. paste preserves relative layout and recreates cables where both ends were in the copied set.

### command palette

the module picker (`src/components/CommandPalette.tsx`) supports:

- tabbed browsing (`common`, `most used`, `all`, and per-category tabs)
- `all` is the default first tab when the palette opens
- search by module name, category, or id (search scans the full available module set, regardless of active tab)
- keyboard placement flow (`arrow up/down` + `enter`)

`most used` is derived from persistent local usage stats (stored in localStorage) by definition id, so it carries across sessions. when no usage data exists yet, it falls back to the `common` starter set.

### module panel structure

each module renders as an absolutely-positioned div on the rack canvas. `ModulePanel.tsx` owns the shared shell (header, drag behavior, selection border, and ports):

```
┌────────────────────────────────┐  ← shade2 border
│  module name                   │  ← shade1 background, drag handle
│ ─────────────────────────────  │  ← shade2 separator
│                                │
│  [params — knobs, faders,      │  ← module body
│   selectors, canvas zones]     │
│                                │
│ ─────────────────────────────  │  ← shade2 separator
│  [inputs]    ┃   [outputs]     │  ← output zone on shade3 inset
└────────────────────────────────┘
```

the output port inset (`shade3` background) is the primary visual signal distinguishing outputs from inputs.
when a module has outputs but no inputs, the output inset stretches full-width across the port row.

module body rendering is delegated by `src/modules/panelRegistry.ts`:

- each module can provide a `src/modules/<id>/panel.tsx` component
- `panelRegistry.ts` maps module ids to those panel components
- modules without a custom panel use `DefaultModuleBodyPanel`, which renders `select` params via `ListSelector` and all other params via `Knob`
- custom body panels are responsible only for body content (`flex: 1`); ports remain in `ModulePanel.tsx`

### cables

cables are `svg` bezier curves rendered on a full-rack overlay (`CableLayer.tsx`). cable colors come from the source port's type. path computation uses `CableBezier.ts`.

cable paths are updated directly via `element.setAttribute('d', path)` rather than through react reconciliation — the `portPositionCache` subscription notifies `CableLayer` to recompute paths without a react re-render. this keeps the cable layer fast during module drag.

the `PortPositionCache` (`src/cables/PortPositionCache.ts`) is a singleton map from `moduleId:portId` to `{x, y}` in rack canvas coordinates. it is updated by `ModulePanel.tsx` whenever a module moves.

### port rendering

input ports: `shade1` background, `shade2` ring, colored center dot when connected.

output ports: `shade3` inset background (inverted), `shade0` ring, `shade0` filled dot when connected.

hover state: ring transitions to `accent0`. tooltip fades in after 300ms.

---

## 8. patch persistence

patches serialize to json via `src/persistence/serialization.ts`. the format:

```typescript
interface SerializedPatch {
  version: string // '1' currently
  name: string
  createdAt: string
  updatedAt: string
  modules: Array<{
    id: string
    definitionId: string
    position: { x: number; y: number }
    params: Record<string, number>
    data?: Record<string, string>
    // subpatch container extras (when definitionId === '__subpatch__')
    subpatchDefinitionId?: string
    macroValues?: Record<string, number>
    containerWidth?: number
    containerHeight?: number
  }>
  cables: Array<{
    id: string
    from: { moduleId: string; portId: string }
    to: { moduleId: string; portId: string }
  }>
  // subpatch definitions — all patch-local definitions
  subpatchDefinitions?: SubpatchDefinition[]
  settings: {
    cableTautness: number
    tooltipsEnabled: boolean
    themeId: string
  }
}
```

autosave writes patch state on a debounced 500ms interval via `src/persistence/storage.ts`.

**missing module handling:** if a saved patch references a `definitionId` that is not in the current registry, the module is preserved in the store but rendered as a "missing" placeholder panel. the rest of the patch loads normally. this means removing a module definition from the registry will not corrupt existing saved patches.

---

## 9. cross-cutting rules

these rules apply everywhere in the codebase and must be maintained when adding or modifying any code:

1. **never use raw color values** — always reference css custom properties (`var(--shade0)`, `var(--accent0)`, `var(--cable-audio)`, etc.) or theme tokens. raw hex values in component code break theming.

2. **never allocate Float32Array in process()** — all buffers come from the pool or are pre-allocated in `state`. allocating inside `process()` causes gc pressure in the audio thread and will degrade performance over time.

3. **process() must be serializable** — no closures over module-level variables, no imports inside the function body, no references to `this`. the function must work when reconstructed from its string representation via `new Function()`.

4. **port positions must update the cache** — any component that renders ports must ensure `portPositionCache` is updated when the component mounts and when the module's position changes. `ModulePanel.tsx` handles this for all standard modules via its `updatePortPositions()` callback.

5. **store is the coordinator** — audio engine calls always go through zustand store actions. components must never call `engine.*` or `EngineController` methods directly. the store is the single point of coordination between ui state and engine state.

6. **cable layer does not use react reconciler for per-frame updates** — cable path `d` attributes are updated via direct dom manipulation (`element.setAttribute`), not by triggering react re-renders. this is intentional for performance. do not refactor cable position updates into react state.

7. **all user-facing text is lowercase** — major mono display uppercase glyphs are reserved for icons and waveform symbols. all labels, module names, param names, and ui text should be lowercase.

8. **sub-grid discipline** — all ui element positions in module declarations are in sub-grid units (8px base at 100% zoom). never use arbitrary pixel values for element placement within a module panel.

9. **standardized port label vocabulary** — use neutral, consistent jack labels. prefer `in`/`out` for primary signal flow, full words (`clock`, `reset`, `trigger`, `gate`) for timing signals, and stable target names for modulation inputs (`time`, `rate`, `pan`, etc.).

10. **css modules are the default styling surface** — place static styles in co-located `*.module.css` files. do not use `composes`; combine shared + local classes in tsx instead. keep inline styles only for runtime geometry (position/size/scale), and keep imperative `.style.*` writes only for known performance paths (meters/indicators/cable preview) or theme token injection in `ThemeProvider`.

---

## 10. current module list

_52 modules currently shipped (50 user-visible + 2 internal proxy modules)._

| id                | name           | category | inputs                                            | outputs                         |
| ----------------- | -------------- | -------- | ------------------------------------------------- | ------------------------------- |
| `vco`             | vco            | source   | frequency (cv), fm (cv), pw (cv)                  | sine, saw, pulse (audio)        |
| `vcf`             | vcf            | filter   | audio, cutoffCv, resonanceCv, envelope (cv)       | out (audio)                     |
| `vca`             | vca            | dynamics | audio, cv                                         | out (audio, metered)            |
| `mixer`           | mixer          | utility  | in1–in4 (audio; mute1–mute4 + masterMute params)  | out (audio)                     |
| `adsr`            | adsr           | envelope | gate                                              | out (cv)                        |
| `ad`              | ad             | envelope | gate                                              | out (cv), eoc (trigger)         |
| `pushbutton`      | button         | control  | —                                                 | gate, trigger                   |
| `scope`           | scope          | display  | in (audio/cv)                                     | —                               |
| `spectrum`        | freq spectrum  | display  | in (audio)                                        | —                               |
| `output`          | output         | utility  | left, right (audio)                               | — (stereo meter)                |
| `lfo`             | lfo            | source   | rate (cv)                                         | sine, saw, pulse, triangle (cv) |
| `chaos`           | chaos          | source   | —                                                 | x, y, z (cv)                    |
| `noise`           | noise          | source   | —                                                 | white, pink, brown (audio)      |
| `samplehold`      | s&h            | utility  | in (cv), trigger                                  | out (cv)                        |
| `clock`           | clock          | control  | reset (trigger)                                   | gate (gate), trigger (trigger)  |
| `sequencer`       | seq            | control  | clock (gate), reset (trigger)                     | out (cv), gate                  |
| `keyboard`        | keyboard       | control  | —                                                 | out (cv), gate, trigger         |
| `attenuverter`    | atten          | utility  | in (cv)                                           | out (cv)                        |
| `cv`              | cv             | control  | —                                                 | out (cv)                        |
| `octave`          | octave         | utility  | in (cv)                                           | out (cv)                        |
| `quantizer`       | quant          | utility  | in (cv)                                           | out (cv)                        |
| `reverb`          | reverb         | fx       | in (audio)                                        | out (audio)                     |
| `delay`           | delay          | utility  | in (audio)                                        | out (audio)                     |
| `slew`            | slew           | utility  | in (cv)                                           | out (cv)                        |
| `mult`            | mult           | utility  | in (cv)                                           | a, b, c, d (cv)                 |
| `mute`            | mute           | utility  | in (audio)                                        | out (audio)                     |
| `envfollower`     | env flwr       | dynamics | in (audio)                                        | out (cv)                        |
| `ar`              | ar             | envelope | gate (gate)                                       | out (cv), eoc (trigger)         |
| `comparator`      | comparator     | utility  | a, b (cv)                                         | gt, lt, eq (gate)               |
| `logic`           | logic          | utility  | a, b (gate)                                       | out (gate)                      |
| `wavefolder`      | wavefold       | fx       | in (audio), foldCv (cv)                           | out (audio)                     |
| `ringmod`         | ring mod       | fx       | a, b (audio)                                      | out (audio)                     |
| `bitcrusher`      | crush          | fx       | in (audio)                                        | out (audio)                     |
| `dist`            | dist           | fx       | in (audio)                                        | out (audio)                     |
| `flanger`         | flanger        | fx       | in (audio)                                        | out (audio)                     |
| `clockdiv`        | clock div      | control  | clock (gate), reset (trigger)                     | out (gate)                      |
| `euclidean`       | euclid         | control  | clock (gate), reset (trigger)                     | out, accent (trigger)           |
| `resonator`       | resonator      | source   | excite (trigger), pitch (cv), exciteAudio (audio) | out (audio)                     |
| `tuner`           | tuner          | display  | in (audio)                                        | —                               |
| `xyscope`         | xy scope       | display  | x, y (audio)                                      | —                               |
| `feedbackdelay`   | feedback delay | fx       | in (audio), time (cv)                             | out (audio)                     |
| `fmop`            | fm op          | source   | v/oct (cv), mod in (audio)                        | out (audio)                     |
| `pluck`           | pluck          | source   | excite (trigger), v/oct (cv), exc in (audio)      | out (audio)                     |
| `compressor`      | compressor     | dynamics | in (audio), sc (audio)                            | out (audio), gr (cv)            |
| `probgate`        | prob gate      | utility  | in (gate)                                         | out (gate), skip (gate)         |
| `chordgen`        | chord          | utility  | root (cv)                                         | v1–v4 (cv)                      |
| `chorddice`       | chord dice     | control  | clock (trigger), root (cv)                        | v1–v4 (cv)                      |
| `panner`          | panner         | utility  | in (audio), pan (cv)                              | left, right (audio)             |
| `tapedelay`       | tape delay     | fx       | in (audio), time (cv)                             | out (audio)                     |
| `note`            | note           | utility  | —                                                 | —                               |
| `subpatch-input`  | in             | utility  | in (any)                                          | out (any) — internal proxy      |
| `subpatch-output` | out            | utility  | in (any)                                          | out (any) — internal proxy      |

`subpatch-input` and `subpatch-output` are marked `internal: true` and are hidden from the command palette at root level. they are simple pass-through modules; their real purpose is to define exposed ports on a subpatch container's face. placed inside a subpatch via drill-down view. label and port type are configurable via their custom panel.

### panel component system

module-specific visual layouts live in `src/modules/<id>/panel.tsx`. `src/modules/panelRegistry.ts` selects the body panel component by module id and falls back to `DefaultModuleBodyPanel` for modules that use the standard control layout.

panel components receive `moduleId` and render only the body area (`flex: 1` between header and ports). ports, drag behavior, and selection chrome stay in `ModulePanel.tsx`.

panels use raw canvas refs with requestAnimationFrame loops for visual animations. they read `mod.params` (and, for ui-only modules like `note`, `mod.data`) from the store via `useStore` and the current theme via `useTheme()`. canvas colors use resolved theme color strings (e.g. `theme.accents.accent0`) since CSS custom properties are not available in canvas 2D contexts.

---

## 11. known implementation quirks

### worklet typescript source vs runtime js

`src/engine/worklet/GraphProcessor.ts` is a typescript reference copy of the worklet implementation. it is **not compiled by vite and not used at runtime.** the actual worklet processor is `public/GraphProcessor.js`, which is served as a static file and loaded by `EngineController.ts` via:

```typescript
await this.context.audioWorklet.addModule('/GraphProcessor.js')
```

`public/GraphProcessor.js` is served at `/GraphProcessor.js` by vite. when editing worklet processing logic, change this file first, then mirror the same logic in `src/engine/worklet/GraphProcessor.ts` so the reference copy stays accurate.

### module counter and patch load

`src/store/patchSlice.ts` uses a module-level `moduleCounter` to generate unique ids for module instances. on patch load this counter is fast-forwarded to avoid collisions.

### display SharedArrayBuffer setup

scope, freq spectrum, tuner, and xy scope each set up their own `SharedArrayBuffer` views inside their module panel components:

- `src/modules/scope/panel.tsx` → `setScopeBuffers`
- `src/modules/spectrum/panel.tsx` → `setScopeBuffers`
- `src/modules/tuner/panel.tsx` → `setTunerBuffer`
- `src/modules/xyscope/panel.tsx` → `setXYScopeBuffers`

buffers are injected through zustand store actions, not direct engine calls from `ModulePanel.tsx`. if `SharedArrayBuffer` is unavailable (missing coop/coep headers), the panels gracefully render without live data.

the freq spectrum and vcf panels share a single log-frequency analyzer implementation at `src/modules/utils/logSpectrumAnalyzer.ts`. it precomputes a blackman-harris window, radix-2 fft tables, and bin-to-bar weights with low-band center-spacing guards so early bars stay responsive. each frame removes dc offset, runs an in-place fft, aggregates fft bin energy into bars, and applies attack/release smoothing in-place so low-frequency bars are stable without per-frame allocations.

### sequencer and clock indicator buffers

the clock and sequencer modules use `Int32Array` views of `SharedArrayBuffer` instances (injected via the store action `setIndicatorBuffer`) to communicate the current beat/step position to the ui without polling. these are read atomically in the `ClockIndicator` and `SequencerIndicator` components via `requestAnimationFrame`.

---

## 12. implementation notes

### undo/redo history

undo/redo is implemented by `src/store/historySlice.ts` with bounded past/future stacks (max 50 entries). snapshot shape is `{ modules, cables, patchName }`. history captures structural patch edits (module/cable add-remove, module moves, and paste operations) and intentionally excludes high-frequency edits like param drags and note text typing for performance and usability.

### zoom + themes

zoom lives in `uiSlice` (`zoom`, `setZoom`) and is applied in `Rack.tsx` via an outer scroll container plus inner `scale(zoom)` transform. zoom is not serialized in patch files.

theme selection is stored in settings (`themeId`) and resolved through `src/theme/themeRegistry.ts`. active theme tokens are injected as css custom properties by `ThemeProvider.tsx`.

### panel architecture

module visuals now follow a single pattern:

- module body components live in `src/modules/<id>/panel.tsx`
- `src/modules/panelRegistry.ts` maps module ids to those body components
- `DefaultModuleBodyPanel` handles modules that only need the standard controls
- `ModulePanel.tsx` remains the shared shell for dragging, multi-selection, and ports

this keeps module-specific UI logic close to each module while preserving a single canonical path for rack behavior and cable positioning.

### tutorial overlay architecture

the guided learning ui lives in `src/components/TutorialOverlay.tsx` + `TutorialOverlay.module.css`.

- the panel reads tutorial state from `tutorialSlice` and renders lesson selection or active step content
- step progress is validated against live store snapshots (modules/cables/params/context) on change
- spotlight rectangles are drawn in a fixed overlay layer by querying focused module/port/param dom nodes
- param spotlighting depends on `data-param-control` + `data-module-id` + `data-param-id` attributes added to shared controls (`Knob`, `ListSelector`, `Fader`)

### subpatch / container modules

subpatches are purely a ui-level grouping concept. the audio worklet always sees a flat graph — internal modules are added to the worklet with namespaced ids (`${instanceId}::${internalModuleId}`).

**definition vs. instance.** a `SubpatchDefinition` holds the internal topology shared by all instances. a `SubpatchContainerInstance` (stored in `patchSlice.modules`) is one placement of that definition on the canvas, plus per-instance `macroValues` and pre-computed display dimensions.

**drill-down navigation.** double-clicking a container calls `enterSubpatch()` in `uiSlice`, which injects the definition's internal modules/cables into `state.modules`/`state.cables`. existing rack components (`ModulePanel`, `Port`, `CableLayer`) continue to work without modification because they just read from those maps. on exit, injected entries are removed and `syncAllInstances(defId)` hot-reloads all other instances from the updated definition.

**port exposure.** `subpatch-input` and `subpatch-output` modules placed inside a subpatch define the exposed ports on the container face. their label and portType (audio/cv/gate/trigger) are editable via the proxy module's custom panel. `refreshExposedPorts()` is called any time a proxy is added, removed, or has its `label`/`portType` changed; it rebuilds `exposedInputs`/`exposedOutputs` on the definition and updates all container instances' display dimensions.

**container port ids.** the parent patch uses synthetic port ids (`sp_in_0`, `sp_out_0`, etc.) for connections to/from containers. `resolveContainerPort()` and `resolveWorkletCable()` translate these to the actual proxy worklet module ids before sending commands to the worklet.

**macro knobs.** right-clicking any knob inside a drill-down view shows an "expose as macro" context menu. this adds a `MacroDefinition` to the definition. the container face renders macro knobs using `SubpatchPanel`. each knob calls `setMacroValue(instanceId, macroId, value)` which routes the value to the internal worklet module. right-clicking again shows "remove macro".

**creation workflows.** two ways to create subpatches:

- select modules → right-click empty space → "group as subpatch" (`groupModulesAsSubpatch`)
- open command palette → "subpatch" entry → creates empty container (`createDefinition` + `addSubpatchContainer`)

**undo/redo.** `historySlice` snapshots `definitions` alongside `modules`/`cables` in each history entry so undo correctly restores subpatch state.
