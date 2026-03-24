/**
 * Global request pacing: at most `requestsPerSecond` acquisitions per second
 * across all concurrent callers (serialized via an internal promise chain).
 */
export class RateLimiter {
  private intervalMs: number;
  private lastTick = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(requestsPerSecond: number) {
    this.intervalMs = 1000 / requestsPerSecond;
  }

  async wait(): Promise<void> {
    const run = async (): Promise<void> => {
      const elapsed = Date.now() - this.lastTick;
      if (elapsed < this.intervalMs) {
        await new Promise<void>((r) => setTimeout(r, this.intervalMs - elapsed));
      }
      this.lastTick = Date.now();
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => {});
    await next;
  }
}
