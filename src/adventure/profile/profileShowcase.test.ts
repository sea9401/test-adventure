import { describe, expect, it } from "vitest";
import {
  ownsProfileBadgeStand,
  parseProfileBadgeStandVisible,
  parseProfileShowcase,
  parseProfileShowcaseSelection,
  parseProfileShowcaseSlots,
} from "./profileShowcase";

describe("profile showcase parser", () => {
  it("parses each supported selection", () => {
    expect(
      parseProfileShowcaseSelection({ kind: "equipment", iid: "eq_1" }),
    ).toEqual({ kind: "equipment", iid: "eq_1" });
    expect(
      parseProfileShowcaseSelection({
        kind: "achievement",
        achievementId: "first_hunt",
      }),
    ).toEqual({ kind: "achievement", achievementId: "first_hunt" });
    expect(
      parseProfileShowcase({ selection: { kind: "title", titleId: "hero" } }),
    ).toEqual({ kind: "title", titleId: "hero" });
    expect(
      parseProfileShowcaseSelection({
        kind: "masteryTrophy",
        trophyId: "mastery:fish",
      }),
    ).toEqual({ kind: "masteryTrophy", trophyId: "mastery:fish" });
  });

  it("rejects malformed and oversized values", () => {
    expect(parseProfileShowcase({ selection: { kind: "equipment" } })).toBeNull();
    expect(
      parseProfileShowcase({
        selection: { kind: "title", titleId: "x".repeat(161) },
      }),
    ).toBeNull();
    expect(parseProfileShowcase({ selection: { kind: "unknown", id: "x" } })).toBeNull();
    expect(parseProfileShowcaseSelection({
      kind: "masteryTrophy",
      trophyId: "x".repeat(161),
    })).toBeNull();
  });

  it("parses three slots and migrates the legacy single selection", () => {
    const title = { kind: "title" as const, titleId: "hero" };
    const achievement = {
      kind: "achievement" as const,
      achievementId: "first_hunt",
    };

    expect(parseProfileShowcaseSlots({ slots: [title, null, achievement] })).toEqual([
      title,
      null,
      achievement,
    ]);
    expect(parseProfileShowcaseSlots({ selection: title })).toEqual([
      title,
      null,
      null,
    ]);
  });

  it("only treats an explicit ownership flag as an owned display stand", () => {
    expect(ownsProfileBadgeStand({ profileBadgeStandOwned: true })).toBe(true);
    expect(ownsProfileBadgeStand({ profileBadgeStandOwned: false })).toBe(false);
    expect(ownsProfileBadgeStand({ profileBadgeStandOwned: 1 })).toBe(false);
    expect(ownsProfileBadgeStand(null)).toBe(false);
  });

  it("keeps legacy stands visible and reads an explicit visibility toggle", () => {
    expect(parseProfileBadgeStandVisible({ slots: [] })).toBe(true);
    expect(parseProfileBadgeStandVisible({ visible: true })).toBe(true);
    expect(parseProfileBadgeStandVisible({ visible: false })).toBe(false);
    expect(parseProfileBadgeStandVisible(null)).toBe(true);
  });
});
