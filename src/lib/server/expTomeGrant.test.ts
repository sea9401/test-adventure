import { describe, it, expect } from "vitest";
import { effectiveLevelCap } from "@/adventure/data/v2/proficiency";
import { applyExpTomeGrant, EXP_TOME_GRANT } from "./expTomeGrant";

describe("applyExpTomeGrant", () => {
  it("100만 EXP 는 캐릭터를 크게 성장시킨다(Lv50 누적 ~22만이라 최소 50+)", () => {
    const cap = effectiveLevelCap(4); // 무직 = 4차 캡
    const r = applyExpTomeGrant({ level: 1, exp: 0 }, {}, EXP_TOME_GRANT);
    // Lv50 까지 누적 EXP 22만 < 100만 → 최소 50 이상은 확실히 도달.
    expect(r.level).toBeGreaterThanOrEqual(Math.min(50, cap));
    expect(r.level).toBeLessThanOrEqual(cap);
    expect(r.levelsGained).toBe(r.level - 1);
    expect(r.exp).toBeGreaterThanOrEqual(0);
  });

  it("이미 만렙이면 레벨 변화 없음(levelsGained 0)", () => {
    const cap = effectiveLevelCap(4);
    const r = applyExpTomeGrant({ level: cap, exp: 0 }, {}, EXP_TOME_GRANT);
    expect(r.level).toBe(cap);
    expect(r.levelsGained).toBe(0);
  });

  it("무직(none)도 레벨업하며 직업 숙련도는 0 유지", () => {
    const r = applyExpTomeGrant(
      { class: undefined, level: 1, exp: 0 },
      {},
    );
    // 무직은 모든 직군 cumLevel 0 유지(스탯 성장은 hunt 처럼 적용됨).
    for (const g of Object.values(r.proficiency.groups)) {
      expect(g.cumLevel).toBe(0);
    }
    expect(r.levelsGained).toBeGreaterThan(0);
  });

  it("EXP 묘약은 레벨만 올리고 직업 숙련도는 올리지 않는다", () => {
    const r = applyExpTomeGrant(
      { class: "warrior", level: 1, exp: 0 },
      {},
      EXP_TOME_GRANT,
    );
    expect(r.levelsGained).toBeGreaterThan(0);
    expect(r.proficiency.groups.warrior?.cumLevel ?? 0).toBe(0);
    expect(r.proficiency.jobCumLevel?.warrior ?? 0).toBe(0);
  });

  it("레거시 totalLevels 입력이 있어도 결과 모델에는 포함하지 않는다", () => {
    const r = applyExpTomeGrant(
      { class: "warrior", level: 30, exp: 0, totalLevels: 999 } as {
        class: string;
        level: number;
        exp: number;
        totalLevels: number;
      },
      {},
      EXP_TOME_GRANT,
    );
    expect("totalLevels" in r).toBe(false);
  });

  it("적은 grant 는 큰 grant 보다 레벨을 적게 올린다", () => {
    const small = applyExpTomeGrant({ level: 1, exp: 0 }, {}, 100);
    const big = applyExpTomeGrant({ level: 1, exp: 0 }, {}, EXP_TOME_GRANT);
    expect(small.levelsGained).toBeLessThanOrEqual(big.levelsGained);
  });
});
