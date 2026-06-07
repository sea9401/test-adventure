// 스타터(T1 상점 장비) 가 들판(깊이 1~6)을 무난히 클리어하는지 검증.
// 질문: "초반 상점 장비만으로도 들판 6까지는 클리어돼야" — 깊이별로 레벨을 맞추는
// sim-v2-progression 과 달리, 레벨/장비를 스타터로 고정하고 깊이 1~6 풀을 쓸어 WR·killT·사망률 측정.
//
// 실행: node --import tsx scripts/sim-starter-field.ts

import { resolveBattle, type PlayerCombat } from "../src/adventure/v2/combat/engine";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { V2_STAT_POINTS_PER_LEVEL } from "../src/adventure/data/v2/v2Stats";
import { V2_MONSTERS } from "../src/adventure/data/v2/v2Monsters";
import { enemiesForDepth, depthName } from "../src/adventure/data/v2/dungeon";
import { scaleMonsterForFloor } from "../src/adventure/data/v2/monsterScale";
import { floorStatMult } from "../src/adventure/data/v2/dungeonLadder";
import type { V2EquipmentId, V2EquipSlot } from "../src/adventure/data/v2/v2Equipment";
import type { V2Class } from "../src/adventure/data/v2/classes";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";
import type { Monster } from "../src/adventure/data/monsters/types";

type Build = "검사(STR/대검)" | "궁수(DEX/활)" | "마법사(INT/지팡이)";

// 풀 T1 상점 세트 — 무기 결에 맞춘 갑옷/장갑/신발 + 반지·목걸이.
const T1_GEAR: Record<Build, Partial<Record<V2EquipSlot, V2EquipmentId>>> = {
  "검사(STR/대검)": {
    weapon: "v2_iron_sword", armor: "v2_chain_mail", gloves: "v2_iron_gauntlets",
    boots: "v2_iron_boots", ring: "v2_silver_ring", necklace: "v2_jade_amulet",
  },
  "궁수(DEX/활)": {
    weapon: "v2_wooden_bow", armor: "v2_leather_armor", gloves: "v2_leather_gloves",
    boots: "v2_leather_boots", ring: "v2_silver_ring", necklace: "v2_jade_amulet",
  },
  "마법사(INT/지팡이)": {
    weapon: "v2_oak_staff", armor: "v2_leather_armor", gloves: "v2_leather_gloves",
    boots: "v2_leather_boots", ring: "v2_silver_ring", necklace: "v2_jade_amulet",
  },
};
const MAIN_STAT: Record<Build, V2StatKey> = {
  "검사(STR/대검)": "str", "궁수(DEX/활)": "dex", "마법사(INT/지팡이)": "int",
};
const CLS: Record<Build, V2Class> = {
  "검사(STR/대검)": "warrior", "궁수(DEX/활)": "rogue", "마법사(INT/지팡이)": "mage",
};

// main 60 / sub(vit) 30 / fill(luk) 10 — sim-v2-progression 과 동결.
function allocate(main: V2StatKey, level: number): Record<V2StatKey, number> {
  const total = Math.max(0, level - 1) * V2_STAT_POINTS_PER_LEVEL;
  const a: Record<V2StatKey, number> = { str: 0, dex: 0, vit: 0, int: 0, spi: 0, luk: 0 };
  if (total === 0) return a;
  a[main] = Math.round(total * 0.6);
  a.vit = Math.round(total * 0.3);
  a.luk = total - a[main] - a.vit;
  return a;
}

function makeStarter(build: Build, level: number): PlayerCombat {
  return derivePlayerCombatV2Pure({
    level,
    allocatedStats: allocate(MAIN_STAT[build], level),
    v2Equipped: T1_GEAR[build],
    playerClass: CLS[build],
    classTier: 1,
    hp: undefined,
  }).player;
}

function depthMonsters(depth: number): Monster[] {
  const out: Monster[] = [];
  for (const e of enemiesForDepth(depth)) {
    const base = V2_MONSTERS[e.key];
    if (base) out.push(scaleMonsterForFloor(base, depth));
  }
  return out;
}

