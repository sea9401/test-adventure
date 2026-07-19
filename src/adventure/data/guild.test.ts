import { describe, expect, it } from "vitest";
import {
  GUILD_BASE_MEMBER_CAP,
  GUILD_LEVEL_THRESHOLDS,
  GUILD_MAX_LEVEL,
  GUILD_MEMBER_CAP_PER_LEVEL,
  NATION_MEMBER_BONUS,
  NATION_NAME_MAX,
  guildLevelForFame,
  guildLevelProgress,
  guildMemberCap,
  validateGuildName,
  validateNationName,
} from "./guild";

describe("guildMemberCap", () => {
  it("Lv.1 국가 미선포 = 기본 정원", () => {
    expect(guildMemberCap(0, false)).toBe(GUILD_BASE_MEMBER_CAP);
  });

  it("레벨이 오를 때마다 정원이 1명씩 증가한다", () => {
    for (let level = 2; level <= GUILD_MAX_LEVEL; level++) {
      const fame = GUILD_LEVEL_THRESHOLDS[level - 1];
      expect(guildMemberCap(fame, false)).toBe(
        GUILD_BASE_MEMBER_CAP + (level - 1) * GUILD_MEMBER_CAP_PER_LEVEL,
      );
    }
  });

  it("국가 선포 보너스는 레벨 정원에 별도로 더해진다", () => {
    const fame = GUILD_LEVEL_THRESHOLDS[3];
    expect(NATION_MEMBER_BONUS).toBeGreaterThan(0);
    expect(guildMemberCap(fame, true) - guildMemberCap(fame, false)).toBe(
      NATION_MEMBER_BONUS,
    );
  });
});

describe("guildLevelForFame", () => {
  it("초반을 강화한 누적 명성 요구량을 유지한다", () => {
    expect(GUILD_MAX_LEVEL).toBe(5);
    expect(GUILD_LEVEL_THRESHOLDS).toEqual([
      0, 3_000, 8_000, 16_000, 30_000,
    ]);
  });

  it("각 누적 명성 임계값에서 다음 레벨을 달성한다", () => {
    GUILD_LEVEL_THRESHOLDS.forEach((threshold, index) => {
      expect(guildLevelForFame(threshold)).toBe(index + 1);
      if (index > 0) expect(guildLevelForFame(threshold - 1)).toBe(index);
    });
  });

  it("음수·비정상 값은 Lv.1로 정규화한다", () => {
    expect(guildLevelForFame(-100)).toBe(1);
    expect(guildLevelForFame(Number.NaN)).toBe(1);
  });

  it("현재 레벨 내 명성과 다음 레벨 요구량을 계산한다", () => {
    expect(guildLevelProgress(4_000)).toEqual({
      level: 2,
      fameTotal: 4_000,
      fameIntoLevel: 1_000,
      fameForNextLevel: 5_000,
      nextLevelFame: 8_000,
    });

    const max = guildLevelProgress(130_000);
    expect(max.level).toBe(GUILD_MAX_LEVEL);
    expect(max.fameForNextLevel).toBeNull();
    expect(max.nextLevelFame).toBeNull();
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
