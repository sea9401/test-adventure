type CacheEntry = {
  expiresAt: number;
  value: Promise<unknown>;
};

export class ShortTtlCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly ttlMs: number) {}

  get<T>(key: string, loader: () => Promise<T>, now = Date.now()): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && now < cached.expiresAt) {
      return cached.value as Promise<T>;
    }

    const value = loader();
    const entry: CacheEntry = {
      expiresAt: now + this.ttlMs,
      value,
    };
    this.entries.set(key, entry);
    void value.catch(() => {
      if (this.entries.get(key) === entry) {
        this.entries.delete(key);
      }
    });
    return value;
  }

  invalidate(key: string) {
    this.entries.delete(key);
  }
}
