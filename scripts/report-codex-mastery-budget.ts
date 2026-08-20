#!/usr/bin/env node

import {
  CODEX_MASTERY_BUDGET_REPORT,
  CODEX_MASTERY_CATALOG_VERSION,
} from "../src/adventure/data/v2/codexMasteryProductionCatalog";

let invalid = false;
console.log(`codex-mastery catalog v${CODEX_MASTERY_CATALOG_VERSION}`);
for (const [category, report] of Object.entries(CODEX_MASTERY_BUDGET_REPORT)) {
  const displayPoints = Math.round(report.scoreMilli / 1_000);
  console.log(
    `${category}: entries=${report.entries} scoreMilli=${report.scoreMilli} displayPoints=${displayPoints}`,
  );
  if (report.scoreMilli < 9_900_000 || report.scoreMilli > 10_100_000) {
    invalid = true;
  }
}
if (invalid) process.exitCode = 1;
