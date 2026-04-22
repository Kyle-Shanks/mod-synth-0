// signal port types
export type PortType = 'audio' | 'cv' | 'gate' | 'trigger'

// ── subpatch types ──────────────────────────────────────────────────────────

// one exposed port on a container's face (backed by a proxy module inside)
export interface ExposedPortDef {
  proxyModuleId: string // module ID inside the definition's module map
  label: string
  type: PortType
}

// a knob on the container face that directly controls one internal parameter
export interface MacroDefinition {
  id: string
  label: string
  targetModuleId: string // internal module ID within the definition
  targetParamId: string
  // range and curve are inherited from the target param at render time
}

// a named, reusable internal patch (stored in subpatchSlice.definitions)
export interface SubpatchDefinition {
  id: string
  name: string
  // matches the shape of ModuleInstance in patchSlice (inlined to avoid circular import)
  modules: Record<
    string,
    {
      definitionId: string
      position: { x: number; y: number }
      params: Record<string, number>
      data?: Record<string, string>
    }
  >
  cables: Record<string, SerializedCable>
  exposedInputs: ExposedPortDef[]
  exposedOutputs: ExposedPortDef[]
  macros: MacroDefinition[]
  // optional manual size overrides (grid units); omit to use auto-computed size
  widthOverride?: number
  heightOverride?: number
}

// port definition — used in ModuleDefinition
export interface PortDefinition {
  type: PortType
  default: number // value used when port is unconnected
  label: string
  // hide this port from the UI (port still exists in worklet for signal routing)
  hidden?: boolean
}

// parameter definition — used in ModuleDefinition
export interface ParamDefinition {
  type: 'float' | 'int' | 'boolean' | 'select'
  min?: number
  max?: number
  default: number
  options?: string[] // for 'select' type only
  label: string
  unit?: string // 'hz', 'db', 'ms', '%', 's' — shown in value display
  curve?: 'linear' | 'log' // 'log' for exponential knob scaling (requires min > 0)
}

// the context object passed to initialize() and process()
export interface ModuleContext {
  sampleRate: number
  bufferSize: number // always 128
}

// the full module definition interface
// I, O, P are generic records of port/param definitions
// S is the module's internal state shape
export interface ModuleDefinition<
  I extends Record<string, PortDefinition> = Record<string, PortDefinition>,
  O extends Record<string, PortDefinition> = Record<string, PortDefinition>,
  P extends Record<string, ParamDefinition> = Record<string, ParamDefinition>,
  S extends Record<string, unknown> = Record<string, unknown>,
> {
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
    | 'subpatch'
  // internal modules are hidden in the command palette unless inside a subpatch
  internal?: boolean

  // rack grid dimensions (in grid units)
  width: number
  height: number

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

// serialized forms used for postMessage and patch storage
export interface SerializedModule {
  id: string // instance id (uuid)
  definitionId: string // references ModuleDefinition.id
  params: Record<string, number>
  state: Record<string, unknown>
  position: { x: number; y: number }
}

export interface SerializedCable {
  id: string
  from: { moduleId: string; portId: string }
  to: { moduleId: string; portId: string }
}

// commands sent from main thread to worklet
export type EngineCommand =
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
  | {
      type: 'SET_SAMPLER_BUFFER'
      moduleId: string
      buffer: ArrayBuffer
      sampleRate: number
    }
  | {
      type: 'SET_SAMPLER_PLAYHEAD_BUFFER'
      moduleId: string
      buffer: SharedArrayBuffer
    }
  | { type: 'TRIGGER_SAMPLER'; moduleId: string }
  | { type: 'STOP_SAMPLER'; moduleId: string }

// events sent from worklet to main thread
export type EngineEvent =
  | { type: 'METER'; moduleId: string; portId: string; peak: number }
  | {
      type: 'METER_BATCH'
      entries: Array<{ moduleId: string; portId: string; peak: number }>
    }
  | { type: 'READY' }
  | { type: 'ERROR'; message: string }
