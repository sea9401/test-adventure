import { describe, expect, it } from "vitest";
import {
  applyLifeFieldDurationReduction,
  LIFE_FIELD_ENVIRONMENT_IDS,
  LIFE_FIELD_SPOT_IDS,
  lifeFieldDayEndsAt,
  lifeFieldDayKey,
  lifeFieldEnvironmentAssignments,
  lifeFieldEnvironmentForSpot,
} from "./lifeFieldEnvironment";

describe("life field environments", () => {
  it("assigns each of three environments to exactly two of six spots", () => {
    for (const activity of ["fishing", "woodcutting", "mining"] as const) {
      const assignments = lifeFieldEnvironmentAssignments(
        activity,
        Date.parse("2026-08-06T12:00:00+09:00"),
      );
      expect(Object.keys(assignments)).toHaveLength(LIFE_FIELD_SPOT_IDS[activity].length);
      for (const id of LIFE_FIELD_ENVIRONMENT_IDS[activity]) {
        expect(Object.values(assignments).filter((value) => value === id)).toHaveLength(2);
      }
    }
  });

  it("never repeats the same spot environment on consecutive KST days", () => {
    const start = Date.parse("2026-08-01T12:00:00+09:00");
    for (const activity of ["fishing", "woodcutting", "mining"] as const) {
      for (let day = 0; day < 20; day += 1) {
        const current = start + day * 86_400_000;
        const next = current + 86_400_000;
        for (const spotId of LIFE_FIELD_SPOT_IDS[activity]) {
          expect(
            lifeFieldEnvironmentForSpot(activity, spotId, current).id,
          ).not.toBe(lifeFieldEnvironmentForSpot(activity, spotId, next).id);
        }
      }
    }
  });

  it("uses the KST midnight boundary", () => {
    const before = Date.parse("2026-08-06T23:59:59.999+09:00");
    const after = before + 1;
    expect(lifeFieldDayKey(before)).toBe("2026-08-06");
    expect(lifeFieldDayKey(after)).toBe("2026-08-07");
    expect(lifeFieldDayEndsAt(before)).toBe(after);
  });

  it("applies duration bonuses without exceeding the final 60% cap", () => {
    expect(applyLifeFieldDurationReduction(10_000, 9_000, 5)).toBe(8_600);
    expect(applyLifeFieldDurationReduction(10_000, 4_100, 50)).toBe(4_000);
  });
});
