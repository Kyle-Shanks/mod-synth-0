import { useMemo, useEffect } from 'react'
import { useStore } from '../../store'
import { getModule } from '../registry'
import { Knob } from '../../components/Knob'
import { CanvasZone } from '../../components/CanvasZone'
import type { CanvasData } from '../../components/CanvasZone'
import { drawXYTrace } from '../../components/canvasPrimitives'
import { GRID_UNIT } from '../../theme/tokens'

interface XYScopePanelProps {
  moduleId: string
}

function renderXY(ctx: CanvasRenderingContext2D, data: CanvasData) {
  const { width, height, theme, xBuffer, yBuffer, writeIndexBuffer, moduleParams } = data
  ctx.fillStyle = theme.shades.shade0
  ctx.fillRect(0, 0, width, height)

  if (!xBuffer || !yBuffer || !writeIndexBuffer) return

  const scale = moduleParams.scale ?? 1
  const persist = moduleParams.persist ?? 0.3
  const wIdx = Atomics.load(writeIndexBuffer, 0)
  drawXYTrace(
    ctx,
    xBuffer,
    yBuffer,
    wIdx,
    scale,
    persist,
    theme.shades.shade0,
    theme.accents.accent1,
    width,
    height,
  )
}

export function XYScopePanel({ moduleId }: XYScopePanelProps) {
  const mod = useStore((s) => s.modules[moduleId])
  const def = mod ? getModule(mod.definitionId) : undefined
  const engineRevision = useStore((s) => s.engineRevision)
  const setXYScopeBuffers = useStore((s) => s.setXYScopeBuffers)

  const xyScopeBuffers = useMemo(() => {
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
  }, [])

  useEffect(() => {
    if (!xyScopeBuffers) return
    setXYScopeBuffers(
      moduleId,
      xyScopeBuffers.xBuffer.buffer as SharedArrayBuffer,
      xyScopeBuffers.yBuffer.buffer as SharedArrayBuffer,
      xyScopeBuffers.writeIndexBuffer.buffer as SharedArrayBuffer,
    )
  }, [moduleId, xyScopeBuffers, engineRevision, setXYScopeBuffers])

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
  )
}
