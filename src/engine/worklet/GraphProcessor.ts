/* eslint-disable */
// reference-only mirror of /public/GraphProcessor.js
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
    this.smoothedParams = {}
    const coeff = 1 - Math.exp(-2 * Math.PI * 300 / sr) // ~3ms at 44100
    this.smootherCoeff = coeff
    for (const [key, value] of Object.entries(params)) {
      this.smoothers[key] = { smoothed: value, coeff }
      this.smoothedParams[key] = value
    }
    for (const [key, value] of Object.entries(paramDefaults)) {
      if (this.smoothers[key]) continue
      const initial = params[key] ?? value ?? 0
      this.smoothers[key] = { smoothed: initial, coeff }
      this.smoothedParams[key] = initial
    }

    // stable per-module objects reused every tick
    this.inputBuffers = {}
    this.outputBuffers = {}
    this.connectedInputs = {}
    for (const portId of inputPortIds) {
      this.inputBuffers[portId] = null
      this.connectedInputs[portId] = false
    }
    for (const portId of outputPortIds) this.outputBuffers[portId] = null
    this.state._connectedInputs = this.connectedInputs
  }

  getSmoothedParams() {
    for (const [key, smoother] of Object.entries(this.smoothers)) {
      const target = this.params[key] ?? this.paramDefaults[key] ?? 0
      smoother.smoothed += (target - smoother.smoothed) * smoother.coeff
      this.smoothedParams[key] = smoother.smoothed
    }
    return this.smoothedParams
  }
}

class GraphProcessorNode extends AudioWorkletProcessor {
  constructor() {
    super()
    this.modules = new Map()
    this.cables = []
    this.evaluationOrder = []
    this.pendingCommands = []

    // topology caches rebuilt on topology change
    this.incomingByModule = new Map() // moduleId -> Map<portId, cable[]>
    this.outgoingByModule = new Map() // moduleId -> cable[]

    // pre-allocated buffer pool
    this.pool = Array.from({ length: 256 }, () => new Float32Array(BUFFER_SIZE))
    this.availableBuffers = [...this.pool]

    // per-tick scratch reused every process() call
    this.tickBuffers = new Map() // moduleId:portId -> Float32Array
    this.acquiredBuffers = []

    // feedback delay buffers: cableId -> Float32Array
    this.feedbackBuffers = new Map()

    // throttle meter events: send every ~15ms (5 buffers at 44100Hz / 128 samples)
    this.meterFrameCounter = 0
    this.METER_INTERVAL = 5

    this.poolExhaustedReported = false

    this.port.onmessage = (e) => this.pendingCommands.push(e.data)
    this.port.postMessage({ type: 'READY' })
  }

  acquireBuffer() {
    const buf = this.availableBuffers.pop()
    if (buf) return buf

    if (!this.poolExhaustedReported) {
      this.poolExhaustedReported = true
      this.port.postMessage({
        type: 'ERROR',
        message: 'buffer pool exhausted - consider increasing pool size',
      })
    }

    // fallback to preserve audio continuity
    return new Float32Array(BUFFER_SIZE)
  }

  releaseBuffer(buf) {
    buf.fill(0)
    this.availableBuffers.push(buf)
  }

  applyCommands() {
    const commands = this.pendingCommands
    for (let i = 0; i < commands.length; i++) {
      this.handleCommand(commands[i])
    }
    commands.length = 0
  }

