#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCK_PATH = path.join(ROOT, "package-lock.json");
const POLICY_PATH = path.join(ROOT, "config", "license-policy.json");
const NOTICE_PATH = path.join(ROOT, "public", "third-party-notices.txt");
const FONT_NOTICE_PATH = path.join(
  ROOT,
  "public",
  "licenses",
  "geist-OFL-1.1.txt",
);
const WRITE = process.argv.includes("--write");
const NOTICE_FILE_RE = /^(?:licen[cs]e|copying|notice)(?:\..+)?$/i;

const [lockText, policyText] = await Promise.all([
  fs.readFile(LOCK_PATH, "utf8"),
  fs.readFile(POLICY_PATH, "utf8"),
]);
const lock = JSON.parse(lockText);
const policy = JSON.parse(policyText);
const reviewed = new Set(policy.reviewedLicenseExpressions);

const entries = Object.entries(lock.packages ?? {})
  .filter(([packagePath]) => packagePath.includes("node_modules/"))
  .map(([packagePath, manifest]) => ({
    packagePath,
    name: packagePath.slice(packagePath.lastIndexOf("node_modules/") + 13),
    version: manifest.version,
    license: manifest.license,
    dev: Boolean(manifest.dev),
    optional: Boolean(manifest.optional),
  }));

const failures = [];
for (const entry of entries) {
  if (!entry.name || !entry.version) {
    failures.push(`${entry.packagePath}: package name or version is missing`);
  }
  if (!entry.license) {
    failures.push(`${entry.name}@${entry.version}: license is missing`);
  } else if (!reviewed.has(entry.license)) {
    failures.push(
      `${entry.name}@${entry.version}: unreviewed license expression ${entry.license}`,
    );
  }
}

if (failures.length) {
  console.error("❌ Dependency license policy failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    "Review the package and then update config/license-policy.json deliberately.",
  );
  process.exit(1);
}

const uniqueAll = uniquePackages(entries);
const uniqueRuntime = uniquePackages(entries.filter((entry) => !entry.dev));
const notice = await buildNotice(uniqueRuntime);

if (WRITE) {
  await fs.mkdir(path.dirname(NOTICE_PATH), { recursive: true });
  await fs.writeFile(NOTICE_PATH, notice);
  console.log(
    `✅ Wrote ${path.relative(ROOT, NOTICE_PATH)} for ${uniqueRuntime.length} runtime packages.`,
  );
} else {
  let current = "";
  try {
    current = await fs.readFile(NOTICE_PATH, "utf8");
  } catch {
    // The comparison below reports the missing generated notice.
  }
  if (current !== notice) {
    console.error(
      "❌ public/third-party-notices.txt is missing or stale. Run npm run update-licenses.",
    );
    process.exit(1);
  }
}

const licenseCounts = new Map();
for (const entry of uniqueAll) {
  licenseCounts.set(entry.license, (licenseCounts.get(entry.license) ?? 0) + 1);
}
console.log(
  `✅ ${entries.length} lockfile entries (${uniqueAll.length} unique packages) use reviewed license expressions.`,
);
for (const [license, count] of [...licenseCounts].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  console.log(`  ${license}: ${count}`);
}

function uniquePackages(packages) {
  const unique = new Map();
  for (const entry of packages) {
    const key = `${entry.name}@${entry.version}`;
    const existing = unique.get(key);
    if (!existing || (!entry.optional && existing.optional)) unique.set(key, entry);
  }
  return [...unique.values()].sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
  );
}

