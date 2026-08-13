import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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
import {
  DangerousFishingView,
  dangerousFishingErrorMessage,
  dangerousFishingShortcut,
} from "./DangerousFishingView";
import type { DangerousFishingViewModel } from "./useDangerousFishing";

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

const handlers = {
  onStartVoyage: vi.fn(async () => true),
  onReturnVoyage: vi.fn(async () => true),
  onStartEncounter: vi.fn(async () => true),
  onAction: vi.fn(async () => true),
  onShop: vi.fn(async () => true),
  onStartBossAttempt: vi.fn(async () => true),
  onBossAction: vi.fn(async () => true),
  onClaimBossReward: vi.fn(async () => true),
};

describe("위험 해역 개인 화면", () => {
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

  it("준비 화면에 해역·수심·장비·미끼·낚시 코인 가격과 불투명 표면을 표시한다", () => {
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
    expect(html).toContain("파쇄 암초");
    expect(html).toContain("표층");
    expect(html).toContain("해역 입문 낚싯대");
    expect(html).toContain("순류 릴");
    expect(html).toContain("15,000");
    expect(html).toContain("무제한");
    expect(html).toContain("보유");
    expect(html).toContain("장착 중");
    expect(html).toContain("출항하기");
    expect(html).toContain("bg-white");
    expect(html).toContain("bg-zinc-50");
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
    expect(html).toContain("2개");
    expect(html).toContain("안전 귀환");
    expect(html).toContain("한 마리만 잡고도 돌아갈 수 있습니다");
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
              encounter: dangerousEncounterView(encounter),
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
    expect(html).toContain("장력 42 / 100");
    expect(html).toContain("다음 징후");
    expect(html).toContain("감아올리기");
    expect(html).toContain("줄 풀기");
    expect(html).toContain("버티기");
    expect(html).toContain("A");
    expect(html).toContain("S");
    expect(html).toContain("D");
    expect(html).toContain("sticky");
  });

  it("처리 중에는 중복 조작을 막고 API 오류를 행동 가능한 문장으로 바꾼다", () => {
    expect(dangerousFishingErrorMessage("out_of_bait")).toBe(
      "선택한 특수 미끼가 없습니다. 기본 미끼를 쓰거나 상점에서 보충하세요.",
    );
    expect(dangerousFishingErrorMessage("auto_active")).toContain("자동 채집");
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

  it("A/S/D 단축키는 입력창이 아닐 때만 각 조작으로 해석한다", () => {
    expect(dangerousFishingShortcut("a", false)).toBe("reel");
    expect(dangerousFishingShortcut("S", false)).toBe("give");
    expect(dangerousFishingShortcut("d", false)).toBe("brace");
    expect(dangerousFishingShortcut("a", true)).toBeNull();
    expect(dangerousFishingShortcut("Enter", false)).toBeNull();
  });
});
