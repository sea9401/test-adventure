// 방어 관통(DEF 무시) 비율이 전투에 미치는 영향 정량 측정 — 일회성 분석용.
// 실행:  npx tsx scripts/sim-def-pierce.ts
//
// 배경: 암살/약점/DEF무시 AP(그림자베기·천살·별빛흩기) 의 "완전 무시(targetDef=0)" 가
//      "선턴 이김"·방어 무력화의 주범이라는 진단. engine.ts DEF_IGNORE_FRACTION 으로 무시
//      비율을 0.3 으로 완화하는 PR(#527) 의 타당성 검증.
//
// 이 스크립트는 *현재 코드의 DEF_IGNORE_FRACTION 값*으로 돈다. 비율별 비교는 호출 측
//      (run-def-pierce-sweep.sh 또는 수동 sed)에서 상수를 바꿔 여러 번 돌려 비교한다.
//      참고: FRAC=1.0 == 옛 "완전 무시"(targetDef 0) 와 동일. 0.0 == DEF 100% 적용.
//
// 측정:
//   [PvP 선턴 이김]  글래스캐논(고SPD/ATK + 암살 + DEF무시 AP + 기습) 이 선공일 때 탱크(고DEF/VIT)
//                    상대 승률 / 평균 턴 / (패배 시) 탱크 잔여HP%. 비율↑ = 공격자 유리(선턴 이김).
//   [PvE 고DEF 보스] 공격형 빌드가 후기 솔로 보스 처치하는 WR / 처치턴. 비율↑ = 빠른 처치.

import {
  resolveBattle,
  type PlayerCombat,
  type EquippedAPSkill,
  DEF_IGNORE_FRACTION,
} from "../src/adventure/battle/engine";
import { resolveBattlePvP } from "../src/adventure/battle/engine-pvp";
import { pickAutoAction } from "../src/adventure/battle/pickAutoAction";
import { derivePlayerCombat } from "../src/adventure/character/derivePlayerCombat";
import { FEAT_NAMES, SKILL_NAMES } from "../src/adventure/character/skills";
import { getAPSkillByName, type APSkillCondition } from "../src/adventure/character/apSkills";
import { ITEMS } from "../src/adventure/data/items";
import { MONSTERS, type Monster } from "../src/adventure/data/monsters";
import type { StatKey } from "../src/adventure/data/stats";

const LEVEL = Number(process.env.LEVEL ?? 100);
const TRIALS = Number(process.env.TRIALS ?? 400);
const PT_MULT = 1.5;

const BASE_STATS: Record<StatKey, number> = { str: 3, dex: 3, vit: 3, spd: 3, luk: 3 };
const FLAGS = new Set<string>([
  "peak_giant_defeated",
  "volcano_heart_defeated",
  "starspire_keeper_defeated",
  "skyfolk_king_defeated",
  "endgame_apex_defeated",
]);

const always = (skill: ReturnType<typeof getAPSkillByName>): EquippedAPSkill => ({
  skill: skill!,
  condition: { kind: "always" } as APSkillCondition,
});

// 스탯 분배 — main 50% / vit 32% / sub 12%.
function allocate(main: StatKey, sub: StatKey): Record<StatKey, number> {
  const points = Math.round(Math.max(0, LEVEL - 1) * PT_MULT);
  const a: Record<StatKey, number> = { str: 0, dex: 0, vit: 0, spd: 0, luk: 0 };
  let left = points;
  const give = (k: StatKey, n: number) => {
    const v = Math.max(0, Math.min(left, n));
    a[k] += v;
    left -= v;
  };
  give(main, Math.round(points * 0.5));
  give("vit", Math.round(points * 0.32));
  give(sub, Math.round(points * 0.12));
  give(main, left);
  return a;
}

function gearItem(id: string, fallback: string) {
  return id in ITEMS ? ITEMS[id as keyof typeof ITEMS] : ITEMS[fallback as keyof typeof ITEMS];
}

// 글래스캐논 — 고SPD/STR, 암살(특기)+기습+DEF무시 AP(그림자베기·천살). DEF 관통 다이얼의 수혜자.
function makeAttacker(): PlayerCombat {
  const d = derivePlayerCombat({
    level: LEVEL,
    baseStats: BASE_STATS,
    allocatedStats: allocate("spd", "str"),
    equipped: {
      weapon: gearItem("empyrean_lance", "volcano_sword"),
      armor: gearItem("empyrean_mantle", "volcano_armor"),
      accessory: gearItem("apex_regalia", "volcano_core"),
    },
    equippedSkills: [SKILL_NAMES.VANGUARD, SKILL_NAMES.DOUBLE_STRIKE, SKILL_NAMES.POWER_ATTACK],
    equippedFeats: [FEAT_NAMES.ASSASSINATE],
    storyFlagIds: FLAGS,
    hp: 99999,
  });
  return {
    ...d.player,
    hp: d.player.maxHp,
    equippedAPSkills: [always(getAPSkillByName("그림자 베기")), always(getAPSkillByName("천살"))],
  };
}

