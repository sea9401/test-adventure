// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DANGEROUS_BAITS,
  DANGEROUS_DEPTHS,
  DANGEROUS_FISH,
  DANGEROUS_LINES,
  DANGEROUS_REELS,
  DANGEROUS_RODS,
  DANGEROUS_ZONES,
} from "@/adventure/data/v2/dangerousFishing";
import { dangerousEncounterView } from "./dangerousFishingEncounter";
import { createDangerousEncounter } from "./dangerousFishingEncounter";
import { emptyDangerousFishingState } from "./dangerousFishingState";
import { createDangerousRealtimeState } from "./dangerousFishingRealtime";
import { dangerousRealtimeModifiers } from "./dangerousFishingRealtimeModifiers";
import {
  DangerousFishingView,
  dangerousFishingErrorMessage,
  dangerousFishingShortcut,
} from "./DangerousFishingView";
import type {
  DangerousFishingClientState,
  DangerousFishingViewModel,
} from "./useDangerousFishing";
import { useDangerousFishing } from "./useDangerousFishing";
import { DangerousFishingBossPanel } from "./DangerousFishingBossPanel";
import type { DangerousFishingBossViewModel } from "./DangerousFishingBossPanel";
import type { DangerousRealtimeClientEncounter } from "./useDangerousFishingRealtime";

function model(overrides: Partial<DangerousFishingViewModel> = {}): DangerousFishingViewModel {
  return {
    ok: true,
    now: 1_800_000_000_000,
    state: {
      ...emptyDangerousFishingState(),
      voyage: null,
      bossAttempt: null,
    },
    heritage: {
      unlocked: true,
      fishingLevel: 15,
      levelAssistPct: 0,
      highestFishingJobId: "fisher",
      lineage: {
        telegraphSteps: 1,
        targetReadingPct: 0,
        staminaBonusPct: 0,
        cargoProtectionPct: 0,
        deepTraceBonusPct: 0,
      },
      passives: {
        traceBonusPct: 0,
        targetReadingPct: 0,
        staminaBonusPct: 0,
        cargoProtectionPct: 0,
        sizeBonusPct: 0,
        deepTraceBonusPct: 0,
      },
    },
    fishingCoins: 150_000,
    activeAutoActivity: null,
    catalogs: {
      zones: DANGEROUS_ZONES,
      depths: DANGEROUS_DEPTHS,
      fish: DANGEROUS_FISH,
      rods: DANGEROUS_RODS,
      reels: DANGEROUS_REELS,
      lines: DANGEROUS_LINES,
      baits: DANGEROUS_BAITS,
    },
    riskPreview: { risk: 0, accidentChance: 0, maxLossFraction: 0 },
    ...overrides,
  };
}

function realtimeEncounter(): DangerousRealtimeClientEncounter {
  const startedAt = Date.now() - 1_000;
  const config: DangerousRealtimeClientEncounter["config"] = {
    seed: 23,
    risk: 1,
    targetKind: "fish",
    rarity: "common",
    behaviorPattern: ["turn", "charge"],
    initialTension: 500,
    maxTension: 1_000,
    initialStamina: 10_000,
    initialDistance: 10_000,
    maxTicks: 400,
    modifiers: dangerousRealtimeModifiers({
      fishingLevel: 15,
      baitId: "basic_bait",
    }),
  };
  const checkpoint = createDangerousRealtimeState(config);
  return {
    simulationVersion: 2,
    balanceRevision: 2,
    id: "realtime-restored",
    targetKind: "fish",
    targetId: "razor_sardine",
    config,
    checkpoint,
    approvedTick: 0,
    revision: 2,
    startedAt,
    expiresAt: startedAt + 20_000,
  };
}

const handlers = {
  onStartVoyage: vi.fn(async () => true),
  onReturnVoyage: vi.fn(async () => true),
  onStartEncounter: vi.fn(async () => true),
  onAction: vi.fn(async () => true),
  onOpenShop: vi.fn(),
  onStartBossAttempt: vi.fn(async () => true),
  onBossAction: vi.fn(async () => true),
  onClaimBossReward: vi.fn(async () => true),
  readJson: (response: Response) => response.json(),
  onRealtimeFinish: vi.fn(),
};

