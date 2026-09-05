import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Large legacy modules are frozen at their audited baseline so they cannot grow while
// they are split incrementally. New high-traffic modules use the same no-growth gate.
export const MODULE_BUDGETS = [
  { path: "src/adventure/v2/V2MarketplaceView.tsx", maxLines: 1_950 },
  {
    path: "src/adventure/v2/marketplace/MarketplaceStackBrowse.tsx",
    maxLines: 230,
  },
  { path: "src/adventure/v2/GameStateProvider.tsx", maxLines: 1_300 },
  { path: "src/adventure/v2/GameStateRefreshContext.tsx", maxLines: 50 },
  { path: "src/adventure/v2/combat/engine.ts", maxLines: 1_110 },
  { path: "src/adventure/v2/combat/engine-pvp.ts", maxLines: 360 },
  { path: "src/adventure/v2/combat/engine.pveOperations.ts", maxLines: 1_180 },
  { path: "src/adventure/v2/combat/engine.playerSkills.ts", maxLines: 1_730 },
  { path: "src/adventure/v2/combat/engine.enemySkills.ts", maxLines: 910 },
  { path: "src/adventure/v2/combat/engine.pvpOperations.ts", maxLines: 2_260 },
  { path: "src/adventure/v2/combat/engine.pvpSkills.ts", maxLines: 2_510 },
  { path: "src/adventure/v2/combat/engine.pvpState.ts", maxLines: 270 },
  { path: "src/app/api/v2/dungeon/hunt/route.ts", maxLines: 70 },
  { path: "src/app/api/v2/dungeon/hunt/huntExecution.ts", maxLines: 1_260 },
  { path: "src/app/api/v2/dungeon/hunt/huntRequest.ts", maxLines: 400 },
  { path: "src/lib/server/derivePlayerCombatV2.ts", maxLines: 100 },
  { path: "src/lib/server/derivePlayerCombatV2Pure.ts", maxLines: 980 },
  { path: "src/app/api/v2/dungeon/hunt/huntLocations.ts", maxLines: 30 },
  { path: "src/admin/tabs/OpsDashboardTab.tsx", maxLines: 2_650 },
  { path: "src/adventure/v2/V2CodexView.tsx", maxLines: 1_619 },
  { path: "src/components/ChatPanel.tsx", maxLines: 1_294 },
  { path: "src/app/api/v2/me/state/route.ts", maxLines: 762 },
];

/**
 * @param {readonly { path: string; maxLines: number }[]} entries
 * @param {(path: string) => number} readLineCount
 */
export function checkModuleBudgets(entries, readLineCount) {
  return entries.flatMap((entry) => {
    let lines;
    try {
      lines = readLineCount(entry.path);
    } catch {
      return [{ ...entry, lines: null, reason: "missing" }];
    }
    return lines > entry.maxLines
      ? [{ ...entry, lines, reason: "line_budget" }]
      : [];
  });
}

export function lineCount(content) {
  if (content === "") return 0;
  const newlineCount = content.match(/\n/g)?.length ?? 0;
  return newlineCount + (content.endsWith("\n") ? 0 : 1);
}

function fileLineCount(path) {
  return lineCount(readFileSync(path, "utf8"));
}

function runCli() {
  const violations = checkModuleBudgets(MODULE_BUDGETS, fileLineCount);
  if (violations.length === 0) {
    console.log(`MODULE BUDGETS PASS (${MODULE_BUDGETS.length} files)`);
    return;
  }
  for (const violation of violations) {
    if (violation.reason === "missing") {
      console.error(`MODULE BUDGET FAIL missing: ${violation.path}`);
    } else {
      console.error(
        `MODULE BUDGET FAIL ${violation.path}: ${violation.lines} > ${violation.maxLines}`,
      );
    }
  }
  process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli();
}