async function buildNotice(packages) {
  const documents = new Map();
  const packageRows = [];

  for (const entry of packages) {
    const installedDir = path.join(ROOT, entry.packagePath);
    const source =
      specialSource(entry.name) ||
      `https://www.npmjs.com/package/${encodeURIComponent(entry.name)}`;
    const documentIds = [];

    // Platform-specific optional packages differ between Linux/macOS/Windows.
    // Their SPDX expression and upstream stay in the index, while bundled texts
    // come from deterministic, non-optional packages plus the explicit font file.
    const noticeDocuments = entry.optional
      ? []
      : [
          ...(await readNoticeDocuments(installedDir)),
          ...(entry.name === "next"
            ? await readNestedNoticeDocuments(
                path.join(installedDir, "dist", "compiled"),
              )
            : []),
        ];
    for (const document of noticeDocuments) {
      const hash = createHash("sha256").update(document.text).digest("hex");
      const id = hash.slice(0, 12);
      documentIds.push(id);
      const existing = documents.get(hash);
      if (existing) {
        existing.packages.push(`${entry.name}@${entry.version}`);
      } else {
        documents.set(hash, {
          id,
          fileName: document.fileName,
          text: document.text,
          packages: [`${entry.name}@${entry.version}`],
        });
      }
    }

    packageRows.push(
      `${entry.name}@${entry.version} | ${entry.license} | ${source}` +
        (documentIds.length ? ` | texts: ${documentIds.join(", ")}` : ""),
    );
  }

  let fontNotice = "";
  try {
    fontNotice = normalizeLineEndings(
      await fs.readFile(FONT_NOTICE_PATH, "utf8"),
    ).trim();
  } catch {
    failures.push("Geist OFL notice file is missing");
  }
  if (failures.length) {
    for (const failure of failures) console.error(`❌ ${failure}`);
    process.exit(1);
  }

  const blocks = [...documents.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (document) =>
        [
          "=".repeat(78),
          `TEXT ${document.id} (${document.fileName})`,
          `Applies to: ${document.packages.sort().join(", ")}`,
          "-".repeat(78),
          document.text.trim(),
        ].join("\n"),
    );

  return `${[
    "THIRD-PARTY SOFTWARE AND FONT NOTICES",
    "",
    "This file is generated from package-lock.json and installed package license",
    "files. It covers runtime dependencies selected by the lockfile. Build-only and",
    "development dependencies are still checked by scripts/check-licenses.mjs.",
    "",
    "No endorsement by any third-party author or project is implied.",
    "",
    "SPECIAL ATTRIBUTIONS",
    "- caniuse-lite browser compatibility data, maintained by the Browserslist",
    "  project and originally authored by Ben Briggs, is used as unmodified build",
    "  input under CC BY 4.0. Source: https://github.com/browserslist/caniuse-lite",
    "  License: https://creativecommons.org/licenses/by/4.0/",
    "- Prebuilt libvips packages used by sharp are indexed below. Corresponding",
    "  source/build recipes: https://github.com/lovell/sharp-libvips",
    "",
    "RUNTIME PACKAGE INDEX",
    "Format: package@version | SPDX expression | upstream | bundled text IDs",
    "-".repeat(78),
    ...packageRows,
    "",
    "FONT NOTICE: GEIST AND GEIST MONO",
    "Source: https://github.com/vercel/geist-font",
    "-".repeat(78),
    fontNotice,
    "",
    "PACKAGE LICENSE AND NOTICE TEXTS",
    ...blocks,
    "",
  ].join("\n")}\n`;
}

async function readNoticeDocuments(directory) {
  let names;
  try {
    names = await fs.readdir(directory);
  } catch {
    return [];
  }
  const documents = [];
  for (const fileName of names.filter((name) => NOTICE_FILE_RE.test(name)).sort()) {
    const filePath = path.join(directory, fileName);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) continue;
    documents.push({
      fileName,
      text: normalizeLineEndings(await fs.readFile(filePath, "utf8")),
    });
  }
  return documents;
}

async function readNestedNoticeDocuments(directory, base = directory, documents = []) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return documents;
  }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await readNestedNoticeDocuments(fullPath, base, documents);
    } else if (entry.isFile() && NOTICE_FILE_RE.test(entry.name)) {
      documents.push({
        fileName: slash(path.relative(base, fullPath)),
        text: normalizeLineEndings(await fs.readFile(fullPath, "utf8")),
      });
    }
  }
  return documents;
}

function specialSource(name) {
  if (name.startsWith("@img/sharp-libvips-")) {
    return "https://github.com/lovell/sharp-libvips";
  }
  if (name === "lightningcss" || name.startsWith("lightningcss-")) {
    return "https://github.com/parcel-bundler/lightningcss";
  }
  return "";
}

function slash(value) {
  return value.split(path.sep).join("/");
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n?/g, "\n");
}
