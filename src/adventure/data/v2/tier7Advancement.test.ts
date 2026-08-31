import { describe, expect, it } from "vitest";
import {
  TIER7_FIRST_UNLOCK_LEVEL,
  TIER7_FIRST_UNLOCK_MATERIAL_COST,
  TIER7_FIRST_UNLOCK_MATERIAL_ID,
  TIER7_PREREQUISITE_MASTERY,
  spendTier7FirstUnlockMaterial,
  tier7AdvancementStatus,
} from "./tier7Advancement";

const ready = {
  targetJobId: "shadowblade",
  currentJobId: "swordsaint",
  currentLevel: 100,
  jobCumLevel: { swordsaint: 100_000, blackmoon: 100_000 },
  jobHistory: [] as string[],
  materials: { v2_storm_origin_fragment: 30 },
};

describe("tier 7 advancement", () => {
  it("exposes the approved first-unlock requirements through status", () => {
    const status = tier7AdvancementStatus(ready);

    expect(status).toMatchObject({
      jobId: "shadowblade",
      permanentlyUnlocked: false,
      prerequisiteProgress: [
        { jobId: "swordsaint", current: 100_000, required: 100_000, met: true },
        { jobId: "blackmoon", current: 100_000, required: 100_000, met: true },
      ],
      currentJob: {
        current: "swordsaint",
        allowed: ["swordsaint", "blackmoon"],
        met: true,
      },
      level: { current: 100, required: 100, met: true },
      material: {
        id: "v2_storm_origin_fragment",
        current: 30,
        required: 30,
        met: true,
      },
      nonLevelRequirementsMet: true,
      firstUnlockReady: true,
      failure: null,
    });
    expect(TIER7_PREREQUISITE_MASTERY).toBe(100_000);
    expect(TIER7_FIRST_UNLOCK_LEVEL).toBe(100);
    expect(TIER7_FIRST_UNLOCK_MATERIAL_ID).toBe("v2_storm_origin_fragment");
    expect(TIER7_FIRST_UNLOCK_MATERIAL_COST).toBe(30);
  });

  it.each([
    [99_999, 100_000],
    [150_000, 50_000],
  ])(
    "requires each prerequisite mastery independently",
    (swordsaint, blackmoon) => {
      const status = tier7AdvancementStatus({
        ...ready,
        jobCumLevel: { swordsaint, blackmoon },
      });

      expect(status?.firstUnlockReady).toBe(false);
      expect(status?.failure).toBe("tier7_prerequisite_proficiency");
    },
  );

  it("requires one of the prerequisite jobs as the current job", () => {
    const status = tier7AdvancementStatus({
      ...ready,
      currentJobId: "warrior",
    });

    expect(status?.currentJob.met).toBe(false);
    expect(status?.failure).toBe("tier7_current_job");
  });

  it("requires actual level 100 for the first unlock", () => {
    const status = tier7AdvancementStatus({ ...ready, currentLevel: 99 });

    expect(status?.level).toEqual({ current: 99, required: 100, met: false });
    expect(status?.failure).toBe("level_too_low");
  });

  it("requires 30 fragments for the first unlock", () => {
    const status = tier7AdvancementStatus({
      ...ready,
      materials: { v2_storm_origin_fragment: 29 },
    });

    expect(status?.material.current).toBe(29);
    expect(status?.failure).toBe("tier7_material_shortage");
  });

  it("spends exactly 30 fragments while preserving other balances", () => {
    const status = tier7AdvancementStatus({
      ...ready,
      materials: { v2_storm_origin_fragment: 35, other: 2 },
    });

    expect(
      spendTier7FirstUnlockMaterial(
        { v2_storm_origin_fragment: 35, other: 2 },
        status!,
      ),
    ).toEqual({ v2_storm_origin_fragment: 5, other: 2 });
    expect(
      spendTier7FirstUnlockMaterial(
        { v2_storm_origin_fragment: 30, other: 2 },
        tier7AdvancementStatus(ready)!,
      ),
    ).toEqual({ other: 2 });
  });

  it("uses job history as a permanent unlock without first-unlock checks", () => {
    const status = tier7AdvancementStatus({
      ...ready,
      currentJobId: "warrior",
      currentLevel: 1,
      jobCumLevel: {},
      jobHistory: ["shadowblade"],
      materials: {},
    });

    expect(status?.permanentlyUnlocked).toBe(true);
    expect(status?.firstUnlockReady).toBe(false);
    expect(status?.failure).toBeNull();
  });

  it("returns null for a job outside the internal tier-7 set", () => {
    expect(
      tier7AdvancementStatus({ ...ready, targetJobId: "swordsaint" }),
    ).toBeNull();
  });

  it("normalizes malformed counters and refuses an invalid debit", () => {
    const status = tier7AdvancementStatus({
      ...ready,
      currentLevel: Number.NaN,
      jobCumLevel: { swordsaint: -1, blackmoon: Number.POSITIVE_INFINITY },
      materials: { v2_storm_origin_fragment: "30" },
    });

    expect(status?.prerequisiteProgress.map((row) => row.current)).toEqual([0, 0]);
    expect(status?.level.current).toBe(0);
    expect(status?.material.current).toBe(0);
    expect(() => spendTier7FirstUnlockMaterial({}, status!)).toThrow(
      "tier 7 first unlock is not ready",
    );
  });
});
