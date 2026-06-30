import { describe, expect, it } from "vitest";
import {
  BLACKSMITH_ARTISAN_JOBS,
  BLACKSMITH_ARTISAN_SKILLS,
  BLACKSMITH_REWARD_MILESTONES,
  addArtisanXp,
  addArtisanXpOnly,
  artisanLevel,
  artisanXpForNextLevel,
  artisanXpIntoLevel,
  blacksmithJobForLevel,
  nextArtisanMilestone,
  parseArtisanState,
  unlockedBlacksmithSkills,
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
    expect(
      unlockedArtisanMilestones(BLACKSMITH_REWARD_MILESTONES, 10).map(
        (m) => m.level,
      ),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(
      nextArtisanMilestone(BLACKSMITH_REWARD_MILESTONES, 9),
    ).toMatchObject({
      level: 10,
      title: "왕도 명장",
    });
    expect(nextArtisanMilestone(BLACKSMITH_REWARD_MILESTONES, 99)).toBeNull();
  });

  it("defines blacksmith as a 1st/2nd/3rd artisan job chain", () => {
    expect(BLACKSMITH_ARTISAN_JOBS.map((job) => job.name)).toEqual([
      "견습 대장장이",
      "대장장이",
      "명장 대장장이",
    ]);
    expect(
      BLACKSMITH_ARTISAN_JOBS.map((job) => [job.category, job.effectScope]),
    ).toEqual([
      ["lifestyle", "crafting"],
      ["lifestyle", "crafting"],
      ["lifestyle", "crafting"],
    ]);
    expect(blacksmithJobForLevel(1).id).toBe("apprentice_blacksmith");
    expect(blacksmithJobForLevel(5).id).toBe("blacksmith");
    expect(blacksmithJobForLevel(8).id).toBe("master_blacksmith");
  });

  it("unlocks blacksmith production skills by artisan level", () => {
    expect(
      BLACKSMITH_ARTISAN_SKILLS.every(
        (skill) => skill.effectScope === "crafting",
      ),
    ).toBe(true);
    expect(
      BLACKSMITH_ARTISAN_SKILLS.some(
        (skill) => skill.id === "blacksmith_masterwork",
      ),
    ).toBe(true);
    expect(unlockedBlacksmithSkills(7).map((skill) => skill.id)).not.toContain(
      "blacksmith_masterwork",
    );
    expect(unlockedBlacksmithSkills(8).map((skill) => skill.id)).toContain(
      "blacksmith_masterwork",
    );
    expect(unlockedBlacksmithSkills(9).map((skill) => skill.id)).toContain(
      "blacksmith_high_quality",
    );
  });
});
