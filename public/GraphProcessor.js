// src/engine/worklet/GraphProcessor.js
// runs in AudioWorkletGlobalScope — no DOM, no imports from main thread

const BUFFER_SIZE = 128

class WorkletModule {
  constructor(definitionId, params, state, inputPortIds, outputPortIds, inputPortTypes, paramDefaults, sr) {
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

  getSmoothedParams() {
    const result = {}
    for (const [key, smoother] of Object.entries(this.smoothers)) {
      const target = this.params[key] ?? this.paramDefaults[key] ?? 0
      smoother.smoothed += (target - smoother.smoothed) * smoother.coeff
      result[key] = smoother.smoothed
    }
    return result
  }
}

class GraphProcessorNode extends AudioWorkletProcessor {
  constructor() {
    super()
    this.modules = new Map()
    this.cables = []
    this.evaluationOrder = []
    this.pendingCommands = []
    // pre-allocated buffer pool
    this.pool = Array.from({ length: 256 }, () => new Float32Array(BUFFER_SIZE))
    this.availableBuffers = [...this.pool]
    // feedback delay buffers: cableId → Float32Array
    this.feedbackBuffers = new Map()

    // throttle meter events: send every ~15ms (5 buffers at 44100Hz / 128 samples)
    this.meterFrameCounter = 0
    this.METER_INTERVAL = 5

    this.port.onmessage = (e) => this.pendingCommands.push(e.data)
    this.port.postMessage({ type: 'READY' })
  }

  acquireBuffer() {
    return this.availableBuffers.pop() ?? new Float32Array(BUFFER_SIZE)
  }

  releaseBuffer(buf) {
    buf.fill(0)
    this.availableBuffers.push(buf)
  }

  applyCommands() {
    while (this.pendingCommands.length > 0) {
      const cmd = this.pendingCommands.shift()
      this.handleCommand(cmd)
    }
  }

  handleCommand(cmd) {
    switch (cmd.type) {
      case 'ADD_MODULE': {
        const { moduleId, definitionId, params, state, inputPortIds, outputPortIds, inputPortTypes, paramDefaults, processFnStr } = cmd
        // reconstruct process function from serialized string
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
        this.modules.delete(cmd.moduleId)
        this.cables = this.cables.filter(
          c => c.from.moduleId !== cmd.moduleId && c.to.moduleId !== cmd.moduleId
        )
        this.rebuildEvaluationOrder()
        break
      }
      case 'ADD_CABLE': {
        const cable = cmd.cable
        this.cables.push(cable)
        if (cable.isFeedback) {
          this.feedbackBuffers.set(cable.id, new Float32Array(BUFFER_SIZE))
        }
        this.rebuildEvaluationOrder()
        break
      }
      case 'REMOVE_CABLE': {
        this.cables = this.cables.filter(c => c.id !== cmd.cableId)
        this.feedbackBuffers.delete(cmd.cableId)
        this.rebuildEvaluationOrder()
        break
      }
      case 'SET_PARAM': {
        const m = this.modules.get(cmd.moduleId)
        if (m) m.params[cmd.param] = cmd.value
        break
      }
      case 'SET_GATE': {
        const m = this.modules.get(cmd.moduleId)
        if (m) {
          const offset = Math.max(0, Math.min(BUFFER_SIZE - 1,
            Math.round((cmd.scheduledAt - currentTime) * sampleRate)
          ))
          if (!m.state._gateEvents) m.state._gateEvents = []
          m.state._gateEvents.push({
            offset,
            value: cmd.value,
            portId: cmd.portId
          })
        }
        break
      }
      case 'SET_SCOPE_BUFFERS': {
        const m = this.modules.get(cmd.moduleId)
        if (m) {
          m.state.scopeBuffer = new Float32Array(cmd.scopeBuffer)
          m.state.writeIndexBuffer = new Int32Array(cmd.writeIndexBuffer)
          m.state.writeIndex = 0
        }
        break
      }
      case 'SET_TUNER_BUFFER': {
        const m = this.modules.get(cmd.moduleId)
        if (m) m.state.tunerBuffer = new Float32Array(cmd.buffer)
        break
      }
      case 'SET_XYSCOPE_BUFFERS': {
        const m = this.modules.get(cmd.moduleId)
        if (m) {
          m.state.xBuffer          = new Float32Array(cmd.xBuffer)
          m.state.yBuffer          = new Float32Array(cmd.yBuffer)
          m.state.writeIndexBuffer = new Int32Array(cmd.writeIndexBuffer)
          m.state.xyWriteIndex     = 0
        }
        break
      }
      case 'SET_INDICATOR_BUFFER': {
        const m = this.modules.get(cmd.moduleId)
        if (m) {
          m.state._indicatorBuffer = new Int32Array(cmd.buffer)
        }
        break
      }
    }
  }

