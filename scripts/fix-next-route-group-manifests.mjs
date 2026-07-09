import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const APP_SERVER_DIR = path.join(".next", "server", "app");
const MANIFEST_FILE = "page_client-reference-manifest.js";

function isRouteGroup(segment) {
  return segment.startsWith("(") && segment.endsWith(")");
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.isFile() && entry.name === MANIFEST_FILE) {
      files.push(fullPath);
    }
  }
  return files;
}

if (!existsSync(APP_SERVER_DIR)) {
  console.warn(`[fix-next-route-group-manifests] missing ${APP_SERVER_DIR}; skipped`);
  process.exit(0);
}

const copied = [];

for (const source of walk(APP_SERVER_DIR)) {
  const relative = path.relative(APP_SERVER_DIR, source);
  const segments = relative.split(path.sep);
  const strippedSegments = segments.filter((segment) => !isRouteGroup(segment));

  if (strippedSegments.length === segments.length) continue;

  const target = path.join(APP_SERVER_DIR, ...strippedSegments);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(source, target);
  copied.push({ source, target });
}

console.log(
  `[fix-next-route-group-manifests] copied ${copied.length} client reference manifest(s)`,
);

for (const { target } of copied.slice(0, 8)) {
  console.log(`  ${target}`);
}

if (copied.length > 8) {
  console.log(`  ...and ${copied.length - 8} more`);
}
