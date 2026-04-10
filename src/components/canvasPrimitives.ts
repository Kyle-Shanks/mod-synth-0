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

export function drawTunerCents(
  ctx: CanvasRenderingContext2D,
  cents: number,
  clarity: number,
  width: number,
  height: number,
  color: string,
): void {
  if (clarity <= 0) return
  const absCents = Math.abs(cents)
  const fraction = Math.min(1, absCents / 50)
  const halfWidth = width / 2
  const barLen = fraction * halfWidth
  const barHeight = 3
  const barY = height / 2 - barHeight / 2
  const barX = cents >= 0 ? halfWidth : halfWidth - barLen

  ctx.globalAlpha = Math.max(0, Math.min(1, clarity))
  ctx.fillStyle = color
  ctx.fillRect(barX, barY, barLen, barHeight)
  ctx.globalAlpha = 1
}

export function drawXYTrace(
  ctx: CanvasRenderingContext2D,
  xBuffer: Float32Array,
  yBuffer: Float32Array,
  writeIndex: number,
  scale: number,
  persist: number,
  trailColor: string,
  lineColor: string,
  width: number,
  height: number,
): void {
  const clampedPersist = Math.max(0, Math.min(1, persist))
  // persist=0 fully clears each frame, persist=1 keeps a longer trail
  const clearAlpha = 1 - clampedPersist * 0.95
  const alpha = Math.round(clearAlpha * 255)
    .toString(16)
    .padStart(2, '0')
  ctx.fillStyle = trailColor + alpha
  ctx.fillRect(0, 0, width, height)

  const nSamples = 512
  const bufLen = xBuffer.length
  const cx = width / 2
  const cy = height / 2
  const r = Math.min(width, height) * 0.43

  ctx.strokeStyle = lineColor
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 0; i < nSamples; i++) {
    const idx = (writeIndex - nSamples + i + bufLen) % bufLen
    const px = cx + (xBuffer[idx] ?? 0) * scale * r
    const py = cy - (yBuffer[idx] ?? 0) * scale * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
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
