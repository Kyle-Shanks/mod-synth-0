import { useMemo, useEffect } from 'react'
import { useStore } from '../../store'
import { getModule } from '../registry'
import { Knob } from '../../components/Knob'
import { CanvasZone } from '../../components/CanvasZone'
import type { CanvasData } from '../../components/CanvasZone'
import { drawScopeTrace, drawGrid } from '../../components/canvasPrimitives'
import { GRID_UNIT } from '../../theme/tokens'

interface ScopePanelProps {
  moduleId: string
}

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

export function ScopePanel({ moduleId }: ScopePanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined
  const engineRevision = useStore((s) => s.engineRevision)
  const setScopeBuffers = useStore((s) => s.setScopeBuffers)

  const scopeBuffers = useMemo(() => {
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
  }, [])

  useEffect(() => {
    if (!scopeBuffers) return
    setScopeBuffers(
      moduleId,
      scopeBuffers.scopeBuffer.buffer as SharedArrayBuffer,
      scopeBuffers.writeIndexBuffer.buffer as SharedArrayBuffer,
    )
  }, [moduleId, scopeBuffers, engineRevision, setScopeBuffers])

  if (!mod || !def) return null

  const widthPx = def.width * GRID_UNIT
  const heightPx = def.height * GRID_UNIT

  return (
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
  )
}
