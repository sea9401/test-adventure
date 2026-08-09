import { describe, expect, it } from "vitest";

import { derivePlayerCombatV2Pure } from "./derivePlayerCombatV2";

describe("derivePlayerCombatV2Pure 방어 감소 전달", () => {
  it("장착 패시브의 물리·마법 방어 감소를 서로 다른 전투 필드로 전달한다", () => {
    const player = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: {},
      passiveEnemyPhysicalDefReductionPct: 12,
      passiveEnemyMagicDefReductionPct: 9,
    }).player;

    expect(player.enemyPhysicalDefReductionPct).toBe(12);
    expect(player.enemyMagicDefReductionPct).toBe(9);
  });

  it("방어 감소를 장착하지 않으면 선택 필드를 만들지 않는다", () => {
    const player = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: {},
    }).player;

    expect(player.enemyPhysicalDefReductionPct).toBeUndefined();
    expect(player.enemyMagicDefReductionPct).toBeUndefined();
  });
});
