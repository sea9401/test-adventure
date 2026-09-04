import { describe, expect, it } from "vitest";
import type { CoopSessionSummary } from "@/adventure/v2/coop/useCoopBossState";
import { coopSessionListSections } from "@/adventure/v2/coop/coopListSections";

function session(
  id: string,
  visibility: CoopSessionSummary["visibility"],
  isOwner: boolean,
  myDamage = 0,
): CoopSessionSummary {
  return {
    id,
    kind: "mountain_chief",
    hp: 100,
    maxHp: 100,
    bossMp: 0,
    bossMaxMp: 0,
    trackingThreat: 0,
    trackingThreatMax: 0,
    trackingReady: false,
    expiresAt: Date.now() + 60_000,
    summonedByName: isOwner ? "나" : "길드원",
    visibility,
    isOwner,
    participantCount: 0,
    myDamage,
    myTier: null,
  };
}

describe("coopSessionListSections", () => {
  it("내 소환은 공개 범위와 무관하게 첫 구역에 모은다", () => {
    const sections = coopSessionListSections([
      session("mine-private", "summoner_only", true),
      session("mine-guild", "guild_only", true),
      session("mine-public", "public", true),
    ]);

    expect(sections[0]?.sessions.map((item) => item.id)).toEqual([
      "mine-private",
      "mine-guild",
      "mine-public",
    ]);
    expect(sections[1]?.sessions).toHaveLength(0);
    expect(sections[2]?.sessions).toHaveLength(0);
  });

  it("다른 사람의 소환은 길드 공개와 전체 공개로 구분한다", () => {
    const sections = coopSessionListSections([
      session("guild", "guild_only", false),
      session("public", "public", false),
    ]);

    expect(sections[1]?.sessions.map((item) => item.id)).toEqual(["guild"]);
    expect(sections[2]?.sessions.map((item) => item.id)).toEqual(["public"]);
  });

  it("내가 공격한 다른 사람의 보스를 공개 범위 구역보다 위에 한 번만 표시한다", () => {
    const sections = coopSessionListSections([
      session("mine", "public", true),
      session("participated-guild", "guild_only", false, 12_000),
      session("guild", "guild_only", false),
      session("participated-public", "public", false, 34_000),
      session("public", "public", false),
    ]);

    expect(sections.map((section) => section.id)).toEqual([
      "mine",
      "participated",
      "guild",
      "public",
    ]);
    expect(sections[1]?.sessions.map((item) => item.id)).toEqual([
      "participated-guild",
      "participated-public",
    ]);
    expect(
      sections.flatMap((section) => section.sessions.map((item) => item.id)),
    ).toEqual([
      "mine",
      "participated-guild",
      "participated-public",
      "guild",
      "public",
    ]);
  });
});
