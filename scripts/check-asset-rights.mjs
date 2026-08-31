#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const STORE_ASSETS = path.join(ROOT, "android", "store-assets");
const LEDGER_PATH = path.join(ROOT, "docs", "asset-rights.json");
const WRITE = process.argv.includes("--write");
const STRICT = process.argv.includes("--strict");
const ASSET_RE = /\.(?:avif|gif|ico|jpe?g|m4a|mp3|mp4|ogg|otf|png|svg|ttf|wav|webm|webp|woff2?)$/i;

const ledger = JSON.parse(await fs.readFile(LEDGER_PATH, "utf8"));
const sourceById = new Map(ledger.sources.map((source) => [source.id, source]));
const scanned = [
  ...(await scanAssets(PUBLIC)),
  ...(await scanAssets(STORE_ASSETS, [], { optional: true })),
];
const current = [];

for (const asset of scanned) {
  const relativePath = slash(path.relative(ROOT, asset));
  const source = sourceFor(relativePath);
  if (!sourceById.has(source)) {
    throw new Error(`Unknown source ${source} for ${relativePath}`);
  }
  const bytes = await fs.readFile(asset);
  current.push({
    path: relativePath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    source,
  });
}
current.sort((a, b) => a.path.localeCompare(b.path));

if (WRITE) {
  ledger.assets = current;
  await fs.writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(`✅ Wrote ${path.relative(ROOT, LEDGER_PATH)} (${current.length} assets).`);
} else {
  const expected = JSON.stringify(ledger.assets ?? []);
  const actual = JSON.stringify(current);
  if (expected !== actual) {
    const expectedByPath = new Map((ledger.assets ?? []).map((asset) => [asset.path, asset]));
    const currentByPath = new Map(current.map((asset) => [asset.path, asset]));
    console.error("❌ Static asset rights ledger is stale:");
    for (const [assetPath, asset] of currentByPath) {
      const old = expectedByPath.get(assetPath);
      if (!old) console.error(`  + unregistered: ${assetPath}`);
      else if (old.sha256 !== asset.sha256) console.error(`  ~ changed: ${assetPath}`);
      else if (old.source !== asset.source) console.error(`  ~ source changed: ${assetPath}`);
    }
    for (const assetPath of expectedByPath.keys()) {
      if (!currentByPath.has(assetPath)) console.error(`  - removed: ${assetPath}`);
    }
    console.error("Run npm run update-asset-rights after reviewing the rights source.");
    process.exit(1);
  }
}

const counts = new Map();
for (const asset of current) counts.set(asset.source, (counts.get(asset.source) ?? 0) + 1);
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

async function scanAssets(directory, found = [], { optional = false } = {}) {
  if (optional) {
    try {
      await fs.access(directory);
    } catch {
      return found;
    }
  }
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await scanAssets(fullPath, found);
    else if (entry.isFile() && ASSET_RE.test(entry.name)) found.push(fullPath);
  }
  return found;
}

function sourceFor(assetPath) {
  if (/^android\/store-assets\//.test(assetPath)) {
    return "operator-cleared-brand-art";
  }
  if (/^public\/images\/ui\/profile-decorations\/.*\.svg$/.test(assetPath)) {
    return "repository-authored-vector";
  }
  if (/^public\/images\/.*\.svg$/.test(assetPath)) {
    return "repository-authored-vector";
  }
  if (/^public\/images\//.test(assetPath)) return "operator-cleared-game-art";
  if (/^public\/(?:icon-[^/]+|og(?:-[^/]+)?)\.(?:png|jpe?g|webp|svg)$/.test(assetPath)) {
    return "operator-cleared-brand-art";
  }
  throw new Error(`No rights source rule for ${assetPath}`);
}

function slash(value) {
  return value.split(path.sep).join("/");
}
