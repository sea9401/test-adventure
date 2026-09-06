import { combatRandom } from "./combatRandom";
import { V2_SKILL_PROC_IN_PATTERN } from "@/adventure/data/v2/coreLoopConfig";
import {
  effectiveCombatPatternFromEquipped,
  smartDefaultPatternFromEquipped,
  V2_SKILLS,
} from "@/adventure/data/v2/v2Skills";
import { berserkerCastContext } from "./berserkerCombat";
import { V2_COMBAT_PATTERN_ENABLED } from "./combatPattern";
import { tickV2BuffMap, type V2SkillCastInput } from "./combatShared";
import { skillTargetDef, skillTargetMagicDef } from "./engine.pvpStats";
import { type PvPSide } from "./engine.pvpState";
import { effectiveMutationDef } from "./mutationCombat";
import { formulaCompletionOverdraftSkillIds } from "./primordialSageCombat";
import { isBleedBurstReady } from "./tier6UniqueEffects";

export function preparePvPSkillCast(side: PvPSide, opp: PvPSide, diagnosticActor?: V2SkillCastInput["diagnosticActor"]) {
  const tier6UnityPct =
    (side.buffs.tier6UnityTurnsLeft ?? 0) > 0
      ? side.buffs.tier6UnityHealPct ?? 0
      : 0;
  const tier6UnityMult = 1 + tier6UnityPct / 100;
  const tier6UnityAtk = Math.floor(side.player.atk * tier6UnityMult);
  const tier6UnityMagicAtk = Math.floor(
    (side.player.magicAtk ?? side.player.atk) * tier6UnityMult,
  );
  // 1) buff/debuff tick (cast 전에 — 새 buff 는 발동턴부터 turns 만큼 유지).
  const tickedSelfBuffs = tickV2BuffMap(side.v2SelfBuffs);
  const tickedSelfDebuffs = tickV2BuffMap(side.v2SelfDebuffs);
  const shadowCoreEquipped = side.v2Skills.equipped.includes(
    "v2c_shadowblade_swordshadow",
  );
  const shadowCoreMechanic =
    V2_SKILLS.v2c_shadowblade_swordshadow.tier7Mechanic;
  const formulaCoreEquipped = side.v2Skills.equipped.includes(
    "v2c_primordialsage_completeformula",
  );
  const formulaOptimizationEquipped = side.v2Skills.equipped.includes(
    "v2c_primordialsage_optimization",
  );
  const formulaState = side.stacks.tier7?.formula ?? {
    stages: 0,
    seenSkillIds: [],
  };
  const formulaOverdraftSkillIds =
    formulaCoreEquipped && formulaOptimizationEquipped
      ? formulaCompletionOverdraftSkillIds({
          state: formulaState,
          learned: side.v2Skills.learned,
          equipped: side.v2Skills.equipped,
        })
      : [];
  const activeOpponentBleed = opp.v2Dots.find(
    (dot) => dot.tag === "bleed" && dot.turns > 0,
  );
  const activeOpponentPoison = opp.v2Dots.find(
    (dot) => dot.tag === "poison" && dot.turns > 0,
  );
  const needsBleedHuntRoll = side.v2Skills.equipped.some(
    (skillId) =>
      V2_SKILLS[skillId]?.bleedHunt?.directPhysicalHitBleedExtend != null,
  );
  // 2) cast 결정 + 효과 계산. target = 상대 side (opp).
  const castInput: V2SkillCastInput = {
    ...(diagnosticActor ? { diagnosticActor } : {}),
    skills: side.v2Skills,
    cooldowns: side.v2SkillCooldowns,
    combatMode: "pvp",
    magicMpCostReductionPct: formulaOptimizationEquipped ? 20 : 0,
    mpOverdraftSkillIds: formulaOverdraftSkillIds,
    // PR2-B(Codex) — PvP 도 발동확률 게이트 + 워메이지 proc 보너스. 단 스킬 미보유 전투자에게
    //   Math.random() 을 소비하면 PvP RNG 가 드리프트하므로(Codex 2차) 장착 스킬 있을 때만 롤.
    procRoll: side.v2Skills.equipped.length > 0 ? combatRandom() * 100 : undefined,
    nextProcRoll: () => combatRandom() * 100,
    bleedHuntRoll: needsBleedHuntRoll ? combatRandom() * 100 : undefined,
    procChanceBonus:
      (side.player.skillProcChanceAdd ?? 0) -
      (side.stacks.skillProcDownTurns > 0 ? side.stacks.skillProcDownPct : 0),
    // 패턴 경로에서도 procChance 굴림(부활) — 플래그 on 이면 패턴이 고른 스킬도 확률 게이트 통과 필요.
    applyProcInPattern: V2_SKILL_PROC_IN_PATTERN,
    turn: side.turn.completedPlayerTurns + 1,
    alternateLastSkillByPair: side.stacks.patternAlternateLastSkillByPair,
    combatPattern: V2_COMBAT_PATTERN_ENABLED
      ? effectiveCombatPatternFromEquipped(
          side.v2Skills.equipped,
          side.v2Skills.pattern ??
            smartDefaultPatternFromEquipped(side.v2Skills.equipped),
        )
      : undefined,
    berserker: side.berserker
      ? berserkerCastContext(
          side.player.berserkerMadnessRank ?? 0,
          side.berserker,
        )
      : undefined,
    attacker: {
      mp: side.mp,
      atk: tier6UnityAtk,
      attackCount: side.player.attackCount,
      magicAtk: tier6UnityMagicAtk,
      singleHitPhysicalSkillDamagePct:
        side.player.singleHitPhysicalSkillDamagePct,
      minDamage: side.player.minDamage,
      magicMinDamage: side.player.magicMinDamage,
      healMult: side.player.healMult,
      maxHp: side.maxHp,
      // PR2-B — PvP 시전자도 PlayerCombat → def/vit 비례딜·현재HP(사혈격)·maxMp(보호막/명상)·차수 flat 유효.
      def: effectiveMutationDef(
        side.player.def,
        side.stacks.mutationWeight,
        side.player.stoneskinDefPctPerWeight ?? 0,
      ),
      str: side.player.strStat,
      int: side.player.intStat,
      vit: side.player.vitStat,
      dex: side.player.dexStat,
      luk: side.player.lukStat,
      spi: side.player.spiStat,
      allStatTotal: side.player.allStatTotal,
      // 활성 파생버프 — 조건식이 만료된 버프만 다시 시전하도록 실제 PvP 스택을 전달한다.
      selfShield: side.stacks.playerShield,
      selfShieldActive: side.stacks.playerShield > 0,
      selfStatBuffActive: {
        spd: side.buffs.playerSpdTurnsLeft > 0,
      },
      selfBuffPctActive: {
        evasion: side.stacks.skillEvasionTurns > 0,
        crit: side.stacks.skillCritTurns > 0,
        damageReduction: side.stacks.skillDmgReduceTurns > 0,
        reflectDamage: side.stacks.skillReflectBoostTurns > 0,
        regen: side.stacks.skillRegenTurns > 0,
        guaranteedEvade: side.stacks.evadesRemaining > 0,
        duelistDeclaration: (side.duelistBuff?.remainingBasicHits ?? 0) > 0,
      },
      currentHp: side.hp,
      maxMp: side.maxMp,
      classTier: side.player.classTier,
      fortressImpact: side.stacks.fortressImpact,
      ironWallReflectCharges: side.stacks.ironWallReflectCharges,
      fortressImpactDamagePctPerStack:
        side.player.fortressImpactDamagePctPerStack,
      fortressDefSkillStatCoefPct: side.player.fortressDefSkillStatCoefPct,
      lawInscription: side.player.lawInscription,
      lawInscriptions: side.stacks.lawInscriptions,
      mutationWeight: side.stacks.mutationWeight,
      tripleWard: side.stacks.tripleWard,
      bloodlineBurstReady: isBleedBurstReady(
        side.player.equipSignatures,
        side.stacks.tier6Uniques,
        side.turn.completedPlayerTurns + 1,
      ),
      bleedPhysicalSkillDamagePctPerStack:
        side.player.bleedPhysicalSkillDamagePctPerStack,
      selfBuffs: tickedSelfBuffs,
      selfDebuffs: tickedSelfDebuffs,
      characterElement: side.player.characterElement,
    },
    target: {
      def: skillTargetDef(side, opp),
      magicDef: skillTargetMagicDef(side, opp),
      // PR-5a: PvP 양 side 다 v2 buff slot 있음 — opponent 의 buff 도 def 곱셈에 반영.
      selfBuffs: opp.v2SelfBuffs,
      selfDebuffs: opp.v2SelfDebuffs,
      // PR2-B — 처단(처형 임계)·스택 payoff(참절/중독폭발) 대상 = 상대 side.
      currentHp: opp.hp,
      maxHp: opp.maxHp,
      bleedStacks: activeOpponentBleed?.stacks ?? 0,
      bleedTurns: activeOpponentBleed?.turns ?? 0,
      poisonStacks: activeOpponentPoison?.stacks ?? 0,
      poisonTurns: activeOpponentPoison?.turns ?? 0,
      // 약점 노출 — 비전 작렬(magicVuln payoff)이 상대 누적 스택을 읽어 추가딜.
      magicVulnStacks: opp.stacks.magicVulnStacks,
      frostChillStacks: opp.stacks.frostChillStacks,
      enemyVulnerabilityActive: opp.stacks.enemyVulnTurns > 0,
      enemyDamageDownActive: opp.stacks.damageDownTurns > 0,
      enemySkillProcDownActive: opp.stacks.skillProcDownTurns > 0,
      enemyHealReductionActive: opp.stacks.healReduceTurns > 0,
    },
  };
  return {
    tier6UnityMult,
    tier6UnityMagicAtk,
    tickedSelfBuffs,
    tickedSelfDebuffs,
    shadowCoreEquipped,
    shadowCoreMechanic,
    formulaCoreEquipped,
    formulaOptimizationEquipped,
    formulaState,
    castInput,
  };
}