const clientStateOmitsCompletionJournal: "realtimeCompletions" extends keyof DangerousFishingClientState
  ? false
  : true = true;

function activeBossModel(
  attempt: DangerousFishingBossViewModel["attempt"] = null,
): DangerousFishingBossViewModel {
  return {
    ok: true,
    now: 1_800_000_000_000,
    event: {
      id: "event-client",
      bossId: "tidal_colossus",
      name: "해일의 거신",
      stamina: 18_000,
      maxStamina: 18_000,
      status: "active",
      spawnedAt: 1_799_999_000_000,
      expiresAt: 1_800_100_000_000,
      defeatedAt: null,
      isDiscoverer: false,
      isLastHaul: false,
    },
    contribution: null,
    attempt,
    realtimeAttempt: null,
    eligible: false,
    claimed: false,
    rewardPreview: null,
  };
}

function installFishingApi(
  status: DangerousFishingViewModel,
  boss: DangerousFishingBossViewModel,
) {
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "POST") return Response.json({ ok: true });
      if (path === "/api/v2/dangerous-fishing/status") {
        return Response.json(status);
      }
      if (path === "/api/v2/dangerous-fishing/boss") {
        return Response.json(boss);
      }
      throw new Error(`Unexpected request: ${path}`);
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function postBodies(fetcher: ReturnType<typeof vi.fn>) {
  return fetcher.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("위험 해역 시작 요청 선택", () => {
  it("조우 시작 뒤 늦게 끝난 이전 상태 조회가 낚시터 선택 화면으로 되돌리지 않는다", async () => {
    const state = emptyDangerousFishingState();
    const encounter = realtimeEncounter();
    const voyage = {
      id: "voyage-race",
      zoneId: "shattered_reef" as const,
      depthId: "surface" as const,
      risk: 1,
      startedAt: 1_800_000_000_000,
      cargo: [],
      encounter: null,
    };
    const before = model({
      state: {
        ...state,
        baitCounts: { reef_bait: 2 },
        voyage,
        bossAttempt: null,
      },
    });
    const started = model({
      state: {
        ...state,
        baitCounts: { reef_bait: 1 },
        voyage: { ...voyage, encounter },
        bossAttempt: null,
      },
    });
    const staleStatus = deferred<Response>();
    let statusRequests = 0;
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (init?.method === "POST") {
          return Response.json({
            ok: true,
            state: started.state,
            encounter,
          });
        }
        if (path === "/api/v2/dangerous-fishing/status") {
          statusRequests += 1;
          if (statusRequests === 1) return Response.json(before);
          if (statusRequests === 2) return staleStatus.promise;
          return Response.json(started);
        }
        if (path === "/api/v2/dangerous-fishing/boss") {
          return Response.json(activeBossModel());
        }
        throw new Error(`Unexpected request: ${path}`);
      },
    );
    vi.stubGlobal("fetch", fetcher);
    const hook = renderHook(() => useDangerousFishing());
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    let olderRefresh: Promise<boolean> | undefined;
    act(() => {
      olderRefresh = hook.result.current.refresh();
    });
    await waitFor(() => expect(statusRequests).toBe(2));

    await act(async () => {
      await hook.result.current.startEncounter("reef_bait");
    });
    expect(hook.result.current.model?.state.voyage?.encounter?.id).toBe(
      encounter.id,
    );

    await act(async () => {
      staleStatus.resolve(Response.json(before));
      await olderRefresh;
    });

    expect(hook.result.current.model?.state.voyage?.encounter?.id).toBe(
      encounter.id,
    );
    expect(hook.result.current.model?.state.baitCounts.reef_bait).toBe(1);
  });

  it("새 일반 조우와 거대어 시도는 선택한 미끼·이벤트를 start_realtime으로 보낸다", async () => {
    const state = emptyDangerousFishingState();
    const status = model({
      state: {
        ...state,
        loadout: { ...state.loadout, baitId: "reef_bait" },
        baitCounts: { reef_bait: 2 },
        voyage: null,
        bossAttempt: null,
      },
    });
    const fetcher = installFishingApi(status, activeBossModel());
    const hook = renderHook(() => useDangerousFishing());
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    await act(async () => {
      await hook.result.current.startEncounter("blood_bait");
      await hook.result.current.startBossAttempt("event-client");
    });

    expect(postBodies(fetcher)).toEqual([
      { action: "start_realtime", baitId: "blood_bait" },
      {
        action: "start_realtime",
        eventId: "event-client",
        baitId: "reef_bait",
      },
    ]);
  });

  it("저장된 v1 일반·거대어 조우는 기존 세 동작 요청을 그대로 보낸다", async () => {
    const state = emptyDangerousFishingState();
    const legacyEncounter = {
      ...dangerousEncounterView(createDangerousEncounter({
        id: "legacy-voyage",
        targetKind: "fish",
        target: DANGEROUS_FISH.ironjaw_tuna,
        rod: DANGEROUS_RODS.starter_rod,
        reel: DANGEROUS_REELS.starter_reel,
        line: DANGEROUS_LINES.starter_line,
        startedAt: 1_800_000_000_000,
        patternSeed: 3,
        assistance: { telegraphSteps: 1 },
      })),
      simulationVersion: 1 as const,
    };
    const status = model({
      state: {
        ...state,
        voyage: {
          id: "legacy-voyage-session",
          zoneId: "shattered_reef",
          depthId: "surface",
          risk: 1,
          startedAt: 1_800_000_000_000,
          cargo: [],
          encounter: legacyEncounter,
        },
        bossAttempt: null,
      },
    });
    const legacyBossEncounter = {
      ...legacyEncounter,
      id: "legacy-boss",
      targetKind: "boss" as const,
      targetId: "tidal_colossus",
    };
    const fetcher = installFishingApi(
      status,
      activeBossModel({
        eventId: "event-client",
        encounter: legacyBossEncounter,
      }),
    );
    const hook = renderHook(() => useDangerousFishing());
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    await act(async () => {
      await hook.result.current.act(
        "brace",
        legacyEncounter.id,
        legacyEncounter.revision,
      );
      await hook.result.current.actOnBoss(
        "give",
        "event-client",
        legacyBossEncounter.id,
        legacyBossEncounter.revision,
      );
    });

    expect(postBodies(fetcher)).toEqual([
      {
        action: "brace",
        encounterId: "legacy-voyage",
        revision: legacyEncounter.revision,
      },
      {
        action: "give",
        eventId: "event-client",
        encounterId: "legacy-boss",
        revision: legacyBossEncounter.revision,
      },
    ]);
  });

});