const TRIALS = 60;
function sweep(player: PlayerCombat, enemies: Monster[]) {
  let wins = 0, total = 0, winTurnsSum = 0;
  for (const enemy of enemies) {
    for (let i = 0; i < TRIALS; i++) {
      total++;
      const r = resolveBattle({ ...player, hp: player.maxHp }, enemy, "Sim", {
        pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
        potions: {},
        v2Skills: { learned: [], equipped: [] },
      });
      if (r.outcome === "win") { wins++; winTurnsSum += r.turns; }
    }
  }
  return { wrPct: (wins / total) * 100, winTurns: wins ? winTurnsSum / wins : 0 };
}

const DEPTHS = [1, 2, 3, 4, 5, 6, 7, 8];
const LEVELS = [1, 3, 5, 8, 12, 16, 20];

console.log("스타터(풀 T1 상점 장비) × 들판 깊이 1~6 — 일반공격 baseline, 스킬 미장착\n");
for (const build of Object.keys(T1_GEAR) as Build[]) {
  console.log(`■ ${build}`);
  // 헤더
  const hdr = ["Lv\\깊이"].concat(DEPTHS.map((d) => `${depthName(d)}(×${floorStatMult(d).toFixed(2)})`));
  console.log("  " + hdr.join("  |  "));
  for (const lv of LEVELS) {
    const p = makeStarter(build, lv);
    const cells = DEPTHS.map((d) => {
      const { wrPct, winTurns } = sweep(p, depthMonsters(d));
      const wr = wrPct.toFixed(0).padStart(3);
      const kt = winTurns ? winTurns.toFixed(1) : "—";
      return `${wr}% ${kt}t`;
    });
    console.log(`  Lv${String(lv).padStart(2)} (atk${Math.round(p.atk)}/mAtk${Math.round(p.magicAtk ?? 0)}/def${Math.round(p.def)}/hp${p.maxHp})  ` + cells.join("  |  "));
  }
  console.log("");
}
console.log("기준선: 'WR 100% & killT 낮음' = 무난. WR<90% 또는 killT 폭증 = 스타터로 버거움.");

// ── 깊은산(깊이 7~10) 게이트 — T3/T5 장비로 닫히는지 확인 ──
const GEARED: Record<"T3검사" | "T5검사", Partial<Record<V2EquipSlot, V2EquipmentId>>> = {
  T3검사: { weapon: "v2_greatsword", armor: "v2_full_plate", gloves: "v2_plate_gauntlets", boots: "v2_plate_boots", ring: "v2_lucky_charm", necklace: "v2_crystal_amulet" },
  T5검사: { weapon: "v2_mithril_sword", armor: "v2_mithril_plate", gloves: "v2_mithril_gauntlets", boots: "v2_mithril_boots", ring: "v2_fate_ring", necklace: "v2_mana_essence" },
};
console.log("\n■ 깊은산 게이트 — 장비 갈아탄 검사 (깊이 7~10)");
console.log("  빌드/Lv  |  " + [7, 8, 9, 10].map((d) => `${depthName(d)}(×${floorStatMult(d).toFixed(2)})`).join("  |  "));
for (const [name, gear] of Object.entries(GEARED)) {
  for (const lv of [16, 25, 40]) {
    const p: PlayerCombat = derivePlayerCombatV2Pure({ level: lv, allocatedStats: allocate("str", lv), v2Equipped: gear, playerClass: "warrior", classTier: lv >= 30 ? 2 : 1, hp: undefined }).player;
    const cells = [7, 8, 9, 10].map((d) => {
      const { wrPct, winTurns } = sweep(p, depthMonsters(d));
      return `${wrPct.toFixed(0).padStart(3)}% ${winTurns ? winTurns.toFixed(1) : "—"}t`;
    });
    console.log(`  ${name} Lv${String(lv).padStart(2)} (atk${Math.round(p.atk)}/def${Math.round(p.def)}/hp${p.maxHp})  ` + cells.join("  |  "));
  }
}
