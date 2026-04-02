// src/engine/worklet/GraphProcessor.ts
// runs in AudioWorkletGlobalScope — no DOM, no imports from main thread

// AudioWorkletGlobalScope globals
declare const sampleRate: number
declare const currentTime: number
declare function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor()
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean
}

const BUFFER_SIZE = 128

interface GateEvent {
  offset: number
  value: number
  portId: string
}

class WorkletModule {
  definitionId: string
  params: Record<string, number>
  smoothers: Record<string, { smoothed: number; coeff: number }>
  state: Record<string, unknown>
  process!: (
    inputs: Record<string, Float32Array>,
    outputs: Record<string, Float32Array>,
    params: Record<string, number>,
    state: Record<string, unknown>,
    context: { sampleRate: number; bufferSize: number }
  ) => void
  inputPortTypes: Record<string, string>
  outputPortIds: string[]
  inputPortIds: string[]
  paramDefaults: Record<string, number>

  constructor(
    definitionId: string,
    params: Record<string, number>,
    state: Record<string, unknown>,
    inputPortIds: string[],
    outputPortIds: string[],
    inputPortTypes: Record<string, string>,
    paramDefaults: Record<string, number>,
    sr: number
  ) {
    this.definitionId = definitionId
    this.params = { ...params }
    this.state = state
    this.inputPortIds = inputPortIds
    this.outputPortIds = outputPortIds
    this.inputPortTypes = inputPortTypes
    this.paramDefaults = paramDefaults

    // initialize smoothers for each param
    this.smoothers = {}
    const coeff = 1 - Math.exp(-2 * Math.PI * 100 / sr)  // ~10ms at 44100
    for (const [key, value] of Object.entries(params)) {
      this.smoothers[key] = { smoothed: value, coeff }
    }
  }

  getSmoothedParams(): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [key, smoother] of Object.entries(this.smoothers)) {
      const target = this.params[key] ?? this.paramDefaults[key] ?? 0
      smoother.smoothed += (target - smoother.smoothed) * smoother.coeff
      result[key] = smoother.smoothed
    }
    return result
  }
}

interface CableRecord {
  id: string
  from: { moduleId: string; portId: string }
  to: { moduleId: string; portId: string }
  isFeedback?: boolean
}

class GraphProcessorNode extends AudioWorkletProcessor {
  private modules = new Map<string, WorkletModule>()
  private cables: CableRecord[] = []
  private evaluationOrder: string[] = []
  private pendingCommands: unknown[] = []
  // pre-allocated buffer pool
  private pool: Float32Array[] = Array.from({ length: 256 }, () => new Float32Array(BUFFER_SIZE))
  private availableBuffers: Float32Array[] = []
  // feedback delay buffers: cableId → Float32Array
  private feedbackBuffers = new Map<string, Float32Array>()

  constructor() {
    super()
    this.availableBuffers = [...this.pool]
    this.port.onmessage = (e: MessageEvent) => this.pendingCommands.push(e.data)
    this.port.postMessage({ type: 'READY' })
  }

  private acquireBuffer(): Float32Array {
    return this.availableBuffers.pop() ?? new Float32Array(BUFFER_SIZE)
  }

  private releaseBuffer(buf: Float32Array): void {
    buf.fill(0)
    this.availableBuffers.push(buf)
  }

  private applyCommands(): void {
    while (this.pendingCommands.length > 0) {
      const cmd = this.pendingCommands.shift() as Record<string, unknown>
      this.handleCommand(cmd)
    }
  }

  private handleCommand(cmd: Record<string, unknown>): void {
    switch (cmd.type) {
      case 'ADD_MODULE': {
        const moduleId = cmd.moduleId as string
        const definitionId = cmd.definitionId as string
        const params = cmd.params as Record<string, number>
        const state = cmd.state as Record<string, unknown>
        const inputPortIds = cmd.inputPortIds as string[]
        const outputPortIds = cmd.outputPortIds as string[]
        const inputPortTypes = cmd.inputPortTypes as Record<string, string>
        const paramDefaults = cmd.paramDefaults as Record<string, number>
        const processFnStr = cmd.processFnStr as string

        // reconstruct process function from serialized string
        // eslint-disable-next-line no-new-func
        const processFn = new Function('return ' + processFnStr)()
        const m = new WorkletModule(
          definitionId,
          params,
          state,
          inputPortIds,
          outputPortIds,
          inputPortTypes,
          paramDefaults,
          sampleRate
        )
        m.process = processFn
        this.modules.set(moduleId, m)
        this.rebuildEvaluationOrder()
        break
      }
      case 'REMOVE_MODULE': {
        this.modules.delete(cmd.moduleId as string)
        this.cables = this.cables.filter(
          c => c.from.moduleId !== cmd.moduleId && c.to.moduleId !== cmd.moduleId
        )
        this.rebuildEvaluationOrder()
        break
      }
      case 'ADD_CABLE': {
        const cable = cmd.cable as CableRecord
        this.cables.push(cable)
        if (cable.isFeedback) {
          this.feedbackBuffers.set(cable.id, new Float32Array(BUFFER_SIZE))
        }
        this.rebuildEvaluationOrder()
        break
      }
      case 'REMOVE_CABLE': {
        this.cables = this.cables.filter(c => c.id !== cmd.cableId)
        this.feedbackBuffers.delete(cmd.cableId as string)
        this.rebuildEvaluationOrder()
        break
      }
      case 'SET_PARAM': {
        const m = this.modules.get(cmd.moduleId as string)
        if (m) m.params[cmd.param as string] = cmd.value as number
        break
      }
      case 'SET_GATE': {
        const m = this.modules.get(cmd.moduleId as string)
        if (m) {
          const offset = Math.max(0, Math.min(BUFFER_SIZE - 1,
            Math.round(((cmd.scheduledAt as number) - currentTime) * sampleRate)
          ))
          if (!m.state['_gateEvents']) m.state['_gateEvents'] = []
          ;(m.state['_gateEvents'] as GateEvent[]).push({
            offset,
            value: cmd.value as number,
            portId: cmd.portId as string
          })
        }
        break
      }
    }
  }

