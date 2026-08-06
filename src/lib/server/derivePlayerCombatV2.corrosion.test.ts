import { describe, expect, it } from "vitest";

import { derivePlayerCombatV2Pure } from "./derivePlayerCombatV2";

describe("derivePlayerCombatV2Pure 부식 합성", () => {
  it("직업 효과와 장착 패시브도 남은 방어력 기준 곱연산한다", () => {
    const player = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: {},
      jobPassiveEffect: { poisonedEnemyDefReductionPct: 20 },
      passivePoisonedEnemyDefReductionPct: 30,
    }).player;

    // 남은 방어 80% × 70% = 56% → 총 감소 44%.
    expect(player.poisonedEnemyDefReductionPct).toBeCloseTo(44);
  });
});
