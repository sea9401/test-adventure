// 폐허 몬스터 밸런스 시뮬레이션 — 일회성 분석용.
// 실행: npx tsx scripts/sim-ruins.ts
//
// 시나리오:
//  - 플레이어 빌드 3종 (저~중~고)을 정의
//  - 각 빌드 vs 폐허 몬스터 3종 vs 호수 님프(비교군)
//  - 1:1 자동 전투를 N회 반복, 승률 / 평균 턴 / 평균 잔여 HP 보고

import { MONSTERS } from "../src/adventure/data/monsters";
import {
  resolveBattle,
  type PlayerCombat,
} from "../src/adventure/battle/engine";
import { pickAutoAction } from "../src/adventure/battle/pickAutoAction";
import { maxHpForLevel } from "../src/adventure/character/defaults";
import { WORLD_MAP, pickEnemyName } from "../src/adventure/data/world";

const TRIALS = 500;
const LEVEL = 9;

type Build = {
  name: string;
  combat: PlayerCombat;
};

// player_combat 계산 규칙 (page.tsx 와 동일):
//   atk = str + Math.floor(dex/5) + equipAtk
//   def = vit*2 + equipDef
//   spd = spd
//   evasionPct = dex
//   attackCount = 1 + Math.floor(spd/10)
//   maxHp = maxHpForLevel(level) + vit
//
// Lv 9 기준:
//   - base stats (3,3,3,3,3) + 8 분배 포인트
//   - maxHp = 47 + 8*5 = 87 (+ vit)

function build(
  name: string,
  s: { str: number; dex: number; vit: number; spd: number; luk: number; int: number },
  gear: { atk?: number; def?: number; bonus?: { str?: number; dex?: number; vit?: number; spd?: number } },
): Build {
  const str = s.str + (gear.bonus?.str ?? 0);
  const dex = s.dex + (gear.bonus?.dex ?? 0);
  const vit = s.vit + (gear.bonus?.vit ?? 0);
  const spd = s.spd + (gear.bonus?.spd ?? 0);
  const maxHp = maxHpForLevel(LEVEL) + vit;
  return {
    name,
    combat: {
      hp: maxHp,
      maxHp,
      atk: str + Math.floor(dex / 5) + (gear.atk ?? 0),
      def: vit * 2 + (gear.def ?? 0),
      spd,
      evasionPct: dex,
      attackCount: 1 + Math.floor(spd / 10),
      powerAttackBonus: 0,
      guaranteedEvades: 0,
      extraAttackEveryNTurns: 0,
      critChancePct: 0,
      guard: { turns: 0, reduction: 0 },
    },
  };
}

const builds: Build[] = [
  // A: 무난 빌드. 8pt 골고루(str+3, vit+3, dex+2). 기본 무기/방어구 (atk +0, def +0).
  build(
    "Lv9 / 기본장비 / str+3 vit+3 dex+2",
    { str: 6, dex: 5, vit: 6, spd: 3, luk: 3, int: 3 },
    { atk: 0, def: 0 },
  ),
  // B: 외곽숲까지 진행한 평균. 야구방망이(+2) + 낡은가죽(+2) + 활력반지(vit+2). 8pt 분배.
  build(
    "Lv9 / 야구방망이+낡은가죽+활력반지 / str+4 vit+2 dex+2",
    { str: 7, dex: 5, vit: 5, spd: 3, luk: 3, int: 3 },
    { atk: 2, def: 2, bonus: { vit: 2 } },
  ),
  // C: 상위 빌드 가정. 산적단검(+4 dex+2) + 낡은가죽(+2) + 님프반지(spd+2). str/vit 위주 8pt.
  build(
    "Lv9 / 산적단검+낡은가죽+님프반지 / str+4 vit+3 spd+1",
    { str: 7, dex: 3, vit: 6, spd: 4, luk: 3, int: 3 },
    { atk: 4, def: 2, bonus: { dex: 2, spd: 2 } },
  ),
];

const targets = [
  "산적",      // 외곽 숲 (lvl 5)
  "호수 님프",  // 안개 호수 (lvl 7)
  "부서진 골렘",
  "떠도는 망령",
  "폐허 늑대",
];

