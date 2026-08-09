import { describe, expect, it } from "vitest";
import { masteryCertificateStatusFromSaves } from "./masteryCertificateStatus";

describe("masteryCertificateStatusFromSaves", () => {
  it("증서 수량과 사용 가능한 전투 직업만 반환한다", () => {
    const status = masteryCertificateStatusFromSaves(
      { class: "warrior" },
      {
        points: 10,
        groups: {
          warrior: { tier: 1, cultivations: 0, cumLevel: 20 },
          survivor: { tier: 1, cultivations: 0, cumLevel: 15 },
        },
        jobCumLevel: { warrior: 20, fisher: 10, farmer: 5 },
        caps: {},
        grown: {},
      },
      { masteryCertificates: 37 },
    );

    expect(status.certificates).toBe(37);
    expect(status.jobs).toContainEqual(
      expect.objectContaining({ id: "warrior", mastery: 20 }),
    );
    expect(status.jobs.some((job) => job.id === "fisher")).toBe(false);
    expect(status.jobs.some((job) => job.id === "farmer")).toBe(false);
  });

  it("손상된 증서 수량은 0으로 정규화한다", () => {
    expect(
      masteryCertificateStatusFromSaves({}, {}, { masteryCertificates: -3.4 })
        .certificates,
    ).toBe(0);
  });
});