describe("위험 해역 개인 화면", () => {
  it("공개 클라이언트 상태 계약은 서버 completion journal을 포함하지 않는다", () => {
    expect(clientStateOmitsCompletionJournal).toBe(true);
  });
  it("첫 이용자가 출항부터 안전 귀환까지 필요한 핵심 규칙을 한곳에서 확인한다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingView
        model={model()}
        boss={null}
        loading={false}
        busy={null}
        error={null}
        {...handlers}
      />,
    );

    expect(html).toContain("처음 이용하시나요?");
    expect(html).toContain("돌진 → 줄 풀기");
    expect(html).toContain("몸부림·잠수 → 버티기");
    expect(html).toContain("급선회 → 감아올리기");
    expect(html).toContain("어체력과 거리를 모두 0");
    expect(html).toContain("안전 귀환해야");
    expect(html).toContain("위험 해역에서 얻는 것");
    expect(html).toContain("경험치·코인·도감");
    expect(html).toContain("상점 교환·거래소");
    expect(html).toContain("거대어 증표");
    expect(html).toContain("위험 해역 교환 보기");
  });

  it("조우 종료 결과를 다음 시도 전까지 안내한다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingView
        model={model()}
        boss={null}
        loading={false}
        busy={null}
        error={null}
        feedback={{
          scope: "voyage",
          tone: "success",
          title: "철턱 참치 132cm 어획 성공",
          detail: "낚시 경험치 +34 · 낚시 코인 +8 · 귀환 전 화물 +1",
          terminal: true,
        }}
        {...handlers}
      />,
    );

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("철턱 참치 132cm 어획 성공");
    expect(html).toContain("낚시 경험치 +34");
  });

  it("낚시 레벨 15 미만에는 해금 조건과 기존 낚시 성장 경로를 안내한다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingView
        model={model({
          heritage: {
            ...model().heritage,
            unlocked: false,
            fishingLevel: 14,
          },
        })}
        boss={null}
        loading={false}
        busy={null}
        error={null}
        {...handlers}
      />,
    );
    expect(html).toContain("낚시 레벨 15");
    expect(html).toContain("현재 14레벨");
    expect(html).toContain("기존 낚시");
    expect(html).not.toContain("출항하기");
  });

  it("출항·거대어 탭을 나누고 준비 화면에 해역 이미지·잠금 상태·현재 장비·상점 이동을 표시한다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingView
        model={model()}
        boss={null}
        loading={false}
        busy={null}
        error={null}
        {...handlers}
      />,
    );
    expect(html).toContain("출항");
    expect(html).toContain("거대어");
    expect(html).toContain("파쇄 암초");
    expect(html).toContain("dangerous-fishing-shattered-reef.webp");
    expect(html).toContain("낚시 Lv 25 필요");
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("표층");
    expect(html).toContain("현재 장비");
    expect(html).toContain("해역 입문 낚싯대");
    expect(html).toContain("입문 릴");
    expect(html).toContain("위험 해역 장비 상점");
    expect(html).toContain("출항하기");
    expect(html).toContain("bg-white");
    expect(html).toContain("bg-zinc-50");
    expect(html).not.toContain("15,000");
    expect(html).not.toContain(">구매<");
    expect(html).not.toContain("현재 포착된 거대어가 없습니다");
    expect(html).not.toMatch(/bg-[^" ]+\/40/);
    expect(html).not.toMatch(/bg-[^" ]+\/70/);
  });

  it("항해 중에는 위험도·사고 상한·화물과 안전 귀환을 보여준다", () => {
    const state = emptyDangerousFishingState();
    const html = renderToStaticMarkup(
      <DangerousFishingView
        model={model({
          state: {
            ...state,
            bossAttempt: null,
            voyage: {
              id: "voyage-1",
              zoneId: "storm_trench",
              depthId: "midwater",
              risk: 4,
              startedAt: 1_799_999_000_000,
              encounter: null,
              cargo: [
                {
                  fishId: "ironjaw_tuna",
                  materialId: "danger_catch_ironjaw_tuna",
                  quantity: 2,
                  totalValue: 420,
                },
              ],
            },
          },
          riskPreview: {
            risk: 4,
            accidentChance: 0.22,
            maxLossFraction: 0.35,
          },
        })}
        boss={null}
        loading={false}
        busy={null}
        error={null}
        {...handlers}
      />,
    );
    expect(html).toContain("위험도 4");
    expect(html).toContain("사고 확률 22%");
    expect(html).toContain("최대 손실 35%");
    expect(html).toContain("철턱 참치");
    expect(html).toContain("dangerous-fishing-storm-trench.webp");
    expect(html).toContain("ironjaw_tuna.webp");
    expect(html).toContain("총 2개");
    expect(html).toContain("상점 교환이나 거래소에서 사용");
    expect(html).toContain("안전 귀환");
    expect(html).toContain("한 마리만 잡고도 돌아갈 수 있습니다");
    expect(html).toContain("낚시 상점의 위험 해역 교환");
    expect(html).toContain("교환 보기");
    expect(html).toContain("다른 수심을 선호하는 어종도 낮은 확률로 출현");
    expect(html).toContain("전설 어종 출현 가중치 +100%");
    expect(html).toContain("시작 어체력 10% 감소");
    expect(html).toContain("모든 행동 장력 충격 12% 감소");
  });

  it("항해 중에는 거대어 개인 시도를 막고 먼저 귀환하라고 안내한다", () => {
    const state = emptyDangerousFishingState();
    render(
      <DangerousFishingView
        model={model({
          state: {
            ...state,
            bossAttempt: null,
            voyage: {
              id: "voyage-1",
              zoneId: "storm_trench",
              depthId: "midwater",
              risk: 4,
              startedAt: 1_799_999_000_000,
              encounter: null,
              cargo: [],
            },
          },
        })}
        boss={activeBossModel()}
        loading={false}
        busy={null}
        error={null}
        {...handlers}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /거대어/ }));

    const startButton = screen.getByRole("button", { name: "개인 시도 시작" });
    expect((startButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/항해를 마치고 귀환한 뒤/)).toBeDefined();
  });

  it("복원된 v2 조우는 legacy 설명 없이 한 개의 hold 조작과 접근 가능한 HUD를 렌더링한다", () => {
    const state = emptyDangerousFishingState();
    const html = renderToStaticMarkup(
      <DangerousFishingView
        model={model({
          state: {
            ...state,
            bossAttempt: null,
            voyage: {
              id: "voyage-realtime",
              zoneId: "shattered_reef",
              depthId: "surface",
              risk: 1,
              startedAt: 1_800_000_000_000,
              cargo: [],
              encounter: realtimeEncounter(),
            },
          },
        })}
        boss={null}
        loading={false}
        busy={null}
        error={null}
        {...handlers}
      />,
    );

    expect((html.match(/aria-label="누르고 감아올리기"/g) ?? []).length).toBe(1);
    expect(html).toContain("낚싯줄 장력");
    expect(html).toContain("어체력");
    expect(html).toContain("남은 거리");
    expect(html).toContain("남은 시간");
    expect(html).toContain('role="meter"');
    expect(html).toContain("bg-zinc-50");
    expect(html).not.toContain('aria-label="위험 해역 조우"');
    expect(html).not.toContain("추천");
    expect(html).not.toContain("현재 행동");
    expect(html).not.toContain("dangerous-fishing-shattered-reef.webp");
    expect((html.match(/<img /g) ?? []).length).toBe(0);
  });

  it("거대어 증표 보상에서 장비·칭호·꾸미기 교환 사용처를 안내한다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingBossPanel
        model={{
          ok: true,
          now: 1_800_000_000_000,
          event: {
            id: "boss-1",
            bossId: "tidal_colossus",
            name: "해일의 거신",
            stamina: 0,
            maxStamina: 10_000,
            status: "defeated",
            spawnedAt: 1_799_900_000_000,
            expiresAt: 1_800_100_000_000,
            defeatedAt: 1_800_000_000_000,
            isDiscoverer: false,
            isLastHaul: false,
          },
          contribution: {
            totalContribution: 500,
            successfulAttempts: 1,
            rewardClaimedAt: null,
          },
          attempt: null,
          realtimeAttempt: null,
          eligible: true,
          claimed: false,
          rewardPreview: {
            tier: "gold",
            fishingCoins: 190,
            materialCount: 3,
            discovererBonus: false,
          },
        }}
        busy={false}
        onStart={vi.fn(async () => true)}
        onAction={vi.fn(async () => true)}
        onClaim={vi.fn(async () => true)}
        onOpenShop={vi.fn()}
        readJson={handlers.readJson}
        onRealtimeFinish={handlers.onRealtimeFinish}
      />,
    );
    expect(html).toContain("최상급 장비");
    expect(html).toContain("칭호·영구 프로필 테두리");
    expect(html).toContain("교환 보기");
  });

  it("복원된 조우에는 장력 숫자·행동 설명과 세 개의 큰 조작 버튼을 표시한다", () => {
    const state = emptyDangerousFishingState();
    const encounter = createDangerousEncounter({
      id: "encounter-1",
      targetKind: "fish",
      target: DANGEROUS_FISH.ironjaw_tuna,
      rod: DANGEROUS_RODS.starter_rod,
      reel: DANGEROUS_REELS.starter_reel,
      line: DANGEROUS_LINES.starter_line,
      startedAt: 1_800_000_000_000,
      patternSeed: 3,
      assistance: { telegraphSteps: 1 },
    });
    const html = renderToStaticMarkup(
      <DangerousFishingView
        model={model({
          state: {
            ...state,
            bossAttempt: null,
            voyage: {
              id: "voyage-1",
              zoneId: "shattered_reef",
              depthId: "midwater",
              risk: 1,
              startedAt: 1_800_000_000_000,
              cargo: [],
              encounter: {
                ...dangerousEncounterView(encounter),
                tension: 90,
              },
            },
          },
        })}
        boss={null}
        loading={false}
        busy={null}
        error={null}
        {...handlers}
      />,
    );
    expect(html).toContain("장력 90 / 100");
    expect(html).toContain("dangerous-fishing-shattered-reef.webp");
    expect(html).toContain("ironjaw_tuna.webp");
    expect(html).toContain("다음 징후");
    expect(html).toContain("감아올리기");
    expect(html).toContain("줄 풀기");
    expect(html).toContain("버티기");
    expect(html).toContain("A");
    expect(html).toContain("S");
    expect(html).toContain("D");
    expect(html).toContain("sticky");
    expect(html).toContain("추천");
    expect(html).toContain("줄이 끊어질 위험");
    expect(html).toContain("transition-[width]");
    expect(html).not.toContain("누르고 감아올리기");
  });

  it("처리 중에는 중복 조작을 막고 API 오류를 행동 가능한 문장으로 바꾼다", () => {
    expect(dangerousFishingErrorMessage("out_of_bait")).toBe(
      "선택한 특수 미끼가 없습니다. 기본 미끼를 쓰거나 상점에서 보충하세요.",
    );
    expect(dangerousFishingErrorMessage("auto_active")).toContain("자동 채집");
    expect(dangerousFishingErrorMessage("voyage_active")).toContain(
      "항해를 마치고 귀환한 뒤",
    );
    expect(dangerousFishingErrorMessage("network")).toContain("다시 시도");
    const html = renderToStaticMarkup(
      <DangerousFishingView
        model={model()}
        boss={null}
        loading={false}
        busy="voyage"
        error="network"
        {...handlers}
      />,
    );
    expect(html).toContain("disabled");
    expect(html).toContain("다시 시도");
  });

  it("사람 확인이 필요하면 확인창을 표시하고 포괄 오류 문구와 조작을 숨긴다", () => {
    const html = renderToStaticMarkup(
      <DangerousFishingView
        model={model()}
        boss={null}
        loading={false}
        busy={null}
        error="human_verification_required"
        verification={{
          activity: "fishing",
          siteKey: "turnstile-site-key",
          captchaSiteKey: null,
          reason: "volume",
          manualTest: true,
        }}
        verifyHuman={vi.fn(async () => true)}
        {...handlers}
      />,
    );

    expect(html).toContain("잠시 사람 확인이 필요합니다");
    expect(html).not.toContain(
      "요청을 처리하지 못했습니다. 상태를 확인하고 다시 시도해 주세요.",
    );
    expect(html).toContain("disabled");
  });

  it("A/S/D 단축키는 입력창이 아닐 때만 각 조작으로 해석한다", () => {
    expect(dangerousFishingShortcut("a", false)).toBe("reel");
    expect(dangerousFishingShortcut("S", false)).toBe("give");
    expect(dangerousFishingShortcut("d", false)).toBe("brace");
    expect(dangerousFishingShortcut("a", true)).toBeNull();
    expect(dangerousFishingShortcut("Enter", false)).toBeNull();
  });
});
