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
    expect(
      sections.find((section) => section.id === "guild")?.sessions,
    ).toHaveLength(0);
    expect(
      sections.find((section) => section.id === "public")?.sessions,
    ).toHaveLength(0);
  });

  it("다른 사람의 소환은 길드 공개와 전체 공개로 구분한다", () => {
    const sections = coopSessionListSections([
      session("guild", "guild_only", false),
      session("public", "public", false),
    ]);

    expect(
      sections
        .find((section) => section.id === "guild")
        ?.sessions.map((item) => item.id),
    ).toEqual(["guild"]);
    expect(
      sections
        .find((section) => section.id === "public")
        ?.sessions.map((item) => item.id),
    ).toEqual(["public"]);
  });

  it("공개 범위가 좁아져도 이미 피해를 기록한 세션을 참여 중 구역에 남긴다", () => {
    const sections = coopSessionListSections([
      session("private-contribution", "summoner_only", false, 37_515),
      session("other-guild-contribution", "guild_only", false, 37_515),
    ]);
    const participated = sections.find((section) => section.id === "participated");

    expect(participated?.sessions.map((item) => item.id)).toEqual([
      "private-contribution",
      "other-guild-contribution",
    ]);
    expect(
      sections
        .filter((section) => section.id === "guild" || section.id === "public")
        .flatMap((section) => section.sessions.map((item) => item.id)),
    ).toEqual([]);
  });
});
