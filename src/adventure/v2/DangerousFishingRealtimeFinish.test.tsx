// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from "@testing-library/react";
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
import { DangerousFishingBossPanel } from "./DangerousFishingBossPanel";
import type { DangerousFishingBossViewModel } from "./DangerousFishingBossPanel";
import { DangerousFishingView } from "./DangerousFishingView";
import { createDangerousRealtimeState } from "./dangerousFishingRealtime";
import { dangerousRealtimeModifiers } from "./dangerousFishingRealtimeModifiers";
import { emptyDangerousFishingState } from "./dangerousFishingState";
import { useDangerousFishing } from "./useDangerousFishing";
import type {
  DangerousFishingViewModel,
} from "./useDangerousFishing";
import type { DangerousRealtimeClientEncounter } from "./useDangerousFishingRealtime";

const NOW = 1_800_000_000_000;

function realtimeEncounter(
  targetKind: "fish" | "boss",
): DangerousRealtimeClientEncounter {
  const boss = targetKind === "boss";
  const config: DangerousRealtimeClientEncounter["config"] = {
    seed: 47,
    risk: boss ? 5 : 1,
    targetKind,
    rarity: boss ? "boss" : "common",
    behaviorPattern: ["turn", "charge", "thrash", "dive"],
    initialTension: 500,
    maxTension: 1_000,
    initialStamina: boss ? 12_000 : 10_000,
    initialDistance: boss ? 12_000 : 10_000,
    maxTicks: 400,
    modifiers: dangerousRealtimeModifiers({
      fishingLevel: 50,
      baitId: "basic_bait",
    }),
  };
  const checkpoint = {
    ...createDangerousRealtimeState(config),
    status: "caught" as const,
    stamina: 0,
    distance: 0,
  };
  return {
    simulationVersion: 2,
    balanceRevision: 2,
    id: boss ? "boss-finish-active" : "voyage-finish-active",
    targetKind,
    targetId: boss ? "tidal_colossus" : "razor_sardine",
    config,
    checkpoint,
    approvedTick: 0,
    revision: 0,
    startedAt: NOW,
    expiresAt: NOW + 20_000,
  };
}

function statusModel(
  encounter: DangerousRealtimeClientEncounter | null,
): DangerousFishingViewModel {
  const state = emptyDangerousFishingState();
  return {
    ok: true,
    now: NOW,
    state: {
      ...state,
      bossAttempt: null,
      voyage: encounter
        ? {
            id: "voyage-finish",
            zoneId: "shattered_reef",
            depthId: "surface",
            risk: 1,
            startedAt: NOW,
            cargo: [],
            encounter,
          }
        : null,
    },
    heritage: {
      unlocked: true,
      fishingLevel: 50,
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
    fishingCoins: 0,
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
    riskPreview: { risk: 1, accidentChance: 0, maxLossFraction: 0 },
  };
}

function bossModel(
  encounter: DangerousRealtimeClientEncounter | null,
): DangerousFishingBossViewModel {
  return {
    ok: true,
    now: NOW,
    event: encounter
      ? {
          id: "event-finish",
          bossId: "tidal_colossus",
          name: "해일의 거신",
          stamina: 12_000,
          maxStamina: 18_000,
          status: "active",
          spawnedAt: NOW - 1_000,
          expiresAt: NOW + 60_000,
          defeatedAt: null,
          isDiscoverer: false,
          isLastHaul: false,
        }
      : null,
    contribution: encounter
      ? {
          totalContribution: 240,
          successfulAttempts: 1,
          rewardClaimedAt: null,
        }
      : null,
    attempt: null,
    realtimeAttempt: encounter
      ? { eventId: "event-finish", encounter }
      : null,
    eligible: true,
    claimed: false,
    rewardPreview: null,
    pendingReward: null,
  };
}

function installInitialModelsThenFail(
  status: DangerousFishingViewModel,
  boss: DangerousFishingBossViewModel,
) {
  let statusReads = 0;
  let bossReads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/v2/dangerous-fishing/status") {
        statusReads += 1;
        if (statusReads === 1) return Response.json(status);
        throw new TypeError("refresh failed");
      }
      if (path === "/api/v2/dangerous-fishing/boss") {
        bossReads += 1;
        if (bossReads === 1) return Response.json(boss);
        throw new TypeError("refresh failed");
      }
      throw new Error(`Unexpected request: ${path}`);
    }),
  );
}

