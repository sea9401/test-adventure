import { describe, expect, it } from "vitest";
import { productionAdvanceCandidates } from "./ProductionJobAdvanceNotice";

describe("productionAdvanceCandidates", () => {
  it("returns an unlocked direct-next production job", () => {
    expect(
      productionAdvanceCandidates({
        jobsV2: {
          currentJobId: "farmer",
          jobs: [
            {
              id: "horticulturist",
              name: "원예가",
              condition: "농부 전직, 농사 Lv 10",
              unlocked: true,
            },
          ],
        },
      }),
    ).toEqual([
      {
        id: "horticulturist",
        name: "원예가",
        condition: "농부 전직, 농사 Lv 10",
        unlocked: true,
      },
    ]);
  });

  it("does not announce locked jobs or production jobs unrelated to the current line", () => {
    expect(
      productionAdvanceCandidates({
        jobsV2: {
          currentJobId: "farmer",
          jobs: [
            {
              id: "horticulturist",
              name: "원예가",
              condition: "농부 전직, 농사 Lv 10",
              unlocked: false,
            },
            {
              id: "miningtechnician",
              name: "채광 기술자",
              condition: "광부 전직, 채광 Lv 10",
              unlocked: true,
            },
          ],
        },
      }),
    ).toEqual([]);
  });
});
