// SPI 부활 PR-3b 캘리브 — 치명형 몹(critPct)이 무투자 빌드엔 적당한 추가 위협, 정신 빌드엔
// 완화되는지 기대 피해 배수로 정량화. 기대배수 = 1 + effCritPct/100 × (critMult−1),
//   effCritPct = max(0, critPct − critResistPct). 실행: npx tsx scripts/sim-v2-spi-critmob.ts
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";

const LEVEL = 60;
const BUDGET = 300;
const CRIT_PCT = 30; // 태그한 치명형 몹(협곡 도적·동굴 포식자·우두머리 늑대)
const CRIT_MULT = 1.5; // MONSTER_CRIT_MULT_DEFAULT

function build(name: string, alloc: Partial<Record<V2StatKey, number>>) {
  const d = derivePlayerCombatV2Pure({
    level: LEVEL,
    allocatedStats: alloc,
    v2Equipped: {},
  });
  return { name, critResist: d.player.critResistPct ?? 0 };
}

const builds = [
  build("무투자(str300=딜)", { str: BUDGET }),
  build("정신 소(spi100)", { spi: 100 }),
  build("정신 중(spi200)", { spi: 200 }),
  build("정신 대(spi300)", { spi: 300 }),
];

console.log(`\n=== SPI PR-3b 치명형 몹 기대 피해 배수 (Lv${LEVEL}, critPct ${CRIT_PCT}·×${CRIT_MULT}) ===`);
for (const b of builds) {
  const eff = Math.max(0, CRIT_PCT - b.critResist);
  const avgMult = 1 + (eff / 100) * (CRIT_MULT - 1);
  console.log(
    `  ${b.name.padEnd(18)} critResist ${String(b.critResist.toFixed(1)).padStart(5)}%p → 유효치명 ${String(eff.toFixed(1)).padStart(4)}% → 기대피해 ×${avgMult.toFixed(3)} (+${((avgMult - 1) * 100).toFixed(1)}%)`,
  );
}
console.log(
  "\n해석: 무투자는 +수%p(치명 버스트 위협), 정신 투자할수록 유효치명 0 으로 수렴(카운터).",
);
console.log("critResist cap 50%p — 어떤 critPct 몹도 정신만으로 완전 봉인은 불가.\n");
