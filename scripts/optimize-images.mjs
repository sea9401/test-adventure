#!/usr/bin/env node
// public/images/{category} 안의 PNG를 카테고리별 max-width로 다운샘플 + WebP로 변환.
// 새 이미지 추가 시 다시 실행하면 .png는 .webp로 교체되고 원본은 삭제된다.
//
//   node scripts/optimize-images.mjs           # 변환 + 원본 삭제
//   node scripts/optimize-images.mjs --keep    # 변환은 하되 .png는 남겨둠 (검증용)

import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "public", "images");

// 카테고리별 최대 가로 픽셀 + WebP 품질. 폴더 안의 서브폴더도 같은 프로필로 재귀 처리.
// - character: 큰 모달/아바타 (~256px) 기준 + 여유분.
// - monster:   전투 96px / 도감 56px 모두 커버하는 512px.
// - npc:       40px 아바타 기준이지만 확대 대비 256px.
// - items:     인벤토리 32~64px 아이콘. 도감 확대 대비 256px. items/{accessory,armor,weapon}/ 모두 동일 프로필.
// - fish:      낚시 결과/도감/리더보드 24~96px 아이콘. 확대 대비 256px.
// - ui:        풀스크린 배경. 1080~1440 디스플레이 폭 커버.
const PROFILES = {
  character: { maxWidth: 512, quality: 85 },
  monster: { maxWidth: 512, quality: 85 },
  npc: { maxWidth: 256, quality: 85 },
  items: { maxWidth: 256, quality: 85 },
  fish: { maxWidth: 256, quality: 86 },
  ui: { maxWidth: 1920, quality: 80 },
};

const KEEP_ORIGINAL = process.argv.includes("--keep");

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function processFile(src, profile) {
  const out = src.replace(/\.png$/i, ".webp");
  const before = (await fs.stat(src)).size;
  await sharp(src)
    .resize({ width: profile.maxWidth, withoutEnlargement: true })
    .webp({ quality: profile.quality })
    .toFile(out);
  const after = (await fs.stat(out)).size;
  if (!KEEP_ORIGINAL) await fs.unlink(src);
  return { before, after };
}

async function processDir(dir, profile) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return { count: 0, before: 0, after: 0 };
  }
  let count = 0;
  let totalBefore = 0;
  let totalAfter = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await processDir(full, profile);
      count += sub.count;
      totalBefore += sub.before;
      totalAfter += sub.after;
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.png$/i.test(entry.name)) continue;
    const { before, after } = await processFile(full, profile);
    const rel = path.relative(ROOT, full.replace(/\.png$/i, ".webp"));
    const pct = ((1 - after / before) * 100).toFixed(0);
    console.log(`  ${rel}: ${fmtBytes(before)} → ${fmtBytes(after)} (-${pct}%)`);
    count += 1;
    totalBefore += before;
    totalAfter += after;
  }
  return { count, before: totalBefore, after: totalAfter };
}

console.log(`이미지 최적화 시작${KEEP_ORIGINAL ? " (원본 유지)" : ""}\n`);

let grandBefore = 0;
let grandAfter = 0;
let grandCount = 0;
for (const [name, profile] of Object.entries(PROFILES)) {
  const dir = path.join(ROOT, name);
  console.log(`[${name}] max ${profile.maxWidth}px @ q${profile.quality}`);
  const { count, before, after } = await processDir(dir, profile);
  grandCount += count;
  grandBefore += before;
  grandAfter += after;
  if (count === 0) console.log(`  (변환할 PNG 없음)`);
  console.log("");
}

const totalPct = grandBefore
  ? ((1 - grandAfter / grandBefore) * 100).toFixed(0)
  : 0;
console.log(
  `완료: ${grandCount}장, ${fmtBytes(grandBefore)} → ${fmtBytes(grandAfter)} (-${totalPct}%)`,
);
