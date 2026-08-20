import { describe, expect, it } from "vitest";

import {
  buildCoopBossBalanceReport,
  withSeededRandom,
} from "../../../../scripts/sim-v2-coop-boss";
import { summarizeLiveCoopAudits } from "../../../../scripts/sim-live-top-combat";

// 보스 원본 수치·기믹 회귀는 coopBosses.test.ts의 리터럴 스냅샷이 고정한다.
// 이 파일은 이후 전투 공식 변경과 독립적인 시뮬레이터 결정성·익명 집계 계약만 검증한다.

describe("협동 보스 결정적 밸런스 시뮬레이션", () => {
  it("협동 보스 보고서는 8종과 7계보를 3,000틱 전투로 집계한다", () => {
    const report = buildCoopBossBalanceReport({ trials: 2, seed: 20260809 });

    expect(report).toHaveLength(8);
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
  }, 15_000);

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
        medianRequiredAttacks: 34,
      },
      {
        bossId: "void_priest",
        survivalRatePct: 100,
        minContributionRatio: 0.08,
        medianContributionRatio: 0.08,
        p95ContributionRatio: 0.08,
        medianRequiredAttacks: 13,
      },
    ]);
    expect(JSON.stringify(summary)).not.toMatch(
      /sentinel-email|sentinel-user-id|sentinel-game-name/,
    );
  });

});
