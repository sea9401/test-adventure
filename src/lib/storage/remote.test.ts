import { describe, it, expect, vi } from "vitest";
import { createRemoteSave } from "./remote";

type Recorded = {
  url: string;
  method: string;
  body: unknown;
};

function makeFakeFetch(opts: {
  patchStatuses?: number[];
  loadResponse?: unknown;
  /** 409 응답에 함께 보낼 currentVersion 값 (없으면 omit). */
  conflictCurrentVersions?: (number | null)[];
}) {
  const recorded: Recorded[] = [];
  let patchCallIndex = 0;
  let conflictIndex = 0;
  const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
    recorded.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    if (init?.method === "PATCH") {
      const status = opts.patchStatuses?.[patchCallIndex++] ?? 200;
      // 200 응답에는 새 version 동봉 — createRemoteSave 가 내부 추적에 사용.
      // 409 응답에는 currentVersion 동봉 — 클라이언트가 expectedVersion 갱신 후 재시도.
      let body: unknown;
      if (status === 200) {
        body = { ok: true, version: 1 };
      } else if (status === 409) {
        const cv = opts.conflictCurrentVersions?.[conflictIndex++];
        body = cv === undefined ? { error: "stale" } : { error: "stale", currentVersion: cv };
      } else {
        body = { error: "stale" };
      }
      return new Response(JSON.stringify(body), { status });
    }
    return new Response(JSON.stringify(opts.loadResponse ?? {}), {
      status: 200,
    });
  });
  return { fakeFetch, recorded };
}

