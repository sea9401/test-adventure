import { describe, expect, it } from "vitest";
import {
  BLACKSMITH_REWARD_MILESTONES,
  addArtisanXp,
  addArtisanXpOnly,
  artisanLevel,
  artisanXpForNextLevel,
  artisanXpIntoLevel,
  nextArtisanMilestone,
  parseArtisanState,
  unlockedArtisanMilestones,
} from "./artisan";

describe("artisan state", () => {
  it("parses missing or malformed state as empty", () => {
    expect(parseArtisanState(null)).toEqual({});
    expect(parseArtisanState({ blacksmith: "bad" })).toEqual({});
  });

  it("normalizes blacksmith xp and craft count", () => {
    expect(
      parseArtisanState({ blacksmith: { xp: 123.9, crafts: 4.8 } }),
    ).toEqual({
      blacksmith: { xp: 123, crafts: 4 },
    });
  });

  it("adds xp and craft count without touching other artisan professions", () => {
    const next = addArtisanXp({ blacksmith: { xp: 245, crafts: 2 } }, "blacksmith", 12);
    expect(next.blacksmith).toEqual({ xp: 257, crafts: 3 });
    expect(artisanLevel(next.blacksmith)).toBe(2);
    expect(artisanXpIntoLevel(next.blacksmith)).toBe(7);
    expect(artisanXpForNextLevel(next.blacksmith)).toBe(400);
  });

  it("adds xp-only rewards without increasing craft count", () => {
    const next = addArtisanXpOnly(
      { blacksmith: { xp: 95, crafts: 2 } },
      "blacksmith",
      12,
    );
    expect(next.blacksmith).toEqual({ xp: 107, crafts: 2 });
  });

  it("exposes blacksmith reward milestones by artisan level", () => {
    expect(
      unlockedArtisanMilestones(BLACKSMITH_REWARD_MILESTONES, 5).map(
        (m) => m.level,
      ),
    ).toEqual([1, 2, 3, 4, 5]);
    expect(
      nextArtisanMilestone(BLACKSMITH_REWARD_MILESTONES, 5),
    ).toMatchObject({
      level: 6,
      title: "전용 무기",
    });
    expect(nextArtisanMilestone(BLACKSMITH_REWARD_MILESTONES, 99)).toBeNull();
  });
});
