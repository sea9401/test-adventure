// 영지(Fiefdom) PvP 권위 시뮬레이터 — /api/fiefdom/attack 가 호출.
// 공격자/방어자 양쪽 FiefdomState 를 받아 결정적으로 결과 계산, 새 state 와 약탈량 반환.
// 클라이언트가 보낸 결과는 신뢰하지 않으며 서버가 직접 계산한 값만 DB 에 반영.
//
// 시뮬 알고리즘은 useBuilderState 의 attackTerritory 와 동일한 time-to-kill 모델.
// computeArmyPower / UNITS / 영웅 상수는 builderData 에서 공용.

import {
  HERO_RECOVERY_MS,
  computeArmyPower,
  heroAtk,
  heroAvailable,
  heroMaxHp,
  xpForNext,
} from "@/adventure/fiefdom/builderData";
import type {
  FiefdomState,
  ResourceBag,
  UnitBag,
} from "@/adventure/fiefdom/types";

/** 약탈은 방어자 보유 자원의 20% 까지만(원본은 보존, 공격자에게 이전된 양만 차감). */
const LOOT_RATIO = 0.2;
/** 방어자 보호막 — 마지막 피격 후 4시간. */
export const SHIELD_MS = 4 * 60 * 60 * 1000;

export type FiefdomBattleOutcome = {
  attackerStateAfter: FiefdomState;
  defenderStateAfter: FiefdomState;
  won: boolean;
  loot: { gold: number; wood: number; food: number };
};

export function simulateFiefdomBattle(
  attacker: FiefdomState,
  defender: FiefdomState,
  now: number,
): FiefdomBattleOutcome {
  const atkHeroIn = heroAvailable(attacker.hero, now);
  const defHeroIn = heroAvailable(defender.hero, now);

  const atkArmy = computeArmyPower(attacker.units);
  const defArmy = computeArmyPower(defender.units);
  const atkHeroPower = atkHeroIn
    ? { atk: heroAtk(attacker.hero), hp: attacker.hero.currentHp }
    : { atk: 0, hp: 0 };
  const defHeroPower = defHeroIn
    ? { atk: heroAtk(defender.hero), hp: defender.hero.currentHp }
    : { atk: 0, hp: 0 };
  const my = { atk: atkArmy.atk + atkHeroPower.atk, hp: atkArmy.hp + atkHeroPower.hp };
  const en = { atk: defArmy.atk + defHeroPower.atk, hp: defArmy.hp + defHeroPower.hp };

  // 양쪽 모두 무력이 0 이면 무승부 → 공격 실패 처리(자원 이전 없음, shield 만 활성화).
  if (my.atk === 0 && en.atk === 0) {
    return {
      attackerStateAfter: attacker,
      defenderStateAfter: defender,
      won: false,
      loot: { gold: 0, wood: 0, food: 0 },
    };
  }

  const timeToKillEnemy = my.atk > 0 ? en.hp / my.atk : Infinity;
  const timeToKillMe = en.atk > 0 ? my.hp / en.atk : Infinity;
  const battleTime = Math.min(timeToKillEnemy, timeToKillMe);
  const won = timeToKillEnemy <= timeToKillMe;

  // 양측 손실 — 결정적 lossRatio.
  const atkLossRatio = my.hp > 0 ? Math.min(1, (en.atk * battleTime) / my.hp) : 1;
  const defLossRatio = en.hp > 0 ? Math.min(1, (my.atk * battleTime) / en.hp) : 1;

  const attackerStateAfter = applySideLosses(
    attacker,
    atkLossRatio,
    now,
    /* isWinner */ won,
  );
  // 방어자는 패배해도 XP 0 — 자기가 시작한 전투가 아니므로(공격을 흡수하는 쪽).
  const defenderStateAfter = applySideLosses(
    defender,
    defLossRatio,
    now,
    /* isWinner */ false,
    /* gainXp */ false,
  );

  // 약탈 — 공격 성공 시에만, 방어자 보유 자원의 20% 까지.
  let loot: ResourceBag = { gold: 0, wood: 0, food: 0 };
  let finalDefender = defenderStateAfter;
  let finalAttacker = attackerStateAfter;
  if (won) {
    loot = {
      gold: Math.floor(defender.resources.gold * LOOT_RATIO),
      wood: Math.floor(defender.resources.wood * LOOT_RATIO),
      food: Math.floor(defender.resources.food * LOOT_RATIO),
    };
    finalDefender = {
      ...defenderStateAfter,
      resources: {
        gold: Math.max(0, defenderStateAfter.resources.gold - loot.gold),
        wood: Math.max(0, defenderStateAfter.resources.wood - loot.wood),
        food: Math.max(0, defenderStateAfter.resources.food - loot.food),
      },
    };
    finalAttacker = {
      ...attackerStateAfter,
      resources: {
        gold: (attackerStateAfter.resources.gold ?? 0) + loot.gold,
        wood: (attackerStateAfter.resources.wood ?? 0) + loot.wood,
        food: (attackerStateAfter.resources.food ?? 0) + loot.food,
      },
    };
  }

  return {
    attackerStateAfter: finalAttacker,
    defenderStateAfter: finalDefender,
    won,
    loot,
  };
}

// 한쪽에 손실/영웅 피해/(승자라면) XP 까지 적용한 새 state 반환.
function applySideLosses(
  side: FiefdomState,
  lossRatio: number,
  now: number,
  isWinner: boolean,
  gainXp = true,
): FiefdomState {
  const survivors: UnitBag = {
    warrior: Math.max(0, Math.floor(side.units.warrior * (1 - lossRatio))),
    archer: Math.max(0, Math.floor(side.units.archer * (1 - lossRatio))),
  };

  let hero = side.hero;
  const heroIn = heroAvailable(hero, now);
  if (heroIn) {
    const heroDmg = Math.floor(lossRatio * hero.currentHp);
    const hpAfter = Math.max(0, hero.currentHp - heroDmg);
    if (hpAfter <= 0) {
      hero = { ...hero, currentHp: 0, recoveringUntil: now + HERO_RECOVERY_MS };
    } else {
      hero = { ...hero, currentHp: hpAfter };
    }
  }

  // XP — 승자만, 본인 무력 비례 보상. 패자는 0(방어자 포함).
  if (gainXp && isWinner) {
    const xpGain = 30 + side.hero.level * 5;
    hero = { ...hero, xp: hero.xp + xpGain };
    while (hero.xp >= xpForNext(hero.level)) {
      hero = { ...hero, xp: hero.xp - xpForNext(hero.level), level: hero.level + 1 };
    }
    if (hero.level !== side.hero.level) {
      hero = { ...hero, currentHp: heroMaxHp(hero) };
    }
  }

  return { ...side, units: survivors, hero };
}
