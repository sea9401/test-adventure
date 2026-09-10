import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateMarketplacePrices, readMarketplacePrices } from "./marketplacePriceCache";

const prices = { iron_ore: { n: 2, avg: 100, min: 90, max: 110 } };

beforeEach(() => {
  vi.useFakeTimers();
  invalidateMarketplacePrices();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("marketplace price cache", () => {
  it("merges concurrent reads and reuses prices only before the 30 second boundary", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, prices }));
    vi.stubGlobal("fetch", fetcher);
    expect(await Promise.all([readMarketplacePrices(), readMarketplacePrices()])).toEqual([prices, prices]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(await readMarketplacePrices()).toEqual(prices);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await readMarketplacePrices();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([503, 200])("does not cache unsuccessful payloads (%s)", async (status) => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: false }, { status }))
      .mockResolvedValueOnce(Response.json({ ok: true, prices }));
    vi.stubGlobal("fetch", fetcher);
    await expect(readMarketplacePrices()).rejects.toThrow();
    expect(await readMarketplacePrices()).toEqual(prices);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("invalidates a completed read and prevents an older pending read from replacing fresh prices", async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: true, prices }))
      .mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }))
      .mockResolvedValueOnce(Response.json({ ok: true, prices: {} }));
    vi.stubGlobal("fetch", fetcher);
    await readMarketplacePrices();
    invalidateMarketplacePrices();
    const oldRead = readMarketplacePrices();
    invalidateMarketplacePrices();
    expect(await readMarketplacePrices()).toEqual({});
    resolve(Response.json({ ok: true, prices }));
    await oldRead;
    expect(await readMarketplacePrices()).toEqual({});
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
