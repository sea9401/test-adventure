import { describe, expect, it } from "vitest";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { farmingLevelXpThreshold } from "./farm";
import {
  addLifeMajorXp,
  assignLifeMajors,
  LIFE_MAJOR_ACTIVITIES,
  LIFE_MAJOR_CHANGE_COOLDOWN_MS,
  LIFE_MAJOR_PRODUCT_ID,
  lifeMajorBonusPct,
  lifeMajorCanCraft,
  signatureIngredientFor,
  lifeMajorProductChancePct,
  lifeMajorStageForXp,
  lifeMajorStageXp,
  lifeMajorT100,
  lifeXpOverflow,
  parseLifeMajorState,
  type LifeMajorActivity,
  type LifeMajorState,
} from "./lifeMajor";

const ALL_100: Record<LifeMajorActivity, number> = {
  farming: 100,
  woodcutting: 100,
  mining: 100,
  fishing: 100,
  cooking: 100,
};
const NOW = Date.parse("2026-10-10T12:00:00+09:00");
const DAY = 86_400_000;

function state(overrides: Partial<LifeMajorState> = {}): LifeMajorState {
  return { ...parseLifeMajorState(null), ...overrides };
}

describe("명장 단계 곡선", () => {
  it("10단계 누적은 생활별 Lv.100 누적 경험치와 같다", () => {
    expect(lifeMajorT100("farming")).toBe(farmingLevelXpThreshold(100));
    for (const activity of LIFE_MAJOR_ACTIVITIES) {
      expect(lifeMajorStageXp(activity, 10)).toBe(lifeMajorT100(activity));
      expect(lifeMajorStageXp(activity, 0)).toBe(0);
    }
  });

  it("단계 요구량은 단조 증가하고 단계당 증가폭도 커진다", () => {
    const steps = Array.from({ length: 10 }, (_, index) =>
      lifeMajorStageXp("mining", index + 1) - lifeMajorStageXp("mining", index),
    );
    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index]).toBeGreaterThan(steps[index - 1]);
    }
  });

  it("경험치로 단계와 진행도를 계산한다", () => {
    const m3 = lifeMajorStageXp("fishing", 3);
    expect(lifeMajorStageForXp("fishing", m3)).toMatchObject({ stage: 3, xpInto: 0, capped: false });
    expect(lifeMajorStageForXp("fishing", m3 - 1).stage).toBe(2);
    expect(lifeMajorStageForXp("fishing", 10 ** 12)).toMatchObject({ stage: 10, capped: true, xpForNext: 0 });
  });
});

describe("전공 효과", () => {
  const xp3 = lifeMajorStageXp("woodcutting", 3);
  const s = state({
    major: "woodcutting",
    minor: "fishing",
    masteryXp: { woodcutting: xp3, fishing: lifeMajorStageXp("fishing", 3), mining: lifeMajorStageXp("mining", 9) },
  });

  it("주전공은 단계당 1, 부전공은 0.5, 비전공은 0", () => {
    expect(lifeMajorBonusPct(s, "woodcutting")).toBe(3);
    expect(lifeMajorBonusPct(s, "fishing")).toBe(1.5);
    expect(lifeMajorBonusPct(s, "mining")).toBe(0);
  });

  it("산물 확률은 주 0.5+0.15×단계, 부전공 절반, 요리·비전공 0", () => {
    expect(lifeMajorProductChancePct(s, "woodcutting")).toBeCloseTo(0.95);
    expect(lifeMajorProductChancePct(s, "fishing")).toBeCloseTo(0.475);
    expect(lifeMajorProductChancePct(s, "mining")).toBe(0);
    expect(lifeMajorProductChancePct(state({ major: "cooking" }), "cooking")).toBe(0);
    expect(lifeMajorProductChancePct(state({ major: "farming" }), "farming")).toBeCloseTo(0.5);
  });

  it("산물 재료 4종을 거래 가능한 재료 카탈로그에 등록한다", () => {
    expect(Object.keys(LIFE_MAJOR_PRODUCT_ID).sort()).toEqual(["farming", "fishing", "mining", "woodcutting"]);
    for (const id of Object.values(LIFE_MAJOR_PRODUCT_ID)) {
      expect(V2_MATERIALS[id]?.name).toMatch(/^명장 /);
    }
  });
});

describe("넘친 경험치와 적립", () => {
  it("상한을 걸쳐 넘은 부분만 넘침으로 센다", () => {
    expect(lifeXpOverflow({ gained: 10, before: 100, after: 110 })).toBe(0);
    expect(lifeXpOverflow({ gained: 10, before: 100, after: 105 })).toBe(5);
    expect(lifeXpOverflow({ gained: 10, before: 100, after: 100 })).toBe(10);
    expect(lifeXpOverflow({ gained: 0, before: 100, after: 100 })).toBe(0);
  });

  it("전공일 때만 적립하고 10단계에서 멈춘다", () => {
    const base = state({ major: "mining" });
    expect(addLifeMajorXp(base, "farming", 50)).toEqual({ state: base, gained: 0 });
    const added = addLifeMajorXp(base, "mining", 50);
    expect(added.gained).toBe(50);
    expect(added.state.masteryXp.mining).toBe(50);
    const cap = lifeMajorStageXp("mining", 10);
    const nearCap = state({ major: "mining", masteryXp: { mining: cap - 3 } });
    expect(addLifeMajorXp(nearCap, "mining", 10)).toMatchObject({ gained: 3, state: { masteryXp: { mining: cap } } });
  });
});

