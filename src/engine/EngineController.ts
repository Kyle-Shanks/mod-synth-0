import type { EngineEvent, ModuleDefinition, SerializedCable, SerializedModule } from './types'
import graphProcessorUrl from './worklet/GraphProcessor.js?url'

// Method shorthand like `process(a, b) { }` is not a valid expression for `new Function('return ...')`.
// Prefix with `function` to make it a named function expression.
function normalizeFnStr(fn: string): string {
  return /^(function[\s(]|async[\s(]|\(|[\w$]+\s*=>)/.test(fn) ? fn : `function ${fn}`
}

export class EngineController {
  private context: AudioContext | null = null
  private workletNode: AudioWorkletNode | null = null
  private ready = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private commandQueue: Record<string, unknown>[] = []
  private eventListeners: Array<(event: EngineEvent) => void> = []

  async initialize(): Promise<void> {
    this.context = new AudioContext({ sampleRate: 44100, latencyHint: 'interactive' })
    await this.context.audioWorklet.addModule(graphProcessorUrl)
    this.workletNode = new AudioWorkletNode(this.context, 'graph-processor', {
      numberOfOutputs: 1,
      outputChannelCount: [2],
    })
    this.workletNode.connect(this.context.destination)

    // wait for READY from the worklet before returning
    await new Promise<void>((resolve) => {
      this.workletNode!.port.onmessage = (e: MessageEvent) => {
        const event = e.data as EngineEvent
        if (event.type === 'READY') {
          this.ready = true
          // flush queued commands
          for (const cmd of this.commandQueue) this.postMessage(cmd)
          this.commandQueue = []
          // switch to permanent handler
          this.workletNode!.port.onmessage = (ev: MessageEvent) => this.handleEvent(ev.data as EngineEvent)
          resolve()
        }
        this.notifyListeners(event)
      }
    })
  }

  private handleEvent(event: EngineEvent): void {
    this.notifyListeners(event)
  }

  private notifyListeners(event: EngineEvent): void {
    for (const listener of this.eventListeners) listener(event)
  }

  onEvent(listener: (event: EngineEvent) => void): () => void {
    this.eventListeners.push(listener)
    return () => { this.eventListeners = this.eventListeners.filter(l => l !== listener) }
  }

  private postMessage(msg: Record<string, unknown>): void {
    this.workletNode?.port.postMessage(msg)
  }

  private send(msg: Record<string, unknown>): void {
    if (!this.ready) { this.commandQueue.push(msg); return }
    this.postMessage(msg)
  }

  addModule(module: SerializedModule, definition: ModuleDefinition): void {
    const inputPortIds = Object.keys(definition.inputs)
    const outputPortIds = Object.keys(definition.outputs)
    const inputPortTypes: Record<string, string> = {}
    for (const [key, port] of Object.entries(definition.inputs)) {
      inputPortTypes[key] = port.type
    }
    const paramDefaults: Record<string, number> = {}
    for (const [key, param] of Object.entries(definition.params)) {
      paramDefaults[key] = param.default
    }

    this.send({
      type: 'ADD_MODULE',
      moduleId: module.id,
      definitionId: module.definitionId,
      params: module.params,
      state: module.state,
      inputPortIds,
      outputPortIds,
      inputPortTypes,
      paramDefaults,
      processFnStr: normalizeFnStr(definition.process.toString()),
    })
  }

  removeModule(moduleId: string): void {
    this.send({ type: 'REMOVE_MODULE', moduleId })
  }

  addCable(cable: SerializedCable, isFeedback = false): void {
    this.send({
      type: 'ADD_CABLE',
      cable: { ...cable, isFeedback },
    })
  }

  removeCable(cableId: string): void {
    this.send({ type: 'REMOVE_CABLE', cableId })
  }

  setParam(moduleId: string, param: string, value: number): void {
    this.send({ type: 'SET_PARAM', moduleId, param, value })
  }

  setScopeBuffer(moduleId: string, buffer: SharedArrayBuffer): void {
    this.send({
      type: 'SET_SCOPE_BUFFER',
      moduleId,
      buffer,
    })
  }

  setGate(moduleId: string, portId: string, value: 0 | 1): void {
    if (!this.context) return
    this.send({
      type: 'SET_GATE',
      moduleId,
      portId,
      value,
      scheduledAt: this.context.currentTime
    })
  }

  async resume(): Promise<void> {
    await this.context?.resume()
  }

  async suspend(): Promise<void> {
    await this.context?.suspend()
  }

  get currentTime(): number {
    return this.context?.currentTime ?? 0
  }

  get sampleRate(): number {
    return this.context?.sampleRate ?? 44100
  }
}

// singleton — one engine per app
export const engine = new EngineController()
