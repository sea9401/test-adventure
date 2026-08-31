import { describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return {
    ...actual,
    V2_CORE_LOOP_V2: true,
    V2_ATB_SKILLS: true,
    V2_SKILL_PROC_IN_PATTERN: true,
  };
});

import { runTier7SwordLineBalance } from "../../../../scripts/sim-v2-tier7-sword-line";
import legacyBaseline from "../../../../scripts/fixtures/tier7-sword-line-legacy-baseline.json";

describe("검성 계열 7차 결정적 밸런스 시뮬레이션", () => {
  it(
    "같은 200개 시드로 동일한 검성 계열 PvE/PvP 분포를 재현한다",
    () => {
      const options = { seeds: 200, seedBase: 20_260_829 };
      const first = runTier7SwordLineBalance(options);
      const second = runTier7SwordLineBalance(options);

      expect(second).toEqual(first);
      expect(first.seeds).toBe(200);
      expect(first.cases.map((entry) => entry.id)).toEqual([
        "swordsaint-core",
        "shadowblade-core",
        "shadowblade-inherited",
        "ruinblade-core",
        "ruinblade-inherited",
      ]);
      for (const entry of first.cases) {
        expect(entry.pveShort.samples).toHaveLength(200);
        expect(entry.pveLong.samples).toHaveLength(200);
        expect(entry.pveLow.samples).toHaveLength(200);
        expect(entry.pvp.samples).toHaveLength(200);
      }
    },
    120_000,
  );

  it(
    "200시드 PvE 목표 범위와 PvP 비상향 조건을 만족한다",
    () => {
      const report = runTier7SwordLineBalance({
        seeds: 200,
        seedBase: 20_260_829,
      });

      expect(report.ratios.shadowCoreToSwordsaint).toBeGreaterThanOrEqual(1.1);
      expect(report.ratios.shadowCoreToSwordsaint).toBeLessThanOrEqual(1.2);
      // 멸검제는 저체력에서 멸검이 열리는 조건부 직업이다. 공격하지 않는
      // 만피 허수아비에서도 검성보다 강하도록 극한일격을 과도하게 올리지 않는다.
      expect(report.ratios.ruinCoreToSwordsaint).toBeGreaterThanOrEqual(0.75);
      expect(report.ratios.ruinCoreToSwordsaint).toBeLessThanOrEqual(0.85);
      expect(report.ratios.ruinCoreLowToSwordsaint).toBeGreaterThanOrEqual(1.1);
      expect(report.ratios.ruinCoreLowToSwordsaint).toBeLessThanOrEqual(1.2);
      expect(report.ratios.shadowInheritedToSwordsaint).toBeGreaterThanOrEqual(1.7);
      expect(report.ratios.shadowInheritedToSwordsaint).toBeLessThanOrEqual(1.9);
      expect(report.ratios.ruinInheritedToSwordsaint).toBeGreaterThanOrEqual(1.7);
      expect(report.ratios.ruinInheritedToSwordsaint).toBeLessThanOrEqual(1.9);
      expect(report.ratios.tier7IdentityGap).toBeLessThanOrEqual(0.1);
      const byId = Object.fromEntries(
        report.cases.map((entry) => [entry.id, entry]),
      );
      const shadowInherited = byId["shadowblade-inherited"].pveLong.mean;
      const ruinInherited = byId["ruinblade-inherited"].pveLong.mean;
      expect(
        Math.abs(shadowInherited - ruinInherited) /
          Math.max(shadowInherited, ruinInherited, 1),
      ).toBeLessThanOrEqual(0.1);
      expect(report.identity.ruinMaxSingleHit).toBeGreaterThan(
        report.identity.shadowMaxSingleHit,
      );

      for (const entry of report.cases.filter((item) => item.id !== "swordsaint-core")) {
        const legacy = legacyBaseline.cases[entry.id];
        expect(entry.pvp.mean).toBeLessThanOrEqual(legacy.mean * 1.05);
        expect(entry.pvp.firstActionKoRate).toBeLessThanOrEqual(
          legacy.firstActionKoRate + 0.02,
        );
      }
    },
    120_000,
  );
});
