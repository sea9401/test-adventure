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

  it("7차는 첫 전직 성공 이력이 있어야 숙련 증서 대상으로 제공한다", () => {
    const candidate = {
      points: 0,
      groups: {},
      jobCumLevel: { swordsaint: 100_000, blackmoon: 100_000 },
      jobHistory: [] as string[],
      caps: {},
      grown: {},
    };

    const before = masteryCertificateStatusFromSaves({}, candidate, {});
    expect(before.jobs.some((job) => job.id === "shadowblade")).toBe(false);

    candidate.jobHistory = ["shadowblade"];
    const after = masteryCertificateStatusFromSaves({}, candidate, {});
    expect(after.jobs.some((job) => job.id === "shadowblade")).toBe(true);
  });
});
