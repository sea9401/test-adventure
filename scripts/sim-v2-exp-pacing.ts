// v2 EXP 페이싱 — 만렙 30~40일 목표로 다이얼 후보 비교.
//
// 현재 새 stamina (max 5000, regen 1분/2) 기준:
//   시나리오 A (상시 접속) 43일 / 시나리오 B (일 1회) 89일
// 목표: B 시나리오 30~40일.

import {
  requiredExpToNext,
  levelBandExpMultiplier,
  applyNewbieBonus,
  MAX_LEVEL,
} from "../src/lib/leveling";
import { MONSTERS } from "../src/adventure/data/monsters";
import { MAIN_DUNGEON, FLOOR_DIFFICULTY } from "../src/adventure/data/v2/dungeon";

const SECONDS_PER_TURN = 2;
const NEW_MAX_STAMINA = 5000;
const STAMINA_REGEN_PER_HOUR = 120;

type FloorInfo = { id: number; avgExp: number; lvMin?: number; lvMax?: number; tier?: string };
// PR-7 에서 던전 층 requirement 가 레벨밴드 → 권장 파워로 바뀜. 이 exp-pacing sim 은
// "레벨 → 어느 층 사냥" 휴리스틱이 필요해 옛 레벨밴드를 로컬로 보존한다(sim 고유 관심사).
// 리셋 루프(전직 Lv1)·파워 게이트를 반영한 재모델은 PR-9(sim 캘리브)에서.
const SIM_FLOOR_LEVEL_BANDS: Record<number, { min: number; max: number }> = {
  1: { min: 1, max: 5 },
  2: { min: 6, max: 13 },
  3: { min: 18, max: 28 },
  4: { min: 34, max: 55 },
  5: { min: 70, max: 100 },
};
const floorInfos: FloorInfo[] = [];
for (const f of MAIN_DUNGEON.floors) {
  const exps: number[] = [];
  for (const e of f.enemies) {
    const m = MONSTERS[e.key];
    if (m) exps.push(m.exp);
  }
  const band = SIM_FLOOR_LEVEL_BANDS[f.id];
  floorInfos.push({
    id: f.id,
    avgExp: exps.reduce((a, b) => a + b, 0) / exps.length,
    lvMin: band?.min,
    lvMax: band?.max,
    tier: f.requirement.kind === "endgame" ? f.requirement.tier : undefined,
  });
}
function pickFloorForLevel(lv: number): FloorInfo {
  let pick = floorInfos[0];
  for (const f of floorInfos) {
    if (f.lvMin === undefined) continue;
    if (lv >= f.lvMin && (f.lvMax === undefined || lv <= f.lvMax)) pick = f;
  }
  if (lv >= 100) pick = floorInfos.find((f) => f.tier === "entry") ?? pick;
  return pick;
}
// winT = STR 빌드 sim-v2-progression --skills 측정값 (2026-05-30 갱신 — 무기재배치·floor5
// 정규화 반영). Lv75/100 은 floor5 ×0.4 로 몹이 약해져 옛 31.3/30.3 → 19.3/16.1 로 빨라짐.
const simWinT: Record<number, number> = { 3: 8.9, 10: 19.3, 25: 19.1, 50: 19.2, 75: 19.3, 100: 16.1 };
const segments = [
  { from: 1, to: 10, lv: 3, winT: 8.9 },
  { from: 10, to: 25, lv: 10, winT: 19.3 },
  { from: 25, to: 50, lv: 25, winT: 19.1 },
  { from: 50, to: 75, lv: 50, winT: 19.2 },
  { from: 75, to: 100, lv: 75, winT: 19.3 },
];

// 다이얼 조합으로 한 hunt 의 최종 exp 계산.
type Dial = {
  name: string;
  xpRate?: number; // 옛 XP_RATE_MULT 자리 (모든 hunt 에 곱)
  bandOverride?: (lv: number) => number; // levelBandExpMultiplier 대체
};

function expPerHuntForDial(lv: number, floor: FloorInfo, dial: Dial): number {
  const diffMult = FLOOR_DIFFICULTY[floor.id as 1] ?? 1;
  const mobExp = floor.avgExp * diffMult;
  const band = dial.bandOverride ? dial.bandOverride(lv) : levelBandExpMultiplier(lv);
  const newbie = applyNewbieBonus(1, lv).gained;
  const rate = dial.xpRate ?? 1;
  return mobExp * band * newbie * rate;
}

function scenarioA(dial: Dial): number {
  let hours = 0;
  for (const seg of segments) {
    let segExp = 0;
    for (let lv = seg.from; lv < seg.to; lv++) segExp += requiredExpToNext(lv)!;
    const winTHph = 3600 / (seg.winT * SECONDS_PER_TURN);
    const hph = Math.min(winTHph, STAMINA_REGEN_PER_HOUR);
    const eph = expPerHuntForDial(seg.lv, pickFloorForLevel(seg.lv), dial);
    hours += segExp / (hph * eph);
  }
  return hours;
}

