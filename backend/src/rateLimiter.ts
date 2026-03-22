export class RateLimiter {
  private intervalMs: number;
  private lastTick = 0;

  constructor(requestsPerSecond: number) {
    this.intervalMs = 1000 / requestsPerSecond;
  }

  async wait(): Promise<void> {
    const elapsed = Date.now() - this.lastTick;
    if (elapsed < this.intervalMs) {
      await new Promise(r => setTimeout(r, this.intervalMs - elapsed));
    }
    this.lastTick = Date.now();
  }
}
