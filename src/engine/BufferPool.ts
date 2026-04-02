export class BufferPool {
  private readonly pool: Float32Array[]
  private readonly available: Float32Array[]

  constructor(poolSize: number, bufferSize: number) {
    this.pool = Array.from({ length: poolSize }, () => new Float32Array(bufferSize))
    this.available = [...this.pool]
  }

  acquire(): Float32Array {
    const buf = this.available.pop()
    if (!buf) throw new Error('BufferPool exhausted — increase pool size')
    return buf
  }

  release(buf: Float32Array): void {
    buf.fill(0)   // zero before returning — prevents signal bleed
    this.available.push(buf)
  }

  get totalSize(): number { return this.pool.length }
  get availableSize(): number { return this.available.length }
}
