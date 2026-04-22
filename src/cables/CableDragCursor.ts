type DragCursor = { x: number; y: number }

type Listener = () => void

class CableDragCursor {
  private cursor: DragCursor = { x: 0, y: 0 }
  private listeners = new Set<Listener>()

  get(): DragCursor {
    return this.cursor
  }

  set(x: number, y: number): void {
    this.cursor = { x, y }
    for (const listener of this.listeners) listener()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export const cableDragCursor = new CableDragCursor()
