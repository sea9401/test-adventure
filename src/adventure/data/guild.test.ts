import { describe, expect, it } from "vitest";
import {
  GUILD_MAX_MEMBERS,
  NATION_MEMBER_BONUS,
  NATION_NAME_MAX,
  guildMemberCap,
  validateGuildName,
  validateNationName,
} from "./guild";

describe("guildMemberCap", () => {
  it("국가 미선포 = 기본 정원", () => {
    expect(guildMemberCap(false)).toBe(GUILD_MAX_MEMBERS);
  });

  it("국가 선포 = 기본 정원 + 보너스", () => {
    expect(guildMemberCap(true)).toBe(GUILD_MAX_MEMBERS + NATION_MEMBER_BONUS);
  });

  it("보너스는 양수라 국가 선포가 정원을 늘린다", () => {
    expect(NATION_MEMBER_BONUS).toBeGreaterThan(0);
    expect(guildMemberCap(true)).toBeGreaterThan(guildMemberCap(false));
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
