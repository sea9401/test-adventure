import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("runs the local comparison CLI and emits revision-aware JSON for supplied snapshots", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/compare-combat-builds.ts", "scripts/fixtures/combat-comparison.example.json"], { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.input.codeVersion).toMatch(/^[a-f0-9]{40}$/);
  expect(typeof report.workingTreeDirty).toBe("boolean");
  expect(report.builds).toHaveLength(2);
  expect(report.builds[0].runs).toHaveLength(20);
  expect(report.input.builds[0].name).toBe("example-A");
});

it("rejects a missing input path without running a simulation", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/compare-combat-builds.ts"], { encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Usage:");
  expect(result.stdout).toBe("");
});

it("reports opt-in diagnostics and identifies the mana-starved build", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/compare-combat-builds.ts", "scripts/fixtures/combat-diagnostics.example.json"], { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report.diagnosticCoverage.complete).toBe(false);
  expect(report.builds[1].runs[0].diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ metric: "skill_gate", source: "v2c_warrior_strike", target: "player:mp" }),
  ]));
});
