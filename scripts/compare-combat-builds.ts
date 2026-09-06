import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { compareCombatBuilds, type CombatComparisonInput } from "../src/adventure/v2/combat/combatComparison";

// Explicit local file only; no env file loading, database or network access.
const path = process.argv[2];
if (!path || process.argv.length !== 3) {
  console.error("Usage: npx tsx scripts/compare-combat-builds.ts <input.json>");
  process.exitCode = 1;
} else {
  try {
    const source = readFileSync(path, "utf8");
    if (Buffer.byteLength(source) > 2_000_000) throw new Error("Input exceeds 2 MB");
    const codeVersion = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;
    const input = JSON.parse(source) as CombatComparisonInput;
    const report = compareCombatBuilds({ ...input, codeVersion });
    console.log(JSON.stringify({ ...report, workingTreeDirty: dirty }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Combat comparison failed");
    process.exitCode = 1;
  }
}