describe("전공 지정과 변경", () => {
  it("처음 지정은 무료이고 변경 시각을 남기지 않는다", () => {
    const result = assignLifeMajors(state(), { major: "farming", minor: "fishing" }, ALL_100, NOW);
    expect(result).toEqual({ state: expect.objectContaining({ major: "farming", minor: "fishing", lastChangedAt: null }) });
  });

  it("Lv.100 미만·같은 생활·주전공 없는 부전공·알 수 없는 생활을 거절한다", () => {
    expect(assignLifeMajors(state(), { major: "farming", minor: null }, { ...ALL_100, farming: 99 }, NOW)).toEqual({ error: "not_level_100" });
    expect(assignLifeMajors(state(), { major: "farming", minor: "farming" }, ALL_100, NOW)).toEqual({ error: "same_activity" });
    expect(assignLifeMajors(state(), { major: null, minor: "farming" }, ALL_100, NOW)).toEqual({ error: "major_required" });
    expect(assignLifeMajors(state(), { major: "smithing" as LifeMajorActivity, minor: null }, ALL_100, NOW)).toEqual({ error: "invalid_activity" });
  });

  it("부전공을 처음 채우는 것은 쿨다운과 무관하다", () => {
    const current = state({ major: "farming", lastChangedAt: NOW - DAY });
    const result = assignLifeMajors(current, { major: "farming", minor: "mining" }, ALL_100, NOW);
    expect(result).toEqual({ state: expect.objectContaining({ minor: "mining", lastChangedAt: NOW - DAY }) });
  });

  it("변경·맞바꿈·해제는 30일 쿨다운을 따른다", () => {
    const current = state({ major: "farming", minor: "fishing", lastChangedAt: null });
    const changed = assignLifeMajors(current, { major: "mining", minor: "fishing" }, ALL_100, NOW);
    expect(changed).toEqual({ state: expect.objectContaining({ major: "mining", lastChangedAt: NOW }) });
    if ("error" in changed) return;

    const day29 = NOW + 29 * DAY;
    expect(assignLifeMajors(changed.state, { major: "fishing", minor: "mining" }, ALL_100, day29)).toEqual({ error: "change_cooldown" });
    expect(assignLifeMajors(changed.state, { major: "mining", minor: null }, ALL_100, day29)).toEqual({ error: "change_cooldown" });
    const day30 = NOW + LIFE_MAJOR_CHANGE_COOLDOWN_MS;
    expect(assignLifeMajors(changed.state, { major: "fishing", minor: "mining" }, ALL_100, day30)).toEqual({
      state: expect.objectContaining({ major: "fishing", minor: "mining", lastChangedAt: day30 }),
    });
  });

  it("같은 값으로 다시 저장하면 변경으로 치지 않는다", () => {
    const current = state({ major: "farming", minor: "fishing", lastChangedAt: NOW - DAY });
    expect(assignLifeMajors(current, { major: "farming", minor: "fishing" }, ALL_100, NOW)).toEqual({ state: current });
  });

  it("명장 경험치는 전공에서 빠져도 보존된다", () => {
    const current = state({ major: "farming", masteryXp: { farming: 500 } });
    const result = assignLifeMajors(current, { major: "mining", minor: null }, ALL_100, NOW);
    if ("error" in result) throw new Error(result.error);
    expect(result.state.masteryXp.farming).toBe(500);
  });
});

describe("세이브 파싱", () => {
  it("손상된 값을 정리하고 알 수 없는 생활을 버린다", () => {
    expect(
      parseLifeMajorState({
        major: "fishing",
        minor: "smithing",
        lastChangedAt: "x",
        masteryXp: { fishing: 12.7, mining: -3, smithing: 50 },
        masterProductsEarned: { fishing: 2 },
      }),
    ).toEqual({
      version: 1,
      major: "fishing",
      minor: null,
      lastChangedAt: null,
      masteryXp: { fishing: 12 },
      masterProductsEarned: { fishing: 2 },
    });
  });

  it("주전공과 같은 부전공은 버린다", () => {
    expect(parseLifeMajorState({ major: "mining", minor: "mining" }).minor).toBeNull();
  });
});

describe("명장 제작 조건", () => {
  it("주전공 3단계 이상만 제작할 수 있고 부전공은 안 된다", () => {
    const stage = (k: number) => lifeMajorStageXp("cooking", k);
    expect(lifeMajorCanCraft(state({ major: "cooking", masteryXp: { cooking: stage(3) } }), "cooking")).toBe(true);
    expect(lifeMajorCanCraft(state({ major: "cooking", masteryXp: { cooking: stage(2) } }), "cooking")).toBe(false);
    expect(
      lifeMajorCanCraft(state({ major: "farming", minor: "cooking", masteryXp: { cooking: stage(9) } }), "cooking"),
    ).toBe(false);
  });

  it("해산물 분야는 명장 어획, 그 밖은 명장 작물을 쓴다", () => {
    expect(signatureIngredientFor("seafood")).toBe(LIFE_MAJOR_PRODUCT_ID.fishing);
    for (const field of ["hearth", "pot", "baking", "medicinal"] as const) {
      expect(signatureIngredientFor(field)).toBe(LIFE_MAJOR_PRODUCT_ID.farming);
    }
  });
});
