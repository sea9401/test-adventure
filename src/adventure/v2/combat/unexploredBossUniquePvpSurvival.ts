import { recordCombatMetric } from "./combatDiagnostics";
import { type PvPSide } from "./engine.pvpState";
import { bossUniqueLethalSave } from "./unexploredBossUniqueEffects";

// 적대 피해 공통 관문(pvpHostileDamage)이 쓰는 영겁 처리. 관문과 어댑터의 순환 의존을 피하려고 분리했다.

/** 관문 결과에서 HP만 꺼내 쓰는 호출부가 보스 고유 상태(영겁 횟수·보류 로그)를 잃지 않게 옮긴다. */
export function carryBossUniqueStacks(
  from: PvPSide,
): Pick<PvPSide["stacks"], "unexploredBoss" | "unexploredBossLogs"> {
  return {
    ...(from.stacks.unexploredBoss ? { unexploredBoss: from.stacks.unexploredBoss } : {}),
    ...(from.stacks.unexploredBossLogs ? { unexploredBossLogs: from.stacks.unexploredBossLogs } : {}),
  };
}

/** 적대 피해 공통 관문에서 HP가 0 이하가 될 때. 로그는 행동 종료 시 남긴다. */
export function bossUniqueLethalSavePvp(side: PvPSide): PvPSide {
  if (side.hp > 0) return side;
  const saved = bossUniqueLethalSave(side.stacks.unexploredBoss, side.player.unexploredBossEffects, {
    hpAfterDamage: side.hp,
    maxHp: side.maxHp,
  });
  if (!saved) return side;
  recordCombatMetric("survival_restoration", "unexplored_eternal", side.name, saved.hp);
  return {
    ...side,
    hp: saved.hp,
    stacks: {
      ...side.stacks,
      unexploredBoss: saved.runtime,
      unexploredBossLogs: [
        ...(side.stacks.unexploredBossLogs ?? []),
        `[영겁] ${side.name} 쓰러지지 않고 HP ${saved.hp}로 버텼다. 피해와 속도가 끓어오른다.`,
      ],
    },
  };
}

