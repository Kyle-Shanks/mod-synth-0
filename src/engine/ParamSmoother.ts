export class ParamSmoother {
  private smoothed: number
  private readonly coeff: number

  // smoothingTimeMs: time to reach ~63% of target (default 10ms)
  constructor(initialValue: number, sampleRate: number, smoothingTimeMs = 10) {
    this.smoothed = initialValue
    // one-pole lowpass coefficient
    this.coeff = 1 - Math.exp(-2 * Math.PI * (1000 / smoothingTimeMs) / sampleRate)
  }

  // call once per buffer tick, returns current smoothed value
  tick(target: number): number {
    this.smoothed += (target - this.smoothed) * this.coeff
    return this.smoothed
  }

  // force-set without smoothing (e.g. on module init)
  set(value: number): void {
    this.smoothed = value
  }

  get current(): number { return this.smoothed }
}
