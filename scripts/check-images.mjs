#!/usr/bin/env node
// 코드의 /images/... 참조와 public/images/ 실제 파일을 대조해
// "참조하지만 없음" + "있지만 참조 없음" 을 리포트.
//
//   node scripts/check-images.mjs            # 누락만 에러로 처리 (CI/predev/prebuild)
//   node scripts/check-images.mjs --strict   # 고아 파일도 에러로

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const IMAGES = path.join(ROOT, "public", "images");
const FISH_DATA = path.join(SRC, "adventure", "data", "v2", "fish.ts");

const STRICT = process.argv.includes("--strict");

// 코드/문자열에서 등장하는 정적 + 템플릿 형태의 /images/... 경로를 모두 캡처.
//   "/images/monster/slime.webp"        → 정적
//   `/images/character/${gender}.webp`  → 템플릿 — 와일드카드로 변환해 매칭
const LITERAL_RE = /["'`](\/images\/[^"'`${}]+\.(?:webp|png|jpg|jpeg|svg))["'`]/g;
const TEMPLATE_RE = /`(\/images\/[^`]*\$\{[^`]*\}[^`]*\.(?:webp|png|jpg|jpeg|svg))`/g;

async function walk(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      await walk(full, out);
    } else if (e.isFile() && /\.(ts|tsx|js|jsx|md)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

async function listImages(dir, base = "", out = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = path.join(base, e.name);
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await listImages(full, rel, out);
    else if (e.isFile() && /\.(webp|png|jpg|jpeg|svg)$/i.test(e.name)) {
      out.push(rel.replaceAll(path.sep, "/"));
    }
  }
  return out;
}

async function collectRefs(files) {
  const literals = new Set();
  const templates = []; // [{ raw, regex }]
  for (const f of files) {
    const text = await fs.readFile(f, "utf8");
    for (const m of text.matchAll(LITERAL_RE)) literals.add(m[1]);
    for (const m of text.matchAll(TEMPLATE_RE)) {
      const raw = m[1];
      const pattern =
        "^" +
        raw
          .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
          .replaceAll(/\\\$\\\{[^}]+\\\}/g, "[^/]+") +
        "$";
      templates.push({ raw, regex: new RegExp(pattern) });
    }
  }
  try {
    const fishText = await fs.readFile(FISH_DATA, "utf8");
    for (const m of fishText.matchAll(/\bid:\s*"([a-z0-9_]+)"/g)) {
      literals.add(`/images/fish/${m[1]}.webp`);
    }
  } catch {
    // fish.ts 가 없는 빌드 컨텍스트에서는 일반 이미지 참조 검사만 수행한다.
  }
  return { literals, templates };
}

const sourceFiles = await walk(SRC);
const { literals, templates } = await collectRefs(sourceFiles);
const onDisk = (await listImages(IMAGES)).map((p) => `/images/${p}`);
const onDiskSet = new Set(onDisk);

// 1) 코드가 참조하는데 디스크에 없는 파일
const missing = [];
for (const ref of literals) if (!onDiskSet.has(ref)) missing.push(ref);

// 2) 디스크에는 있지만 어느 ref(literal/template)도 가리키지 않는 파일
const orphans = [];
for (const file of onDisk) {
  if (literals.has(file)) continue;
  if (templates.some((t) => t.regex.test(file))) continue;
  orphans.push(file);
}

const lit = [...literals].sort();
console.log(`참조 (literal): ${lit.length}장, (template): ${templates.length}패턴`);
console.log(`디스크: ${onDisk.length}장`);
console.log("");

if (missing.length) {
  console.log("❌ 코드가 참조하지만 파일이 없는 이미지:");
  for (const m of missing.sort()) console.log(`  ${m}`);
  console.log("");
}

if (orphans.length) {
  console.log(`⚠️  디스크에는 있지만 코드 어디서도 참조하지 않는 이미지:`);
  for (const o of orphans.sort()) console.log(`  ${o}`);
  console.log("");
}

if (!missing.length && !orphans.length) {
  console.log("✅ 모든 이미지가 일관됩니다.");
}

if (missing.length) process.exit(1);
if (STRICT && orphans.length) process.exit(1);
