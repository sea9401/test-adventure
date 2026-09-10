import { describe, expect, it, vi } from "vitest";
import {
  createGameStateFetchCoordinator,
  createInFlightResponseFetcher,
} from "./fetchGameState";

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

describe("createGameStateFetchCoordinator", () => {
  it("동시에 시작한 core가 진행 중 full 응답에 합류한다", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetcher = vi.fn(async () => {
      await gate;
      return Response.json({ ok: true, gold: 123 });
    });
    const coordinator = createGameStateFetchCoordinator(fetcher);

    const core = coordinator.fetchCore();
    const full = coordinator.fetchFull();
    release();

    const [coreResponse, fullResponse] = await Promise.all([core, full]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/api/v2/me/state", undefined);
    await expect(coreResponse.json()).resolves.toMatchObject({ gold: 123 });
    await expect(fullResponse.json()).resolves.toMatchObject({ gold: 123 });
  });

  it("full이 없으면 core 전용 view를 조회하고 동일 core GET은 병합한다", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    const coordinator = createGameStateFetchCoordinator(fetcher);

    await Promise.all([coordinator.fetchCore(), coordinator.fetchCore()]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v2/me/state?view=core",
      undefined,
    );
  });

  it("settled 응답은 캐시하지 않아 다음 core 요청을 새로 시작한다", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    const coordinator = createGameStateFetchCoordinator(fetcher);

    await coordinator.fetchCore();
    await coordinator.fetchCore();

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("재화 변경 후 core 조회는 변경 전 full 요청에 합류하지 않는다", async () => {
    let release!: (response: Response) => void;
    const oldFull = new Promise<Response>((resolve) => { release = resolve; });
    const fetcher = vi.fn()
      .mockReturnValueOnce(oldFull)
      .mockResolvedValueOnce(Response.json({ gold: 200 }));
    const coordinator = createGameStateFetchCoordinator(fetcher);
    const full = coordinator.fetchFull();

    coordinator.invalidate();
    const core = await coordinator.fetchCore();
    release(Response.json({ gold: 100 }));

    await expect(core.json()).resolves.toEqual({ gold: 200 });
    await expect((await full).json()).resolves.toEqual({ gold: 100 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenLastCalledWith("/api/v2/me/state?view=core", undefined);
  });

  it("abort signal이 있는 요청은 병합하지 않는다", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    const coordinator = createGameStateFetchCoordinator(fetcher);
    const controller = new AbortController();

    await Promise.all([
      coordinator.fetchCore({ signal: controller.signal }),
      coordinator.fetchCore({ signal: controller.signal }),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
