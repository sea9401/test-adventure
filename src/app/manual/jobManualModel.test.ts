import { describe, expect, it } from "vitest";
import {
  V2_JOB_LIST,
} from "@/adventure/data/v2/v2JobCatalog";
import { V2_SKILLS } from "@/adventure/data/v2/v2Skills";
import { skillsForJob } from "@/adventure/data/v2/v2SkillsByJob";
import {
  buildJobManualEntry,
  buildJobManualIndex,
  jobManualStaticParams,
} from "./jobManualModel";

describe("job manual model", () => {
  it("includes every catalog job and static route exactly once", () => {
    const index = buildJobManualIndex();

    expect(index.map((job) => job.id)).toEqual(
      V2_JOB_LIST.map((job) => job.id),
    );
    expect(new Set(index.map((job) => job.id)).size).toBe(V2_JOB_LIST.length);
    expect(jobManualStaticParams()).toEqual(
      V2_JOB_LIST.map((job) => ({ jobId: job.id })),
    );
  });

  it("builds forward and reverse links for a hybrid job", () => {
    const templar = buildJobManualEntry("templar");

    expect(templar).not.toBeNull();
    expect(templar!.prerequisites.map((job) => job.name)).toEqual([
      "기사",
      "사제",
    ]);
    expect(templar!.classification.line).toBe("hybrid");
    expect(templar!.nextJobs.map((job) => job.name)).toContain("성전사");
  });

  it("expands primordial spell variants and equipped synergies", () => {
    const primordial = buildJobManualEntry("primordialmage");
    const skill = primordial?.skills.find((entry) => entry.name === "태초회귀");

    expect(skill?.variants[0]?.name).toBe("개벽·오원소 회귀");
    expect(skill?.variants[0]?.requiredEquippedSkillNames).toContain("홍련술");
    expect(
      skill?.synergies.some(
        (entry) =>
          entry.requiredSkillNames.includes("근원공명") &&
          entry.requiredSkillNames.includes("오원소 폭주"),
      ),
    ).toBe(true);
    expect(
      skill?.variants[0]?.effectLines.some((line) => line.startsWith("피해 ")),
    ).toBe(true);
  });

  it("classifies roots and lifestyle jobs without hiding their data", () => {
    const adventurer = buildJobManualEntry("none");
    const chef = buildJobManualEntry("legendarychef");

    expect(adventurer?.classification).toEqual({
      kind: "combat",
      kindLabel: "전투",
      line: "adventurer",
      lineLabel: "모험가",
    });
    expect(chef?.classification).toMatchObject({
      kind: "life",
      line: "survivor",
    });
    expect(chef?.prerequisites.map((job) => job.name)).toContain("요리 명장");
    expect(chef?.additionalUnlockConditions).toContain("요리 Lv 50");
  });

  it("includes every first-unlock requirement for tier seven jobs", () => {
    const sage = buildJobManualEntry("primordialsage");

    expect(sage?.additionalUnlockConditions).toEqual([
      "선행 직업 중 하나로 Lv 100",
      "최초 해금: 폭풍 기원의 파편 30개",
      "해금 후 영구 유지",
    ]);
  });

  it("returns null for an unknown job", () => {
    expect(buildJobManualEntry("missing-job")).toBeNull();
  });

  it("resolves every catalog skill reference", () => {
    for (const job of V2_JOB_LIST) {
      for (const skillId of skillsForJob(job.id)) {
        expect(
          V2_SKILLS[skillId],
          `${job.id} references missing skill ${skillId}`,
        ).toBeDefined();
      }
    }
  });
});