  handleCommand(cmd) {
    switch (cmd.type) {
      case 'ADD_MODULE': {
        const {
          moduleId,
          definitionId,
          params,
          state,
          inputPortIds,
          outputPortIds,
          inputPortTypes,
          paramDefaults,
          processFnStr,
        } = cmd

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
          sampleRate,
        )
        m.process = processFn
        this.modules.set(moduleId, m)
        this.rebuildEvaluationOrder()
        break
      }

      case 'REMOVE_MODULE': {
        this.modules.delete(cmd.moduleId)
        this.cables = this.cables.filter(
          (c) => c.from.moduleId !== cmd.moduleId && c.to.moduleId !== cmd.moduleId,
        )
        this.rebuildEvaluationOrder()
        break
      }

      case 'ADD_CABLE': {
        this.cables.push(cmd.cable)
        this.rebuildEvaluationOrder()
        break
      }

      case 'REMOVE_CABLE': {
        this.cables = this.cables.filter((c) => c.id !== cmd.cableId)
        this.feedbackBuffers.delete(cmd.cableId)
        this.rebuildEvaluationOrder()
        break
      }

      case 'SET_PARAM': {
        const m = this.modules.get(cmd.moduleId)
        if (m) {
          m.params[cmd.param] = cmd.value
          if (!m.smoothers[cmd.param]) {
            const initial = cmd.value ?? m.paramDefaults[cmd.param] ?? 0
            m.smoothers[cmd.param] = {
              smoothed: initial,
              coeff: m.smootherCoeff,
            }
            m.smoothedParams[cmd.param] = initial
          }
        }
        break
      }

      case 'SET_GATE': {
        const m = this.modules.get(cmd.moduleId)
        if (m) {
          const offset = Math.max(
            0,
            Math.min(
              BUFFER_SIZE - 1,
              Math.round((cmd.scheduledAt - currentTime) * sampleRate),
            ),
          )
          if (!m.state._gateEvents) m.state._gateEvents = []
          m.state._gateEvents.push({
            offset,
            value: cmd.value,
            portId: cmd.portId,
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
          m.state.xBuffer = new Float32Array(cmd.xBuffer)
          m.state.yBuffer = new Float32Array(cmd.yBuffer)
          m.state.writeIndexBuffer = new Int32Array(cmd.writeIndexBuffer)
          m.state.xyWriteIndex = 0
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

  rebuildTopologyCaches() {
    const incomingByModule = new Map()
    const outgoingByModule = new Map()

    for (const cable of this.cables) {
      let incomingPorts = incomingByModule.get(cable.to.moduleId)
      if (!incomingPorts) {
        incomingPorts = new Map()
        incomingByModule.set(cable.to.moduleId, incomingPorts)
      }

      let portCables = incomingPorts.get(cable.to.portId)
      if (!portCables) {
        portCables = []
        incomingPorts.set(cable.to.portId, portCables)
      }
      portCables.push(cable)

      let outgoing = outgoingByModule.get(cable.from.moduleId)
      if (!outgoing) {
        outgoing = []
        outgoingByModule.set(cable.from.moduleId, outgoing)
      }
      outgoing.push(cable)
    }

    this.incomingByModule = incomingByModule
    this.outgoingByModule = outgoingByModule
  }

  rebuildEvaluationOrder() {
    this.rebuildTopologyCaches()

    // Re-detect feedback cables from scratch on every topology change.
    // Preserve existing delay buffer data for cables that remain feedback edges.
    const prevFeedbackBuffers = this.feedbackBuffers
    this.feedbackBuffers = new Map()

    const visited = new Set()
    const order = []

    const visit = (id, stack) => {
      if (visited.has(id)) return
      if (stack.has(id)) return
      stack.add(id)

      const incomingPorts = this.incomingByModule.get(id)
      if (incomingPorts) {
        for (const cablesForPort of incomingPorts.values()) {
          for (const cable of cablesForPort) {
            const depId = cable.from.moduleId
            if (stack.has(depId)) {
              this.feedbackBuffers.set(
                cable.id,
                prevFeedbackBuffers.get(cable.id) ?? new Float32Array(BUFFER_SIZE),
              )
            } else {
              visit(depId, stack)
            }
          }
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

    this.tickBuffers.clear()
    this.acquiredBuffers.length = 0

    const getBuffer = (key) => {
      let buf = this.tickBuffers.get(key)
      if (!buf) {
        buf = this.acquireBuffer()
        this.acquiredBuffers.push(buf)
        this.tickBuffers.set(key, buf)
      }
      return buf
    }

    // run each module in topological order
    for (const moduleId of this.evaluationOrder) {
      const m = this.modules.get(moduleId)
      if (!m) continue

      const inputBuffers = m.inputBuffers
      const outputBuffers = m.outputBuffers
      const incomingPorts = this.incomingByModule.get(moduleId)

      // build inputs: gather connected cables, sum multiple connections
      for (const portId of m.inputPortIds) {
        const buf = this.acquireBuffer()
        this.acquiredBuffers.push(buf)

        const connected = incomingPorts?.get(portId)
        const isConnected = !!(connected && connected.length > 0)
        m.connectedInputs[portId] = isConnected
        if (isConnected) {
          for (const cable of connected) {
            const srcBuf = this.feedbackBuffers.has(cable.id)
              ? this.feedbackBuffers.get(cable.id)
              : this.tickBuffers.get(`${cable.from.moduleId}:${cable.from.portId}`)
            if (srcBuf) {
              for (let i = 0; i < BUFFER_SIZE; i++) buf[i] += srcBuf[i]
            }
          }
        } else {
          // defaults handled by modules themselves
          buf.fill(0)
        }

        inputBuffers[portId] = buf
      }

      // build outputs
      for (const portId of m.outputPortIds) {
        outputBuffers[portId] = getBuffer(`${moduleId}:${portId}`)
      }

      // run module DSP
      try {
        m.process(inputBuffers, outputBuffers, m.getSmoothedParams(), m.state, {
          sampleRate,
          bufferSize: BUFFER_SIZE,
        })
      } catch (e) {
        this.port.postMessage({ type: 'ERROR', message: String(e) })
      }

      // update feedback buffers for this module's outgoing feedback cables
      const outgoing = this.outgoingByModule.get(moduleId)
      if (outgoing) {
        for (const cable of outgoing) {
          const feedbackBuf = this.feedbackBuffers.get(cable.id)
          if (!feedbackBuf) continue
          const srcBuf = outputBuffers[cable.from.portId]
          if (srcBuf) feedbackBuf.set(srcBuf)
        }
      }
    }

    // write to web audio output
    for (const [, m] of this.modules) {
      if (m.definitionId !== 'output') continue

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

    // release all tick buffers back to pool
    for (const buf of this.acquiredBuffers) this.releaseBuffer(buf)

    // send throttled METER events
    this.meterFrameCounter++
    if (this.meterFrameCounter >= this.METER_INTERVAL) {
      this.meterFrameCounter = 0
      for (const [moduleId, m] of this.modules) {
        // output module peak levels
        if (m.definitionId === 'output') {
          const peakL = m.state.peakL ?? 0
          const peakR = m.state.peakR ?? 0
          this.port.postMessage({ type: 'METER', moduleId, portId: 'peakL', peak: peakL })
          this.port.postMessage({ type: 'METER', moduleId, portId: 'peakR', peak: peakR })
        }
        // generic per-module meters: any module can write _meters object to state
        if (m.state._meters) {
          for (const [portId, value] of Object.entries(m.state._meters)) {
            this.port.postMessage({ type: 'METER', moduleId, portId, peak: value })
          }
        }
      }
    }

    return true // keep processor alive
  }
}

registerProcessor('graph-processor', GraphProcessorNode)
