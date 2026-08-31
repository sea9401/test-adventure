import { describe, expect, it, vi } from "vitest";
import { createInFlightResponseFetcher } from "./fetchGameState";

describe("createInFlightResponseFetcher", () => {
  it("coalesces concurrent GETs while returning independently readable responses", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetcher = vi.fn(async () => {
      await gate;
      return Response.json({ ok: true });
    });
    const request = createInFlightResponseFetcher(fetcher);

    const first = request("/api/v2/me/state");
    const second = request("/api/v2/me/state");
    release();

    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(firstResponse.json()).resolves.toEqual({ ok: true });
    await expect(secondResponse.json()).resolves.toEqual({ ok: true });
  });

  it("starts a fresh request after the previous one settles", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    const request = createInFlightResponseFetcher(fetcher);

    await request("/api/v2/me/state");
    await request("/api/v2/me/state");

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
