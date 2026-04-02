export interface CableEndpoints {
  x1: number; y1: number
  x2: number; y2: number
}

export function cablePath(endpoints: CableEndpoints, tautness: number): string {
  const { x1, y1, x2, y2 } = endpoints
  const dy = Math.abs(y2 - y1)
  const slack = (1 - tautness) * Math.max(40, dy * 0.5)

  // control points droop downward proportional to slack
  const cx1 = x1
  const cy1 = y1 + slack
  const cx2 = x2
  const cy2 = y2 + slack

  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`
}
