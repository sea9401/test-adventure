import { describe, expect, it } from "vitest";
import {
  dangerousFishingActionFeedback,
  dangerousFishingBossClaimFeedback,
  dangerousFishingReturnFeedback,
} from "./dangerousFishingFeedback";
import type { DangerousEncounterView } from "./dangerousFishingEncounter";

const encounter: DangerousEncounterView = {
  id: "encounter-1",
  targetKind: "fish",
  targetId: "ironjaw_tuna",
  status: "active",
  tension: 42,
  maxTension: 100,
  stamina: 66,
  maxStamina: 66,
  distance: 58,
  startDistance: 58,
  slackTurns: 0,
  slackTolerance: 0,
  step: 0,
  revision: 0,
  nextActionAt: 0,
  expiresAt: 100_000,
  reelPowerBonus: 0,
  staminaDamageBonus: 0,
  tensionControlBonus: 0,
  behavior: "charge",
};

describe("dangerous fishing feedback", () => {
  it("describes a correct action with the encounter deltas", () => {
    expect(
      dangerousFishingActionFeedback({
        scope: "voyage",
        action: "give",
        before: encounter,
        targetName: "철턱 참치",
        response: {
          event: "progress",
          encounter: {
            ...encounter,
            tension: 20,
            stamina: 60,
            distance: 66,
            step: 1,
            revision: 1,
          },
        },
      }),
    ).toEqual({
      scope: "voyage",
      tone: "success",
      title: "정확한 대응 · 줄 풀기",
      detail: "장력 -22 · 어체력 -6 · 거리 +8",
      terminal: false,
    });
  });

  it("keeps catch and failure outcomes until the next attempt", () => {
    expect(
      dangerousFishingActionFeedback({
        scope: "voyage",
        action: "reel",
        before: encounter,
        targetName: "철턱 참치",
        response: {
          event: "caught",
          fish: { id: "ironjaw_tuna", name: "철턱 참치", sizeCm: 132 },
          fishingXpGained: 34,
          fishingCoinsGained: 8,
        },
      }),
    ).toEqual({
      scope: "voyage",
      tone: "success",
      title: "철턱 참치 132cm 어획 성공",
      detail: "낚시 경험치 +34 · 낚시 코인 +8 · 귀환 전 화물 +1",
      terminal: true,
    });

    const failures = [
      ["line_broken", "줄이 끊어져 철턱 참치를 놓쳤습니다."],
      ["hook_lost", "바늘이 빠져 철턱 참치를 놓쳤습니다."],
      ["timeout", "제한 시간이 지나 철턱 참치를 놓쳤습니다."],
    ] as const;
    for (const [event, title] of failures) {
      expect(
        dangerousFishingActionFeedback({
          scope: "voyage",
          action: "reel",
          before: encounter,
          targetName: "철턱 참치",
          response: { event },
        }),
      ).toMatchObject({ tone: "danger", title, terminal: true });
    }
  });

  it("explains confirmed cargo and incident returns", () => {
    expect(
      dangerousFishingReturnFeedback({
        returned: true,
        incident: false,
        lostValue: 0,
        returnFishingCoinsGained: 270,
        materials: { danger_catch_a: 2, danger_catch_b: 1 },
      }),
    ).toEqual({
      scope: "voyage",
      tone: "success",
      title: "안전 귀환 완료",
      detail:
        "어획물 3개를 확정하고 낚시 코인 +270을 받았습니다. 낚시 상점의 위험 해역 교환이나 거래소에서 사용할 수 있습니다.",
      terminal: true,
    });
    expect(
      dangerousFishingReturnFeedback({
        returned: true,
        incident: true,
        lostValue: 420,
        returnFishingCoinsGained: 53,
        materials: { danger_catch_a: 1 },
      }),
    ).toMatchObject({
      tone: "warning",
      title: "해상 사고로 강제 귀환",
      detail: expect.stringContaining("손실 가치 420"),
    });
    expect(
      dangerousFishingReturnFeedback({
        returned: true,
        incident: true,
        lostValue: 420,
        returnFishingCoinsGained: 53,
        materials: { danger_catch_a: 1 },
      })?.detail,
    ).toContain("낚시 코인 +53");
  });

  it("does not disguise a destructive return coin value as a zero reward", () => {
    const feedback = dangerousFishingReturnFeedback({
      returned: true,
      incident: false,
      returnFishingCoinsGained: -1,
      materials: {},
    });

    expect(feedback?.detail).toContain("낚시 코인 -1");
    expect(feedback?.detail).not.toContain("낚시 코인 +0");
  });

  it("explains boss contribution and claimed token uses", () => {
    expect(
      dangerousFishingActionFeedback({
        scope: "boss",
        action: "brace",
        before: { ...encounter, targetKind: "boss" },
        targetName: "해일의 거신",
        response: {
          event: "caught",
          contribution: 240,
          totalContribution: 480,
          defeated: false,
        },
      }),
    ).toEqual({
      scope: "boss",
      tone: "success",
      title: "개인 시도 성공 · 기여 +240",
      detail: "누적 기여 480 · 거대어 제압 후 보상을 받을 수 있습니다.",
      terminal: true,
    });

    expect(
      dangerousFishingBossClaimFeedback(
        {
          reward: { fishingCoins: 190, materialCount: 3 },
          materialId: "danger_boss_tidal_colossus",
        },
        "해일의 거신",
      ),
    ).toEqual({
      scope: "boss",
      tone: "success",
      title: "해일의 거신 보상 수령",
      detail:
        "낚시 코인 +190 · 거대어 증표 +3 · 전용 장비·미끼·칭호·꾸미기 교환에 사용할 수 있습니다.",
      terminal: true,
    });
  });
});
