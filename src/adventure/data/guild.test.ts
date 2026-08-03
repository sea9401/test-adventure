import { describe, expect, it } from "vitest";
import {
  GUILD_BASE_MEMBER_CAP,
  GUILD_LEVEL_UPGRADE_COSTS,
  GUILD_MAX_LEVEL,
  GUILD_MEMBER_CAP_PER_LEVEL,
  NATION_MEMBER_BONUS,
  NATION_NAME_MAX,
  guildLevelUpgradeCost,
  guildMemberCap,
  normalizeGuildLevel,
  validateGuildName,
  validateNationName,
} from "./guild";

describe("guildMemberCap", () => {
  it("Lv.1 국가 미선포 = 기본 정원 6명", () => {
    expect(GUILD_BASE_MEMBER_CAP).toBe(6);
    expect(guildMemberCap(1, false)).toBe(GUILD_BASE_MEMBER_CAP);
  });

  it("레벨이 오를 때마다 정원이 1명씩 증가한다", () => {
    for (let level = 2; level <= GUILD_MAX_LEVEL; level++) {
      expect(guildMemberCap(level, false)).toBe(
        GUILD_BASE_MEMBER_CAP + (level - 1) * GUILD_MEMBER_CAP_PER_LEVEL,
      );
    }
  });

  it("국가 선포 보너스는 레벨 정원에 별도로 더해진다", () => {
    expect(NATION_MEMBER_BONUS).toBeGreaterThan(0);
    expect(guildMemberCap(4, true) - guildMemberCap(4, false)).toBe(
      NATION_MEMBER_BONUS,
    );
  });
});

describe("길드 수동 승급", () => {
  it("옛 누적 명성 총량을 단계별 실제 명성 비용으로 유지하고 골드도 요구한다", () => {
    expect(GUILD_MAX_LEVEL).toBe(5);
    expect(GUILD_LEVEL_UPGRADE_COSTS.map((cost) => cost.fame)).toEqual([
      3_000, 5_000, 8_000, 14_000,
    ]);
    expect(
      GUILD_LEVEL_UPGRADE_COSTS.reduce((sum, cost) => sum + cost.fame, 0),
    ).toBe(30_000);
    expect(GUILD_LEVEL_UPGRADE_COSTS.every((cost) => cost.gold > 0)).toBe(true);
  });

  it("현재 저장 레벨에 맞는 다음 승급 비용을 반환한다", () => {
    expect(guildLevelUpgradeCost(1)).toEqual(GUILD_LEVEL_UPGRADE_COSTS[0]);
    expect(guildLevelUpgradeCost(4)).toEqual(GUILD_LEVEL_UPGRADE_COSTS[3]);
    expect(guildLevelUpgradeCost(5)).toBeNull();
  });

  it("손상된 저장 레벨은 1~최고 레벨 범위로 정규화한다", () => {
    expect(normalizeGuildLevel(-100)).toBe(1);
    expect(normalizeGuildLevel(Number.NaN)).toBe(1);
    expect(normalizeGuildLevel(99)).toBe(GUILD_MAX_LEVEL);
  });
});

describe("validateNationName", () => {
  it("정상 국가명 통과 + trim", () => {
    const r = validateNationName("  새벽 제국 ");
    expect(r).toEqual({ ok: true, trimmed: "새벽 제국" });
  });

  it("길드명보다 긴 국가명 허용(최대 16자)", () => {
    const long = "가".repeat(NATION_NAME_MAX);
    expect(validateNationName(long).ok).toBe(true);
    // 길드명 한도(12)는 넘지만 국가명 한도(16) 안.
    expect(validateGuildName(long).ok).toBe(false);
  });

  it("너무 짧으면 거부", () => {
    expect(validateNationName("가").ok).toBe(false);
  });

  it("16자 초과 거부", () => {
    expect(validateNationName("가".repeat(NATION_NAME_MAX + 1)).ok).toBe(false);
  });

  it("특수문자 거부", () => {
    expect(validateNationName("제국@!").ok).toBe(false);
  });

  it("금칙어 거부", () => {
    expect(validateNationName("운영자 나라").ok).toBe(false);
  });
});
