import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const ASSET_RE = /\.(?:avif|gif|ico|jpe?g|m4a|mp3|mp4|ogg|otf|png|svg|ttf|wav|webm|webp|woff2?)$/i;

export function slash(value) {
  return value.split(path.sep).join("/");
}

export function sourceFor(assetPath) {
  if (/^android\/store-assets\//.test(assetPath)) {
    return "operator-cleared-brand-art";
  }
  if (/^public\/images\/rating\//.test(assetPath)) {
    return "official-gcrb-rating-marks";
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

export async function scanAssets(
  directory,
  found = [],
  { optional = false } = {},
) {
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

export async function collectCurrentAssets(root, ledger) {
  const sourceById = new Map(ledger.sources.map((source) => [source.id, source]));
  const scanned = [
    ...(await scanAssets(path.join(root, "public"))),
    ...(await scanAssets(path.join(root, "android", "store-assets"), [], {
      optional: true,
    })),
  ];
  const current = [];
  for (const asset of scanned) {
    const relativePath = slash(path.relative(root, asset));
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
  return current.sort((left, right) => left.path.localeCompare(right.path));
}

export function assetDifferences(expected, current) {
  const differences = [];
  const expectedByPath = new Map(expected.map((asset) => [asset.path, asset]));
  const currentByPath = new Map(current.map((asset) => [asset.path, asset]));
  for (const [assetPath, asset] of currentByPath) {
    const old = expectedByPath.get(assetPath);
    if (!old) differences.push(`  + unregistered: ${assetPath}`);
    else if (old.sha256 !== asset.sha256) differences.push(`  ~ changed: ${assetPath}`);
    else if (old.source !== asset.source) differences.push(`  ~ source changed: ${assetPath}`);
  }
  for (const assetPath of expectedByPath.keys()) {
    if (!currentByPath.has(assetPath)) differences.push(`  - removed: ${assetPath}`);
  }
  return differences;
}

export function countAssetsBySource(assets) {
  const counts = new Map();
  for (const asset of assets) {
    counts.set(asset.source, (counts.get(asset.source) ?? 0) + 1);
  }
  return counts;
}

function assertLedgerShape(ledger) {
  if (
    ledger === null ||
    typeof ledger !== "object" ||
    ledger.schemaVersion !== 1 ||
    !Array.isArray(ledger.sources) ||
    !Array.isArray(ledger.assets)
  ) {
    throw new Error("invalid asset rights ledger");
  }
}

export function updateLedgerForTask(ledger, request) {
  assertLedgerShape(ledger);
  const next = structuredClone(ledger);
  const source = next.sources.find((candidate) => candidate.id === request.sourceId);
  if (source === undefined) {
    throw new Error(`unknown rights source: ${request.sourceId}`);
  }
  const byPath = new Map();
  for (const asset of next.assets) {
    if (byPath.has(asset.path)) {
      throw new Error(`duplicate asset path in ledger: ${asset.path}`);
    }
    byPath.set(asset.path, asset);
  }
  for (const asset of request.assets) {
    if (asset.source !== request.sourceId) {
      throw new Error(`asset source does not match task source: ${asset.path}`);
    }
    const existing = byPath.get(asset.path);
    if (
      existing !== undefined &&
      (existing.sha256 !== asset.sha256 || existing.source !== asset.source)
    ) {
      throw new Error(`asset path already has a different hash: ${asset.path}`);
    }
    if (existing === undefined) {
      const copy = structuredClone(asset);
      next.assets.push(copy);
      byPath.set(copy.path, copy);
    }
  }
  next.assets.sort((left, right) => left.path.localeCompare(right.path));
  source.evidence = [...new Set([...source.evidence, request.evidencePath])].sort();
  next.reviewedAt = request.reviewedAt;
  return next;
}
