import { describe, expect, it, vi } from "vitest";
import { emptyProficiency } from "@/adventure/data/v2/proficiency";
import { jobsV2Section } from "./stateSections";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/adventure/data/v2/coreLoopConfig")
  >()),
  V2_CORE_LOOP_V2: true,
}));

describe("jobsV2Section 해금 조건 진행도", () => {
  const section = () =>
    jobsV2Section({
      charSave: { class: "warrior", level: 100 } as never,
      proficiencyRaw: {
        ...emptyProficiency(),
        groups: { warrior: { cultivations: 0, tier: 1, cumLevel: 640 } },
      },
      skillsRaw: null,
      jobUnlockCtx: undefined,
    });

  it("공개된 조건은 선행 직업 숙련도의 현재값/필요값을 함께 준다", () => {
    const squire = section()?.jobs.find((job) => job.id === "squire");

    expect(squire?.conditionProgress).toBe("견습 병사 숙련도 640/1,000");
  });

  it("미공개 직업에는 진행도를 싣지 않는다", () => {
    const hidden = section()?.jobs.find((job) => !job.conditionRevealed);

    expect(hidden).toBeTruthy();
    expect(hidden?.conditionProgress).toBeUndefined();
  });
});
