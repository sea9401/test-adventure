// A 메타 신규 패시브 밸런스 점검(임시) — 각 패시브를 한 빌드에 단독 장착했을 때 무(無)패시브
//   동일 빌드 대비 PvP 승률. 지배적(must-pick)·죽은(never-pick) 효과를 가려낸다.
//   ⚠️ 단일 빌드·단독 패시브라 빌드 시너지(치명피해는 치명확률 빌드에서 빛남)는 과소평가됨 —
//   "한 빌드에 꽂아도 압도적인가/무의미한가"의 1차 outlier 스캐너로만 본다.
import { resolveBattlePvP } from "../src/adventure/v2/combat/engine-pvp";
import type { PlayerCombat } from "../src/adventure/v2/combat/engine";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";
import { emptyV2SkillsState } from "../src/adventure/data/v2/v2Skills";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";

const LEVEL = 50;
const TRIALS = 1500;

// 대표 엔드 브루저 빌드 — tier3/4 패시브는 cumLevel 250~450(환생 다수) 엔드에서나 열리므로
//   거대 누적 스탯으로 근사(엔드는 스탯이 지배). 무장비(엔드 장비 비중 작음)로 패시브 효과 격리.
//   str/vit 중심 + dex/luk 로 crit/eva 도 base 를 갖게.
function allocate(): Partial<Record<V2StatKey, number>> {
  return { str: 500, vit: 400, dex: 250, luk: 200, int: 40, spi: 40 };
}

type PassiveInput = Parameters<typeof derivePlayerCombatV2Pure>[0];

function build(extra: Partial<PassiveInput>): PlayerCombat {
  const d = derivePlayerCombatV2Pure({
    level: LEVEL,
    allocatedStats: allocate(),
    v2Equipped: {},
    hp: undefined,
    ...extra,
  });
  return {
    ...d.player,
    hp: d.maxHp,
    attackElement: "neutral",
    characterElement: "neutral",
  };
}

const CTX = {
  pickAction: () => ({ kind: "attack" as const }),
  potions: { p1: {}, p2: {} },
  v2Skills: { p1: emptyV2SkillsState(), p2: emptyV2SkillsState() },
};

function winrate(buffed: PlayerCombat, base: PlayerCombat): number {
  let w = 0;
  for (let i = 0; i < TRIALS; i += 1) {
    const r = resolveBattlePvP(
      { ...buffed, hp: buffed.maxHp },
      { ...base, hp: base.maxHp },
      "A",
      "B",
      CTX,
    );
    if (r.outcome === "p1_win") w += 1;
    else if (r.outcome === "draw") w += 0.5;
  }
  return (w / TRIALS) * 100;
}

const CASES: { label: string; extra: Partial<PassiveInput> }[] = [
  { label: "근력 (힘+10 flat·tier1 ref)", extra: { jobBonus: { str: 10 } } },
  { label: "근력II (힘+15%·tier2 ref)", extra: { statPct: { str: 15 } } },
  { label: "근력III (힘+20%·tier3 ref)", extra: { statPct: { str: 20 } } },
  { label: "체력 (최대HP+12%)", extra: { maxHpPct: 12 } },
  { label: "철신 (최대HP+12%·tier4)", extra: { maxHpPct: 12 } },
  { label: "치명 (치명확률+8%)", extra: { passiveCritPct: 8 } },
  { label: "맹공 (치명피해+30%)", extra: { passiveCritDmgPct: 30 } },
  { label: "필살 (치명피해+25%·tier4)", extra: { passiveCritDmgPct: 25 } },
  { label: "허보/잔영 (회피+10~12%)", extra: { passiveEvasionPct: 12 } },
  { label: "포식 (흡혈+4%)", extra: { passiveLifestealPct: 4 } },
  { label: "철벽 (방어+20%)", extra: { passiveDefPct: 20 } },
  { label: "정밀 (명중+12)", extra: { passiveAccuracyPct: 12 } },
];

const base = build({});
console.log(
  `\nA 메타 신규 패시브 밸런스 — Lv${LEVEL} 브루저 빌드·단독 패시브 vs 무패시브·${TRIALS}판\n` +
    `base 파생: atk=${base.atk} def=${base.def} maxHp=${base.maxHp} crit=${(base.critChancePct ?? 0).toFixed(1)}% critMult=${(base.critMult ?? 0).toFixed(2)} eva=${(base.evasionPct ?? 0).toFixed(1)}% acc=${(base.accuracyPct ?? 0).toFixed(1)}%\n`,
);
const rows = CASES.map((c) => ({ label: c.label, wr: winrate(build(c.extra), base) }));
rows.sort((a, b) => b.wr - a.wr);
for (const r of rows) {
  const flag = r.wr >= 80 ? " ⚠️지배적" : r.wr <= 53 ? " ⚠️미미" : "";
  console.log(`  ${r.wr.toFixed(1).padStart(5)}%  ${r.label}${flag}`);
}
console.log(
  `\n해석: 50%=무의미, 높을수록 단독 가치 큼. 80%+ =단독으로도 압도(must-pick 의심),\n` +
    `53%-=단독 거의 무의미(빌드 시너지 의존). 밴드가 좁을수록 건전(must-pick 없음).`,
);
