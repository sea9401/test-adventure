import { STAT_LABELS } from "@/adventure/data/stats";
import {
  describeV2Skill,
  describeV2SkillEffects,
  spCostOf,
  V2_SKILLS,
  type V2SkillDefinition,
  type V2SkillEffect,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import {
  V2_ELEMENT_LABEL,
  type V2Element,
} from "@/adventure/data/v2/elements";
import { classifySkillForLibrary } from "./skillLibraryFilters";

export type SkillDetailSectionId =
  | "variants"
  | "automaticSynergies"
  | "mechanics"
  | "synergies"
  | "limitations"
  | "pvp";

export type SkillDetailSection = {
  id: SkillDetailSectionId;
  title: string;
  items: readonly string[];
};

export type SkillDetailModel = {
  skillId: V2SkillId;
  name: string;
  summary: string;
  badges: readonly string[];
  facts: readonly string[];
  sections: readonly SkillDetailSection[];
};

const SECTION_TITLES: Record<SkillDetailSectionId, string> = {
  variants: "변형 효과",
  automaticSynergies: "자동 연계 정보",
  mechanics: "작동 방식",
  synergies: "연계",
  limitations: "제약",
  pvp: "PvP 차이",
};

const CATEGORY_LABELS: Record<V2SkillDefinition["category"], string> = {
  attack: "공격",
  heal: "회복",
  buff: "강화",
  debuff: "약화",
  passive: "패시브",
};

function skillNames(ids: readonly V2SkillId[] | undefined): string {
  return (ids ?? [])
    .map((id) => {
      const referenced = V2_SKILLS[id];
      if (!referenced && process.env.NODE_ENV !== "production") {
        console.warn(`[skill-detail] Unknown referenced skill: ${id}`);
      }
      return referenced?.name ?? id;
    })
    .join(", ");
}

type EquippedSynergy = NonNullable<
  V2SkillDefinition["equippedSynergies"]
>[number];

function equippedSynergyRequirements(
  synergy: EquippedSynergy,
): V2SkillId[] {
  return [
    ...(synergy.requiredSkillId ? [synergy.requiredSkillId] : []),
    ...(synergy.requiredSkillIds ?? []),
  ].filter((id, index, all) => all.indexOf(id) === index);
}

function impliedEquippedSynergyEffects(
  skill: V2SkillDefinition,
  equippedIds: readonly V2SkillId[],
): V2SkillEffect[] {
  const equipped = new Set(equippedIds);
  return (skill.equippedSynergies ?? []).flatMap((synergy) =>
    equippedSynergyRequirements(synergy).every((id) => equipped.has(id))
      ? synergy.effects
      : [],
  );
}

function effectSummary(
  skill: V2SkillDefinition,
  effects: readonly V2SkillEffect[],
  activeCastEffects: readonly V2SkillEffect[] = effects,
): string {
  return describeV2SkillEffects(skill, effects, activeCastEffects).join(" · ");
}

function section(
  id: SkillDetailSectionId,
  items: readonly string[] | undefined,
): SkillDetailSection | null {
  const present = (items ?? []).filter((item) => item.trim().length > 0);
  return present.length > 0
    ? { id, title: SECTION_TITLES[id], items: present }
    : null;
}

export function buildSkillDetailModel(skillId: string): SkillDetailModel | null {
  const skill = (V2_SKILLS as Readonly<Record<string, V2SkillDefinition>>)[
    skillId
  ];
  if (!skill) return null;

  const classification = classifySkillForLibrary(skill.id);
  const variants = [
    ...(skill.elementEffects
      ? Object.entries(skill.elementEffects).map(
          ([element, effects]) =>
            `${V2_ELEMENT_LABEL[element as V2Element]} — ${effectSummary(skill, effects ?? [])}`,
        )
      : []),
    ...(skill.castVariants ?? []).map((variant) => {
      const conditions = [
        variant.requiredLearnedSkillIds?.length
          ? `보유: ${skillNames(variant.requiredLearnedSkillIds)}`
          : "",
        variant.requiredEquippedSkillIds?.length
          ? `장착: ${skillNames(variant.requiredEquippedSkillIds)}`
          : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `${variant.name}${conditions ? ` (${conditions})` : ""} — ${effectSummary(skill, variant.effects)}`;
    }),
  ];

  const automaticSynergies = [
    ...(skill.equippedSynergies ?? []).map((synergy) => {
      const ids = equippedSynergyRequirements(synergy);
      return `장착: ${skillNames(ids)} — ${effectSummary(skill, synergy.effects, [
        ...skill.effects,
        ...impliedEquippedSynergyEffects(skill, ids),
      ])}`;
    }),
    ...(skill.elementEffectSynergies ?? []).flatMap((synergy) =>
      Object.entries(synergy.elementEffects).map(
        ([element, effects]) =>
          `장착: ${skillNames([synergy.requiredSkillId])} · ${V2_ELEMENT_LABEL[element as V2Element]} — ${effectSummary(skill, effects ?? [])}`,
      ),
    ),
  ];

  const badges = [
    classification?.tier === "common"
      ? "공용"
      : classification?.tier
        ? `${classification.tier}차`
        : "",
    CATEGORY_LABELS[skill.category],
    STAT_LABELS[skill.stat],
    skill.element ? V2_ELEMENT_LABEL[skill.element] : "",
  ].filter(
    (badge, index, all) =>
      badge.length > 0 && all.indexOf(badge) === index,
  );

  const sections = [
    section("variants", variants),
    section("automaticSynergies", automaticSynergies),
    section("mechanics", skill.detail?.mechanics),
    section("synergies", skill.detail?.synergies),
    section("limitations", skill.detail?.limitations),
    section("pvp", skill.detail?.pvp),
  ].filter((value): value is SkillDetailSection => value !== null);

  return {
    skillId: skill.id,
    name: skill.name,
    summary: skill.description,
    badges,
    facts: [...describeV2Skill(skill), `SP ${spCostOf(skill)}`],
    sections,
  };
}