  rebuildEvaluationOrder() {
    // Re-detect feedback cables from scratch on every topology change.
    // Preserve existing delay buffer data for cables that remain feedback edges.
    const prev = this.feedbackBuffers
    this.feedbackBuffers = new Map()

    const visited = new Set()
    const order = []

    const visit = (id, stack) => {
      if (visited.has(id)) return
      if (stack.has(id)) return
      stack.add(id)

      for (const cable of this.cables) {
        if (cable.to.moduleId !== id) continue
        const depId = cable.from.moduleId
        if (stack.has(depId)) {
          // back edge: auto-mark as feedback, preserve any existing delay buffer
          this.feedbackBuffers.set(cable.id, prev.get(cable.id) ?? new Float32Array(BUFFER_SIZE))
        } else {
          visit(depId, stack)
        }
      }

      stack.delete(id)
      visited.add(id)
      order.push(id)
    }

    for (const id of this.modules.keys()) visit(id, new Set())
    this.evaluationOrder = order
  }

  process(_inputs, outputs, _parameters) {
    this.applyCommands()

    // per-module output buffers for this tick: moduleId:portId → Float32Array
    const tickBuffers = new Map()
    const acquiredBuffers = []

    const getBuffer = (key) => {
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
      const inputBuffers = {}
      for (const portId of m.inputPortIds) {
        const buf = this.acquireBuffer()
        acquiredBuffers.push(buf)
        // find all cables connected to this input port
        const connected = this.cables.filter(c => c.to.moduleId === moduleId && c.to.portId === portId)
        for (const cable of connected) {
          // use feedback buffer if this is a feedback cable
          const srcBuf = this.feedbackBuffers.has(cable.id)
            ? this.feedbackBuffers.get(cable.id)
            : tickBuffers.get(`${cable.from.moduleId}:${cable.from.portId}`)
          if (srcBuf) {
            for (let i = 0; i < BUFFER_SIZE; i++) buf[i] += srcBuf[i]
          }
        }
        // if no connection, fill with port default
        if (connected.length === 0) {
          buf.fill(0)  // defaults handled by module itself
        }
        inputBuffers[portId] = buf
      }

      // build output buffers
      const outputBuffers = {}
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
          if (srcBuf) this.feedbackBuffers.get(cable.id).set(srcBuf)
        }
      }
    }

    // write to web audio output
    for (const [, m] of this.modules) {
      if (m.definitionId === 'output') {
        // output module writes processed audio to state._outputLeft / _outputRight
        const leftBuf = m.state._outputLeft
        const rightBuf = m.state._outputRight

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

    // send throttled METER events for output module peak levels
    this.meterFrameCounter++
    if (this.meterFrameCounter >= this.METER_INTERVAL) {
      this.meterFrameCounter = 0
      for (const [moduleId, m] of this.modules) {
        if (m.definitionId === 'output') {
          const peakL = m.state.peakL ?? 0
          const peakR = m.state.peakR ?? 0
          this.port.postMessage({ type: 'METER', moduleId, portId: 'peakL', peak: peakL })
          this.port.postMessage({ type: 'METER', moduleId, portId: 'peakR', peak: peakR })
        }
      }
    }

    return true  // keep processor alive
  }
}

registerProcessor('graph-processor', GraphProcessorNode)
