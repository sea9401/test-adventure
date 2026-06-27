// 투승 반격(v2c_battlemonk_counter) — 장착 패시브가 counterChancePct 를 aggregate→derive→엔진
//   passiveCounterChancePct 훅으로 흘리는지. 엔진 카운터 메커니즘(enemyPhase) 자체는 기존.
//   🔑 무인 재설계(2026-06-22): 옛 절정 반격(v2c_sensei_combo)이 권룡의 공격형 전환으로 무승 계보
//      정점 투승의 전용 id(v2c_battlemonk_counter)로 이전. 카운터 메커니즘·SP 루브릭은 동일.
import { describe, it, expect } from "vitest";
import {
  V2_SKILLS,
  aggregateEquippedPassives,
  spCostOf,
  describeV2Skill,
} from "./v2Skills";

describe("투승 반격 패시브", () => {
  it("카탈로그: v2c_battlemonk_counter = 반격 패시브(counterChancePct 30·SP 6)", () => {
    const s = V2_SKILLS.v2c_battlemonk_counter;
    expect(s.name).toBe("반격");
    expect(s.category).toBe("passive");
    expect(s.passive?.counterChancePct).toBe(30);
    expect(spCostOf(s)).toBe(6); // 루브릭 8(counterChancePct 30) × 패시브 할인 0.75 → 6
  });

  it("aggregateEquippedPassives 가 counterChancePct 합산", () => {
    expect(aggregateEquippedPassives(["v2c_battlemonk_counter"]).counterChancePct).toBe(30);
    // 미장착 = 0(byte-identical 보장).
    expect(aggregateEquippedPassives([]).counterChancePct).toBe(0);
    // 철신과 동시 장착해도 카운터 30 유지(철신은 maxHp 축).
    expect(
      aggregateEquippedPassives([
        "v2c_battlemonk_counter",
        "v2c_battlemonk_ironbody",
      ]).counterChancePct,
    ).toBe(30);
  });

  it("스킬 설명에 반격 표기", () => {
    expect(
      describeV2Skill(V2_SKILLS.v2c_battlemonk_counter).some((l) => l.includes("반격")),
    ).toBe(true);
  });
});