describe("createRemoteSave", () => {
  it("디바운스 — 같은 키 연속 patch 는 한 번만 보내고 최신값", async () => {
    vi.useFakeTimers();
    const { fakeFetch, recorded } = makeFakeFetch({});
    const remote = createRemoteSave({
      flushDelayMs: 100,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    remote.patch("character.v2", { hp: 50 });
    remote.patch("character.v2", { hp: 48 });
    remote.patch("character.v2", { hp: 45 });

    expect(recorded).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(100);

    expect(recorded).toHaveLength(1);
    expect(recorded[0].method).toBe("PATCH");
    expect(recorded[0].url).toContain("key=character.v2");
    expect(recorded[0].body).toEqual({
      value: { hp: 45 },
      expectedVersion: null,
    });

    vi.useRealTimers();
  });

  it("서로 다른 키는 한 사이클에 모두 전송", async () => {
    vi.useFakeTimers();
    const { fakeFetch, recorded } = makeFakeFetch({});
    const remote = createRemoteSave({
      flushDelayMs: 100,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    remote.patch("character.v2", { hp: 50 });
    remote.patch("inventory.v2", { potions: {} });
    await vi.advanceTimersByTimeAsync(100);

    expect(recorded).toHaveLength(2);
    const keys = recorded.map((r) => new URL(r.url, "http://x").searchParams.get("key"));
    expect(keys).toContain("character.v2");
    expect(keys).toContain("inventory.v2");

    vi.useRealTimers();
  });

  it("실패 시 backoff 재시도", async () => {
    vi.useFakeTimers();
    const { fakeFetch } = makeFakeFetch({ patchStatuses: [500, 200] });
    const remote = createRemoteSave({
      flushDelayMs: 100,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    remote.patch("character.v2", { hp: 50 });
    await vi.advanceTimersByTimeAsync(100);
    expect(remote.status().kind).toBe("error");

    // 1s backoff 후 재시도 → 성공.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(remote.status().kind).toBe("idle");
    expect(fakeFetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("401 수신 시 session-expired 로 전환 + 큐 보존", async () => {
    vi.useFakeTimers();
    const { fakeFetch } = makeFakeFetch({ patchStatuses: [401] });
    const remote = createRemoteSave({
      flushDelayMs: 100,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    remote.patch("character.v2", { hp: 50 });
    await vi.advanceTimersByTimeAsync(100);

    expect(remote.status().kind).toBe("session-expired");
    expect(fakeFetch).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("loadAll — 알 수 없는 키 필터링 + version 추출", async () => {
    const { fakeFetch } = makeFakeFetch({
      loadResponse: {
        "character.v2": { hp: 50 },
        "unknown.v2": "ignored",
        _version: { "character.v2": 7, "unknown.v2": 99 },
      },
    });
    const remote = createRemoteSave({
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    const result = await remote.loadAll();
    expect(result.data).toEqual({ "character.v2": { hp: 50 } });
    expect(result.versions).toEqual({ "character.v2": 7 });
  });

  it("seedVersions 후 PATCH 는 expectedVersion 동봉", async () => {
    vi.useFakeTimers();
    const { fakeFetch, recorded } = makeFakeFetch({});
    const remote = createRemoteSave({
      flushDelayMs: 100,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    remote.seedVersions({ "character.v2": 7 });
    remote.patch("character.v2", { hp: 50 });
    await vi.advanceTimersByTimeAsync(100);

    expect(recorded[0].body).toEqual({
      value: { hp: 50 },
      expectedVersion: 7,
    });

    vi.useRealTimers();
  });

  it("409 1회 → currentVersion 으로 expectedVersion 갱신 후 자동 재시도 → 성공", async () => {
    vi.useFakeTimers();
    const { fakeFetch, recorded } = makeFakeFetch({
      patchStatuses: [409, 200],
      conflictCurrentVersions: [42],
    });
    const remote = createRemoteSave({
      flushDelayMs: 100,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    remote.seedVersions({ "character.v2": 7 });
    remote.patch("character.v2", { hp: 50 });
    await vi.advanceTimersByTimeAsync(100);
    // 첫 PATCH: expectedVersion 7 → 409 (server 는 42).
    // 재시도 큐 → 다음 사이클로 scheduleFlush.
    await vi.advanceTimersByTimeAsync(100);
    // 두 번째 PATCH: expectedVersion 42 (currentVersion 으로 갱신) → 200.

    const patches = recorded.filter((r) => r.method === "PATCH");
    expect(patches).toHaveLength(2);
    expect((patches[0].body as { expectedVersion: unknown }).expectedVersion).toBe(7);
    expect((patches[1].body as { expectedVersion: unknown }).expectedVersion).toBe(42);
    expect(remote.status().kind).toBe("idle");

    vi.useRealTimers();
  });

  it("409 가 MAX_KEY_CONFLICT_RETRIES(3) 초과 → 그 키만 폐기 + stale 표시", async () => {
    vi.useFakeTimers();
    const { fakeFetch } = makeFakeFetch({
      patchStatuses: [409, 409, 409, 409],
      conflictCurrentVersions: [10, 11, 12, 13],
    });
    const remote = createRemoteSave({
      flushDelayMs: 100,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    remote.patch("character.v2", { hp: 50 });
    await vi.advanceTimersByTimeAsync(100); // 1차 409 → 재시도
    await vi.advanceTimersByTimeAsync(100); // 2차 409 → 재시도
    await vi.advanceTimersByTimeAsync(100); // 3차 409 → 재시도
    await vi.advanceTimersByTimeAsync(100); // 4차 409 → 한도 초과 → stale

    expect(fakeFetch).toHaveBeenCalledTimes(4);
    expect(remote.status().kind).toBe("stale");
    // stale 상태에서도 새 patch 는 큐에 쌓이지만 자동 flush 는 안 함 — SaveProvider 가
    // 곧 location.reload 로 서버 상태를 통째로 다시 불러오므로 보낼 의미가 없음.
    remote.patch("character.v2", { hp: 60 });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fakeFetch).toHaveBeenCalledTimes(4);

    vi.useRealTimers();
  });

  it("staleEncountered: 한 키가 stale 한도 초과해도 같은 snapshot 의 다른 키는 정상 PATCH", async () => {
    vi.useFakeTimers();
    let charCalls = 0;
    let invCalled = false;
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method !== "PATCH") {
        return new Response("{}", { status: 200 });
      }
      const u = new URL(url, "http://x");
      const key = u.searchParams.get("key");
      if (key === "character.v2") {
        charCalls += 1;
        return new Response(
          JSON.stringify({ error: "stale", currentVersion: 99 }),
          { status: 409 },
        );
      }
      if (key === "inventory.v2") {
        invCalled = true;
        return new Response(JSON.stringify({ ok: true, version: 1 }), {
          status: 200,
        });
      }
      return new Response("{}", { status: 200 });
    });
    const remote = createRemoteSave({
      flushDelayMs: 100,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    remote.patch("character.v2", { hp: 50 });
    remote.patch("inventory.v2", { gold: 100 });
    await vi.advanceTimersByTimeAsync(100); // 1차: char 409, inv 200
    await vi.advanceTimersByTimeAsync(100); // 2차: char 409 retry
    await vi.advanceTimersByTimeAsync(100); // 3차: char 409
    await vi.advanceTimersByTimeAsync(100); // 4차: char 한도 초과 → stale

    expect(charCalls).toBe(4);
    expect(invCalled).toBe(true); // 핵심 — 다른 키는 첫 사이클에 정상 처리
    expect(remote.status().kind).toBe("stale");

    vi.useRealTimers();
  });

  it("409 → 200 성공 후 다시 409 가 와도 카운트가 리셋되어 재시도 가능", async () => {
    vi.useFakeTimers();
    const { fakeFetch } = makeFakeFetch({
      patchStatuses: [409, 200, 409, 200],
      conflictCurrentVersions: [5, 9],
    });
    const remote = createRemoteSave({
      flushDelayMs: 100,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    remote.patch("character.v2", { hp: 50 });
    await vi.advanceTimersByTimeAsync(100); // 409
    await vi.advanceTimersByTimeAsync(100); // 200 → idle
    expect(remote.status().kind).toBe("idle");

    remote.patch("character.v2", { hp: 60 });
    await vi.advanceTimersByTimeAsync(100); // 409 (카운트 리셋됐으므로 retry 1회 가능)
    await vi.advanceTimersByTimeAsync(100); // 200
    expect(remote.status().kind).toBe("idle");
    expect(fakeFetch).toHaveBeenCalledTimes(4);

    vi.useRealTimers();
  });

  it("flush() 는 in-flight 사이클 + 그 동안 쌓인 큐까지 완료될 때까지 await", async () => {
    // 회귀 가드 — 옛 구현은 flushNow 의 `if (flushing) return;` 으로 즉시 resolve,
    // quest claim 같은 caller 가 stale 값으로 후속 API 를 호출하는 race 가 있었다.
    vi.useFakeTimers();
    const pendingResolvers: Array<() => void> = [];
    const fakeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== "PATCH") return new Response("{}", { status: 200 });
      // 응답을 외부에서 제어 — in-flight 상태 유지.
      await new Promise<void>((r) => pendingResolvers.push(r));
      return new Response(JSON.stringify({ ok: true, version: 1 }), {
        status: 200,
      });
    });

    const remote = createRemoteSave({
      flushDelayMs: 100,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    // 첫 patch — 100ms 디바운스 후 fetch 발사 (응답 대기 상태).
    remote.patch("character.v2", { hp: 50 });
    await vi.advanceTimersByTimeAsync(100);
    expect(fakeFetch).toHaveBeenCalledTimes(1);

    // in-flight 중에 새 키 patch.
    remote.patch("inventory.v2", { gold: 100 });

    // 별도 caller 가 flush() — 진짜 끝까지 대기해야 함 (옛 구현은 여기서 즉시 resolve).
    let flushResolved = false;
    const flushPromise = remote.flush().then(() => {
      flushResolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(flushResolved).toBe(false);

    // 첫 fetch 응답 → 진행 중 사이클 완료 → flush() 의 while 루프가 두 번째 사이클 발사.
    pendingResolvers[0]();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(fakeFetch).toHaveBeenCalledTimes(2);
    expect(flushResolved).toBe(false);

    // 두 번째 fetch 응답 → 큐 비고 flush() resolve.
    pendingResolvers[1]();
    await vi.advanceTimersByTimeAsync(0);
    await flushPromise;
    expect(flushResolved).toBe(true);
    expect(remote.status().kind).toBe("idle");

    vi.useRealTimers();
  });

  it("성공 응답의 version 으로 다음 PATCH expectedVersion 갱신", async () => {
    vi.useFakeTimers();
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const body = JSON.parse(init.body as string) as { expectedVersion?: number | null };
        const next = (body.expectedVersion ?? 0) + 1;
        return new Response(JSON.stringify({ ok: true, version: next }), {
          status: 200,
        });
      }
      return new Response("{}", { status: 200 });
    });
    const remote = createRemoteSave({
      flushDelayMs: 100,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    remote.patch("character.v2", { hp: 50 });
    await vi.advanceTimersByTimeAsync(100);
    // 첫 PATCH: expectedVersion null → 응답 version 1.

    remote.patch("character.v2", { hp: 45 });
    await vi.advanceTimersByTimeAsync(100);
    // 두 번째 PATCH: expectedVersion 1 (직전 응답에서 받은 값).

    const calls = fakeFetch.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === "PATCH",
    );
    const bodies = calls.map(
      (c) => JSON.parse((c[1] as RequestInit).body as string),
    );
    expect(bodies[0]).toEqual({ value: { hp: 50 }, expectedVersion: null });
    expect(bodies[1]).toEqual({ value: { hp: 45 }, expectedVersion: 1 });

    vi.useRealTimers();
  });
});
