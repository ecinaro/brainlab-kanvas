/** Kayan pencere hız sınırlayıcı. Kie: 10 saniyede en fazla 20 yeni üretim isteği. */
export class RateLimiter {
  private stamps: number[] = [];
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private limit = 20,
    private windowMs = 10_000,
    private now: () => number = Date.now,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Sırayla kuyruğa girer; pencerede yer açılınca çözülür. */
  acquire(): Promise<void> {
    const next = this.chain.then(async () => {
      for (;;) {
        const t = this.now();
        this.stamps = this.stamps.filter((s) => t - s < this.windowMs);
        if (this.stamps.length < this.limit) {
          this.stamps.push(t);
          return;
        }
        await this.sleep(this.windowMs - (t - this.stamps[0]) + 5);
      }
    });
    this.chain = next.catch(() => {});
    return next;
  }
}
