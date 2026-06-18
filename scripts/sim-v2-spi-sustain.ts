// SPI 부활 PR-4 게이트(Codex 권고) — 고-SPI 사제(치유+회복강화)가 솔로 PvE 를 무적화하는지 점검.
// 핵심 질문: 힐이 데미지를 앞질러, 파워가 한참 모자란 심도까지 out-sustain 으로 이겨버리는가?
//   실행: npx tsx scripts/sim-v2-spi-sustain.ts
import { resolveBattle, type PlayerCombat } from "../src/adventure/v2/combat/engine";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { V2_MONSTERS } from "../src/adventure/data/v2/v2Monsters";
import { enemiesForDepth } from "../src/adventure/data/v2/dungeon";
import { scaleMonsterForFloor } from "../src/adventure/data/v2/monsterScale";
import type { Monster } from "../src/adventure/data/monsters/types";
import type { V2SkillsState } from "../src/adventure/data/v2/v2Skills";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";

const LEVEL = 60;
const BUDGET = 300;
const TRIALS = 40; // 크리/회피/proc 랜덤 → 표본
const HEAL: V2SkillsState = {
  learned: ["v2c_acolyte_smite"],
  equipped: ["v2c_acolyte_smite"],
};
const NOSKILL: V2SkillsState = { learned: [], equipped: [] };

function player(alloc: Partial<Record<V2StatKey, number>>, healPowerPct = 0) {
  return derivePlayerCombatV2Pure({
    level: LEVEL,
    allocatedStats: alloc,
    v2Equipped: {},
    passiveHealPowerPct: healPowerPct,
  }).player;
}

type Build = { name: string; p: PlayerCombat; skills: V2SkillsState };
const builds: Build[] = [
  { name: "딜 베이스(str300,무힐)", p: player({ str: BUDGET }), skills: NOSKILL },
  { name: "딜+치유(str300)", p: player({ str: BUDGET }), skills: HEAL },
  { name: "혼합 str150/spi150+치유", p: player({ str: 150, spi: 150 }), skills: HEAL },
  { name: "혼합 +회복25", p: player({ str: 150, spi: 150 }, 25), skills: HEAL },
  { name: "혼합 int150/spi150+치유+회복25", p: player({ int: 150, spi: 150 }, 25), skills: HEAL },
  { name: "순수 spi300+치유+회복25", p: player({ spi: BUDGET }, 25), skills: HEAL },
];

function depthMonsters(depth: number): Monster[] {
  const out: Monster[] = [];
  for (const e of enemiesForDepth(depth)) {
    const base = V2_MONSTERS[e.key];
    if (base) out.push(scaleMonsterForFloor(base, depth));
  }
  return out;
}

function winRate(b: Build, depth: number): { wr: number; capPct: number } {
  const mobs = depthMonsters(depth);
  if (!mobs.length) return { wr: -1, capPct: 0 };
  let wins = 0;
  let caps = 0;
  let n = 0;
  for (const enemy of mobs) {
    for (let i = 0; i < TRIALS; i++) {
      n++;
      const r = resolveBattle({ ...b.p, hp: b.p.maxHp }, enemy, "Sim", {
        pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
        potions: {},
        v2Skills: b.skills,
        depth,
      });
      if (r.outcome === "win") wins++;
      // 턴 캡 근처 = 힐 교착(무적 신호). BOSS_TURN_CAP 50 기준 45+.
      if (r.turns >= 45) caps++;
    }
  }
  return { wr: (wins / n) * 100, capPct: (caps / n) * 100 };
}

// 적정(파워 맞음) → 과도(파워 한참 부족) 심도. 무적이면 과도 심도에서도 사제만 승률 유지.
const DEPTHS = [9, 16, 22, 28];
console.log(`\n=== SPI PR-4 게이트: 고-SPI 사제 솔로 무적화 점검 (Lv${LEVEL}, ${TRIALS}회/몹) ===`);
console.log("심도↑ = 파워 부족. 무적이면 사제만 과도심도서 승률·턴캡 유지.\n");
const header = "빌드".padEnd(26) + DEPTHS.map((d) => `d${d}`.padStart(9)).join("");
console.log(header);
for (const b of builds) {
  const cells = DEPTHS.map((d) => {
    const { wr } = winRate(b, d);
    return `${wr.toFixed(0)}%`.padStart(9);
  });
  console.log(b.name.padEnd(26) + cells.join(""));
}
console.log("\n턴캡(45+) 비율 — 힐 교착(무적) 신호:");
for (const b of builds) {
  if (b.skills === NOSKILL) continue;
  const cells = DEPTHS.map((d) => `${winRate(b, d).capPct.toFixed(0)}%`.padStart(9));
  console.log(b.name.padEnd(26) + cells.join(""));
}
console.log(
  "\n해석: 사제 승률이 무투자보다 약간 높고(탱/지속) 과도심도(d28)서 함께 무너지면 정상.",
);
console.log("사제만 d28 고승률 + 턴캡 다발 = 무적화 → HEAL_MULT/회복% 하향 필요.\n");
