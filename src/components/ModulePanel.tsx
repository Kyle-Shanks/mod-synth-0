import { useRef, useCallback, useEffect, useMemo } from 'react'
import { useStore } from '../store'
import { getModule } from '../modules/registry'
import { Port } from './Port'
import { Knob } from './Knob'
import { Fader } from './Fader'
import { ListSelector } from './ListSelector'
import { PushButton } from './PushButton'
import { ClockIndicator } from './ClockIndicator'
import { SequencerIndicator } from './SequencerIndicator'
import { GainMeter } from './GainMeter'
import { TunerDisplay } from './TunerDisplay'
import { CanvasZone } from './CanvasZone'
import type { CanvasData } from './CanvasZone'
import { drawScopeTrace, drawGrid, drawXYTrace } from './canvasPrimitives'
import { portPositionCache } from '../cables/PortPositionCache'
import { GRID_UNIT } from '../theme/tokens'

interface ModulePanelProps {
  moduleId: string
}

// scope rendering function — defined outside component to avoid re-creation
function renderScope(ctx: CanvasRenderingContext2D, data: CanvasData) {
  const { width, height, theme, scopeBuffer, writeIndexBuffer, moduleParams } =
    data

  drawGrid(ctx, theme.shades.shade2, width, height, 0.2)

  if (scopeBuffer && writeIndexBuffer) {
    const writeIndex = Atomics.load(writeIndexBuffer, 0)
    drawScopeTrace(
      ctx,
      scopeBuffer,
      writeIndex,
      theme.accents.accent1,
      width,
      height,
      1.5,
      moduleParams.timeScale ?? 1,
    )
  }
}

function renderXY(ctx: CanvasRenderingContext2D, data: CanvasData) {
  const { width, height, theme, xBuffer, yBuffer, writeIndexBuffer, moduleParams } = data
  ctx.fillStyle = theme.shades.shade0
  ctx.fillRect(0, 0, width, height)

  if (!xBuffer || !yBuffer || !writeIndexBuffer) return

  const scale = moduleParams.scale ?? 1
  const persist = moduleParams.persist ?? 0.3
  const wIdx = Atomics.load(writeIndexBuffer, 0)
  drawXYTrace(ctx, xBuffer, yBuffer, wIdx, scale, persist, theme.shades.shade0, theme.accents.accent1, width, height)
}

