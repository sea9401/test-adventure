import { describe, expect, it } from "vitest";
import type { RuneGrade, RuneId } from "@/adventure/data/runes";
import { computeRuneBonus, pctToMultiplier } from "./runeBonus";

describe("computeRuneBonus", () => {
  it("undefined / 빈 슬롯 → 모두 0", () => {
    expect(computeRuneBonus(undefined).atk_pct).toBe(0);
    expect(computeRuneBonus([null, null, null]).hp_pct).toBe(0);
  });

  it("ATK 5등급 1슬롯 = +7% (PR-D1 너프 후)", () => {
    const b = computeRuneBonus([{ id: "rune_attack", grade: 5 }, null, null]);
    expect(b.atk_pct).toBe(7);
    expect(b.def_pct).toBe(0);
  });

  it("같은 효과 종 룬은 합산 — ATK 5등급 ×3 = +21% (PR-D1 너프 후)", () => {
    const b = computeRuneBonus([
      { id: "rune_attack", grade: 5 },
      { id: "rune_attack", grade: 5 },
      { id: "rune_attack", grade: 5 },
    ]);
    expect(b.atk_pct).toBe(21);
  });

  it("혼합 빌드 — ATK 4등급 + 행운 3등급 + 치명타 5등급 (PR-D1)", () => {
    const b = computeRuneBonus([
      { id: "rune_attack", grade: 4 },
      { id: "rune_fortune", grade: 3 },
      { id: "rune_crit", grade: 5 },
    ]);
    expect(b.atk_pct).toBe(5);
    expect(b.drop_pct).toBe(10);
    expect(b.crit_pct).toBe(7);
    expect(b.def_pct).toBe(0);
  });

  it("자원형 5등급은 20% (PR-D1 너프 후 — 평탄과 다른 magnitude)", () => {
    const b = computeRuneBonus([
      { id: "rune_training", grade: 5 },
      null,
      null,
    ]);
    expect(b.exp_pct).toBe(20);
  });

  it("proc 룬 5등급 — 반격/흡혈 8% (PR-D1 너프 후)", () => {
    const b = computeRuneBonus([
      { id: "rune_counter", grade: 5 },
      { id: "rune_lifesteal", grade: 5 },
      null,
    ]);
    expect(b.counter_pct).toBe(8);
    expect(b.lifesteal_pct).toBe(8);
  });

  it("재생 룬 5등급 = 3% (PR-D1 너프 후)", () => {
    const b = computeRuneBonus([
      { id: "rune_regen", grade: 5 },
      null,
      null,
    ]);
    expect(b.regen_pct).toBe(3);
  });

  it("같은 proc 룬 5등급 ×3 = 24% (PR-D1 너프 후, cap 없음 — 호출부 책임)", () => {
    const b = computeRuneBonus([
      { id: "rune_counter", grade: 5 },
      { id: "rune_counter", grade: 5 },
      { id: "rune_counter", grade: 5 },
    ]);
    expect(b.counter_pct).toBe(24);
  });

  it("5막 PR-D1 — 6등급 신설. ATK 6등급 = +9%", () => {
    const b = computeRuneBonus([{ id: "rune_attack", grade: 6 }, null, null]);
    expect(b.atk_pct).toBe(9);
  });

  it("5막 PR-D1 — 6등급 자원형 25% / proc 12% / 재생 4%", () => {
    const training = computeRuneBonus([
      { id: "rune_training", grade: 6 },
      null,
      null,
    ]);
    expect(training.exp_pct).toBe(25);
    const counter = computeRuneBonus([
      { id: "rune_counter", grade: 6 },
      null,
      null,
    ]);
    expect(counter.counter_pct).toBe(12);
    const regen = computeRuneBonus([
      { id: "rune_regen", grade: 6 },
      null,
      null,
    ]);
    expect(regen.regen_pct).toBe(4);
  });
});

describe("computeRuneBonus — carry-through 미인식 룬 안전성", () => {
  it("미인식 grade 룬은 0 기여, 정상 룬 합산엔 영향 없음 (NaN 오염 X)", () => {
    const b = computeRuneBonus([
      { id: "rune_attack", grade: 99 as RuneGrade },
      { id: "rune_attack", grade: 5 },
      null,
    ]);
    expect(b.atk_pct).toBe(7);
    expect(Number.isNaN(b.atk_pct)).toBe(false);
  });

  it("미인식 id 룬은 무시 (throw/NaN 없음)", () => {
    const b = computeRuneBonus([
      { id: "rune_future_unknown" as RuneId, grade: 3 },
      null,
      null,
    ]);
    expect(b.atk_pct).toBe(0);
  });
});

describe("pctToMultiplier", () => {
  it("0 → 1, 50 → 1.5, 100 → 2", () => {
    expect(pctToMultiplier(0)).toBe(1);
    expect(pctToMultiplier(50)).toBe(1.5);
    expect(pctToMultiplier(100)).toBe(2);
  });
});
