import { describe, expect, it } from "vitest";
import { toCoopSessionAttackSummary } from "./coopSessionAttackSummary";

describe("toCoopSessionAttackSummary", () => {
  it("returns a lightweight attack summary without replay data", () => {
    const summary = toCoopSessionAttackSummary({
      attack: {
        id: 7,
        userId: "attacker",
        name: "모험가",
        damageDealt: 123,
        damageTaken: 45,
        diedEarly: false,
        createdAt: new Date("2026-08-21T00:00:00.000Z"),
      },
      viewerUserId: "viewer",
      avatar: "male1",
      profileBorder: null,
    });

    expect(summary).toEqual({
      id: 7,
      name: "모험가",
      damageDealt: 123,
      damageTaken: 45,
      diedEarly: false,
      isMe: false,
      avatar: "male1",
      profileBorder: null,
      at: Date.parse("2026-08-21T00:00:00.000Z"),
    });
    expect(summary).not.toHaveProperty("replay");
  });
});
