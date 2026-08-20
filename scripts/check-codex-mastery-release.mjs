#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const FEATURE_KEYS = [
  "recordingEnabled",
  "overviewVisible",
  "rankingVisible",
  "sealsEnabled",
  "trophiesEnabled",
  "monthlyProgressEnabled",
  "monthlyRankingVisible",
  "settlementEnabled",
  "feedEnabled",
];

const REQUIRED_FILES = [
  "drizzle/0175_codex_research_publication.sql",
  "src/app/api/rankings/codex-research/archive/route.ts",
  "src/app/api/admin/codex-research-seasons/route.ts",
  "src/adventure/rankings/CodexResearchArchivePanel.tsx",
];

const SOURCE_FILES = [
  "src/lib/server/opsSettings.ts",
  "src/adventure/data/v2/codexResearchOps.ts",
  "src/app/api/rankings/codex-research/archive/route.ts",
];

export function validateCodexMasteryRelease(sources, fileNames) {
  const errors = [];
  const files = new Set(fileNames);
  for (const file of REQUIRED_FILES) {
    if (!files.has(file)) errors.push(`required file is missing: ${file}`);
  }

  const settings = sources.get("src/lib/server/opsSettings.ts") ?? "";
  const defaults = settings.match(
    /DEFAULT_CODEX_MASTERY_FEATURES[\s\S]*?=\s*\{([\s\S]*?)\}\s*;/,
  )?.[1] ?? "";
  for (const key of FEATURE_KEYS) {
    if (!new RegExp(`\\b${key}\\s*:\\s*false\\b`).test(defaults)) {
      errors.push(`${key} must default to false`);
    }
  }

  const ops = sources.get("src/adventure/data/v2/codexResearchOps.ts") ?? "";
  if (!/["']publish-honors["']\s*:\s*["']PUBLISH["']/.test(ops)) {
    errors.push("exact PUBLISH confirmation mapping is missing");
  }
  const archive = sources.get(
    "src/app/api/rankings/codex-research/archive/route.ts",
  ) ?? "";
  if (!archive.includes("monthlyRankingVisible") || !archive.includes("trophiesEnabled")) {
    errors.push("archive route must gate monthlyRankingVisible and trophiesEnabled");
  }

  for (const file of fileNames) {
    if (
      /^src\/app\/api\/cron\/codex(?:-|\/)/i.test(file) ||
      /^src\/.*codex.*(?:production|prod).*season/i.test(file)
    ) {
      errors.push(`production automation is forbidden: ${file}`);
    }
  }
  return errors;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next") continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path));
    else output.push(relative(resolve("."), path).split(sep).join("/"));
  }
  return output;
}

async function main() {
  const fileNames = await walk(resolve("."));
  const sources = new Map(await Promise.all(SOURCE_FILES.map(async (file) => [
    file,
    await readFile(resolve(file), "utf8"),
  ])));
  const errors = validateCodexMasteryRelease(sources, fileNames);
  if (errors.length > 0) {
    console.error("✗ codex mastery release check failed");
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log("✓ codex mastery release surface is inert and complete");
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
