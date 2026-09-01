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
      const options = { seeds: 2, seedBase: 20_260_829 };
      const first = runTier7SwordLineBalance(options);
      const second = runTier7SwordLineBalance(options);

      expect(second).toEqual(first);
      expect(first.seeds).toBe(2);
      expect(first.cases.map((entry) => entry.id)).toEqual([
        "swordsaint-core",
        "blackmoon-core",
        "hegemon-core",
        "shadow-prerequisite",
        "shadowblade-core",
        "shadowblade-inherited",
        "shadowblade-full",
        "ruin-prerequisite",
        "ruinblade-core",
        "ruinblade-inherited",
        "ruinblade-full",
        "heavenlybow-core",
        "celestialdragon-core",
        "sky-prerequisite",
        "skyascendant-core",
        "skyascendant-inherited",
        "skyascendant-full",
      ]);
      for (const entry of first.cases) {
        expect(entry.pveShort.samples).toHaveLength(2);
        expect(entry.pveLong.samples).toHaveLength(2);
        expect(entry.pveLow.samples).toHaveLength(2);
        expect(entry.pvp.samples).toHaveLength(2);
      }
    },
    120_000,
  );

  it(
    "7차 고유 패키지는 일반 PvE와 PvP에서도 검성보다 명확히 강하다",
    () => {
      const report = runTier7SwordLineBalance({
        seeds: 200,
        seedBase: 20_260_829,
      });

      const byId = Object.fromEntries(
        report.cases.map((entry) => [entry.id, entry]),
      );
      const shadowPrerequisiteLong = Math.max(
        byId["swordsaint-core"].pveLong.mean,
        byId["blackmoon-core"].pveLong.mean,
      );
      const shadowPrerequisitePvp = Math.max(
        byId["swordsaint-core"].pvp.mean,
        byId["blackmoon-core"].pvp.mean,
      );
      const ruinPrerequisiteLong = Math.max(
        byId["swordsaint-core"].pveLong.mean,
        byId["hegemon-core"].pveLong.mean,
      );
      const ruinPrerequisitePvp = Math.max(
        byId["swordsaint-core"].pvp.mean,
        byId["hegemon-core"].pvp.mean,
      );
      const shadowLongRatio =
        byId["shadowblade-core"].pveLong.mean / shadowPrerequisiteLong;
      const ruinLongRatio =
        byId["ruinblade-core"].pveLong.mean / ruinPrerequisiteLong;
      expect(shadowLongRatio).toBeGreaterThanOrEqual(1.1);
      expect(shadowLongRatio).toBeLessThanOrEqual(1.15);
      expect(ruinLongRatio).toBeGreaterThanOrEqual(1.1);
      expect(ruinLongRatio).toBeLessThanOrEqual(1.15);

      const shadowPvpRatio =
        byId["shadowblade-core"].pvp.mean / shadowPrerequisitePvp;
      const ruinPvpRatio =
        byId["ruinblade-core"].pvp.mean / ruinPrerequisitePvp;
      expect(shadowPvpRatio).toBeGreaterThanOrEqual(1.05);
      expect(shadowPvpRatio).toBeLessThanOrEqual(1.1);
      expect(ruinPvpRatio).toBeGreaterThanOrEqual(1.05);
      expect(ruinPvpRatio).toBeLessThanOrEqual(1.1);

      const skyPrerequisiteLong = Math.max(
        byId["heavenlybow-core"].pveLong.mean,
        byId["celestialdragon-core"].pveLong.mean,
      );
      const skyPrerequisitePvp = Math.max(
        byId["heavenlybow-core"].pvp.mean,
        byId["celestialdragon-core"].pvp.mean,
      );
      const skyLongRatio =
        byId["skyascendant-core"].pveLong.mean / skyPrerequisiteLong;
      const skyPvpRatio =
        byId["skyascendant-core"].pvp.mean / skyPrerequisitePvp;
      expect(skyLongRatio).toBeGreaterThanOrEqual(1.1);
      expect(skyLongRatio).toBeLessThanOrEqual(1.15);
      expect(skyPvpRatio).toBeGreaterThanOrEqual(1.05);
      expect(skyPvpRatio).toBeLessThanOrEqual(1.1);

      const ruinLowToNormal =
        byId["ruinblade-core"].pveLow.mean /
        byId["ruinblade-core"].pveLong.mean;
      expect(ruinLowToNormal).toBeGreaterThanOrEqual(1.2);
      expect(ruinLowToNormal).toBeLessThanOrEqual(1.35);

      const shadowBudgetRatio =
        byId["shadowblade-inherited"].pveLong.mean /
        byId["shadow-prerequisite"].pveLong.mean;
      const ruinBudgetRatio =
        byId["ruinblade-inherited"].pveLong.mean /
        byId["ruin-prerequisite"].pveLong.mean;
      expect(shadowBudgetRatio).toBeGreaterThanOrEqual(1.25);
      expect(ruinBudgetRatio).toBeGreaterThanOrEqual(1.25);
      expect(report.identity.ruinMaxSingleHit).toBeGreaterThan(
        report.identity.shadowMaxSingleHit,
      );

      for (const entry of report.cases) {
        const legacy = legacyBaseline.cases[
          entry.id as keyof typeof legacyBaseline.cases
        ];
        if (!legacy) continue;
        expect(entry.pvp.firstActionKoRate).toBeLessThanOrEqual(
          legacy.firstActionKoRate + 0.02,
        );
      }
    },
    120_000,
  );
});
