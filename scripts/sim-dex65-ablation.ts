// DEX 자동 사냥 wins/h 폭발 ablation — Lv80 폐도 기준.
// IMPORTANT: Lv80 일반 스킬 슬롯 = 4개. effectiveSkillNames 가 stored.slice(0,4) 라
// 5개 배열을 넘기면 5번째가 무음으로 잘림. 이전 시도에서 [BASE] 5스킬을 넘겼다가
// ANALYSIS 가 잘려 "5스킬 vs 4스킬" 비교가 실은 "ANALYSIS 유무" 비교였던 사고 정정.
// 모든 케이스를 4스킬로 통일 + ANALYSIS 는 항상 마지막 자리(잘리지 않게).
//
// result.revives 도 같이 출력 — 사망 1회당 자동사냥 20분 페널티가 wins 의 비선형 amp
// 원인이라 직접 확인 필요.
import { pickAutoAction } from "../src/adventure/battle/pickAutoAction";
import { derivePlayerCombat } from "../src/adventure/character/derivePlayerCombat";
import { simulateOfflineHunt } from "../src/adventure/battle/offlineSim";
import { FEAT_NAMES, SKILL_NAMES } from "../src/adventure/character/skills";
import { ITEMS } from "../src/adventure/data/items";
import { WORLD_MAP } from "../src/adventure/data/world";
import type { StatKey } from "../src/adventure/data/stats";

const BASE_STATS: Record<StatKey, number> = { str: 3, dex: 3, vit: 3, spd: 3, luk: 3 };
// Lv 80 폐도가 진짜 DEX 폭발 지점 (메서드 fix 후 재측정 기준: DEX 219wins/h vs 다른 빌드 8~12).
// Lv 70 starspire 는 fix 후 평형됨 (DEX 38 vs 다른 24).
const LEVEL = 80;
const REGION_ID = "skyfolk_ruins";

// 메인 80% — Lv70 에 DEX 임계 65 도달 보장 (ANALYSIS 5티어 트리거).
// 60% 였던 직전 sim 은 ANALYSIS 가 임계 미달로 비활성 → -ANALYSIS≈BASE 가 가짜 0 영향.
function allocate(level: number): Record<StatKey, number> {
  const pts = Math.max(0, level - 1);
  const a: Record<StatKey, number> = { str: 0, dex: 0, vit: 0, spd: 0, luk: 0 };
  a.dex = Math.round(pts * 0.8);
  a.vit = Math.round(pts * 0.15);
  a.luk = pts - a.dex - a.vit;
  return a;
}

const ALL_STORY_FLAGS = new Set<string>([
  "peak_giant_defeated",
  "volcano_heart_defeated",
  "endgame_apex_defeated",
  "starspire_keeper_defeated",
  "skyfolk_king_defeated",
]);

function run(label: string, equippedSkills: string[]) {
  const allocated = allocate(LEVEL);
  // Lv80 skyfolk_ruins 적정 장비 — 폐도 보스(천공인의 왕) 드랍 라인 (aether_*) + 회랑 망토.
  const gear = { weapon: ITEMS["aether_lance"], armor: ITEMS["star_robe"], accessory: ITEMS["corridor_mantle"] };
  const d = derivePlayerCombat({
    level: LEVEL,
    baseStats: BASE_STATS,
    allocatedStats: allocated,
    equipped: { weapon: gear.weapon, armor: gear.armor, accessory: gear.accessory },
    equippedSkills,
    equippedFeats: [FEAT_NAMES.ACROBAT],
    storyFlagIds: ALL_STORY_FLAGS,
    hp: 99999,
  });
  const region = WORLD_MAP.regions.find((r) => r.id === REGION_ID)!;
  const result = simulateOfflineHunt({
    player: d.player,
    playerName: "Sim",
    region,
    playerLevel: LEVEL,
    playerExp: 0,
    potions: { potion_heal_s: 30, potion_heal_m: 10 },
    turnIntervalMs: 0,
    awayMs: 3600 * 1000,
    pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
    luk: BASE_STATS.luk + allocated.luk,
    knowsRecipe: () => false,
  });
  console.log(`${label.padEnd(50)} │ ${String(result.battles).padStart(5)} battles / ${String(result.wins).padStart(5)} wins / ${String(result.revives).padStart(2)} revives / ${String(result.expGained).padStart(7)} exp`);
}

console.log(`DEX Lv${LEVEL} ${REGION_ID} ablation — ANALYSIS 활성 빌드 비교 (4슬롯)\n`);
console.log("스킬 셋업".padEnd(50) + " │ 1h sim 결과");
console.log("─".repeat(120));

// 4슬롯 + ANALYSIS — Lv80 의 ANALYSIS 메타 빌드 (이전 [-CLONE] / [-PRECISION] 와 동일)
run(
  "[+ANALYSIS+CLONE]   EVADE+COUNTER+CLONE+ANALYSIS",
  [SKILL_NAMES.EVADE, SKILL_NAMES.COUNTER, SKILL_NAMES.SHADOW_CLONE, SKILL_NAMES.ANALYSIS],
);
run(
  "[+ANALYSIS+PRECISION] EVADE+COUNTER+PRECISION+ANALYSIS",
  [SKILL_NAMES.EVADE, SKILL_NAMES.COUNTER, SKILL_NAMES.PRECISION, SKILL_NAMES.ANALYSIS],
);

// ANALYSIS 빠진 4슬롯 — DPS 우선 빌드
run(
  "[-ANALYSIS+CLONE]   EVADE+COUNTER+PRECISION+CLONE",
  [SKILL_NAMES.EVADE, SKILL_NAMES.COUNTER, SKILL_NAMES.PRECISION, SKILL_NAMES.SHADOW_CLONE],
);

// 3슬롯 베이스라인 — 5티어 잠금 (Lv65 미만 가정)
run(
  "[BASE-3] EVADE+COUNTER+PRECISION",
  [SKILL_NAMES.EVADE, SKILL_NAMES.COUNTER, SKILL_NAMES.PRECISION],
);

// 2슬롯 — ANALYSIS 단독 효과 (EVADE+COUNTER baseline 위에 ANALYSIS)
run(
  "[2슬롯+ANALYSIS] EVADE+COUNTER+ANALYSIS (3슬롯 모드)",
  [SKILL_NAMES.EVADE, SKILL_NAMES.COUNTER, SKILL_NAMES.ANALYSIS],
);
run(
  "[2슬롯 only]   EVADE+COUNTER",
  [SKILL_NAMES.EVADE, SKILL_NAMES.COUNTER],
);
