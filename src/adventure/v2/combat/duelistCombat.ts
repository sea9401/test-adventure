import type { APSkill } from "@/adventure/character/apSkills";
import { V2_SKILLS, type V2SkillId } from "@/adventure/data/v2/v2Skills";

export const DUELIST_STANCE_BONUS_PCT: Readonly<Record<string, number>> = {
  duelist: 35,
  contender: 40,
  undefeated: 45,
  grandchampion: 50,
};

export const DUELIST_DECLARATION_IDS = [
  "v2c_duelist_declaration",
  "v2c_contender_insight",
  "v2c_undefeated_momentum",
  "v2c_grandchampion_hour",
] as const satisfies readonly V2SkillId[];

export type DuelistDeclarationId = (typeof DUELIST_DECLARATION_IDS)[number];

const DECLARATION_RANK = new Map<string, number>(
  DUELIST_DECLARATION_IDS.map((id, index) => [id, index + 1]),
);

const AP_DAMAGE_EFFECT_KINDS = new Set([
  "atk_multiplier",
  "atk_plus_spd_pct_bonus",
  "multi_hit_self_damage",
  "atk_multiplier_with_silence",
]);

export type DuelistStanceSnapshot = {
  active: boolean;
  bonusPct: number;
  blockingSkillName: string | null;
};

export function duelistStanceSnapshot(
  jobId: string,
  equippedV2SkillIds: readonly string[],
  equippedApSkills: readonly APSkill[],
): DuelistStanceSnapshot {
  const lineageBonus = DUELIST_STANCE_BONUS_PCT[jobId] ?? 0;
  if (lineageBonus <= 0) {
    return { active: false, bonusPct: 0, blockingSkillName: null };
  }

  for (const skillId of equippedV2SkillIds) {
    const skill = V2_SKILLS[skillId as V2SkillId];
    if (skill?.category === "attack") {
      return { active: false, bonusPct: 0, blockingSkillName: skill.name };
    }
  }
  for (const skill of equippedApSkills) {
    if (AP_DAMAGE_EFFECT_KINDS.has(skill.effect.kind)) {
      return { active: false, bonusPct: 0, blockingSkillName: skill.name };
    }
  }

  return { active: true, bonusPct: lineageBonus, blockingSkillName: null };
}

export type DuelistBuff = {
  declarationId: DuelistDeclarationId;
  declarationName: string;
  chainCount: number;
  remainingBasicHits: number;
  basicDamagePct: number;
  basicCritChancePct: number;
  basicDefPenetrationPct: number;
  rampPctPerPriorHit: number;
  landedBasicHits: number;
  basicCritMultAdd: number;
  basicCritChanceCap: number;
};

export function isDuelistDeclarationId(id: string): id is DuelistDeclarationId {
  return DECLARATION_RANK.has(id);
}

export function highestEquippedDeclaration(
  equippedSkillIds: readonly string[],
): DuelistDeclarationId | null {
  let highest: DuelistDeclarationId | null = null;
  let highestRank = 0;
  for (const id of equippedSkillIds) {
    const rank = DECLARATION_RANK.get(id) ?? 0;
    if (rank > highestRank && isDuelistDeclarationId(id)) {
      highest = id;
      highestRank = rank;
    }
  }
  return highest;
}