export function ModulePanel({ moduleId }: ModulePanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const engineRevision = useStore((s) => s.engineRevision)
  const setModulePosition = useStore((s) => s.setModulePosition)
  const setScopeBuffers = useStore((s) => s.setScopeBuffers)
  const setTunerBuffer = useStore((s) => s.setTunerBuffer)
  const setXYScopeBuffers = useStore((s) => s.setXYScopeBuffers)
  const setSelectedModule = useStore((s) => s.setSelectedModule)
  const selectedModuleId = useStore((s) => s.selectedModuleId)
  const cables = useStore((s) => s.cables)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  const def = mod ? getModule(mod.definitionId) : undefined

  // scope SharedArrayBuffer setup (only for scope modules)
  const scopeBuffers = useMemo(() => {
    if (!def || def.id !== 'scope') return null
    try {
      const sab = new SharedArrayBuffer(2048 * Float32Array.BYTES_PER_ELEMENT)
      const idxSab = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
      return {
        scopeBuffer: new Float32Array(sab),
        writeIndexBuffer: new Int32Array(idxSab),
      }
    } catch {
      return null
    }
  }, [def])

  // inject scope buffers into engine module state
  useEffect(() => {
    if (!scopeBuffers || !def || def.id !== 'scope') return
    setScopeBuffers(
      moduleId,
      scopeBuffers.scopeBuffer.buffer as SharedArrayBuffer,
      scopeBuffers.writeIndexBuffer.buffer as SharedArrayBuffer,
    )
  }, [moduleId, scopeBuffers, def, engineRevision, setScopeBuffers])

  // tuner SharedArrayBuffer setup (only for tuner modules)
  const tunerBuffer = useMemo(() => {
    if (!def || def.id !== 'tuner') return null
    try {
      const sab = new SharedArrayBuffer(2 * Float32Array.BYTES_PER_ELEMENT)
      return new Float32Array(sab)
    } catch {
      return null
    }
  }, [def])

  useEffect(() => {
    if (!tunerBuffer || !def || def.id !== 'tuner') return
    setTunerBuffer(moduleId, tunerBuffer.buffer as SharedArrayBuffer)
  }, [moduleId, tunerBuffer, def, engineRevision, setTunerBuffer])

  // XY scope SharedArrayBuffer setup (only for xyscope modules)
  const xyScopeBuffers = useMemo(() => {
    if (!def || def.id !== 'xyscope') return null
    try {
      const xSab = new SharedArrayBuffer(2048 * Float32Array.BYTES_PER_ELEMENT)
      const ySab = new SharedArrayBuffer(2048 * Float32Array.BYTES_PER_ELEMENT)
      const idxSab = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
      return {
        xBuffer: new Float32Array(xSab),
        yBuffer: new Float32Array(ySab),
        writeIndexBuffer: new Int32Array(idxSab),
      }
    } catch {
      return null
    }
  }, [def])

  useEffect(() => {
    if (!xyScopeBuffers || !def || def.id !== 'xyscope') return
    setXYScopeBuffers(
      moduleId,
      xyScopeBuffers.xBuffer.buffer as SharedArrayBuffer,
      xyScopeBuffers.yBuffer.buffer as SharedArrayBuffer,
      xyScopeBuffers.writeIndexBuffer.buffer as SharedArrayBuffer,
    )
  }, [moduleId, xyScopeBuffers, def, engineRevision, setXYScopeBuffers])

  // update all port positions after render / position change
  const updatePortPositions = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return
    panel.querySelectorAll<HTMLDivElement>('[data-port-id]').forEach((el) => {
      const fn = (el as HTMLDivElement & { _updatePortPosition?: () => void })
        ._updatePortPosition
      fn?.()
    })
  }, [])

  useEffect(() => {
    updatePortPositions()
  }, [mod?.position, updatePortPositions])

  // --- drag handling ---
  const handleHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!mod) return
      e.preventDefault()
      setSelectedModule(moduleId)
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: mod.position.x,
        origY: mod.position.y,
      }

      useStore.getState().stageHistory()

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        const dx = ev.clientX - dragRef.current.startX
        const dy = ev.clientY - dragRef.current.startY
        // mouse deltas are in viewport (scaled) pixels; divide by zoom to get logical pixels,
        // then divide by GRID_UNIT to convert to grid units
        const z = useStore.getState().zoom
        const newX = dragRef.current.origX + Math.round(dx / z / GRID_UNIT)
        const newY = dragRef.current.origY + Math.round(dy / z / GRID_UNIT)
        setModulePosition(moduleId, { x: newX, y: newY })
        // update port positions on next frame for cable redraw
        requestAnimationFrame(updatePortPositions)
      }

      const handleMouseUp = () => {
        dragRef.current = null
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        useStore.getState().commitHistory()
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [mod, setSelectedModule, moduleId, setModulePosition, updatePortPositions],
  )

  // clean up port cache on unmount
  useEffect(() => {
    return () => {
      portPositionCache.deleteModule(moduleId)
    }
  }, [moduleId])

  if (!mod) return null

  // missing module — definition not in registry, show placeholder
  if (!def) {
    const placeholderW = 3 * GRID_UNIT
    const placeholderH = 4 * GRID_UNIT
    return (
      <div
        ref={panelRef}
        style={{
          position: 'absolute',
          left: mod.position.x * GRID_UNIT,
          top: mod.position.y * GRID_UNIT,
          width: placeholderW,
          height: placeholderH,
          background: 'var(--shade1)',
          border: `1px dashed var(--shade2)`,
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          opacity: 0.6,
        }}
        onMouseDown={() => setSelectedModule(moduleId)}
      >
        <div
          onMouseDown={handleHeaderMouseDown}
          style={{
            padding: '4px 6px',
            fontSize: 'var(--text-sm)',
            color: 'var(--shade2)',
            cursor: 'grab',
            borderBottom: '1px dashed var(--shade2)',
            flexShrink: 0,
          }}
        >
          missing
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 8,
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--shade2)' }}>
            {mod.definitionId}
          </span>
        </div>
      </div>
    )
  }

  const isSelected = selectedModuleId === moduleId
  const widthPx = def.width * GRID_UNIT
  const heightPx = def.height * GRID_UNIT

  const inputPorts = Object.entries(def.inputs)
  const outputPorts = Object.entries(def.outputs)
  const paramEntries = Object.entries(def.params)

  // check which ports are connected
  const connectedPorts = new Set<string>()
  for (const cable of Object.values(cables)) {
    if (cable.from.moduleId === moduleId) connectedPorts.add(cable.from.portId)
    if (cable.to.moduleId === moduleId) connectedPorts.add(cable.to.portId)
  }

  // determine if this is a special module
  const isPushButton = def.id === 'pushbutton'
  const isScope = def.id === 'scope'
  const isTuner = def.id === 'tuner'
  const isXYScope = def.id === 'xyscope'
  const isMixer = def.id === 'mixer'
  const isSequencer = def.id === 'sequencer'
  const isClock = def.id === 'clock'
  const isOutput = def.id === 'output'

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        left: mod.position.x * GRID_UNIT,
        top: mod.position.y * GRID_UNIT,
        width: widthPx,
        height: heightPx,
        background: 'var(--shade1)',
        border: `1px solid ${isSelected ? 'var(--accent0)' : 'var(--shade2)'}`,
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onMouseDown={() => setSelectedModule(moduleId)}
    >
      {/* header */}
      <div
        onMouseDown={handleHeaderMouseDown}
        style={{
          padding: '4px 6px',
          fontSize: 'var(--text-sm)',
          color: 'var(--shade3)',
          cursor: 'grab',
          borderBottom: '1px solid var(--shade2)',
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{def.name}</span>
        {/* <span style={{ fontSize: 'var(--text-xs)', color: 'var(--shade2)' }}>
          {def.category}
        </span> */}
      </div>

      {/* body — special rendering per module type */}
      {isPushButton ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <PushButton moduleId={moduleId} />
        </div>
      ) : isScope ? (
        // scope body: canvas + timeScale knob below it
        // body available = heightPx - header(29) - portSection(44) - padding(8) = heightPx - 81
        // knob area: 32px svg + 2px gap + 11px label = 45px, plus 4px gap from canvas = 49px
        // canvas height = heightPx - 81 - 49 = heightPx - 130
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: 4,
            gap: 4,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <CanvasZone
            width={widthPx - 10}
            height={heightPx - 130}
            render={renderScope}
            moduleParams={mod.params}
            scopeBuffer={scopeBuffers?.scopeBuffer ?? null}
            writeIndexBuffer={scopeBuffers?.writeIndexBuffer ?? null}
          />
          {Object.entries(def.params).map(([paramId, paramDef]) => (
            <Knob
              key={paramId}
              moduleId={moduleId}
              paramId={paramId}
              definition={paramDef}
              value={mod.params[paramId] ?? paramDef.default}
            />
          ))}
        </div>
      ) : isTuner ? (
        <TunerDisplay moduleId={moduleId} tunerBuffer={tunerBuffer} />
      ) : isXYScope ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: 4,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <CanvasZone
            width={widthPx - 10}
            height={heightPx - 130}
            render={renderXY}
            moduleParams={mod.params}
            xBuffer={xyScopeBuffers?.xBuffer ?? null}
            yBuffer={xyScopeBuffers?.yBuffer ?? null}
            writeIndexBuffer={xyScopeBuffers?.writeIndexBuffer ?? null}
          />
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '6px 4px',
              overflow: 'hidden',
            }}
          >
            {Object.entries(def.params).map(([paramId, paramDef]) => (
              <Knob
                key={paramId}
                moduleId={moduleId}
                paramId={paramId}
                definition={paramDef}
                value={mod.params[paramId] ?? paramDef.default}
              />
            ))}
          </div>
        </div>
      ) : isOutput ? (
        // output module body: gain meter + volume knob
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '6px 4px',
          }}
        >
          <GainMeter moduleId={moduleId} />
          {paramEntries.map(([paramId, paramDef]) => (
            <Knob
              key={paramId}
              moduleId={moduleId}
              paramId={paramId}
              definition={paramDef}
              value={mod.params[paramId] ?? paramDef.default}
            />
          ))}
        </div>
      ) : (
        <>
          {/* indicator lights for clock / sequencer */}
          {isClock && <ClockIndicator moduleId={moduleId} />}
          {isSequencer && (
            <SequencerIndicator
              moduleId={moduleId}
              stepCount={Math.round(mod.params.steps ?? 8)}
            />
          )}

          {/* params body */}
          {paramEntries.length > 0 && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: isMixer ? 'flex-end' : 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '6px 4px',
                overflow: 'hidden',
              }}
            >
              {paramEntries.map(([paramId, paramDef]) => {
                if (paramDef.type === 'select') {
                  return (
                    <ListSelector
                      key={paramId}
                      moduleId={moduleId}
                      paramId={paramId}
                      definition={paramDef}
                      value={mod.params[paramId] ?? paramDef.default}
                    />
                  )
                }

                // use faders for mixer levels
                if (isMixer && paramId !== 'master') {
                  return (
                    <Fader
                      key={paramId}
                      moduleId={moduleId}
                      paramId={paramId}
                      definition={paramDef}
                      value={mod.params[paramId] ?? paramDef.default}
                      orientation='vertical'
                      length={56}
                    />
                  )
                }

                // use short faders for sequencer step values
                if (isSequencer && paramId.startsWith('step')) {
                  return (
                    <Fader
                      key={paramId}
                      moduleId={moduleId}
                      paramId={paramId}
                      definition={paramDef}
                      value={mod.params[paramId] ?? paramDef.default}
                      orientation='vertical'
                      length={48}
                    />
                  )
                }

                return (
                  <Knob
                    key={paramId}
                    moduleId={moduleId}
                    paramId={paramId}
                    definition={paramDef}
                    value={mod.params[paramId] ?? paramDef.default}
                  />
                )
              })}
            </div>
          )}

          {/* spacer if no params */}
          {paramEntries.length === 0 && <div style={{ flex: 1 }} />}
        </>
      )}

      {/* ports section */}
      {(inputPorts.length > 0 || outputPorts.length > 0) && (
        <div
          style={{
            borderTop: '1px solid var(--shade2)',
            display: 'flex',
            flexShrink: 0,
          }}
        >
          {/* inputs */}
          {inputPorts.length > 0 && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                padding: '6px 4px',
                justifyContent: 'center',
              }}
            >
              {inputPorts.map(([id, portDef]) => (
                <div key={id}>
                  <Port
                    moduleId={moduleId}
                    portId={id}
                    direction='input'
                    type={portDef.type}
                    label={portDef.label}
                    connected={connectedPorts.has(id)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* output inset */}
          {outputPorts.length > 0 && (
            <div
              style={{
                background: 'var(--shade3)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                padding: '6px 4px',
                justifyContent: 'center',
                borderLeft:
                  inputPorts.length > 0 ? '1px solid var(--shade2)' : undefined,
              }}
            >
              {outputPorts.map(([id, portDef]) => (
                <div key={id}>
                  <Port
                    moduleId={moduleId}
                    portId={id}
                    direction='output'
                    type={portDef.type}
                    label={portDef.label}
                    connected={connectedPorts.has(id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
