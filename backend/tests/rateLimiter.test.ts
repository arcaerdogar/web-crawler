import { RateLimiter } from '../src/rateLimiter.js';

describe('RateLimiter', () => {
  it('first call returns immediately', async () => {
    const limiter = new RateLimiter(10);
    const start = Date.now();
    await limiter.wait();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('enforces minimum interval between calls', async () => {
    const rps = 5;
    const limiter = new RateLimiter(rps);
    const expectedInterval = 1000 / rps;

    await limiter.wait();
    const start = Date.now();
    await limiter.wait();
    expect(Date.now() - start).toBeGreaterThanOrEqual(expectedInterval - 20);
  });

  it('does not delay if enough time has passed', async () => {
    const limiter = new RateLimiter(10);
    await limiter.wait();

    await new Promise(r => setTimeout(r, 200));

    const start = Date.now();
    await limiter.wait();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('handles rate of 1 request per second', async () => {
    const limiter = new RateLimiter(1);

    await limiter.wait();
    const start = Date.now();
    await limiter.wait();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(elapsed).toBeLessThan(1200);
  });

  it('handles high rate (20 rps) with short interval', async () => {
    const limiter = new RateLimiter(20);

    await limiter.wait();
    const start = Date.now();
    await limiter.wait();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(30);
    expect(elapsed).toBeLessThan(150);
  });

  it('serializes concurrent wait() so global cap holds (e.g. parallel workers)', async () => {
    const rps = 10;
    const limiter = new RateLimiter(rps);
    const gap = 1000 / rps;

    const start = Date.now();
    await Promise.all([limiter.wait(), limiter.wait(), limiter.wait()]);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(2 * gap - 30);
    expect(elapsed).toBeLessThan(2 * gap + 150);
  });
});
