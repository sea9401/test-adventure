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

  it("무직(none)도 레벨업하며 직군 누적레벨은 0 유지(addCumLevel no-op)·totalLevels 는 누적", () => {
    const r = applyExpTomeGrant(
      { class: undefined, level: 1, exp: 0, totalLevels: 1 },
      {},
    );
    // 무직은 모든 직군 cumLevel 0 유지(스탯 성장은 hunt 처럼 적용됨).
    for (const g of Object.values(r.proficiency.groups)) {
      expect(g.cumLevel).toBe(0);
    }
    expect(r.levelsGained).toBeGreaterThan(0);
    // 🔑 핵심: 직군 누적(cumLevel)엔 안 잡혀도 평생 누적(totalLevels)엔 모험가 레벨이 잡힌다.
    expect(r.totalLevels).toBe(1 + r.levelsGained);
  });

  it("totalLevels — 없는 옛 세이브는 직전 레벨로 시드 후 누적", () => {
    const r = applyExpTomeGrant(
      { class: "warrior", level: 30, exp: 0 },
      {},
      EXP_TOME_GRANT,
    );
    // totalLevels 미보유 → 직전 레벨(30) 시드 + 오른 레벨.
    expect(r.totalLevels).toBe(30 + r.levelsGained);
  });

  it("적은 grant 는 큰 grant 보다 레벨을 적게 올린다", () => {
    const small = applyExpTomeGrant({ level: 1, exp: 0 }, {}, 100);
    const big = applyExpTomeGrant({ level: 1, exp: 0 }, {}, EXP_TOME_GRANT);
    expect(small.levelsGained).toBeLessThanOrEqual(big.levelsGained);
  });
});
