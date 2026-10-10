import { describe, expect, it } from "vitest";
import type { PlayerCombat } from "@/adventure/v2/combat/engine";
import { parseV2SkillsState } from "@/adventure/data/v2/v2Skills";
import { resolveGuildRaidBattle } from "./guildRaidBattle";

const player: PlayerCombat = {
  hp: 5_000,
  maxHp: 5_000,
  atk: 800,
  def: 50,
  spd: 60,
  evasionPct: 0,
  attackCount: 1,
  accuracyPct: 100,
};

describe("길드 토벌전 순수 전투", () => {
  it.each([
    ["mountain_chief_hard", "흉포한 산군"],
    ["canyon_predator_raid", "재앙의 스콜피온 킹"],
  ] as const)("%s 보스와 DB 없이 전투한다", (bossId, bossName) => {
    const result = resolveGuildRaidBattle({
      bossId,
      player,
      playerMaxHp: player.maxHp,
      skills: parseV2SkillsState(null),
      playerName: "시험자",
    });

    expect(result.playerName).toBe("시험자");
    expect(result.replay.enemy.name).toBe(bossName);
    expect(result.damageDealt).toBeGreaterThanOrEqual(0);
    expect(result.damageTaken).toBeGreaterThanOrEqual(0);
  });
});
