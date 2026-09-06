import { expect, it } from "vitest";
import { buildVenomComparisonCases } from "../../../../scripts/compare-venom-loadouts";
import { compareCombatBuilds } from "./combatComparison";

it("changes only the weapon under identical progression, enhancement and skills", () => {
  const fixture = buildVenomComparisonCases("test-sha", 2);
  const [six, unique] = fixture.loadouts;
  expect(Object.keys(six.equipment).filter((slot) => six.equipment[slot as keyof typeof six.equipment] !== unique.equipment[slot as keyof typeof unique.equipment])).toEqual(["weapon"]);
  expect(six.equipment.weapon).toBe("v2_storm_venom_dagger");
  expect(unique.equipment.weapon).toBe("v2_sky_sig_venom_dagger");
  expect(six.snapshot.v2Skills).toEqual(unique.snapshot.v2Skills);
  expect(six.snapshot.currentJobId).toBe(unique.snapshot.currentJobId);
  expect(fixture.progression.enhanceLevel).toBe(12);
  expect(fixture.progression.careerWins).toBe(500_000);
  expect(fixture.cases.some((c) => c.target.kind === "pve")).toBe(true);
  expect(fixture.cases.some((c) => c.target.kind === "pvp")).toBe(true);
  expect(buildVenomComparisonCases("test-sha", 2)).toEqual(fixture);
});

it("replays both catalog loadouts deterministically", () => {
  const fixture = buildVenomComparisonCases("test-sha", 2);
  for (const input of fixture.cases) {
    const measured = compareCombatBuilds(input);
    expect(measured).toEqual(compareCombatBuilds(input));
    const plain = compareCombatBuilds({ ...input, diagnostics: false });
    expect(measured.builds.map((build) => ({ ...build, runs: build.runs.map((run) => ({
      seed: run.seed, outcome: run.outcome, timeout: run.timeout, turns: run.turns,
      playerRemainingHp: run.playerRemainingHp, targetRemainingHp: run.targetRemainingHp,
    })) }))).toEqual(plain.builds);
  }
});
