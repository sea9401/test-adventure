// SPI 부활 PR-3a 캘리브 — 마법형 몹(atkType:"magic")이 물리탱크엔 약점·정신 빌드엔 카운터인지,
// 무투자 빌드엔 과하지 않은지 1타 피해로 정량화. damageBetween(mobAtk, 마법이면 magicDef else def).
//   실행: npx tsx scripts/sim-v2-spi-magicmob.ts
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { damageBetween } from "../src/adventure/v2/combat/combatShared";
import { V2_MONSTERS } from "../src/adventure/data/v2/v2Monsters";
import { scaleMonsterForFloor } from "../src/adventure/data/v2/monsterScale";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";

const LEVEL = 60;
const BUDGET = 300; // 동일 분배 포인트(공정 비교)

function build(name: string, alloc: Partial<Record<V2StatKey, number>>) {
  const d = derivePlayerCombatV2Pure({
    level: LEVEL,
    allocatedStats: alloc,
    v2Equipped: {},
  });
  return { name, def: d.player.def, magicDef: d.player.magicDef ?? 0 };
}

const builds = [
  build("물리탱크(vit300)", { vit: BUDGET }),
  build("정신(spi300)", { spi: BUDGET }),
  build("균형(vit/spi/str)", { vit: 100, spi: 100, str: 100 }),
  build("무투자(str300=딜)", { str: BUDGET }),
];

// 마법 태그한 4몹 + 대표 깊이(밴드). 깊이로 atk 스케일.
const MOBS: Array<{ key: string; depth: number }> = [
  { key: "얼음 정령", depth: 9 },
  { key: "호수 망령", depth: 9 },
  { key: "성소 망령", depth: 24 },
  { key: "독안개 정령", depth: 16 },
];

console.log(`\n=== SPI PR-3a 마법형 몹 1타 피해 (Lv${LEVEL}, 분배 ${BUDGET}p) ===`);
console.log("빌드별 def/magicDef:");
for (const b of builds) {
  console.log(`  ${b.name.padEnd(20)} def=${String(b.def).padStart(4)}  magicDef=${String(b.magicDef).padStart(4)}`);
}

for (const { key, depth } of MOBS) {
  const base = V2_MONSTERS[key];
  if (!base) {
    console.log(`\n[${key}] 미존재`);
    continue;
  }
  const scaled = scaleMonsterForFloor(base, depth);
  console.log(`\n[${key}] 깊이 ${depth} · atk ${scaled.atk}  (마법 1타 vs 물리였다면 1타)`);
  for (const b of builds) {
    const magicDmg = damageBetween(scaled.atk, b.magicDef);
    const physDmg = damageBetween(scaled.atk, b.def); // 만약 물리였다면
    const ratio = physDmg > 0 ? (magicDmg / physDmg).toFixed(1) : "∞";
    console.log(
      `  ${b.name.padEnd(20)} 마법 ${String(magicDmg).padStart(4)}  (물리였다면 ${String(physDmg).padStart(4)}, ×${ratio})`,
    );
  }
}

console.log(
  "\n해석: 물리탱크는 마법몹에 ×수배 더 맞아야(약점), 정신 빌드는 마법몹 피해가 낮아야(카운터),",
);
console.log("무투자 빌드는 마법≈물리(둘 다 방어 낮아 중립)여야 한다.\n");
