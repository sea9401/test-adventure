import type { PlayerCombat } from "@/adventure/v2/combat/engineState";
import type { Monster } from "@/adventure/data/monsters/types";
import {
  STORM_EXPEDITION_SUPPLY_CHOICES, STORM_EXPEDITION_CAMP_CHOICES,
  STORM_EXPEDITION_ALTAR_CHOICES, STORM_EXPEDITION_FINAL_PREP_CHOICES,
  type StormExpeditionActive, type StormExpeditionBattleEffectId,
  type StormExpeditionBoonId, type StormExpeditionChoiceKind,
  type StormExpeditionEncounterKind, type StormExpeditionRiskEventOffer,
} from "@/adventure/data/v2/stormExpedition";
import { mergeStormExpeditionMaterials, STORM_EXPEDITION_ROUTE_MATERIAL_ID } from "@/adventure/data/v2/stormExpeditionRewards";

// Shared expedition combat and checkpoint effects. Dungeon progression and rewards remain separate.
export function applyBattleBonuses(
  player: PlayerCombat,
  active: StormExpeditionActive,
  encounterKind: StormExpeditionEncounterKind,
): PlayerCombat {
  let attackMultiplier = 1;
  if (active.boons.includes("tempest_might")) attackMultiplier *= 1.12;
  if (active.nextBattleEffects.includes("next_assault")) attackMultiplier *= 1.12;
  if (encounterKind === "final_boss" && active.nextBattleEffects.includes("heart_assault")) attackMultiplier *= 1.15;
  let damageReduction = player.passiveDamageTakenReductionPct ?? 0;
  if (active.boons.includes("storm_guard")) damageReduction += 10;
  if (active.nextBattleEffects.includes("next_guard")) damageReduction += 15;
  const speedMultiplier = active.riskEvent?.status === "accepted"
    && active.riskEvent.curseId === "dulled_senses" ? 0.88 : 1;
  return {
    ...player,
    atk: Math.floor(player.atk * attackMultiplier),
    magicAtk: Math.floor((player.magicAtk ?? player.atk) * attackMultiplier),
    spd: Math.floor(player.spd * (active.boons.includes("swift_fate") ? 1.12 : 1) * speedMultiplier),
    critChancePct: (player.critChancePct ?? 0) + (active.boons.includes("swift_fate") ? 5 : 0),
    passiveDamageTakenReductionPct: damageReduction,
  };
}

export function consumeBattleEffects(
  effects: readonly StormExpeditionBattleEffectId[],
  encounterKind: StormExpeditionEncounterKind,
): StormExpeditionBattleEffectId[] {
  return effects.filter((effect) => {
    if (effect === "next_guard" || effect === "next_assault") return false;
    if (effect === "risk_enemy_fury") return false;
    if (effect === "heart_assault" && encounterKind === "final_boss") return false;
    return true;
  });
}

export function advanceAfterBattle(active: StormExpeditionActive, encounterCount: number): StormExpeditionActive {
  if (active.encounterIndex + 1 < encounterCount) {
    return { ...active, encounterIndex: active.encounterIndex + 1 };
  }
  return {
    ...active,
    completedNodeIds: appendUnique(active.completedNodeIds, active.currentNodeId),
    encounterIndex: 0,
  };
}

export function applyChoice(
  active: StormExpeditionActive,
  kind: StormExpeditionChoiceKind,
  choiceId: string,
  baseMaxHp: number,
  baseMaxMp: number,
): StormExpeditionActive | null {
  const choiceCatalog = kind === "supply"
    ? STORM_EXPEDITION_SUPPLY_CHOICES
    : kind === "camp"
      ? STORM_EXPEDITION_CAMP_CHOICES
      : kind === "altar"
        ? STORM_EXPEDITION_ALTAR_CHOICES
        : STORM_EXPEDITION_FINAL_PREP_CHOICES;
  if (!choiceCatalog.some((choice) => choice.id === choiceId)) return null;
  if (kind === "altar" && !active.altarOffers.includes(choiceId as StormExpeditionBoonId)) return null;
  if (kind === "altar" && active.boons.includes(choiceId as StormExpeditionBoonId)) return null;

  let hp = Math.min(baseMaxHp, active.hp);
  const hadDeepMana = active.boons.includes("deep_mana");
  let effectiveMaxMp = stormEffectiveMaxMp(baseMaxMp, active.boons, active.riskEvent);
  let mp = Math.min(effectiveMaxMp, active.mp);
  let pendingGold = active.pendingGold;
  let boons = [...active.boons];
  let nextBattleEffects = [...active.nextBattleEffects];

  if (choiceId === "field_rations") hp = heal(hp, baseMaxHp, 0.15);
  if (choiceId === "mana_ampoule") mp = heal(mp, effectiveMaxMp, 0.2);
  if (choiceId === "wind_barrier") nextBattleEffects = appendUnique(nextBattleEffects, "next_guard");
  if (choiceId === "storm_oil") nextBattleEffects = appendUnique(nextBattleEffects, "next_assault");
  if (choiceId === "scavenged_coffer" && active.mode === "normal") pendingGold += 25_000;
  if (choiceId === "deep_rest") hp = heal(hp, baseMaxHp, 0.35);
  if (choiceId === "meditation") mp = heal(mp, effectiveMaxMp, 0.45);
  if (choiceId === "balanced_rest") {
    hp = heal(hp, baseMaxHp, 0.2);
    mp = heal(mp, effectiveMaxMp, 0.25);
  }
  if (kind === "altar") {
    boons = appendUnique(boons, choiceId as StormExpeditionBoonId);
    if (choiceId === "deep_mana" && !hadDeepMana) {
      const oldMaxMp = effectiveMaxMp;
      effectiveMaxMp = stormEffectiveMaxMp(baseMaxMp, boons, active.riskEvent);
      mp = Math.min(effectiveMaxMp, mp + (effectiveMaxMp - oldMaxMp));
    }
  }
  if (choiceId === "repair_armor") hp = heal(hp, baseMaxHp, 0.25);
  if (choiceId === "focus_mana") mp = heal(mp, effectiveMaxMp, 0.35);
  if (choiceId === "boss_slayer") nextBattleEffects = appendUnique(nextBattleEffects, "heart_assault");

  return {
    ...active,
    completedNodeIds: appendUnique(active.completedNodeIds, active.currentNodeId),
    encounterIndex: 0,
    hp,
    mp,
    maxHp: baseMaxHp,
    maxMp: effectiveMaxMp,
    pendingGold,
    boons,
    nextBattleEffects,
    chosenChoices: { ...active.chosenChoices, [kind]: choiceId },
  };
}

