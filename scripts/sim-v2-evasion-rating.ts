// 라이브 회피도·적중도 경감 모델 캘리브.
//   직접 피해 경감률 = MAX_REDUCTION × evaRating / (evaRating + 상대 accRating × K)
//   몬스터 적중도 = ACC_BASE × floorStatMult(depth).
//
// 실행: node --import tsx scripts/sim-v2-evasion-rating.ts
// 목표 프로파일: 권장레벨 회피몰빵(DEX/LUK) ~50%·균형(BAL) ~30%·비회피(STR/VIT) ~10%, 전 깊이 안정.

import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { powerInputFromPlayer } from "../src/lib/server/playerPowerInput";
import { derivePowerScore } from "../src/adventure/data/v2/power";
import {
  floorPowerGate,
  floorStatMult,
  MOB_ACC_BASE,
} from "../src/adventure/data/v2/dungeonLadder";
import {
  EVASION_DAMAGE_REDUCTION_MAX_PCT,
  PVE_DODGE_K,
} from "../src/adventure/data/v2/v2CombatConstants";
import { V2_STAT_POINTS_PER_LEVEL } from "../src/adventure/data/v2/v2Stats";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";

// ── 대결형 다이얼(캘리브 대상) — env 로 스윕 가능 ───────────────────────────
const MAX_REDUCTION = Number(
  process.env.MAX_REDUCTION ?? EVASION_DAMAGE_REDUCTION_MAX_PCT,
); // 점근 천장(도달하지 않음).
const K = Number(process.env.K ?? PVE_DODGE_K);
const ACC_BASE = Number(process.env.ACC_BASE ?? MOB_ACC_BASE); // 몹 명중레이팅 = ACC_BASE × floorStatMult(depth)

type Arch = "DEX" | "LUK" | "STR" | "VIT" | "BAL";
const ARCHES: Arch[] = ["DEX", "LUK", "STR", "VIT", "BAL"];
const SUB_STAT: Record<string, V2StatKey> = { str: "vit", dex: "luk", vit: "str", int: "vit", spi: "vit", luk: "dex" };
const FILL_STAT: Record<string, V2StatKey> = { str: "luk", dex: "vit", vit: "luk", int: "luk", spi: "luk", luk: "vit" };

function allocate(arch: Arch, level: number): Record<V2StatKey, number> {
  const total = Math.max(0, level - 1) * V2_STAT_POINTS_PER_LEVEL;
  const a: Record<V2StatKey, number> = { str: 0, dex: 0, vit: 0, int: 0, spi: 0, luk: 0 };
  if (total === 0) return a;
  if (arch === "BAL") {
    a.str = Math.round(total * 0.25);
    a.vit = Math.round(total * 0.25);
    a.dex = Math.round(total * 0.2);
    a.luk = Math.round(total * 0.15);
    a.spi = total - a.str - a.vit - a.dex - a.luk;
    return a;
  }
  const main = arch.toLowerCase() as V2StatKey;
  a[main] = Math.round(total * 0.6);
  a[SUB_STAT[main]] = Math.round(total * 0.3);
  a[FILL_STAT[main]] = total - a[main] - a[SUB_STAT[main]];
  return a;
}

function playerAt(arch: Arch, level: number) {
  return derivePlayerCombatV2Pure({
    level,
    allocatedStats: allocate(arch, level),
    v2Equipped: {},
  }).player;
}

// 깊이 권장 파워 매칭 레벨(BAL 파워 ≥ gate 최소 레벨) — sim-v2-progression 미러.
function levelForDepth(depth: number): number {
  const target = floorPowerGate(depth);
  for (let lv = 1; lv <= 2000; lv++) {
    const p = derivePlayerCombatV2Pure({ level: lv, allocatedStats: allocate("BAL", lv), v2Equipped: {} }).player;
    const pw = derivePowerScore(
      powerInputFromPlayer(p, p.maxHp, p.maxMp),
    );
    if (pw >= target) return lv;
  }
  return 2000;
}

const reductionPct = (eva: number, mobAcc: number) =>
  (MAX_REDUCTION * eva) / (eva + mobAcc * K);

const DEPTHS = [8, 14, 20, 30, 42, 50];

const ehp = (reduction: number) => 1 / (1 - reduction / 100);
const parityReduction = MAX_REDUCTION / (1 + K);

console.log(`회피 경감 캘리브 — MAX_REDUCTION=${MAX_REDUCTION} K=${K} ACC_BASE=${ACC_BASE}`);
console.log(`동일 수치(evaR=accR) 경감률 = ${parityReduction.toFixed(0)}%\n`);

for (const depth of DEPTHS) {
  const lv = levelForDepth(depth);
  const mobAcc = ACC_BASE * floorStatMult(depth);
  console.log(`━━ 깊이 ${depth} (권장 Lv${lv}, 몹명중레이팅 ${mobAcc.toFixed(0)}) ━━`);
  console.log("Arch │ evaR │ accR │ 직접 피해 경감 · EHP배수");
  for (const arch of ARCHES) {
    const player = playerAt(arch, lv);
    const eva = player.evaRating ?? 0;
    const acc = player.accRating ?? 0;
    const reduction = reductionPct(eva, mobAcc);
    console.log(
      `${arch.padEnd(4)} │ ${eva.toFixed(0).padStart(4)} │ ${acc.toFixed(0).padStart(4)} │ ` +
        `${reduction.toFixed(0).padStart(3)}% · ×${ehp(reduction).toFixed(2)}`,
    );
  }
  console.log("");
}
