#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assetDifferences,
  collectCurrentAssets,
  countAssetsBySource,
} from "./asset-rights-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER_PATH = path.join(ROOT, "docs", "asset-rights.json");
const WRITE = process.argv.includes("--write");
const STRICT = process.argv.includes("--strict");

const ledger = JSON.parse(await fs.readFile(LEDGER_PATH, "utf8"));
const current = await collectCurrentAssets(ROOT, ledger);

if (WRITE) {
  ledger.assets = current;
  await fs.writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(`✅ Wrote ${path.relative(ROOT, LEDGER_PATH)} (${current.length} assets).`);
} else {
  const expected = JSON.stringify(ledger.assets ?? []);
  const actual = JSON.stringify(current);
  if (expected !== actual) {
    console.error("❌ Static asset rights ledger is stale:");
    for (const difference of assetDifferences(ledger.assets ?? [], current)) {
      console.error(difference);
    }
    console.error("Run npm run update-asset-rights after reviewing the rights source.");
    process.exit(1);
  }
}

const counts = countAssetsBySource(current);
for (const source of ledger.sources) {
  const count = counts.get(source.id) ?? 0;
  console.log(`  ${source.id}: ${count} (${source.releaseStatus})`);
  if (STRICT && count && source.releaseStatus !== "cleared") {
    console.error(`❌ ${source.id} still requires rights clearance.`);
    process.exitCode = 1;
  }
}
if (!process.exitCode) {
  console.log(`✅ ${current.length} deployed visual assets match the rights ledger.`);
}
