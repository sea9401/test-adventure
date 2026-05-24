// 지역 광역 sweep — Lv80 DEX 메타 빌드(EVADE+COUNTER+PRECISION+CLONE+ANALYSIS 가능한 만큼)로
// 본토+별빛 전 지역에서 1h offlineSim 돌려 어느 지역이 진짜 폭발 지점인지 매핑.
//
// 출력 정렬: 권장 레벨 오름차순. wins/revives 한눈에 비교.
// 비고: enemies 비어있는 town/허브 노드는 건너뜀(시뮬 자체가 즉시 return).
import { pickAutoAction } from "../src/adventure/battle/pickAutoAction";
import { derivePlayerCombat } from "../src/adventure/character/derivePlayerCombat";
import { simulateOfflineHunt } from "../src/adventure/battle/offlineSim";
import { FEAT_NAMES, SKILL_NAMES } from "../src/adventure/character/skills";
import { ITEMS } from "../src/adventure/data/items";
import { WORLD_MAP } from "../src/adventure/data/world";
import type { StatKey } from "../src/adventure/data/stats";

const BASE_STATS: Record<StatKey, number> = { str: 3, dex: 3, vit: 3, spd: 3, luk: 3 };
const LEVEL = 80;

// Lv80 = 일반 스킬 슬롯 4 개. ANALYSIS 는 4번째 자리에 두어야 slice 에 안 잘림.
// effectiveSkillNames 가 stored.slice(0, 4) 라 5개 넘기면 마지막이 무음 잘림.
const DEX_META_SKILLS = [
  SKILL_NAMES.EVADE,
  SKILL_NAMES.COUNTER,
  SKILL_NAMES.PRECISION,
  SKILL_NAMES.ANALYSIS, // ← 4번째 자리, SHADOW_CLONE 대신 ANALYSIS 활성화 메타
];

const ALL_STORY_FLAGS = new Set<string>([
  "peak_giant_defeated",
  "volcano_heart_defeated",
  "endgame_apex_defeated",
  "starspire_keeper_defeated",
  "skyfolk_king_defeated",
]);

function allocate(): Record<StatKey, number> {
  const pts = Math.max(0, LEVEL - 1);
  const a: Record<StatKey, number> = { str: 0, dex: 0, vit: 0, spd: 0, luk: 0 };
  a.dex = Math.round(pts * 0.8);
  a.vit = Math.round(pts * 0.15);
  a.luk = pts - a.dex - a.vit;
  return a;
}

function makePlayer() {
  const d = derivePlayerCombat({
    level: LEVEL,
    baseStats: BASE_STATS,
    allocatedStats: allocate(),
    equipped: {
      weapon: ITEMS["aether_lance"],
      armor: ITEMS["star_robe"],
      accessory: ITEMS["corridor_mantle"],
    },
    equippedSkills: DEX_META_SKILLS,
    equippedFeats: [FEAT_NAMES.ACROBAT],
    storyFlagIds: ALL_STORY_FLAGS,
    hp: 99999,
  });
  return { combat: d.player, luk: BASE_STATS.luk + allocate().luk };
}

const { combat, luk } = makePlayer();
console.log(`Lv${LEVEL} DEX 메타 빌드 — atk ${combat.atk} def ${combat.def} hp ${combat.maxHp} eva ${(combat.evasionPct ?? 0).toFixed(0)}% crit ${(combat.critChancePct ?? 0).toFixed(0)}%`);
console.log(`스킬: ${DEX_META_SKILLS.join("+")}, analysisPerTurn=${combat.analysisPerTurn ?? 0}`);
console.log("");

type Row = {
  regionId: string;
  name: string;
  recommendedLevel: number;
  battles: number;
  wins: number;
  revives: number;
  exp: number;
};

const rows: Row[] = [];

for (const region of WORLD_MAP.regions) {
  if (region.enemies.length === 0) continue; // 마을·허브 건너뜀
  const result = simulateOfflineHunt({
    player: combat,
    playerName: "Sim",
    region,
    playerLevel: LEVEL,
    playerExp: 0,
    potions: { potion_heal_s: 30, potion_heal_m: 10 },
    turnIntervalMs: 0,
    awayMs: 3600 * 1000,
    pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
    luk,
    knowsRecipe: () => false,
  });
  rows.push({
    regionId: region.id,
    name: region.name,
    recommendedLevel: region.recommendedLevel ?? 0,
    battles: result.battles,
    wins: result.wins,
    revives: result.revives,
    exp: result.expGained,
  });
}

// 권장 레벨 오름차순으로 정렬
rows.sort((a, b) => a.recommendedLevel - b.recommendedLevel || a.regionId.localeCompare(b.regionId));

console.log(
  "권장Lv │ regionId".padEnd(36) +
  " │ 지역명".padEnd(22) +
  " │ battles │  wins │ rev │     exp",
);
console.log("─".repeat(110));
for (const r of rows) {
  console.log(
    `   ${String(r.recommendedLevel).padStart(3)} │ ${r.regionId.padEnd(24)}` +
    ` │ ${r.name.padEnd(18)}` +
    ` │ ${String(r.battles).padStart(7)}` +
    ` │ ${String(r.wins).padStart(5)}` +
    ` │ ${String(r.revives).padStart(3)}` +
    ` │ ${String(r.exp).padStart(7)}`,
  );
}

console.log("\n해석:");
console.log("  - 권장Lv 80 이상에서 wins 가 갑자기 폭증하면 그 지역이 메타 농장.");
console.log("  - revives 0~1 vs 3 패턴 — 사망률 정수 차이가 wins 비선형 amp 의 원인.");
console.log("  - 권장Lv 80 미만에서도 wins 높은 곳 = 저레벨 농사 가성비 지점.");