export function composeDuelistDeclaration(
  equippedSkillIds: readonly string[],
  castSkillId: string,
): DuelistBuff | null {
  if (!isDuelistDeclarationId(castSkillId)) return null;
  if (highestEquippedDeclaration(equippedSkillIds) !== castSkillId) return null;

  const equipped = new Set(equippedSkillIds);
  const definition = V2_SKILLS[castSkillId];
  const hits = definition.duelistDeclaration?.hits;
  if (!hits) return null;

  return {
    declarationId: castSkillId,
    declarationName: definition.name,
    chainCount: DUELIST_DECLARATION_IDS.filter((id) => equipped.has(id)).length,
    remainingBasicHits: hits,
    basicDamagePct: equipped.has("v2c_duelist_declaration") ? 15 : 0,
    basicCritChancePct: equipped.has("v2c_duelist_declaration") ? 15 : 0,
    basicDefPenetrationPct: equipped.has("v2c_contender_insight") ? 15 : 0,
    rampPctPerPriorHit: equipped.has("v2c_undefeated_momentum") ? 5 : 0,
    landedBasicHits: 0,
    basicCritMultAdd: equipped.has("v2c_grandchampion_hour") ? 0.25 : 0,
    basicCritChanceCap: equipped.has("v2c_grandchampion_hour") ? 95 : 75,
  };
}

export type DuelistBasicHitModifiers = {
  basicDamagePct: number;
  basicCritChancePct: number;
  basicDefPenetrationPct: number;
  rampDamagePct: number;
  basicCritMultAdd: number;
  basicCritChanceCap: number;
};

export function consumeDuelistBasicHit(buff: DuelistBuff): {
  modifiers: DuelistBasicHitModifiers;
  buff: DuelistBuff | null;
} {
  const modifiers = {
    basicDamagePct: buff.basicDamagePct,
    basicCritChancePct: buff.basicCritChancePct,
    basicDefPenetrationPct: buff.basicDefPenetrationPct,
    rampDamagePct: buff.rampPctPerPriorHit * buff.landedBasicHits,
    basicCritMultAdd: buff.basicCritMultAdd,
    basicCritChanceCap: buff.basicCritChanceCap,
  };
  const remainingBasicHits = Math.max(0, buff.remainingBasicHits - 1);
  return {
    modifiers,
    buff: remainingBasicHits > 0
      ? {
          ...buff,
          remainingBasicHits,
          landedBasicHits: buff.landedBasicHits + 1,
        }
      : null,
  };
}

export function interruptDuelistRamp(buff: DuelistBuff | null | undefined): DuelistBuff | null {
  return buff ? { ...buff, landedBasicHits: 0 } : null;
}

export function consumeDuelistCritHaste(
  interval: number,
  hastePct: number,
  pending: boolean,
): { interval: number; pending: false } {
  return {
    interval: pending
      ? interval * (1 - Math.max(0, Math.min(100, hastePct)) / 100)
      : interval,
    pending: false,
  };
}

export function duelistDeclarationSummary(buff: DuelistBuff): string {
  const effects: string[] = [];
  if (buff.basicDamagePct) effects.push(`평타 피해 +${buff.basicDamagePct}%`);
  if (buff.basicCritChancePct) effects.push(`평타 치명 +${buff.basicCritChancePct}%p`);
  if (buff.basicDefPenetrationPct) effects.push(`평타 방어 관통 +${buff.basicDefPenetrationPct}%p`);
  if (buff.rampPctPerPriorHit) effects.push(`연속 평타마다 피해 +${buff.rampPctPerPriorHit}%`);
  if (buff.basicCritMultAdd) effects.push(`평타 치명 배율 +${buff.basicCritMultAdd.toFixed(2)}배`);
  if (buff.basicCritChanceCap > 75) effects.push(`평타 치명 상한 ${buff.basicCritChanceCap}%`);
  return `[계보 연계 ${buff.chainCount}단계] ${buff.declarationName} · 다음 평타 ${buff.remainingBasicHits}회 · ${effects.join(" · ")}`;
}

export function duelistDeclarationProgress(
  buff: DuelistBuff | null,
  declarationName: string,
): string {
  if (!buff) return `[선언 종료] ${declarationName}`;
  const nextRampPct = buff.rampPctPerPriorHit * buff.landedBasicHits;
  return `[선언 유지] ${buff.declarationName} · 남은 평타 ${buff.remainingBasicHits}회 · 다음 연속 +${nextRampPct}%`;
}
