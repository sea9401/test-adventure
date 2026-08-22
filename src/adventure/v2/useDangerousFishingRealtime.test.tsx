// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDangerousRealtimeState,
  dangerousRealtimeMinimumCatchTick,
  dangerousRealtimeView,
  replayDangerousRealtimeInputs,
  type DangerousRealtimeConfig,
  type DangerousRealtimeInput,
  type DangerousRealtimeState,
} from "./dangerousFishingRealtime";
import { dangerousRealtimeModifiers } from "./dangerousFishingRealtimeModifiers";
import {
  dangerousFishingRealtimeStorageKey,
  useDangerousFishingRealtime,
  type DangerousRealtimeClientEncounter,
} from "./useDangerousFishingRealtime";
import { dangerousFishingRealtimeFinishFeedback } from "./useDangerousFishing";
import { useActivityVerification } from "./useActivityVerification";

const STARTED_AT = 1_000_000;

function encounterFixture(
  overrides: Partial<DangerousRealtimeConfig> = {},
  balanceRevision: DangerousRealtimeClientEncounter["balanceRevision"] = 2,
): DangerousRealtimeClientEncounter {
  const config: DangerousRealtimeConfig = {
    seed: 71,
    risk: 0,
    targetKind: "fish",
    rarity: "rare",
    behaviorPattern: ["turn", "charge", "thrash", "dive"],
    initialTension: 500,
    maxTension: 1_000,
    initialStamina: 10_000,
    initialDistance: 10_000,
    maxTicks: 400,
    modifiers: dangerousRealtimeModifiers({
      fishingLevel: 50,
      baitId: "basic_bait",
      slackTolerance: 100,
    }),
    ...overrides,
  };
  const checkpoint = createDangerousRealtimeState(config, balanceRevision);
  return {
    simulationVersion: 2,
    balanceRevision,
    id: "encounter-client-1",
    targetKind: "fish",
    targetId: "ironjaw_tuna",
    config,
    checkpoint,
    view: dangerousRealtimeView(checkpoint, config),
    approvedTick: 0,
    revision: 0,
    startedAt: STARTED_AT,
    expiresAt: STARTED_AT + config.maxTicks * 50,
  };
}

function jsonReader(response: Response) {
  return response.json().catch(() => null);
}

function pointerEvent() {
  return {
    pointerId: 7,
    preventDefault: vi.fn(),
    currentTarget: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
    },
  };
}

function keyboardEvent(repeat = false) {
  return {
    code: "Space",
    key: " ",
    repeat,
    preventDefault: vi.fn(),
  };
}

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: value === "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

type MutableStoredSessionFixture = {
  version: number;
  encounterId: string;
  server: {
    revision: number;
    approvedTick: number;
    checkpoint: DangerousRealtimeState;
  };
  inputs: Array<{
    tick: number;
    mode: "reel" | "release";
    sequence: number;
  }>;
  nextSequence: number;
  finishRequestId: string | null;
  savedAt: number;
};

function successfulFetch(initial: DangerousRealtimeClientEncounter) {
  let server = initial;
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      action: "checkpoint" | "finish";
      revision: number;
      inputs: DangerousRealtimeInput[];
      clientTick: number;
    };
    if (body.action === "finish") {
      return Response.json({ ok: true, event: "timeout" });
    }
    const checkpoint = replayDangerousRealtimeInputs(
      server.config,
      body.inputs,
      body.clientTick,
      server.checkpoint,
      server.balanceRevision,
    );
    server = {
      ...server,
      checkpoint,
      view: dangerousRealtimeView(checkpoint, server.config),
      approvedTick: checkpoint.tick,
      revision: server.revision + 1,
    };
    return Response.json({ ok: true, encounter: server });
  });
}