const handlers = {
  onStartVoyage: vi.fn(async () => true),
  onReturnVoyage: vi.fn(async () => true),
  onStartEncounter: vi.fn(async () => true),
  onAction: vi.fn(async () => true),
  onStartBossAttempt: vi.fn(async () => true),
  onBossAction: vi.fn(async () => true),
  onClaimBossReward: vi.fn(async () => true),
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("실시간 조우 finish 결과 bridge", () => {
  it("voyage finish 승인 뒤 refresh가 실패해도 active v2 패널에 상세 보상을 한 번 표시한다", async () => {
    const encounter = realtimeEncounter("fish");
    installInitialModelsThenFail(statusModel(encounter), bossModel(null));
    const hook = renderHook(() => useDangerousFishing());
    await waitFor(() => expect(hook.result.current.model).not.toBeNull());

    hook.result.current.handleRealtimeFinish("voyage", {
      ok: true,
      event: "caught",
      fish: { name: "칼날 정어리", sizeCm: 88 },
      fishingXpGained: 34,
      fishingCoinsGained: 8,
    });
    await waitFor(() => expect(hook.result.current.error).toBe("refresh failed"));

    const html = renderToStaticMarkup(
      <DangerousFishingView
        model={hook.result.current.model}
        boss={hook.result.current.boss}
        loading={false}
        busy={null}
        error={hook.result.current.error}
        feedback={hook.result.current.feedback}
        verification={hook.result.current.verification}
        readJson={hook.result.current.readJson}
        onRealtimeFinish={hook.result.current.handleRealtimeFinish}
        {...handlers}
      />,
    );

    expect((html.match(/칼날 정어리 88cm 어획 성공/g) ?? []).length).toBe(1);
    expect(html).toContain("낚시 경험치 +34 · 낚시 코인 +8 · 귀환 전 화물 +1");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="실시간 위험 해역 조우"');
    expect(html).not.toContain("서버 확인 대기");
    expect(html).not.toContain("서버 확인 완료");
  });

  it("boss finish 승인 뒤 refresh가 실패해도 공용 기여 문맥과 상세 결과를 한 번 표시한다", async () => {
    const encounter = realtimeEncounter("boss");
    installInitialModelsThenFail(statusModel(null), bossModel(encounter));
    const hook = renderHook(() => useDangerousFishing());
    await waitFor(() => expect(hook.result.current.boss).not.toBeNull());

    hook.result.current.handleRealtimeFinish("boss", {
      ok: true,
      event: "caught",
      contribution: 240,
      totalContribution: 480,
      defeated: false,
    });
    await waitFor(() => expect(hook.result.current.error).toBe("refresh failed"));

    const html = renderToStaticMarkup(
      <DangerousFishingBossPanel
        model={hook.result.current.boss}
        busy={false}
        feedback={hook.result.current.feedback}
        onStart={handlers.onStartBossAttempt}
        onAction={handlers.onBossAction}
        onClaim={handlers.onClaimBossReward}
        readJson={hook.result.current.readJson}
        onRealtimeFinish={(response) =>
          hook.result.current.handleRealtimeFinish("boss", response)
        }
      />,
    );

    expect(html).toContain("공용 제압 현황");
    expect(html).toContain("내 누적 기여 240");
    expect((html.match(/개인 시도 성공 · 기여 \+240/g) ?? []).length).toBe(1);
    expect(html).toContain("누적 기여 480 · 거대어 제압 후 보상을 받을 수 있습니다.");
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("서버 확인 대기");
    expect(html).not.toContain("서버 확인 완료");
  });
});
