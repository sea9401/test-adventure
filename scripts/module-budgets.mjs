import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Large legacy modules are frozen at their audited baseline so they cannot grow while
// they are split incrementally. New high-traffic modules use the same no-growth gate.
export const MODULE_BUDGETS = [
  { path: "src/adventure/v2/combat/combatShared.ts", maxLines: 2_110 },
  { path: "src/adventure/v2/combat/combatDots.ts", maxLines: 250 },
  { path: "src/adventure/v2/combat/hitDistribution.ts", maxLines: 40 },
  { path: "src/adventure/v2/combat/combatRandom.ts", maxLines: 50 },
  { path: "src/adventure/v2/combat/combatComparison.ts", maxLines: 140 },
  { path: "src/adventure/v2/combat/combatDiagnostics.ts", maxLines: 80 },
  { path: "src/adventure/v2/combat/combatHpLedger.ts", maxLines: 45 },
  { path: "scripts/compare-venom-matrix.ts", maxLines: 90 },
  { path: "src/adventure/v2/V2MarketplaceView.tsx", maxLines: 1_950 },
  {
    path: "src/adventure/v2/marketplace/MarketplaceStackBrowse.tsx",
    maxLines: 230,
  },
  { path: "src/adventure/v2/GameStateProvider.tsx", maxLines: 1_300 },
  { path: "src/adventure/v2/GameStateRefreshContext.tsx", maxLines: 50 },
  // Fourth-pass numeric hooks only: +6/+1 lines above the previous ceilings.
  { path: "src/adventure/v2/combat/engine.ts", maxLines: 1_116 },
  { path: "src/adventure/v2/combat/engine-pvp.ts", maxLines: 360 },
  { path: "src/adventure/v2/combat/engine.pveOperations.ts", maxLines: 1_180 },
  { path: "src/adventure/v2/combat/engine.playerSkills.ts", maxLines: 1_730 },
  { path: "src/adventure/v2/combat/engine.enemySkills.ts", maxLines: 911 },
  { path: "src/adventure/v2/combat/engine.pvpOperations.ts", maxLines: 1_820 },
  { path: "src/adventure/v2/combat/engine.pvpSkills.ts", maxLines: 2_280 },
  { path: "src/adventure/v2/combat/engine.pvpSkillInput.ts", maxLines: 195 },
  { path: "src/adventure/v2/combat/engine.pvpProvoke.ts", maxLines: 75 },
  { path: "src/adventure/v2/combat/engine.pvpStats.ts", maxLines: 230 },
  { path: "src/adventure/v2/combat/engine.pvpSide.ts", maxLines: 30 },
  { path: "src/adventure/v2/combat/engine.pvpShadow.ts", maxLines: 100 },
  { path: "src/adventure/v2/combat/engine.pveRecovery.ts", maxLines: 120 },
  { path: "scripts/compare-venom-loadouts.ts", maxLines: 90 },
  { path: "src/adventure/v2/combat/engine.pvpInitialState.ts", maxLines: 285 },
  { path: "src/adventure/v2/combat/engine.atb.ts", maxLines: 1_265 },
  { path: "src/adventure/v2/combat/engine.atbLog.ts", maxLines: 155 },
  { path: "src/adventure/v2/combat/engine.atbFortress.ts", maxLines: 165 },
  { path: "src/adventure/v2/combat/engine.atbBerserker.ts", maxLines: 160 },
  { path: "src/adventure/v2/combat/engine.atbTracking.ts", maxLines: 235 },
  { path: "src/adventure/v2/combat/engine.atbCrystal.ts", maxLines: 200 },
  { path: "src/adventure/v2/combat/engine.atbGlacial.ts", maxLines: 300 },
  { path: "src/adventure/v2/combat/engine.atbToxic.ts", maxLines: 355 },
  { path: "src/adventure/v2/combat/engine.pvpState.ts", maxLines: 270 },
  { path: "src/app/api/v2/dungeon/hunt/route.ts", maxLines: 70 },
  // Includes the request-phase wrapper; gameplay extraction budget remains bounded.
  { path: "src/app/api/v2/dungeon/hunt/huntExecution.ts", maxLines: 1_280 },
  { path: "src/app/api/v2/dungeon/hunt/huntRequest.ts", maxLines: 400 },
  { path: "src/lib/server/derivePlayerCombatV2.ts", maxLines: 100 },
  { path: "src/lib/server/derivePlayerCombatV2Pure.ts", maxLines: 980 },
  { path: "src/app/api/v2/dungeon/hunt/huntLocations.ts", maxLines: 30 },
  { path: "src/admin/tabs/OpsDashboardTab.tsx", maxLines: 435 },
  { path: "src/admin/tabs/OpsDashboardHotTime.tsx", maxLines: 505 },
  { path: "src/admin/tabs/OpsDashboardRewards.tsx", maxLines: 505 },
  { path: "src/admin/tabs/OpsDashboardRisk.tsx", maxLines: 440 },
  { path: "src/admin/tabs/OpsDashboardSettings.tsx", maxLines: 340 },
  { path: "src/admin/tabs/OpsDashboardSummary.tsx", maxLines: 105 },
  { path: "src/admin/tabs/OpsDashboardUi.tsx", maxLines: 295 },
  { path: "src/adventure/v2/FishingView.tsx", maxLines: 950 },
  { path: "src/adventure/v2/FishingCanvas.tsx", maxLines: 245 },
  { path: "src/adventure/v2/fishingCanvasDrawing.ts", maxLines: 895 },
  { path: "src/app/api/v2/grid-dungeon/route.ts", maxLines: 560 },
  { path: "src/app/api/v2/guild/workshop/route.ts", maxLines: 850 },
  { path: "src/app/api/admin/ops-dashboard/route.ts", maxLines: 390 },
  { path: "src/lib/server/gridDungeonSupport.ts", maxLines: 435 },
  { path: "src/lib/server/gridDungeonReadModel.ts", maxLines: 190 },
  { path: "src/lib/server/gridDungeonBattle.ts", maxLines: 210 },
  { path: "src/lib/server/guildWorkshopAccess.ts", maxLines: 205 },
  { path: "src/lib/server/guildWorkshopReadHandler.ts", maxLines: 215 },
  { path: "src/lib/server/opsDashboardModel.ts", maxLines: 710 },
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
