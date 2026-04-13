export const RACK_COLS = 64
export const RACK_ROWS = 32

export interface RackPosition {
  x: number
  y: number
}

export function clampPositionToRack(
  position: RackPosition,
  width: number,
  height: number,
): RackPosition {
  const maxX = Math.max(0, RACK_COLS - width)
  const maxY = Math.max(0, RACK_ROWS - height)
  return {
    x: Math.max(0, Math.min(maxX, position.x)),
    y: Math.max(0, Math.min(maxY, position.y)),
  }
}

export function isPositionWithinRack(
  position: RackPosition,
  width: number,
  height: number,
): boolean {
  const clamped = clampPositionToRack(position, width, height)
  return clamped.x === position.x && clamped.y === position.y
}
