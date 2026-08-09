import { describe, expect, it } from "vitest";

import {
  buildCoopBossBalanceReport,
  withSeededRandom,
  type CoopBossAudit,
} from "../../../../scripts/sim-v2-coop-boss";
import { summarizeLiveCoopAudits } from "../../../../scripts/sim-live-top-combat";

const BALANCE_TARGETS = {
  mountain_chief: { survival: [90, 100], contribution: [0.03, 0.08] },
  canyon_predator: { survival: [85, 100], contribution: [0.03, 0.08] },
  lake_sovereign: { survival: [75, 95], contribution: [0.03, 0.08] },
  void_priest: { survival: [65, 90], contribution: [0.03, 0.08] },
  mountain_chief_hard: { survival: [35, 70], contribution: [0.02, 0.05] },
  // 심연어룡은 파생 ATK·적중 반올림 경계에서 계보별 생존율이 이산적으로 변한다.
  // 대응/비대응 생존 조건은 별도 검사하고, 난도 상한은 아래 중앙 잔여 HP로 고정한다.
  abyssal_tyrant: { survival: [35, 100], contribution: [0.02, 0.05] },
} as const;

let cachedBalanceReport: CoopBossAudit[] | undefined;

function fullBalanceReport(): CoopBossAudit[] {
  cachedBalanceReport ??= buildCoopBossBalanceReport({
    trials: 200,
    seed: 20260809,
  });
  return cachedBalanceReport;
}

function auditFor(bossId: keyof typeof BALANCE_TARGETS): CoopBossAudit {
  const audit = fullBalanceReport().find((entry) => entry.bossId === bossId);
  if (!audit) throw new Error(`missing balance audit: ${bossId}`);
  return audit;
}