  private rebuildEvaluationOrder(): void {
    const visited = new Set<string>()
    const order: string[] = []

    const getInputModuleIds = (moduleId: string): string[] => {
      return this.cables
        .filter(c => c.to.moduleId === moduleId && !this.feedbackBuffers.has(c.id))
        .map(c => c.from.moduleId)
    }

    const visit = (id: string, stack: Set<string>): void => {
      if (visited.has(id)) return
      if (stack.has(id)) return  // cycle — handled by feedback buffers
      stack.add(id)
      for (const dep of getInputModuleIds(id)) visit(dep, stack)
      stack.delete(id)
      visited.add(id)
      order.push(id)
    }

    for (const id of this.modules.keys()) visit(id, new Set())
    this.evaluationOrder = order
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
    this.applyCommands()

    // per-module output buffers for this tick: moduleId:portId → Float32Array
    const tickBuffers = new Map<string, Float32Array>()
    const acquiredBuffers: Float32Array[] = []

    const getBuffer = (key: string): Float32Array => {
      let buf = tickBuffers.get(key)
      if (!buf) {
        buf = this.acquireBuffer()
        acquiredBuffers.push(buf)
        tickBuffers.set(key, buf)
      }
      return buf
    }

    // run each module in topological order
    for (const moduleId of this.evaluationOrder) {
      const m = this.modules.get(moduleId)
      if (!m) continue

      // build inputs: gather connected cables, sum multiple connections
      const inputBuffers: Record<string, Float32Array> = {}
      for (const portId of m.inputPortIds) {
        const buf = this.acquireBuffer()
        acquiredBuffers.push(buf)
        // find all cables connected to this input port
        const connected = this.cables.filter(c => c.to.moduleId === moduleId && c.to.portId === portId)
        for (const cable of connected) {
          // use feedback buffer if this is a feedback cable
          const srcBuf = this.feedbackBuffers.has(cable.id)
            ? this.feedbackBuffers.get(cable.id)!
            : tickBuffers.get(`${cable.from.moduleId}:${cable.from.portId}`)
          if (srcBuf) {
            for (let i = 0; i < BUFFER_SIZE; i++) buf[i]! += srcBuf[i]!
          }
        }
        // if no connection, fill with port default
        if (connected.length === 0) {
          buf.fill(0)  // defaults handled by module itself
        }
        inputBuffers[portId] = buf
      }

      // build output buffers
      const outputBuffers: Record<string, Float32Array> = {}
      for (const portId of m.outputPortIds) {
        const buf = getBuffer(`${moduleId}:${portId}`)
        outputBuffers[portId] = buf
      }

      // run the module
      try {
        m.process(inputBuffers, outputBuffers, m.getSmoothedParams(), m.state, { sampleRate, bufferSize: BUFFER_SIZE })
      } catch (e) {
        this.port.postMessage({ type: 'ERROR', message: String(e) })
      }

      // update feedback buffers (copy output into feedback delay line)
      for (const cable of this.cables) {
        if (cable.from.moduleId === moduleId && this.feedbackBuffers.has(cable.id)) {
          const srcBuf = outputBuffers[cable.from.portId]
          if (srcBuf) this.feedbackBuffers.get(cable.id)!.set(srcBuf)
        }
      }
    }

    // write to web audio output — the output module writes to its input buffers,
    // the worklet copies them to the actual audio output
    for (const [, m] of this.modules) {
      if (m.definitionId === 'output') {
        // output module writes processed audio to state._outputLeft / _outputRight
        const leftBuf = m.state['_outputLeft'] as Float32Array | undefined
        const rightBuf = m.state['_outputRight'] as Float32Array | undefined

        if (outputs[0]?.[0] && leftBuf) outputs[0][0].set(leftBuf)
        if (outputs[0]?.[1]) {
          if (rightBuf) {
            outputs[0][1].set(rightBuf)
          } else if (leftBuf) {
            outputs[0][1].set(leftBuf)
          }
        }
      }
    }

    // release all tick buffers back to pool
    for (const buf of acquiredBuffers) this.releaseBuffer(buf)

    return true  // keep processor alive
  }
}

registerProcessor('graph-processor', GraphProcessorNode)
