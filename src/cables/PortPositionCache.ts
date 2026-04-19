type Position = { x: number; y: number }

type Listener = () => void

class PortPositionCacheImpl {
  private positions = new Map<string, Position>()
  private listeners = new Set<Listener>()
  private batchDepth = 0
  private hasPendingNotify = false

  set(moduleId: string, portId: string, position: Position): void {
    this.positions.set(`${moduleId}:${portId}`, position)
    this.queueNotify()
  }

  get(moduleId: string, portId: string): Position | undefined {
    return this.positions.get(`${moduleId}:${portId}`)
  }

  deleteModule(moduleId: string): void {
    for (const key of [...this.positions.keys()]) {
      if (key.startsWith(`${moduleId}:`)) this.positions.delete(key)
    }
    this.queueNotify()
  }

  batch(run: () => void): void {
    this.batchDepth += 1
    try {
      run()
    } finally {
      this.batchDepth -= 1
      if (this.batchDepth === 0 && this.hasPendingNotify) {
        this.hasPendingNotify = false
        this.notify()
      }
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  private queueNotify(): void {
    if (this.batchDepth > 0) {
      this.hasPendingNotify = true
      return
    }
    this.notify()
  }
}

export const portPositionCache = new PortPositionCacheImpl()