function runMatchups() {
  for (const b of builds) {
    console.log(`\n=== ${b.name} ===`);
    console.log(
      `  atk=${b.combat.atk} def=${b.combat.def} spd=${b.combat.spd} dex(eva%)=${b.combat.evasionPct} maxHp=${b.combat.maxHp} attacks/turn=${b.combat.attackCount}`,
    );
    console.log(
      `  ${"적".padEnd(10)}  ${"승률".padStart(6)}  ${"평균턴".padStart(7)}  ${"평균잔여HP".padStart(11)}  ${"승리시평균턴".padStart(13)}`,
    );
    for (const enemyName of targets) {
      const enemy = MONSTERS[enemyName];
      let wins = 0;
      let totalTurns = 0;
      let totalHpLeft = 0;
      let winTurnsSum = 0;
      for (let i = 0; i < TRIALS; i += 1) {
        // 매 전투 풀체력에서 시작 (편의상). 실제 사냥 흐름은 누적이지만, 단일 매치업 평가용.
        const player: PlayerCombat = { ...b.combat, hp: b.combat.maxHp };
        const r = resolveBattle(player, enemy, "tester", {
          potions: {},
          pickAction: (state) => pickAutoAction(state, { rules: [], potions: {} }),
        });
        totalTurns += r.turns;
        const finalHp = r.finalState.playerHp;
        totalHpLeft += Math.max(0, finalHp);
        if (r.outcome === "win") {
          wins += 1;
          winTurnsSum += r.turns;
        }
      }
      const winRate = ((wins / TRIALS) * 100).toFixed(1);
      const avgTurns = (totalTurns / TRIALS).toFixed(1);
      const avgHpLeft = (totalHpLeft / TRIALS).toFixed(1);
      const avgWinTurns = wins > 0 ? (winTurnsSum / wins).toFixed(1) : "—";
      console.log(
        `  ${enemyName.padEnd(10)}  ${(winRate + "%").padStart(6)}  ${avgTurns.padStart(7)}  ${(avgHpLeft + "/" + b.combat.maxHp).padStart(11)}  ${avgWinTurns.padStart(13)}`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// 연속 사냥 모드: 풀 HP 로 시작 → 가중치 기반으로 적 추첨 → 중단까지 반복.
// 빌드별로 평균 처치/사망/잔여 HP / 등장 분포를 본다.
function runHunt(
  regionId: "ruins",
  options: { potionsCount?: number } = {},
) {
  const region = WORLD_MAP.regions.find((r) => r.id === regionId)!;
  const HUNT_TRIALS = 200;
  const KILLS_TARGET = 30; // 한 세션에서 30마리 잡거나 죽거나.
  const startPotions = options.potionsCount ?? 0;
  console.log(
    `\n\n━━━ 연속 사냥 시뮬 — ${region.name} ${startPotions > 0 ? `(작은 회복약 ${startPotions}개 보유)` : "(회복약 없음)"} ━━━`,
  );
  console.log(`  weights: ${JSON.stringify(region.encounterWeights)}`);
  for (const b of builds) {
    let totalKills = 0;
    let deaths = 0;
    let totalEnemyEncounters: Record<string, number> = {};
    let totalSessionHp = 0;
    let totalSessionsCompleted = 0;
    let totalEarnedExp = 0;

    for (let s = 0; s < HUNT_TRIALS; s += 1) {
      let hp = b.combat.maxHp;
      let kills = 0;
      let earnedExp = 0;
      // 디폴트 룰: HP 60% 미만이면 작은 회복약 사용. 보유량 매 세션 시작 시 reset.
      let potionsLeft = startPotions;
      while (kills < KILLS_TARGET) {
        const name = pickEnemyName(region);
        if (!name) break;
        totalEnemyEncounters[name] = (totalEnemyEncounters[name] ?? 0) + 1;
        const enemy = MONSTERS[name];
        const player: PlayerCombat = { ...b.combat, hp };
        const potionsForBattle = { potion_heal_s: potionsLeft } as const;
        const rules =
          potionsLeft > 0
            ? [
                {
                  id: "auto_heal",
                  enabled: true,
                  target: "hp_heal" as const,
                  trigger: { kind: "hp_below_pct" as const, pct: 60 },
                },
              ]
            : [];
        const r = resolveBattle(player, enemy, "tester", {
          potions: potionsForBattle,
          pickAction: (state) =>
            pickAutoAction(state, {
              rules,
              potions: { potion_heal_s: potionsLeft },
            }),
        });
        const usedPotions = r.potionsConsumed.potion_heal_s ?? 0;
        potionsLeft = Math.max(0, potionsLeft - usedPotions);
        if (r.outcome === "lose") {
          deaths += 1;
          break;
        }
        kills += 1;
        earnedExp += enemy.exp;
        hp = r.finalState.playerHp;
        if (hp <= 0) {
          deaths += 1;
          break;
        }
      }
      totalKills += kills;
      totalEarnedExp += earnedExp;
      if (kills >= KILLS_TARGET) {
        totalSessionsCompleted += 1;
        totalSessionHp += hp;
      }
    }

    console.log(`\n  ${b.name}`);
    const avgKills = (totalKills / HUNT_TRIALS).toFixed(1);
    const deathRate = ((deaths / HUNT_TRIALS) * 100).toFixed(1);
    const avgExp = (totalEarnedExp / HUNT_TRIALS).toFixed(0);
    console.log(
      `    평균 킬 ${avgKills}/${KILLS_TARGET}, 세션 완수율 ${(((HUNT_TRIALS - deaths) / HUNT_TRIALS) * 100).toFixed(1)}% (사망 ${deathRate}%)`,
    );
    console.log(`    평균 EXP/세션 ${avgExp}`);
    if (totalSessionsCompleted > 0) {
      console.log(
        `    완수 시 평균 잔여 HP ${(totalSessionHp / totalSessionsCompleted).toFixed(1)}/${b.combat.maxHp}`,
      );
    }
    const totalEncounters = Object.values(totalEnemyEncounters).reduce(
      (a, b) => a + b,
      0,
    );
    const dist = Object.entries(totalEnemyEncounters)
      .map(
        ([name, n]) =>
          `${name} ${((n / totalEncounters) * 100).toFixed(1)}%`,
      )
      .join(", ");
    console.log(`    등장 분포: ${dist}`);
  }
}

runMatchups();
runHunt("ruins", { potionsCount: 0 });
runHunt("ruins", { potionsCount: 5 });
