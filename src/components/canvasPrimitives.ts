// pre-built canvas drawing primitives for display modules

export function drawScopeTrace(
  ctx: CanvasRenderingContext2D,
  buffer: Float32Array,
  writeIndex: number,
  color: string,
  width: number,
  height: number,
  lineWidth = 1.5,
  timeScale = 1,
): void {
  const len = buffer.length
  if (len === 0) return

  // higher timeScale = zoom in (fewer samples shown, more detail)
  // timeScale 1 = full view (~960 samples), timeScale 10 = zoomed in (~96 samples)
  const maxSamples = Math.floor(len / 2) - 64
  const samplesToShow = Math.max(64, Math.floor(maxSamples / timeScale))

  // anchor display to the most recent positive-slope zero crossing
  // search backward from the nominal window start so the waveform stays locked
  const nominalStart = (writeIndex - samplesToShow + len) % len
  let triggerIdx = nominalStart
  const searchLen = Math.min(512, Math.floor(len / 4))
  for (let i = 0; i < searchLen; i++) {
    const idx = (nominalStart - i + len) % len
    const prev = (idx - 1 + len) % len
    if ((buffer[prev] ?? 0) < 0 && (buffer[idx] ?? 0) >= 0) {
      triggerIdx = idx
      break
    }
  }

  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.beginPath()

  const midY = height / 2
  for (let i = 0; i < samplesToShow; i++) {
    const idx = (triggerIdx + i) % len
    const sample = buffer[idx] ?? 0
    const x = (i / samplesToShow) * width
    const y = midY - sample * midY * 0.9 // ±1 maps to 90% of half-height

    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }

  ctx.stroke()
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number,
  height: number,
  opacity = 0.15,
): void {
  ctx.strokeStyle = color
  ctx.globalAlpha = opacity
  ctx.lineWidth = 0.5

  // horizontal center line
  ctx.beginPath()
  ctx.moveTo(0, height / 2)
  ctx.lineTo(width, height / 2)
  ctx.stroke()

  // vertical center line
  ctx.beginPath()
  ctx.moveTo(width / 2, 0)
  ctx.lineTo(width / 2, height)
  ctx.stroke()

  ctx.globalAlpha = 1
}