export function applyRiskDecision(
  active: StormExpeditionActive,
  decision: "accept" | "decline",
): StormExpeditionActive {
  const riskEvent = active.riskEvent;
  if (!riskEvent) return active;
  if (decision === "decline") {
    return { ...active, riskEvent: { ...riskEvent, status: "declined" } };
  }

  let next: StormExpeditionActive = {
    ...active,
    riskEvent: { ...riskEvent, status: "accepted" },
  };
  if (riskEvent.id === "rift_cache") {
    next = {
      ...next,
      pendingMaterials: next.mode === "practice"
        ? {}
        : mergeStormExpeditionMaterials(next.pendingMaterials, {
            [STORM_EXPEDITION_ROUTE_MATERIAL_ID[next.routeId]]: 2,
          }),
      nextBattleEffects: appendUnique(next.nextBattleEffects, "risk_enemy_fury"),
    };
  }
  if (riskEvent.id === "unstable_blessing" && riskEvent.boonId) {
    const oldMaxMp = next.maxMp;
    const boons = appendUnique(next.boons, riskEvent.boonId);
    const baseMaxMp = active.boons.includes("deep_mana")
      ? Math.round(active.maxMp / 1.2)
      : active.maxMp;
    const effectiveMaxMp = stormEffectiveMaxMp(
      baseMaxMp,
      boons,
      next.riskEvent,
    );
    next = {
      ...next,
      boons,
      maxMp: effectiveMaxMp,
      mp: riskEvent.boonId === "deep_mana"
        ? Math.min(effectiveMaxMp, next.mp + Math.max(0, effectiveMaxMp - oldMaxMp))
        : Math.min(effectiveMaxMp, next.mp),
    };
  }
  if (riskEvent.id === "golden_compass") {
    next = {
      ...next,
      completedNodeIds: appendUnique(next.completedNodeIds, next.currentNodeId),
      encounterIndex: 0,
      chosenChoices: { ...next.chosenChoices, camp: "golden_compass" },
    };
  }
  return next;
}

export function stormEffectiveMaxMp(
  baseMaxMp: number,
  boons: readonly StormExpeditionBoonId[],
  riskEvent: StormExpeditionRiskEventOffer | null,
): number {
  let multiplier = boons.includes("deep_mana") ? 1.2 : 1;
  if (riskEvent?.status === "accepted" && riskEvent.curseId === "mana_fracture") {
    multiplier *= 0.85;
  }
  return Math.max(0, Math.floor(baseMaxMp * multiplier));
}

export function isAcceptedRisk(
  active: StormExpeditionActive,
  id: StormExpeditionRiskEventOffer["id"],
): boolean {
  return active.riskEvent?.id === id && active.riskEvent.status === "accepted";
}

export function applyRiskToEnemy(enemy: Monster, active: StormExpeditionActive): Monster {
  let attackMultiplier = 1;
  if (active.nextBattleEffects.includes("risk_enemy_fury")) attackMultiplier *= 1.2;
  if (isAcceptedRisk(active, "storm_contract")) attackMultiplier *= 1.1;
  if (active.riskEvent?.status === "accepted" && active.riskEvent.curseId === "raging_current") {
    attackMultiplier *= 1.12;
  }
  return attackMultiplier === 1
    ? enemy
    : { ...enemy, atk: Math.max(1, Math.floor(enemy.atk * attackMultiplier)) };
}

function heal(current: number, maximum: number, fraction: number): number {
  return Math.min(maximum, current + Math.floor(maximum * fraction));
}

export function appendUnique<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values : [...values, value];
}