function scenarioB(dial: Dial): number {
  let days = 0;
  for (const seg of segments) {
    let segExp = 0;
    for (let lv = seg.from; lv < seg.to; lv++) segExp += requiredExpToNext(lv)!;
    const eph = expPerHuntForDial(seg.lv, pickFloorForLevel(seg.lv), dial);
    days += segExp / (NEW_MAX_STAMINA * eph);
  }
  return days;
}

// 다이얼 후보들
const dials: Dial[] = [
  { name: "현재 (변경 없음)" },
  { name: "XP_RATE ×2.0" , xpRate: 2.0 },
  { name: "XP_RATE ×2.2" , xpRate: 2.2 },
  { name: "XP_RATE ×2.5" , xpRate: 2.5 },
  { name: "XP_RATE ×3.0" , xpRate: 3.0 },
  // band 강화 — L70+ 만 손대서 신캐/중반 보존
  {
    name: "band L70-100 ×2.0 (현 1.45/1.55 → 2.9/3.1)",
    bandOverride: (lv) => {
      if (lv < 30) return 1;
      if (lv < 50) return 1.1;
      if (lv < 70) return 1.25;
      if (lv < 90) return 1.45 * 2.0;
      return 1.55 * 2.0;
    },
  },
  {
    name: "band L50-100 ×1.5 (중반부터 강화)",
    bandOverride: (lv) => {
      if (lv < 30) return 1;
      if (lv < 50) return 1.1;
      if (lv < 70) return 1.25 * 1.5;
      if (lv < 90) return 1.45 * 1.5;
      return 1.55 * 1.5;
    },
  },
];

console.log("━━━ 만렙 1→100 페이싱 (다이얼별 비교) ━━━");
console.log("기준: stamina max 5000, 1분/2 회복, 1턴 2초, STR 빌드 sim winT");
console.log("");
console.log("다이얼                                              | A 상시   | B 일1회 | A→B 비");
console.log("---------------------------------------------------+----------+---------+--------");
for (const d of dials) {
  const a = scenarioA(d);
  const b = scenarioB(d);
  const aH = a < 24 ? `${a.toFixed(1)}h` : `${(a / 24).toFixed(1)}일`;
  const bD = `${b.toFixed(1)}일`;
  const ratio = (b / (a / 24)).toFixed(2);
  const target = b >= 30 && b <= 40 ? "  ⭐ 목표 적중" : "";
  console.log(
    `${d.name.padEnd(50)} | ${aH.padStart(8)} | ${bD.padStart(7)} | ×${ratio}${target}`,
  );
}

// 구간별 분포 — 목표 적중 다이얼 한두 개 자세히
console.log("\n\n━━━ 구간별 분포 (XP_RATE ×2.5 vs band 강화 비교) ━━━");
const detailDials = [
  dials[3], // XP_RATE ×2.5
  dials[5], // band L70+
  dials[6], // band L50+
];

for (const d of detailDials) {
  console.log(`\n## ${d.name}`);
  console.log("구간     | seg EXP    | A 구간(h) | A 누적   | B 구간(일) | B 누적");
  let cumH = 0, cumD = 0;
  for (const seg of segments) {
    let segExp = 0;
    for (let lv = seg.from; lv < seg.to; lv++) segExp += requiredExpToNext(lv)!;
    const winTHph = 3600 / (seg.winT * SECONDS_PER_TURN);
    const hph = Math.min(winTHph, STAMINA_REGEN_PER_HOUR);
    const eph = expPerHuntForDial(seg.lv, pickFloorForLevel(seg.lv), d);
    const segHours = segExp / (hph * eph);
    const segDays = segExp / (NEW_MAX_STAMINA * eph);
    cumH += segHours;
    cumD += segDays;
    console.log(
      `Lv${seg.from.toString().padStart(2)}→${seg.to.toString().padEnd(3)} | ${segExp.toLocaleString().padStart(10)} | ${segHours.toFixed(1).padStart(8)}h | ${(cumH < 24 ? cumH.toFixed(1) + "h" : (cumH / 24).toFixed(1) + "일").padStart(7)} | ${segDays.toFixed(1).padStart(8)}일 | ${cumD.toFixed(1).padStart(5)}일`,
    );
  }
}

console.log("\n노트:");
console.log("- XP_RATE 옵션 = staging .env 한 줄 설정 (NEXT_PUBLIC_XP_RATE_MULT=N)");
console.log("- band 옵션 = leveling.ts 코드 변경 (PR). v2/라이브 공유 코드라 라이브 영향 주의");
console.log("- 라이브 영향 회피하려면 band 변경 시 v2 전용 헬퍼 분리 필요");
