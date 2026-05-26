// ANALYSIS 8배 폭발 메커니즘 진단 — 단일 전투 turn-by-turn 로그.
// Lv 80 DEX 빌드, 폐도 잡몹 1체씩 vs ANALYSIS 활성/비활성.
import { resolveBattle, type PlayerCombat } from "../src/adventure/battle/engine";
import { pickAutoAction } from "../src/adventure/battle/pickAutoAction";
import { derivePlayerCombat } from "../src/adventure/character/derivePlayerCombat";
import { SKILL_NAMES, FEAT_NAMES } from "../src/adventure/character/skills";
import { ITEMS } from "../src/adventure/data/items";
import { MONSTERS } from "../src/adventure/data/monsters";
import type { StatKey } from "../src/adventure/data/stats";

const BASE_STATS: Record<StatKey, number> = { str: 3, dex: 3, vit: 3, spd: 3, luk: 3, int: 3 };
const LEVEL = 80;
const ALLOC: Record<StatKey, number> = { str: 0, dex: 63, vit: 12, spd: 0, luk: 4, int: 0 };

const ALL_STORY_FLAGS = new Set<string>([
  "peak_giant_defeated",
  "volcano_heart_defeated",
  "endgame_apex_defeated",
]);

function makePlayer(skills: string[]): PlayerCombat {
  const d = derivePlayerCombat({
    level: LEVEL,
    baseStats: BASE_STATS,
    allocatedStats: ALLOC,
    equipped: {
      weapon: ITEMS["aether_lance"],
      armor: ITEMS["star_robe"],
      accessory: ITEMS["corridor_mantle"],
    },
    equippedSkills: skills,
    equippedFeats: [FEAT_NAMES.ACROBAT],
    storyFlagIds: ALL_STORY_FLAGS,
    hp: 99999,
  });
  return d.player;
}

function trace(label: string, skills: string[], monsterName: string, trials = 5) {
  const monster = MONSTERS[monsterName];
  if (!monster) throw new Error(`monster not found: ${monsterName}`);
  const p = makePlayer(skills);
  console.log(`\n━━ [${label}] vs ${monsterName} (HP${monster.hp} ATK${monster.atk} DEF${monster.def} EVA${monster.evasionPct ?? 0}%) ━━`);
  console.log(`플레이어: atk${p.atk} def${p.def} hp${p.maxHp} eva${(p.evasionPct ?? 0).toFixed(0)}% crit${(p.critChancePct ?? 0).toFixed(0)}% analysisPerTurn=${p.analysisPerTurn ?? 0}`);
  let totalTurns = 0;
  let totalDmgDealt = 0;
  let totalDmgTaken = 0;
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    const r = resolveBattle({ ...p, hp: p.maxHp }, monster, "Sim", {
      pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
      potions: {},
    });
    if (r.outcome === "win") wins++;
    const finalState = r.finalState;
    totalTurns += r.turns;
    totalDmgDealt += (monster.hp - finalState.enemyHp);
    totalDmgTaken += (p.maxHp - finalState.playerHp);
  }
  const avgTurns = (totalTurns / trials).toFixed(1);
  const avgDmgDealt = Math.round(totalDmgDealt / trials);
  const avgDmgTaken = Math.round(totalDmgTaken / trials);
  console.log(`결과 ${trials}회 평균: ${wins}/${trials}승 / ${avgTurns}턴 / 데미지가한 ${avgDmgDealt} / 받은 ${avgDmgTaken}`);
}

// ── 한 전투 상세 로그 (1턴씩) ──
function traceOne(label: string, skills: string[], monsterName: string) {
  const monster = MONSTERS[monsterName];
  if (!monster) throw new Error(`monster not found: ${monsterName}`);
  const p = makePlayer(skills);
  console.log(`\n══ [${label}] vs ${monsterName} 단일 전투 상세 ══`);
  const r = resolveBattle({ ...p, hp: p.maxHp }, monster, "Sim", {
    pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
    potions: {},
  });
  // 로그 출력 — 시간순으로 데미지/페널티 흐름
  const interesting = r.finalState.log.filter((entry) =>
    entry.text.includes("[약점 분석]") ||
    entry.text.includes("데미지") ||
    entry.text.includes("회피") ||
    entry.text.includes("반격") ||
    entry.text.includes("그림자 분신") ||
    entry.text.includes("쓰러뜨렸") ||
    entry.text.includes("쓰러져") ||
    entry.text.includes("HP") && entry.text.includes("→"),
  );
  for (const entry of interesting.slice(0, 40)) {
    console.log(`  ${entry.text}`);
  }
  console.log(`▶ 결과: ${r.outcome}, 총 ${r.turns}턴, 적 HP ${r.finalState.enemyHp}/${monster.hp}, 플레이어 HP ${r.finalState.playerHp}/${p.maxHp}`);
  console.log(`▶ 최종 페널티 누적: ATK -${r.finalState.buffs.enemyAtkPenalty} / DEF -${r.finalState.buffs.enemyDefPenalty}`);
}

// 잡몹 3종 비교
const ENEMIES = ["천공인 사관", "천공인 전사", "폐허의 거상"];

console.log(`=== ANALYSIS 메커니즘 추적 (Lv${LEVEL} DEX 빌드, alloc dex${ALLOC.dex}/vit${ALLOC.vit}/luk${ALLOC.luk}) ===`);
console.log("DEX 임계 65 충족 여부:", BASE_STATS.dex + ALLOC.dex + 8 /* aether_lance dex+10 */ + 8 /* corridor_mantle dex+8 */ >= 65, "(분배+장비)");

const WITH_ANALYSIS = [SKILL_NAMES.EVADE, SKILL_NAMES.COUNTER, SKILL_NAMES.PRECISION, SKILL_NAMES.ANALYSIS];
const WITHOUT = [SKILL_NAMES.EVADE, SKILL_NAMES.COUNTER, SKILL_NAMES.PRECISION, SKILL_NAMES.SHADOW_CLONE];

for (const enemy of ENEMIES) {
  trace("ANALYSIS 있음", WITH_ANALYSIS, enemy, 10);
  trace("ANALYSIS 없음", WITHOUT, enemy, 10);
}

// 가장 강한 잡몹(폐허의 거상) 1전투 상세 로그
console.log("\n\n=== 단일 전투 상세 — 폐허의 거상 ===");
traceOne("ANALYSIS 있음", WITH_ANALYSIS, "폐허의 거상");
traceOne("ANALYSIS 없음", WITHOUT, "폐허의 거상");
