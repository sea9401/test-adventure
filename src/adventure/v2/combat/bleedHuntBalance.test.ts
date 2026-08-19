import { describe, expect, it } from "vitest";
import { runBeastkinBalance } from "../../../../scripts/sim-v2-beastkin-jobs";

describe("수인 계보 결정적 밸런스 비교", () => {
  it("같은 시드와 시행 횟수는 같은 결과를 낸다", () => {
    expect(runBeastkinBalance(20_260_820, 2)).toEqual(
      runBeastkinBalance(20_260_820, 2),
    );
  });

  it("2~6차의 완성 계보·휴대형 패키지를 같은 차수 중앙값과 비교한다", () => {
    const report = runBeastkinBalance(20_260_820, 2);
    expect(report.cases).toHaveLength(10);
    expect(new Set(report.cases.map((entry) => entry.jobId))).toEqual(
      new Set([
        "beastwarrior",
        "tracker",
        "bloodtracker",
        "predator",
        "primalpredator",
      ]),
    );
    for (const entry of report.cases) {
      for (const value of [
        entry.power,
        entry.sp,
        entry.powerPerSp,
        entry.sameTierMedianPowerPerSp,
        entry.winRatePct,
        entry.averageActions,
        entry.averageDamage,
        entry.averageHealing,
        entry.bleed5UptimePct,
        entry.bleed10UptimePct,
      ]) {
        expect(Number.isFinite(value)).toBe(true);
      }
      expect(entry.sp).toBeGreaterThan(0);
      expect(entry.powerPerSp).toBeGreaterThan(0);
      expect(entry.sameTierMedianPowerPerSp).toBeGreaterThan(0);
      expect(entry.bleed5UptimePct).toBeGreaterThanOrEqual(0);
      expect(entry.bleed10UptimePct).toBeLessThanOrEqual(
        entry.bleed5UptimePct,
      );
    }
  });

  it("현재 차수 두 스킬의 SP당 점수는 같은 차수 중앙값의 과도한 이상치가 아니다", () => {
    const portable = runBeastkinBalance(20_260_820, 1).cases.filter(
      (entry) => entry.variant === "portable",
    );
    for (const entry of portable) {
      const ratio = entry.powerPerSp / entry.sameTierMedianPowerPerSp;
      expect(ratio).toBeGreaterThan(0.65);
      expect(ratio).toBeLessThan(1.45);
    }
  });
});
