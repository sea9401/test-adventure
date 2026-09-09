import { type EnemySkillMitigation } from "./engine.enemySkills";
import { damageBetween, v2DefBuffMult, type V2SkillCastResult } from "./combatShared";
import { playerFacingEnemyDef } from "./engine.pveOperations";
import { type BattleState, type PlayerCombat } from "./engineState";
import { resolveFortressReaction } from "./fortressKnight";

export function resolveEnemySkillReflection(
  state: BattleState,
  player: PlayerCombat,
  result: Pick<V2SkillCastResult, "enemyDamage">,
  mitigation: EnemySkillMitigation,
  damageToHp: number,
  shieldAbsorbed: number,
  fortressReaction: ReturnType<typeof resolveFortressReaction>,
): { damage: number; labels: string[]; genericReflectEligible: boolean } {
  const landed = result.enemyDamage > 0;
  const hitStoppedByShield = shieldAbsorbed > 0 && damageToHp <= 0;
  const reflectBase = Math.max(
    0,
    result.enemyDamage - mitigation.evasionReducedBy,
  );
  const thornsDamage =
    landed && !hitStoppedByShield && (player.thornsPct ?? 0) > 0
      ? Math.floor((reflectBase * (player.thornsPct ?? 0)) / 100)
      : 0;
  const brambleDamage =
    landed && !hitStoppedByShield && (player.bramblePct ?? 0) > 0
      ? Math.floor((reflectBase * (player.bramblePct ?? 0)) / 100)
      : 0;
  const infiniteDamage =
    landed && !hitStoppedByShield && (player.infiniteThornsAtkPct ?? 0) > 0
      ? Math.floor(
          (state.enemy.atk * (player.infiniteThornsAtkPct ?? 0)) / 100,
        )
      : 0;
  const enchantDamage =
    landed && (player.enchantReflectPct ?? 0) > 0 && damageToHp > 0
      ? Math.floor((damageToHp * (player.enchantReflectPct ?? 0)) / 100)
      : 0;
  const wardenDamage =
    landed && !hitStoppedByShield && (player.thornsFlatFromDef ?? 0) > 0
      ? player.thornsFlatFromDef ?? 0
      : 0;
  const genericRaw =
    thornsDamage +
    brambleDamage +
    infiniteDamage +
    enchantDamage +
    wardenDamage;
  const reflectBoostPct =
    state.stacks.skillReflectBoostTurns > 0
      ? state.stacks.skillReflectBoostPct
      : 0;
  const boostedGenericRaw =
    reflectBoostPct > 0
      ? Math.floor(genericRaw * (1 + reflectBoostPct / 100))
      : genericRaw;
  const totalRaw = boostedGenericRaw + fortressReaction.rawReflectDamage;
  const targetDef = playerFacingEnemyDef(state, player);
  const targetDefMult = v2DefBuffMult(
    state.enemyV2SelfBuffs,
    state.enemyV2Debuffs,
  );
  const damage =
    totalRaw > 0
      ? damageBetween(
          totalRaw,
          targetDefMult !== 1
            ? Math.floor(targetDef * targetDefMult)
            : targetDef,
        )
      : 0;
  const labels: string[] = [];
  if (thornsDamage > 0) labels.push("반사 갑주");
  if (brambleDamage > 0) labels.push("가시 갑옷");
  if (infiniteDamage > 0) labels.push("무한 가시");
  if (enchantDamage > 0) labels.push("별빛 반사");
  if (wardenDamage > 0) labels.push("수호 반사");
  if (reflectBoostPct > 0 && genericRaw > 0) labels.push("반사 증폭");
  if (fortressReaction.ironWallReflected) labels.push("철벽 반사");
  return {
    damage,
    labels,
    genericReflectEligible: genericRaw > 0,
  };
}
