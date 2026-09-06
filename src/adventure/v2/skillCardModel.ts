import {
  describeV2Skill,
  V2_SKILLS,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";

/** 표시용 분류만 수행하며 비용·계수는 공통 설명 함수를 그대로 사용한다. */
export function buildSkillCardModel(skillId: string) {
  const skill = V2_SKILLS[skillId as V2SkillId];
  if (!skill) return null;
  const chips = describeV2Skill(skill);
  const kind = skill.category === "passive" || skill.passive ? "패시브" : "액티브";
  const meta: string[] = [];
  const resources: string[] = [];
  const highlights: string[] = [];
  const details: string[] = [];
  const family = chips.find((chip) => chip.startsWith("교차 계열: "));
  if (family) meta.push(family.replace("교차 계열: ", ""));
  const multiHit = chips.find((chip) => /^\d+회 공격$/.test(chip));
  let hit = 0;
  for (let i = 0; i < chips.length; i += 1) {
    const chip = chips[i];
    if (chip === family) continue;
    if (chip === multiHit) {
      meta.push(chip);
    } else if (/^(MP |발동 |쿨 )/.test(chip)) {
      resources.push(chip);
    } else if (chip.startsWith("피해 ")) {
      if (multiHit) {
        const start = ++hit;
        while (chips[i + 1] === chip) {
          i += 1;
          hit += 1;
        }
        details.push(`${start === hit ? start : `${start}~${hit}`}타 · ${chip}`);
      } else {
        details.push(chip);
      }
    } else if (chip.includes("PvP") || highlights.length >= 4) {
      details.push(chip);
    } else {
      highlights.push(chip);
    }
  }
  const mechanic = skill.tier7Mechanic;
  const core = V2_SKILLS.v2c_skyascendant_crossover.tier7Mechanic;
  const synergy = mechanic?.kind === "crossStrike" && core?.kind === "crossCore"
    ? mechanic.family === "martial"
      ? {
          name: "교차·추격",
          condition: "교차 장착 + 원거리→체술 교대 공격 적중 시",
          effects: [`추가 피해 ${core.pursuitDamagePct}%`, `적 행동 지연 ${core.pursuitEnemyDelayPct}%`, `내 행동 가속 ${core.hastePct}%`],
          pvp: [`추가 피해 ${core.pvpPursuitDamagePct}%`, `적 행동 지연 ${core.pvpPursuitEnemyDelayPct}%`, `내 행동 가속 ${core.pvpHastePct}%`],
        }
      : {
          name: "교차·포획",
          condition: "교차 장착 + 체술→원거리 교대 공격 적중 시",
          effects: [`최종 피해 +${core.captureDamagePct}%`, `적중 +${core.captureAccuracyPct}%`, `관통 ${core.capturePenetrationPct}%`, `내 행동 가속 ${core.hastePct}%`],
          pvp: [`최종 피해 +${core.pvpCaptureDamagePct}%`, `적중 +${core.captureAccuracyPct}%`, `관통 ${core.pvpCapturePenetrationPct}%`, `내 행동 가속 ${core.pvpHastePct}%`],
        }
    : null;
  return {
    kind, meta, resources, highlights, details, synergy,
    pvp: synergy ? [] : skill.detail?.pvp ?? [],
    summary: skillId === "v2c_skyascendant_voidbreak"
      ? "연속으로 4회 공격하며 마지막 타격이 강화됩니다."
      : skill.description,
  };
}