describe("협동 보스 결정적 밸런스 시뮬레이션", () => {
  it("협동 보스 보고서는 6종과 7계보를 실제 20턴 전투로 집계한다", () => {
    const report = buildCoopBossBalanceReport({ trials: 2, seed: 20260809 });

    expect(report).toHaveLength(6);
    expect(report.every((boss) => boss.builds.length === 7)).toBe(true);
    expect(
      report.every((boss) =>
        boss.builds.every(
          (build) =>
            build.medianContributionRatio >= 0 &&
            build.medianContributionRatio <= 1,
        ),
      ),
    ).toBe(true);
  });

  it("같은 시드의 보고서는 보스 실행 순서와 무관하다", () => {
    const ids = ["mountain_chief", "void_priest"] as const;
    const forward = buildCoopBossBalanceReport({
      trials: 2,
      seed: 77,
      bossIds: ids,
    });
    const reverse = buildCoopBossBalanceReport({
      trials: 2,
      seed: 77,
      bossIds: [...ids].reverse(),
    });

    expect(reverse.reverse()).toEqual(forward);
  });

  it("시뮬레이션 콜백이 실패해도 전역 난수 함수는 복원한다", () => {
    const original = Math.random;

    expect(() =>
      withSeededRandom(1, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(Math.random).toBe(original);
  });

  it("운영 교차 검증은 식별 정보 없이 보스별 집계만 반환한다", () => {
    const rows = [
      {
        bossId: "mountain_chief" as const,
        survived: true,
        contributionRatio: 0.01,
        email: "sentinel-email@example.invalid",
      },
      {
        bossId: "mountain_chief" as const,
        survived: false,
        contributionRatio: 0.03,
        userId: "sentinel-user-id",
      },
      {
        bossId: "mountain_chief" as const,
        survived: true,
        contributionRatio: 0.05,
        gameName: "sentinel-game-name",
      },
      {
        bossId: "void_priest" as const,
        survived: true,
        contributionRatio: 0.08,
      },
    ];

    const summary = summarizeLiveCoopAudits(rows);

    expect(summary).toEqual([
      {
        bossId: "mountain_chief",
        survivalRatePct: (2 / 3) * 100,
        minContributionRatio: 0.01,
        medianContributionRatio: 0.03,
        p95ContributionRatio: 0.03,
      },
      {
        bossId: "void_priest",
        survivalRatePct: 100,
        minContributionRatio: 0.08,
        medianContributionRatio: 0.08,
        p95ContributionRatio: 0.08,
      },
    ]);
    expect(JSON.stringify(summary)).not.toMatch(
      /sentinel-email|sentinel-user-id|sentinel-game-name/,
    );
  });

  it(
    "6종의 20턴 생존율과 기여율은 승인된 계단식 난도 범위에 든다",
    () => {
      for (const [bossId, target] of Object.entries(BALANCE_TARGETS)) {
        const audit = auditFor(bossId as keyof typeof BALANCE_TARGETS);
        expect(
          audit.medianSurvivalRatePct,
          `${bossId} median survival`,
        ).toBeGreaterThanOrEqual(target.survival[0]);
        expect(
          audit.medianSurvivalRatePct,
          `${bossId} median survival`,
        ).toBeLessThanOrEqual(target.survival[1]);
        expect(
          audit.medianContributionRatio,
          `${bossId} median contribution`,
        ).toBeGreaterThanOrEqual(target.contribution[0]);
        expect(
          audit.medianContributionRatio,
          `${bossId} median contribution`,
        ).toBeLessThanOrEqual(target.contribution[1]);
        expect(
          audit.p95ContributionRatio,
          `${bossId} p95 contribution`,
        ).toBeLessThanOrEqual(0.15);
      }
    },
    300_000,
  );

  it(
    "일반 4종의 중앙 생존율은 상위 단계로 갈수록 증가하지 않는다",
    () => {
      const normalLadder = [
        "mountain_chief",
        "canyon_predator",
        "lake_sovereign",
        "void_priest",
      ] as const;
      const survivalRates = normalLadder.map(
        (bossId) => auditFor(bossId).medianSurvivalRatePct,
      );

      for (let index = 1; index < survivalRates.length; index += 1) {
        expect(
          survivalRates[index],
          `${normalLadder[index]} survival staircase`,
        ).toBeLessThanOrEqual(survivalRates[index - 1]);
      }
    },
    300_000,
  );

  it(
    "하드 보스는 대응 방어 계보를 보상하면서 다른 계보 두 종 이상도 생존시킨다",
    () => {
      const hardSangoon = auditFor("mountain_chief_hard");
      const abyssalTyrant = auditFor("abyssal_tyrant");
      const build = (audit: CoopBossAudit, arch: string) => {
        const found = audit.builds.find((entry) => entry.arch === arch);
        if (!found) throw new Error(`missing build audit: ${audit.bossId}/${arch}`);
        return found;
      };

      expect(build(hardSangoon, "VIT").survivalRatePct).toBeGreaterThanOrEqual(
        75,
      );
      expect(build(hardSangoon, "LUK").survivalRatePct).toBeGreaterThanOrEqual(
        75,
      );
      expect(
        hardSangoon.builds.filter(
          (entry) =>
            entry.arch !== "VIT" &&
            entry.arch !== "LUK" &&
            entry.survivalRatePct >= 50,
        ).length,
      ).toBeGreaterThanOrEqual(2);

      expect(build(abyssalTyrant, "VIT").survivalRatePct).toBeGreaterThanOrEqual(
        75,
      );
      expect(build(abyssalTyrant, "SPI").survivalRatePct).toBeGreaterThanOrEqual(
        75,
      );
      expect(
        abyssalTyrant.builds.filter(
          (entry) =>
            entry.arch !== "VIT" &&
            entry.arch !== "SPI" &&
            entry.survivalRatePct >= 50,
        ).length,
      ).toBeGreaterThanOrEqual(2);

      const abyssalMedianHpRatio = [...abyssalTyrant.builds]
        .map((entry) => entry.medianPlayerHpRatio)
        .sort((left, right) => left - right)[3];
      expect(abyssalMedianHpRatio).toBeGreaterThan(0);
      expect(abyssalMedianHpRatio).toBeLessThanOrEqual(0.05);
    },
    300_000,
  );
});
