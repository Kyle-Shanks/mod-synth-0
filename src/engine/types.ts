// signal port types
export type PortType = 'audio' | 'cv' | 'gate' | 'trigger'

// port definition — used in ModuleDefinition
export interface PortDefinition {
  type: PortType
  default: number   // value used when port is unconnected
  label: string
}

// parameter definition — used in ModuleDefinition
export interface ParamDefinition {
  type: 'float' | 'int' | 'boolean' | 'select'
  min?: number
  max?: number
  default: number
  options?: string[]   // for 'select' type only
  label: string
  unit?: string        // 'hz', 'db', 'ms', '%', 's' — shown in value display
  curve?: 'linear' | 'log'  // 'log' for exponential knob scaling (requires min > 0)
}

// the context object passed to initialize() and process()
export interface ModuleContext {
  sampleRate: number
  bufferSize: number   // always 128
}

// the full module definition interface
// I, O, P are generic records of port/param definitions
// S is the module's internal state shape
export interface ModuleDefinition<
  I extends Record<string, PortDefinition> = Record<string, PortDefinition>,
  O extends Record<string, PortDefinition> = Record<string, PortDefinition>,
  P extends Record<string, ParamDefinition> = Record<string, ParamDefinition>,
  S extends Record<string, unknown> = Record<string, unknown>
> {
  id: string
  name: string
  category: 'source' | 'filter' | 'envelope' | 'dynamics' | 'utility' | 'fx' | 'display' | 'control'

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
    context: ModuleContext
  ): void
}

// serialized forms used for postMessage and patch storage
export interface SerializedModule {
  id: string               // instance id (uuid)
  definitionId: string     // references ModuleDefinition.id
  params: Record<string, number>
  state: Record<string, unknown>
  position: { x: number; y: number }
}

export interface SerializedCable {
  id: string
  from: { moduleId: string; portId: string }
  to:   { moduleId: string; portId: string }
}

// commands sent from main thread to worklet
export type EngineCommand =
  | { type: 'ADD_MODULE';    module: SerializedModule; definition: ModuleDefinition }
  | { type: 'REMOVE_MODULE'; moduleId: string }
  | { type: 'ADD_CABLE';     cable: SerializedCable }
  | { type: 'REMOVE_CABLE';  cableId: string }
  | { type: 'SET_PARAM';     moduleId: string; param: string; value: number }
  | { type: 'SET_GATE';      moduleId: string; portId: string; value: 0 | 1; scheduledAt: number }

// events sent from worklet to main thread
export type EngineEvent =
  | { type: 'METER'; moduleId: string; portId: string; peak: number }
  | { type: 'READY' }
  | { type: 'ERROR'; message: string }