// 탱크 — 고VIT/DEF, 수호. 방어 관통 완화의 수혜자(완화될수록 오래 버팀).
function makeTank(): PlayerCombat {
  const d = derivePlayerCombat({
    level: LEVEL,
    baseStats: BASE_STATS,
    allocatedStats: allocate("vit", "str"),
    equipped: {
      weapon: gearItem("empyrean_blade", "volcano_sword"),
      armor: gearItem("empyrean_mantle", "volcano_armor"),
      accessory: gearItem("apex_regalia", "volcano_core"),
    },
    equippedSkills: [SKILL_NAMES.GUARD, SKILL_NAMES.POWER_ATTACK, SKILL_NAMES.CRUSH],
    equippedFeats: [FEAT_NAMES.LIFESTEAL],
    storyFlagIds: FLAGS,
    hp: 99999,
  });
  // DEF 를 의도적으로 키워 "방어 투자" 빌드를 표현 (관통 다이얼의 효과를 또렷이).
  return { ...d.player, hp: d.player.maxHp, def: Math.round(d.player.def * 1.8) };
}

const pvpCtx = {
  pickAction: () => ({ kind: "attack" as const }),
  potions: { p1: {}, p2: {} },
};

function pad(s: string | number, n: number, left = false): string {
  const str = String(s);
  return left ? str.padStart(n) : str.padEnd(n);
}

console.log(`\n방어 관통(DEF 무시) 영향 측정 — DEF_IGNORE_FRACTION = ${DEF_IGNORE_FRACTION}`);
console.log(`Lv${LEVEL} 풀스펙(empyrean) · TRIALS=${TRIALS}`);
console.log(`(FRAC 1.0 = 옛 완전무시 / 0.3 = PR#527 / 0.0 = DEF 100% 적용)\n`);

// ── [PvP] 글래스캐논(선공) vs 탱크 ──────────────────────────────────────
{
  const atk = makeAttacker();
  const tank = makeTank();
  const firstName = atk.spd >= tank.spd ? "공격자" : "탱크";
  let atkWins = 0;
  let turnsSum = 0;
  let tankHpLeftOnLoss = 0;
  let lossN = 0;
  for (let t = 0; t < TRIALS; t++) {
    const r = resolveBattlePvP(
      { ...atk, hp: atk.maxHp },
      { ...tank, hp: tank.maxHp },
      "공격자",
      "탱크",
      pvpCtx,
    );
    if (r.outcome === "p1_win") atkWins += 1;
    turnsSum += r.turns;
    if (r.outcome !== "p1_win") {
      lossN += 1;
      tankHpLeftOnLoss += (r.finalState.p2.hp / r.finalState.p2.maxHp) * 100;
    }
  }
  console.log(`[PvP] 글래스캐논 vs 탱크  (선공: ${firstName}, atk.spd=${atk.spd} tank.spd=${tank.spd})`);
  console.log(`  공격자 승률 : ${((atkWins / TRIALS) * 100).toFixed(1)}%`);
  console.log(`  평균 턴수   : ${(turnsSum / TRIALS).toFixed(1)}`);
  console.log(
    `  공격자 패배 시 탱크 잔여HP% : ${lossN ? (tankHpLeftOnLoss / lossN).toFixed(1) : "-"} (n=${lossN})`,
  );
  console.log(`  공격자 atk=${atk.atk} maxHp=${atk.maxHp} / 탱크 def=${tank.def} maxHp=${tank.maxHp}\n`);
}

// ── [PvE] 공격형 빌드 vs 후기 솔로 보스 ─────────────────────────────────
const noPotion = {
  potions: {},
  pickAction: (s: Parameters<typeof pickAutoAction>[0]) =>
    pickAutoAction(s, { rules: [], potions: {} }),
};
const SOLO_BOSSES = ["별을 지키는 자", "천공인의 왕", "순례자의 분신", "창공의 주재"];
{
  const atk = makeAttacker();
  console.log(`[PvE] 글래스캐논 vs 후기 솔로 보스 (WR / 처치턴)`);
  console.log(`    ${pad("보스", 16)}${pad("WR%", 8, true)}${pad("처치턴", 9, true)}`);
  for (const name of SOLO_BOSSES) {
    if (!MONSTERS[name]) {
      console.log(`    (없음: ${name})`);
      continue;
    }
    let wins = 0;
    let turns = 0;
    for (let t = 0; t < TRIALS; t++) {
      const enemy: Monster = MONSTERS[name];
      const r = resolveBattle({ ...atk, hp: atk.maxHp }, enemy, "p", { ...noPotion, isBoss: true });
      if (r.outcome === "win") {
        wins += 1;
        turns += r.turns;
      }
    }
    const wr = (wins / TRIALS) * 100;
    console.log(
      `    ${pad(name, 16)}${pad(wr.toFixed(0), 8, true)}${pad(wins ? (turns / wins).toFixed(1) : "-", 9, true)}`,
    );
  }
}
console.log("");
