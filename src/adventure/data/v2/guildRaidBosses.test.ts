import { describe, expect, it } from "vitest";
import { COOP_BOSSES } from "./coopBosses";
import {
  GUILD_RAID_BOSS_IDS,
  GUILD_RAID_BOSSES,
  GUILD_RAID_DEFAULT_BOSS_ID,
  parseGuildRaidBossId,
} from "./guildRaidBosses";

describe("길드 토벌전 보스 목록", () => {
  it("토벌 보스 id만 인정하고 협동 보스 id나 프로토타입 키는 거부한다", () => {
    expect(parseGuildRaidBossId("canyon_predator_raid")).toBe(
      "canyon_predator_raid",
    );
    expect(parseGuildRaidBossId("mountain_chief_hard")).toBe(
      "mountain_chief_hard",
    );
    expect(parseGuildRaidBossId("canyon_predator_hard")).toBeNull();
    expect(parseGuildRaidBossId("toString")).toBeNull();
    expect(parseGuildRaidBossId(1)).toBeNull();
  });

  it("산군을 기본 보스로 두고 산군, 스콜피온 순서로 노출한다", () => {
    expect(GUILD_RAID_DEFAULT_BOSS_ID).toBe("mountain_chief_hard");
    expect(GUILD_RAID_BOSS_IDS).toEqual([
      "mountain_chief_hard",
      "canyon_predator_raid",
    ]);
  });

  it("산군은 협동 정의를 그대로 쓰고 기존 단계 체력과 1배 보상을 유지한다", () => {
    const boss = GUILD_RAID_BOSSES.mountain_chief_hard;
    expect(boss.definition).toBe(COOP_BOSSES.mountain_chief_hard);
    expect(boss.stageBaseHp).toBe(1_200_000);
    expect(boss.rewardMultiplier).toBe(1);
    expect(boss.bonusMinGuildDamage).toBeNull();
  });

  it("토벌 스콜피온은 재앙의 스콜피온 킹 외형을 쓰되 더 깊은 기준으로 강화한다", () => {
    const boss = GUILD_RAID_BOSSES.canyon_predator_raid;
    const source = COOP_BOSSES.canyon_predator_hard;
    expect(boss.definition.name).toBe("재앙의 스콜피온 킹");
    expect(boss.definition.base.image).toBe(source.base.image);
    expect(boss.definition.anchorDepth).toBeGreaterThan(source.anchorDepth);
    expect(boss.rewardMultiplier).toBe(2);
    expect(boss.bonusMinGuildDamage).toBeGreaterThan(0);
  });

  it("협동 보스 재앙의 스콜피온 킹 원본은 바꾸지 않는다", () => {
    expect(COOP_BOSSES.canyon_predator_hard.anchorDepth).toBe(78);
    expect(
      COOP_BOSSES.canyon_predator_hard.enrageStages.map(
        (stage) => stage.hpFraction,
      ),
    ).toEqual([0.7, 0.4]);
  });

  it("최대 HP 비례 피해가 보스마다 달라지지 않게 토벌 전투 체력 풀을 산군과 맞춘다", () => {
    expect(GUILD_RAID_BOSSES.canyon_predator_raid.definition.sharedMaxHp).toBe(
      GUILD_RAID_BOSSES.mountain_chief_hard.definition.sharedMaxHp,
    );
  });
});
