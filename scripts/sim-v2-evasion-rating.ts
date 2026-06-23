// 회피 대결형(contested rating) 모델 캘리브 — 설계 프로토타입(라이브 엔진 미변경).
//   현재: 회피% = (dex×0.1 + luk×0.08 + 장비 + 패시브) 합연산 → 75% 하드캡. 몹 명중을 캡 뒤 뺄셈.
//   문제: 이진 캡(d20쯤 75% 포화)·콘텐츠 미추종(절대값)·DEX 더블딥(공짜 4× EHP).
//   제안: 회피/명중을 raw 레이팅으로(같은 계수, 캡 제거) + 비율 대결:
//     회피확률 = MAX_DODGE × evaRating / (evaRating + 몹명중레이팅 × K)
//   몹 명중 = ACC_BASE × floorStatMult(depth) → 깊이 따라 자동 스케일(회피 self-following).
//
// 실행: node --import tsx scripts/sim-v2-evasion-rating.ts
// 목표 프로파일: 권장레벨 회피몰빵(DEX/LUK) ~50%·균형(BAL) ~30%·비회피(STR/VIT) ~10%, 전 깊이 안정.

import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { derivePowerScore } from "../src/adventure/data/v2/power";
import { floorPowerGate, floorStatMult } from "../src/adventure/data/v2/dungeonLadder";
import { V2_STAT_POINTS_PER_LEVEL } from "../src/adventure/data/v2/v2Stats";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";

// ── 라이브 계수(derivePlayerCombatV2 — 그대로 레이팅화) ────────────────────────
const EVA_PER_DEX = 0.1;
const EVA_PER_LUK = 0.08;
const ACC_PER_DEX = 0.05;
const ACC_PER_STR = 0.02;
const ACC_PER_INT = 0.02;
const ACC_PER_SPI = 0.015;
const EVASION_PCT_CAP = 75; // 현 모델 캡(비교용)

// ── 대결형 다이얼(캘리브 대상) — env 로 스윕 가능 ───────────────────────────
const MAX_DODGE = Number(process.env.MAX_DODGE ?? 75); // 점근 천장(소프트·절대 도달X). 캡 제거 금지=무적꼬리.
const K = Number(process.env.K ?? 8); // 기본 회피 높낮이 — 클수록 명중이 회피를 더 누름(파리티 회피↓). 확정 8.
const ACC_BASE = Number(process.env.ACC_BASE ?? 1.05); // 몹 명중레이팅 = ACC_BASE × floorStatMult(depth)

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

function statsAt(arch: Arch, level: number): Record<V2StatKey, number> {
  const d = derivePlayerCombatV2Pure({ level, allocatedStats: allocate(arch, level), v2Equipped: {} });
  return d.totalStats as Record<V2StatKey, number>;
}

// 깊이 권장 파워 매칭 레벨(BAL 파워 ≥ gate 최소 레벨) — sim-v2-progression 미러.
function levelForDepth(depth: number): number {
  const target = floorPowerGate(depth);
  for (let lv = 1; lv <= 2000; lv++) {
    const p = derivePlayerCombatV2Pure({ level: lv, allocatedStats: allocate("BAL", lv), v2Equipped: {} }).player;
    const pw = derivePowerScore({ atk: p.atk, magicAtk: p.magicAtk, def: p.def, spd: p.spd, maxHp: p.maxHp, maxMp: p.maxMp });
    if (pw >= target) return lv;
  }
  return 2000;
}

const evaRating = (s: Record<V2StatKey, number>) => s.dex * EVA_PER_DEX + s.luk * EVA_PER_LUK;
const _accRating = (s: Record<V2StatKey, number>) =>
  s.dex * ACC_PER_DEX + s.str * ACC_PER_STR + s.int * ACC_PER_INT + s.spi * ACC_PER_SPI;

// 대결형 회피확률.
const dodgeNew = (eva: number, mobAcc: number) => (MAX_DODGE * eva) / (eva + mobAcc * K);
// 현 모델(참고) — 몹 명중 0 가정이라 그냥 min(eva,75).
const dodgeOld = (eva: number) => Math.min(eva, EVASION_PCT_CAP);

const DEPTHS = [8, 14, 20, 30, 42, 50];

const ehp = (dodgePct: number) => 1 / (1 - dodgePct / 100); // 회피→유효체력 배수
const parityDodge = MAX_DODGE / (1 + K); // evaR == 몹명중 일 때(균등 매칭) 회피

console.log(`회피 대결형 캘리브 — MAX_DODGE=${MAX_DODGE} K=${K} ACC_BASE=${ACC_BASE}`);
console.log(`파리티 회피(evaR=몹명중) = MAX/(1+K) = ${parityDodge.toFixed(0)}%  (균등 매칭 시 기본 회피)\n`);

for (const depth of DEPTHS) {
  const lv = levelForDepth(depth);
  const mobAcc = ACC_BASE * floorStatMult(depth);
  console.log(`━━ 깊이 ${depth} (권장 Lv${lv}, 몹명중레이팅 ${mobAcc.toFixed(0)}) ━━`);
  console.log("Arch │ evaR │ 회피(현,캡75) → 회피(대결형) · EHP배수");
  for (const arch of ARCHES) {
    const s = statsAt(arch, lv);
    const eva = evaRating(s);
    const dOld = dodgeOld(eva);
    const dNew = dodgeNew(eva, mobAcc);
    console.log(
      `${arch.padEnd(4)} │ ${eva.toFixed(0).padStart(4)} │ ` +
        `${dOld.toFixed(0).padStart(3)}% → ${dNew.toFixed(0).padStart(3)}% · ×${ehp(dNew).toFixed(2)}`,
    );
  }
  console.log("");
}