function renderRealtime(
  encounter: DangerousRealtimeClientEncounter,
  options: {
    target?: { kind: "voyage"; endpoint: "/api/v2/dangerous-fishing/encounter" };
    onFinish?: (json: Record<string, unknown>) => void;
  } = {},
) {
  return renderHook(() =>
    useDangerousFishingRealtime({
      encounter,
      target: options.target ?? {
        kind: "voyage",
        endpoint: "/api/v2/dangerous-fishing/encounter",
      },
      readJson: jsonReader,
      verification: null,
      onFinish: options.onFinish,
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(STARTED_AT);
  sessionStorage.clear();
  setVisibility("visible");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useDangerousFishingRealtime", () => {
  it("서버가 공개한 legacy balance revision으로 catch timing을 replay한다", () => {
    const base = encounterFixture();
    const checkpoint = {
      ...createDangerousRealtimeState(base.config, 1),
      stamina: 0,
      distance: 0,
    };
    const encounter: DangerousRealtimeClientEncounter = {
      ...base,
      balanceRevision: 1,
      checkpoint,
      view: dangerousRealtimeView(checkpoint, base.config),
    };
    vi.stubGlobal("fetch", successfulFetch(encounter));
    const { result } = renderRealtime(encounter);

    act(() => vi.advanceTimersByTime(50));

    expect(result.current.view.status).toBe("caught");
  });

  it.each([2, 3] as const)(
    "revision %i 포획 확보 checkpoint는 조작 없이 자동 tick·finish를 이어 최소 연출 뒤 확정된다",
    async (balanceRevision) => {
    const base = encounterFixture({}, balanceRevision);
    const minimumCatchTick = dangerousRealtimeMinimumCatchTick(
      base.checkpoint.targetTicks,
    );
    const checkpoint = {
      ...base.checkpoint,
      tick: minimumCatchTick - 2,
      stamina: 0,
      distance: 0,
      status: "active" as const,
    };
    const encounter = {
      ...base,
      checkpoint,
      view: dangerousRealtimeView(checkpoint, base.config),
      approvedTick: checkpoint.tick,
      startedAt: STARTED_AT - checkpoint.tick * 50,
      expiresAt: STARTED_AT + (base.config.maxTicks - checkpoint.tick) * 50,
    };
    const fetcher = successfulFetch(encounter);
    const onFinish = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderRealtime(encounter, { onFinish });

    expect(result.current.view.status).toBe("active");
    expect(result.current.view).toMatchObject({ stamina: 0, distance: 0 });

    await act(async () => vi.advanceTimersByTimeAsync(100));

    expect(result.current.view.status).toBe("caught");
    expect(result.current.view.tick).toBe(minimumCatchTick);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v2/dangerous-fishing/encounter",
      expect.objectContaining({
        body: expect.stringContaining('"action":"finish"'),
      }),
    );
    expect(onFinish).toHaveBeenCalledTimes(1);
    },
  );

  it("revision 3 authoritative checkpoint를 받아 같은 revision으로 복구를 이어간다", async () => {
    const encounter = encounterFixture({}, 3);
    const fetcher = successfulFetch(encounter);
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderRealtime(encounter);

    await act(async () => vi.advanceTimersByTimeAsync(2_050));

    expect(result.current.connection).toBe("online");
    expect(
      JSON.parse(
        sessionStorage.getItem(
          dangerousFishingRealtimeStorageKey(encounter.id),
        )!,
      ),
    ).toMatchObject({
      server: {
        revision: 1,
        checkpoint: { performanceScalePermille: 1_000 },
      },
    });
  });

  it.each([0, 4, "3", null])(
    "authoritative checkpoint의 미래·비정상 balance revision %j은 거부한다",
    async (balanceRevision) => {
      const encounter = encounterFixture({}, 3);
      const invalid = { ...encounter, balanceRevision };
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ ok: true, encounter: invalid })),
      );
      const { result, unmount } = renderRealtime(encounter);

      await act(async () => vi.advanceTimersByTimeAsync(2_050));

      expect(result.current.connection).toBe("offline");
      unmount();
    },
  );

  it("terminal 서버 응답을 기존 결과 카드 feedback 모델로 연결한다", () => {
    const encounter = encounterFixture();
    expect(
      dangerousFishingRealtimeFinishFeedback({
        scope: "voyage",
        encounter,
        targetName: "철턱 참치",
        response: {
          event: "caught",
          fish: { name: "철턱 참치", sizeCm: 132 },
          fishingXpGained: 34,
          fishingCoinsGained: 8,
        },
      }),
    ).toMatchObject({
      tone: "success",
      title: "철턱 참치 132cm 어획 성공",
      terminal: true,
    });
  });

  it("pointer와 Space 입력을 같은 reel/release 전환으로 처리하고 반복 키다운을 무시한다", () => {
    const encounter = encounterFixture();
    vi.stubGlobal("fetch", successfulFetch(encounter));
    const { result } = renderRealtime(encounter);

    const pointer = pointerEvent();
    act(() => result.current.onPointerDown(pointer as never));
    expect(result.current.holding).toBe(true);
    expect(result.current.view.mode).toBe("reel");
    expect(pointer.currentTarget.setPointerCapture).toHaveBeenCalledWith(7);

    act(() => result.current.onPointerUp(pointer as never));
    expect(result.current.holding).toBe(false);
    expect(result.current.view.mode).toBe("release");

    const repeated = keyboardEvent(true);
    act(() => result.current.onKeyDown(repeated as never));
    expect(repeated.preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.holding).toBe(false);

    const keyDown = keyboardEvent();
    act(() => result.current.onKeyDown(keyDown as never));
    expect(keyDown.preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.holding).toBe(true);

    const storedAfterRepeat = JSON.parse(
      sessionStorage.getItem(dangerousFishingRealtimeStorageKey(encounter.id))!,
    ) as { inputs: unknown[] };
    expect(storedAfterRepeat.inputs).toHaveLength(1);

    const keyUp = keyboardEvent();
    act(() => result.current.onKeyUp(keyUp as never));
    expect(keyUp.preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.holding).toBe(false);
  });

  it("같은 encounter의 상위 status refresh가 진행 중 hold와 loop를 재시작하지 않는다", () => {
    const encounter = encounterFixture();
    vi.stubGlobal("fetch", successfulFetch(encounter));
    const target = {
      kind: "voyage" as const,
      endpoint: "/api/v2/dangerous-fishing/encounter" as const,
    };
    const hook = renderHook(
      ({ current }: { current: DangerousRealtimeClientEncounter }) =>
        useDangerousFishingRealtime({
          encounter: current,
          target,
          readJson: jsonReader,
          verification: null,
        }),
      { initialProps: { current: encounter } },
    );

    act(() => hook.result.current.onPointerDown(pointerEvent() as never));
    hook.rerender({ current: { ...encounter } });

    expect(hook.result.current.holding).toBe(true);
    expect(hook.result.current.view.mode).toBe("reel");
  });

  it("새 encounter ID로 바뀌면 이전 transcript와 physical hold를 원자적으로 초기화한다", () => {
    const first = encounterFixture();
    vi.stubGlobal("fetch", successfulFetch(first));
    const target = {
      kind: "voyage" as const,
      endpoint: "/api/v2/dangerous-fishing/encounter" as const,
    };
    const hook = renderHook(
      ({ current }: { current: DangerousRealtimeClientEncounter }) =>
        useDangerousFishingRealtime({
          encounter: current,
          target,
          readJson: jsonReader,
          verification: null,
        }),
      { initialProps: { current: first } },
    );
    act(() => hook.result.current.onPointerDown(pointerEvent() as never));

    const second = { ...encounterFixture(), id: "encounter-client-2" };
    hook.rerender({ current: second });

    expect(hook.result.current.holding).toBe(false);
    expect(hook.result.current.connection).toBe("online");
    expect(hook.result.current.view).toMatchObject({ tick: 0, mode: "release" });
    const stored = JSON.parse(
      sessionStorage.getItem(dangerousFishingRealtimeStorageKey(second.id))!,
    ) as { inputs: unknown[]; nextSequence: number; finishRequestId: string | null };
    expect(stored).toMatchObject({
      inputs: [],
      nextSequence: 0,
      finishRequestId: null,
    });
  });

  it("완료한 encounter 뒤 새 ID에서도 저장과 checkpoint를 다시 시작한다", async () => {
    const first = encounterFixture({ maxTicks: 3 });
    const fetcher = successfulFetch(first);
    vi.stubGlobal("fetch", fetcher);
    const target = {
      kind: "voyage" as const,
      endpoint: "/api/v2/dangerous-fishing/encounter" as const,
    };
    const hook = renderHook(
      ({ current }: { current: DangerousRealtimeClientEncounter }) =>
        useDangerousFishingRealtime({
          encounter: current,
          target,
          readJson: jsonReader,
          verification: null,
        }),
      { initialProps: { current: first } },
    );
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(hook.result.current.connection).toBe("finished");

    const second = {
      ...encounterFixture(),
      id: "encounter-after-finish",
      startedAt: Date.now(),
      expiresAt: Date.now() + 400 * 50,
    };
    hook.rerender({ current: second });
    act(() => hook.result.current.onPointerDown(pointerEvent() as never));
    await act(async () => vi.advanceTimersByTimeAsync(2_050));

    const bodies = fetcher.mock.calls.map((call) =>
      JSON.parse(String(call[1]?.body)) as { encounterId: string },
    );
    expect(bodies.at(-1)?.encounterId).toBe(second.id);
    expect(
      sessionStorage.getItem(dangerousFishingRealtimeStorageKey(second.id)),
    ).not.toBeNull();
  });

  it("이전 encounter의 늦은 finally가 새 encounter의 진행 중 요청 guard를 해제하지 않는다", async () => {
    const first = encounterFixture();
    const second = {
      ...encounterFixture(),
      id: "encounter-after-pending-request",
    };
    const requestA = deferred<Response>();
    const requestB = deferred<Response>();
    const requestC = deferred<Response>();
    const fetcher = vi.fn(async () => {
      const call = fetcher.mock.calls.length;
      if (call === 1) return requestA.promise;
      if (call === 2) return requestB.promise;
      return requestC.promise;
    });
    vi.stubGlobal("fetch", fetcher);
    const target = {
      kind: "voyage" as const,
      endpoint: "/api/v2/dangerous-fishing/encounter" as const,
    };
    const hook = renderHook(
      ({ current }: { current: DangerousRealtimeClientEncounter }) =>
        useDangerousFishingRealtime({
          encounter: current,
          target,
          readJson: jsonReader,
          verification: null,
        }),
      { initialProps: { current: first } },
    );

    await act(async () => vi.advanceTimersByTimeAsync(2_050));
    expect(fetcher).toHaveBeenCalledTimes(1);

    hook.rerender({ current: second });
    await act(async () => vi.advanceTimersByTimeAsync(50));
    expect(fetcher).toHaveBeenCalledTimes(2);

    await act(async () => {
      requestA.resolve(Response.json({ ok: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => window.dispatchEvent(new Event("online")));
    await act(async () => vi.advanceTimersByTimeAsync(50));
    expect(fetcher).toHaveBeenCalledTimes(2);

    await act(async () => {
      requestB.resolve(Response.json({ ok: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("pointer cancel, 창 blur, hidden 전환에서 reel을 즉시 해제한다", () => {
    const encounter = encounterFixture();
    vi.stubGlobal("fetch", successfulFetch(encounter));
    const { result } = renderRealtime(encounter);

    act(() => result.current.onPointerDown(pointerEvent() as never));
    act(() => result.current.onPointerUp(pointerEvent() as never));
    expect(result.current.holding).toBe(false);

    act(() => result.current.onPointerDown(pointerEvent() as never));
    act(() => window.dispatchEvent(new Event("blur")));
    expect(result.current.holding).toBe(false);

    act(() => result.current.onPointerDown(pointerEvent() as never));
    act(() => setVisibility("hidden"));
    expect(result.current.holding).toBe(false);
    expect(result.current.view.mode).toBe("release");
  });

  it("hidden 동안 tick을 진행하지 않고 foreground 복귀 때 경과한 whole tick만 따라잡는다", () => {
    const encounter = encounterFixture();
    vi.stubGlobal("fetch", successfulFetch(encounter));
    const { result } = renderRealtime(encounter);

    act(() => setVisibility("hidden"));
    act(() => vi.advanceTimersByTime(5_025));
    expect(result.current.view.tick).toBe(0);

    act(() => setVisibility("visible"));
    expect(result.current.view.tick).toBe(100);
  });

  it("약 2초마다 transcript checkpoint를 보내고 복구 세션을 저장한다", async () => {
    const encounter = encounterFixture();
    const fetcher = successfulFetch(encounter);
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderRealtime(encounter);

    act(() => result.current.onPointerDown(pointerEvent() as never));
    await act(async () => vi.advanceTimersByTimeAsync(2_050));

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("dangerous-fishing"),
      expect.objectContaining({ method: "POST" }),
    );
    const request = JSON.parse(
      String(fetcher.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(request).toMatchObject({
      action: "checkpoint",
      encounterId: encounter.id,
      revision: 0,
      clientTick: 40,
      inputs: [{ tick: 0, mode: "reel" }],
    });
    expect(
      JSON.parse(
        sessionStorage.getItem(
          dangerousFishingRealtimeStorageKey(encounter.id),
        )!,
      ),
    ).toMatchObject({ encounterId: encounter.id });
  });

  it("active checkpoint의 malformed success를 finish로 오인하지 않고 복구 가능한 protocol 오류로 둔다", async () => {
    const encounter = encounterFixture();
    const onFinish = vi.fn();
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderRealtime(encounter, { onFinish });

    await act(async () => vi.advanceTimersByTimeAsync(2_050));

    expect(result.current.connection).toBe("offline");
    expect(result.current.view.status).toBe("active");
    expect(onFinish).not.toHaveBeenCalled();
    expect(
      sessionStorage.getItem(dangerousFishingRealtimeStorageKey(encounter.id)),
    ).not.toBeNull();
  });

  it("stale revision의 authoritative checkpoint 위에 현재 local hold를 다시 replay한다", async () => {
    const encounter = encounterFixture();
    const checkpoint = replayDangerousRealtimeInputs(
      encounter.config,
      [],
      20,
      encounter.checkpoint,
      encounter.balanceRevision,
    );
    const authoritative = {
      ...encounter,
      checkpoint,
      view: dangerousRealtimeView(checkpoint, encounter.config),
      approvedTick: 20,
      revision: 1,
    };
    const fetcher = vi.fn(async () =>
      Response.json(
        { ok: false, error: "stale", encounter: authoritative },
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderRealtime(encounter);

    act(() => result.current.onPointerDown(pointerEvent() as never));
    await act(async () => vi.advanceTimersByTimeAsync(2_050));

    expect(result.current.view.tick).toBeGreaterThanOrEqual(40);
    expect(result.current.view.mode).toBe("reel");
    expect(
      JSON.parse(
        sessionStorage.getItem(
          dangerousFishingRealtimeStorageKey(encounter.id),
        )!,
      ),
    ).toMatchObject({ server: { revision: 1, approvedTick: 20 } });
  });

  it("deferred checkpoint 성공 중 같은 tick에서 바뀐 입력의 tick과 mode를 보존한다", async () => {
    const encounter = encounterFixture();
    const pending = deferred<Response>();
    const fetcher = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => {
      if (fetcher.mock.calls.length === 1) throw new TypeError("offline");
      return pending.promise;
    });
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderRealtime(encounter);
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(result.current.view.tick).toBe(40);

    act(() => result.current.onPointerDown(pointerEvent() as never));
    act(() => window.dispatchEvent(new Event("online")));
    expect(fetcher).toHaveBeenCalledTimes(2);
    act(() => result.current.onPointerUp(pointerEvent() as never));
    await act(async () => vi.advanceTimersByTimeAsync(500));

    const request = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)) as {
      inputs: DangerousRealtimeInput[];
      clientTick: number;
    };
    const checkpoint = replayDangerousRealtimeInputs(
      encounter.config,
      request.inputs,
      request.clientTick,
      encounter.checkpoint,
      encounter.balanceRevision,
    );
    const acknowledged = {
      ...encounter,
      checkpoint,
      view: dangerousRealtimeView(checkpoint, encounter.config),
      approvedTick: checkpoint.tick,
      revision: 1,
    };
    await act(async () => {
      pending.resolve(Response.json({ ok: true, encounter: acknowledged }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const stored = JSON.parse(
      sessionStorage.getItem(dangerousFishingRealtimeStorageKey(encounter.id))!,
    ) as { inputs: DangerousRealtimeInput[] };
    expect(stored.inputs).toContainEqual({
      tick: 40,
      mode: "release",
      sequence: expect.any(Number),
    });
    expect(result.current.view.mode).toBe("release");
  });

  it("deferred stale 409 rebase 중 기록한 입력을 authoritative checkpoint 위에 유지한다", async () => {
    const encounter = encounterFixture();
    const pending = deferred<Response>();
    const fetcher = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => {
      if (fetcher.mock.calls.length === 1) throw new TypeError("offline");
      return pending.promise;
    });
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderRealtime(encounter);
    await act(async () => vi.advanceTimersByTimeAsync(2_000));

    act(() => result.current.onPointerDown(pointerEvent() as never));
    act(() => window.dispatchEvent(new Event("online")));
    act(() => result.current.onPointerUp(pointerEvent() as never));
    await act(async () => vi.advanceTimersByTimeAsync(500));

    const checkpoint = replayDangerousRealtimeInputs(
      encounter.config,
      [],
      20,
      encounter.checkpoint,
      encounter.balanceRevision,
    );
    const authoritative = {
      ...encounter,
      checkpoint,
      view: dangerousRealtimeView(checkpoint, encounter.config),
      approvedTick: 20,
      revision: 1,
    };
    await act(async () => {
      pending.resolve(
        Response.json(
          { ok: false, error: "stale", encounter: authoritative },
          { status: 409 },
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const stored = JSON.parse(
      sessionStorage.getItem(dangerousFishingRealtimeStorageKey(encounter.id))!,
    ) as { inputs: DangerousRealtimeInput[]; server: { revision: number } };
    expect(stored.server.revision).toBe(1);
    expect(stored.inputs).toContainEqual({
      tick: 40,
      mode: "release",
      sequence: expect.any(Number),
    });
  });

  it("reload에서 미승인 transcript를 복원하고 손상되거나 다른 encounter 저장본은 버린다", () => {
    const encounter = encounterFixture();
    vi.stubGlobal("fetch", successfulFetch(encounter));
    const first = renderRealtime(encounter);
    act(() => first.result.current.onPointerDown(pointerEvent() as never));
    act(() => vi.advanceTimersByTime(500));
    const staminaAfterReel = first.result.current.view.stamina;
    first.unmount();

    expect(Date.now()).toBe(STARTED_AT + 500);
    const restored = renderRealtime(encounter);
    expect(restored.result.current.view.tick).toBe(10);
    expect(restored.result.current.view.stamina).toBe(staminaAfterReel);
    restored.unmount();

    const key = dangerousFishingRealtimeStorageKey(encounter.id);
    sessionStorage.setItem(key, "{broken");
    vi.setSystemTime(STARTED_AT);
    const corrupt = renderRealtime(encounter);
    expect(corrupt.result.current.view.tick).toBe(0);
    expect(sessionStorage.getItem(key)).not.toContain("broken");
    corrupt.unmount();

    sessionStorage.setItem(
      key,
      JSON.stringify({ version: 1, encounterId: "someone-else" }),
    );
    const mismatched = renderRealtime(encounter);
    expect(mismatched.result.current.view.tick).toBe(0);
    expect(sessionStorage.getItem(key)).toContain(encounter.id);
  });

  it.each([
    ["negative revision", (value: MutableStoredSessionFixture) => {
      value.server.revision = -1;
    }],
    ["negative checkpoint", (value: MutableStoredSessionFixture) => {
      value.server.approvedTick = -1;
      value.server.checkpoint.tick = -1;
    }],
    ["checkpoint beyond maxTicks", (value: MutableStoredSessionFixture) => {
      value.server.approvedTick = 401;
      value.server.checkpoint.tick = 401;
    }],
    ["duplicate sequence", (value: MutableStoredSessionFixture) => {
      value.inputs.push({ tick: 1, mode: "release", sequence: 0 });
      value.nextSequence = 2;
    }],
    ["non-advancing nextSequence", (value: MutableStoredSessionFixture) => {
      value.nextSequence = 0;
    }],
    ["empty finish request ID", (value: MutableStoredSessionFixture) => {
      value.finishRequestId = "";
    }],
    ["oversized finish request ID", (value: MutableStoredSessionFixture) => {
      value.finishRequestId = "x".repeat(129);
    }],
    ["input beyond maxTicks", (value: MutableStoredSessionFixture) => {
      value.inputs[0].tick = 401;
    }],
    ["tension beyond active bound", (value: MutableStoredSessionFixture) => {
      value.server.checkpoint.tension = value.server.checkpoint.maxTension + 1;
    }],
    ["stamina beyond maximum", (value: MutableStoredSessionFixture) => {
      value.server.checkpoint.stamina = value.server.checkpoint.maxStamina + 1;
    }],
    ["distance beyond escape bound", (value: MutableStoredSessionFixture) => {
      value.server.checkpoint.distance = value.server.checkpoint.startDistance * 2 + 1;
    }],
    ["slack counter beyond grace", (value: MutableStoredSessionFixture) => {
      value.server.checkpoint.lowTensionTicks =
        encounterFixture().config.modifiers.lowTensionGraceTicks + 1;
    }],
    ["zero RNG state", (value: MutableStoredSessionFixture) => {
      value.server.checkpoint.rngState = 0;
    }],
    ["zero phase duration", (value: MutableStoredSessionFixture) => {
      value.server.checkpoint.phaseTicksRemaining = 0;
    }],
    ["phase duration beyond bound", (value: MutableStoredSessionFixture) => {
      value.server.checkpoint.phaseTicksRemaining = 6;
    }],
    ["derived target ticks changed", (value: MutableStoredSessionFixture) => {
      value.server.checkpoint.targetTicks += 1;
    }],
    ["derived performance scale changed", (value: MutableStoredSessionFixture) => {
      value.server.checkpoint.performanceScalePermille += 1;
    }],
  ])("valid JSON storage의 %s invariant 위반을 폐기한다", (_name, mutate) => {
    const encounter = encounterFixture();
    const key = dangerousFishingRealtimeStorageKey(encounter.id);
    const stored: MutableStoredSessionFixture = {
      version: 1,
      encounterId: encounter.id,
      server: {
        revision: 0,
        approvedTick: 0,
        checkpoint: structuredClone(encounter.checkpoint),
      },
      inputs: [{ tick: 0, mode: "reel", sequence: 0 }],
      nextSequence: 1,
      finishRequestId: null,
      savedAt: STARTED_AT,
    };
    mutate(stored);
    sessionStorage.setItem(key, JSON.stringify(stored));
    vi.stubGlobal("fetch", successfulFetch(encounter));

    const hook = renderRealtime(encounter);

    const recovered = JSON.parse(sessionStorage.getItem(key)!) as {
      server: { revision: number; approvedTick: number };
      inputs: unknown[];
      nextSequence: number;
      finishRequestId: string | null;
    };
    expect(recovered).toMatchObject({
      server: { revision: 0, approvedTick: 0 },
      inputs: [],
      nextSequence: 0,
      finishRequestId: null,
    });
    hook.unmount();
  });

  it("encounter pattern에 없는 유효 behavior를 가진 저장본을 폐기한다", () => {
    const encounter = encounterFixture({
      behaviorPattern: ["turn", "charge", "thrash"],
    });
    const key = dangerousFishingRealtimeStorageKey(encounter.id);
    const stored: MutableStoredSessionFixture = {
      version: 1,
      encounterId: encounter.id,
      server: {
        revision: 0,
        approvedTick: 0,
        checkpoint: {
          ...structuredClone(encounter.checkpoint),
          behavior: "dive",
        },
      },
      inputs: [{ tick: 0, mode: "reel", sequence: 0 }],
      nextSequence: 1,
      finishRequestId: null,
      savedAt: STARTED_AT,
    };
    sessionStorage.setItem(key, JSON.stringify(stored));
    vi.stubGlobal("fetch", successfulFetch(encounter));

    const hook = renderRealtime(encounter);

    expect(JSON.parse(sessionStorage.getItem(key)!)).toMatchObject({
      server: { approvedTick: 0, checkpoint: { status: "active" } },
      inputs: [],
      nextSequence: 0,
    });
    hook.unmount();
  });

  it("tick 0 checkpoint를 caught로만 조작한 저장본을 버리고 서버 projection의 active 상태로 복구한다", () => {
    const encounter = encounterFixture({ behaviorPattern: ["turn", "charge", "thrash"] });
    const key = dangerousFishingRealtimeStorageKey(encounter.id);
    const stored: MutableStoredSessionFixture = {
      version: 1,
      encounterId: encounter.id,
      server: {
        revision: 0,
        approvedTick: 0,
        checkpoint: { ...structuredClone(encounter.checkpoint), status: "caught" },
      },
      inputs: [],
      nextSequence: 0,
      finishRequestId: "false-terminal-finish",
      savedAt: STARTED_AT,
    };
    sessionStorage.setItem(key, JSON.stringify(stored));
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const fetcher = successfulFetch(encounter);
    vi.stubGlobal("fetch", fetcher);

    const hook = renderRealtime(encounter);

    expect(removeItem).toHaveBeenCalledWith(key);
    expect(hook.result.current.view).toMatchObject({
      tick: 0,
      status: "active",
      stamina: encounter.checkpoint.stamina,
      distance: encounter.checkpoint.distance,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem(key)!)).toMatchObject({
      server: { approvedTick: 0, checkpoint: { status: "active" } },
      finishRequestId: null,
    });
    hook.unmount();
  });

  it("offline finish를 bounded exponential backoff로 재시도하고 manual retry에도 같은 requestId를 쓴다", async () => {
    const encounter = encounterFixture({ maxTicks: 3 });
    const requestedAt: number[] = [];
    const fetcher = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => {
      requestedAt.push(Date.now());
      throw new TypeError("offline");
    });
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderRealtime(encounter);

    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    const automaticCalls = fetcher.mock.calls.length;
    expect(automaticCalls).toBe(5);
    expect(requestedAt).toEqual([
      STARTED_AT + 150,
      STARTED_AT + 650,
      STARTED_AT + 1_650,
      STARTED_AT + 3_650,
      STARTED_AT + 7_650,
    ]);
    expect(result.current.connection).toBe("offline");
    const requestIds = fetcher.mock.calls.map((call) => {
      const body = JSON.parse(String(call[1]?.body)) as { requestId: string };
      return body.requestId;
    });
    expect(new Set(requestIds).size).toBe(1);

    await act(async () => result.current.retryFinish());
    expect(fetcher).toHaveBeenCalledTimes(automaticCalls + 1);
    const manualBody = JSON.parse(
      String(fetcher.mock.calls.at(-1)?.[1]?.body),
    ) as { requestId: string };
    expect(manualBody.requestId).toBe(requestIds[0]);
  });

  it("offline finish requestId를 unmount/reload 뒤에도 그대로 재사용한다", async () => {
    const encounter = encounterFixture();
    const fetcher = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => {
      throw new TypeError("offline");
    });
    vi.stubGlobal("fetch", fetcher);
    vi.setSystemTime(encounter.expiresAt);
    const first = renderRealtime(encounter);
    await act(async () => vi.advanceTimersByTimeAsync(50));
    const firstBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      requestId: string;
    };
    first.unmount();

    renderRealtime(encounter);
    await act(async () => vi.advanceTimersByTimeAsync(50));
    const restoredBody = JSON.parse(
      String(fetcher.mock.calls.at(-1)?.[1]?.body),
    ) as { requestId: string };

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(restoredBody.requestId).toBe(firstBody.requestId);
  });

  it("승인된 finish 저장본을 unmount cleanup이 되살리지 않는다", async () => {
    const encounter = encounterFixture({ maxTicks: 3 });
    vi.stubGlobal("fetch", successfulFetch(encounter));
    const hook = renderRealtime(encounter);

    await act(async () => vi.advanceTimersByTimeAsync(200));
    const key = dangerousFishingRealtimeStorageKey(encounter.id);
    expect(hook.result.current.connection).toBe("finished");
    expect(sessionStorage.getItem(key)).toBeNull();

    hook.unmount();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it("거대어 endpoint 요청에는 public eventId metadata를 포함한다", async () => {
    const encounter = {
      ...encounterFixture({ maxTicks: 3, targetKind: "boss", rarity: "boss" }),
      targetKind: "boss" as const,
      targetId: "tidal_colossus",
    };
    const fetcher = successfulFetch(encounter);
    vi.stubGlobal("fetch", fetcher);
    renderHook(() =>
      useDangerousFishingRealtime({
        encounter,
        target: {
          kind: "boss",
          endpoint: "/api/v2/dangerous-fishing/boss",
          eventId: "boss-event-7",
        },
        readJson: jsonReader,
        verification: null,
      }),
    );

    await act(async () => vi.advanceTimersByTimeAsync(200));
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      eventId: string;
    };
    expect(body.eventId).toBe("boss-event-7");
  });

  it("checkpoint가 offline이어도 local fixed-tick simulation을 계속한다", async () => {
    const encounter = encounterFixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    const { result } = renderRealtime(encounter);

    await act(async () => vi.advanceTimersByTimeAsync(3_000));
    expect(result.current.connection).toBe("offline");
    expect(result.current.view.tick).toBe(60);
  });

  it("실제 activity reader의 verification challenge 동안 retry budget을 쓰지 않고 인증 완료 신호로 재개한다", async () => {
    const encounter = encounterFixture();
    const online = successfulFetch(encounter);
    let verified = false;
    let dangerousRequests = 0;
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/v2/activity-verification") {
          return Response.json({ ok: true });
        }
        dangerousRequests += 1;
        if (!verified) {
          return Response.json(
            {
              ok: false,
              error: "human_verification_required",
              activity: "fishing",
              siteKey: "turnstile-site",
              reason: "volume",
            },
            { status: 403 },
          );
        }
        return online(input, init);
      },
    );
    vi.stubGlobal("fetch", fetcher);
    const hook = renderHook(() => {
      const activity = useActivityVerification("fishing");
      const realtime = useDangerousFishingRealtime({
        encounter,
        target: {
          kind: "voyage",
          endpoint: "/api/v2/dangerous-fishing/encounter",
        },
        readJson: activity.readJson,
        verification: activity.verification,
      });
      return { ...activity, realtime };
    });

    act(() => hook.result.current.realtime.onPointerDown(pointerEvent() as never));
    expect(hook.result.current.realtime.holding).toBe(true);
    expect(hook.result.current.realtime.view.mode).toBe("reel");

    await act(async () => vi.advanceTimersByTimeAsync(2_050));
    expect(hook.result.current.verification).toMatchObject({
      activity: "fishing",
      siteKey: "turnstile-site",
    });
    expect(hook.result.current.realtime.connection).toBe(
      "verification_required",
    );
    expect(hook.result.current.realtime.holding).toBe(false);
    expect(hook.result.current.realtime.view.mode).toBe("release");
    const storedDuringVerification = JSON.parse(
      sessionStorage.getItem(
        dangerousFishingRealtimeStorageKey(encounter.id),
      )!,
    ) as { inputs: Array<{ mode: string }> };
    expect(storedDuringVerification.inputs.at(-1)?.mode).toBe("release");
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(dangerousRequests).toBe(1);

    verified = true;
    await act(async () => {
      await hook.result.current.verifyHuman({ turnstileToken: "verified" });
      await Promise.resolve();
    });

    expect(dangerousRequests).toBe(2);
    expect(hook.result.current.realtime.connection).toBe("online");
  });

  it("unmount에서 listener와 timer를 정리하고 진행 중 요청을 abort하며 늦은 응답을 무시한다", async () => {
    const encounter = encounterFixture();
    let resolveRequest!: (response: Response) => void;
    const captured: { signal: AbortSignal | null } = { signal: null };
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        await new Promise<Response>((resolve) => {
          resolveRequest = resolve;
          captured.signal = init?.signal ?? null;
        }),
    );
    const onFinish = vi.fn();
    const removeWindowListener = vi.spyOn(window, "removeEventListener");
    const removeDocumentListener = vi.spyOn(document, "removeEventListener");
    vi.stubGlobal("fetch", fetcher);
    const hook = renderRealtime(encounter, { onFinish });
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(fetcher).toHaveBeenCalledTimes(1);

    hook.unmount();
    expect(captured.signal?.aborted).toBe(true);
    expect(removeWindowListener).toHaveBeenCalledWith("blur", expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removeDocumentListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    const storedAfterUnmount = sessionStorage.getItem(
      dangerousFishingRealtimeStorageKey(encounter.id),
    );
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("online"));
    setVisibility("hidden");
    resolveRequest(Response.json({ ok: true, encounter }));
    await Promise.resolve();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
    expect(
      sessionStorage.getItem(dangerousFishingRealtimeStorageKey(encounter.id)),
    ).toBe(storedAfterUnmount);
  });

  it("지원 기기에서 high tension 최초 진입과 line break 전환에만 진동한다", () => {
    const encounter = encounterFixture({ initialTension: 755, maxTicks: 100 });
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });
    vi.stubGlobal("fetch", successfulFetch(encounter));
    const { result, rerender } = renderRealtime(encounter);

    act(() => result.current.onPointerDown(pointerEvent() as never));
    act(() => vi.advanceTimersByTime(100));
    expect(vibrate).toHaveBeenCalledTimes(1);
    rerender();
    act(() => vi.advanceTimersByTime(500));
    expect(vibrate).toHaveBeenCalledTimes(1);
    result.current.onPointerUp(pointerEvent() as never);

    const breaking = encounterFixture({ initialTension: 995, maxTicks: 100 });
    breaking.id = "encounter-client-line-break";
    const lineBreak = renderRealtime(breaking);
    act(() => lineBreak.result.current.onPointerDown(pointerEvent() as never));
    act(() => vi.advanceTimersByTime(100));
    expect(vibrate).toHaveBeenCalledTimes(2);
    lineBreak.rerender();
    act(() => vi.advanceTimersByTime(500));
    expect(vibrate).toHaveBeenCalledTimes(2);
  });
});
