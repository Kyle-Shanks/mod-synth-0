type RafListener = (timestamp: number) => void

class RafScheduler {
  private listeners = new Map<number, RafListener>()
  private nextId = 1
  private frameId: number | null = null

  private tick = (timestamp: number) => {
    for (const listener of this.listeners.values()) {
      listener(timestamp)
    }
    this.frameId =
      this.listeners.size > 0 ? requestAnimationFrame(this.tick) : null
  }

  subscribe(listener: RafListener): () => void {
    const id = this.nextId++
    this.listeners.set(id, listener)
    if (this.frameId === null) {
      this.frameId = requestAnimationFrame(this.tick)
    }

    return () => {
      this.listeners.delete(id)
      if (this.listeners.size === 0 && this.frameId !== null) {
        cancelAnimationFrame(this.frameId)
        this.frameId = null
      }
    }
  }
}

export const rafScheduler = new RafScheduler()
