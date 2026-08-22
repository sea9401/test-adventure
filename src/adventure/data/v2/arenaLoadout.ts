// 아레나 전투 세팅 스냅샷 — 직업/스탯은 저장하지 않고 장착 스킬 + 활성 전투 패턴(겜빗) +
// 장착 장비(슬롯→개체 iid)만 저장한다. 아레나 매치는 공격/수비 양쪽 모두 이 활성 스냅샷을
// 전투 입력에 오버레이한다. 캐릭터의 현재 장착 상태를 직접 바꾸지 않는다.
//
// 저장 위치 = save key `arena-loadouts.v2`. 과거에는 목록이었으므로 파서는 배열의 첫 항목을
// 활성 템플릿으로 읽는다. 신규 저장은 단일 원소 배열로 덮어쓴다.

import {
  V2_SKILLS,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import { STAT_LABELS } from "@/adventure/data/stats";
import type { V2EquipSlot } from "@/adventure/data/v2/v2Equipment";
import {
  parseCombatPattern,
  type V2CombatCondition,
  type V2CombatRole,
  type V2CombatPattern,
} from "@/adventure/v2/combat/combatPattern";

export const ARENA_LOADOUT_MAX = 6;
export const ARENA_LOADOUT_NAME_MAX = 40;
export const ARENA_LOADOUT_TEMPLATE_ID = "arena-template";

const SLOTS: readonly V2EquipSlot[] = [
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
];

export type ArenaLoadout = {
  /** 고유 id(UI key·적용/삭제 선택). */
  id: string;
  name: string;
  /** ISO 저장 시각. */
  savedAt: string;
  /** 장착 스킬 스냅샷(우선순위 순). 적용 시 learned 인 것만 복원. */
  skills: V2SkillId[];
  /** 활성 전투 패턴(겜빗) 스냅샷. null = 미설정(엔진 기본 패턴). */
  pattern: V2CombatPattern | null;
  /** 장착 장비 스냅샷(슬롯 → 개체 iid). 적용 시 현재 보유(iid)인 것만 복원. */
  equipment: Partial<Record<V2EquipSlot, string>>;
};

export type ArenaPatternActionSummary = {
  key: string;
  name: string;
  condition: string;
};

export type ArenaLoadoutIssueSummary = {
  emptyEquipmentSlots: V2EquipSlot[];
  unavailableEquipmentSlots: V2EquipSlot[];
  uncoveredActiveSkills: { id: V2SkillId; name: string }[];
};

const ROLE_LABEL: Record<V2CombatRole, string> = {
  main_attack: "주 공격",
  heal: "회복",
  buff: "버프",
  debuff: "디버프",
};

const DERIVED_BUFF_LABEL = {
  evasion: "회피",
  crit: "치명타",
  damageReduction: "받는 피해 감소",
  reflectDamage: "반사 피해",
  regen: "지속 회복",
  guaranteedEvade: "확정 회피",
  duelistDeclaration: "선언",
  berserkerFinisher: "혈전 준비",
  berserkerDeathOvercome: "사망 극복 공격 준비",
} as const;

const ENEMY_STATUS_LABEL = {
  bleed: "출혈",
  poison: "중독",
  vuln: "마법취약",
  frostChill: "한기",
} as const;

const SELF_RESOURCE_LABEL = {
  impact: "충격",
  ironWallReflect: "철벽 반사",
  inscription: "각인 총합",
  weight: "중량",
} as const;

const ENEMY_DEBUFF_LABEL = {
  vulnerability: "받는 피해 증가(취약)",
  damageDown: "주는 피해 감소",
  skillProcDown: "스킬 발동률 감소",
  healReduction: "회복 효과 감소",
} as const;

/** 아레나 템플릿에서 저장된 전투패턴 조건을 사람이 읽는 문구로 표시한다. */
export function arenaPatternConditionSummary(
  condition: V2CombatCondition,
): string {
  switch (condition.kind) {
    case "always":
      return "항상";
    case "all":
    case "any": {
      const mode = condition.kind === "all" ? "모두 만족" : "하나 만족";
      return `${mode} (${condition.conditions
        .map(arenaPatternConditionSummary)
        .join(" / ")})`;
    }
    case "self_hp":
      return `내 HP ${condition.pct}% ${condition.op === "below" ? "이하" : "이상"}`;
    case "self_mp":
      return `내 MP ${condition.pct}% ${condition.op === "below" ? "이하" : "이상"}`;
    case "self_shield":
      return "active" in condition
        ? `내 보호막 ${condition.active ? "있음" : "없음"}`
        : `내 보호막 ${condition.value} ${condition.op === "atMost" ? "이하" : "이상"}`;
    case "self_buff":
      return `내 ${STAT_LABELS[condition.stat]} 버프 ${condition.active ? "있음" : "없음"}`;
    case "self_buff_pct":
      return `내 ${DERIVED_BUFF_LABEL[condition.target]} 상태 효과 ${condition.active ? "있음" : "없음"}`;
    case "self_resource":
      return condition.op === "none"
        ? `내 ${SELF_RESOURCE_LABEL[condition.resource]} 없음`
        : `내 ${SELF_RESOURCE_LABEL[condition.resource]} ${condition.value} ${condition.op === "atMost" ? "이하" : "이상"}`;
    case "enemy_hp":
      return `적 HP ${condition.pct}% ${condition.op === "below" ? "이하" : "이상"}`;
    case "enemy_status":
      return condition.op === "none"
        ? `적 ${ENEMY_STATUS_LABEL[condition.tag]} 없음`
        : `적 ${ENEMY_STATUS_LABEL[condition.tag]} ${condition.stacks}스택 ${condition.op === "atMost" ? "이하" : "이상"}`;
    case "enemy_debuff":
      return `적 ${ENEMY_DEBUFF_LABEL[condition.target]} ${condition.active ? "있음" : "없음"}`;
    case "turn":
      return condition.op === "every"
        ? `내 공격 매 ${condition.value}회`
        : `내 공격 ${condition.value}회 ${condition.op === "atMost" ? "이하" : "이상"}`;
  }
}

/** 아레나 요약 화면용 실제 패턴 행동 목록. 장착 액티브 목록과 섞지 않는다. */
export function arenaPatternActionSummary(
  loadout: Pick<ArenaLoadout, "pattern">,
): ArenaPatternActionSummary[] {
  const { pattern } = loadout;
  if (!pattern) return [];
  return pattern.blocks.map((block, index) => {
    const action = block.action;
    const value =
      action.kind === "skill"
        ? action.skillId
        : action.kind === "role"
          ? action.role
          : "basic_attack";
    return {
      key: `${index}:${action.kind}:${value}`,
      name:
        action.kind === "skill"
          ? (V2_SKILLS[action.skillId as V2SkillId]?.name ?? action.skillId)
          : action.kind === "role"
            ? ROLE_LABEL[action.role]
            : "일반 공격",
      condition: arenaPatternConditionSummary(block.condition),
    };
  });
}

/** 저장 템플릿이 실제 전투에서 조용히 비게 되는 부분을 UI에서 미리 경고한다. */
export function arenaLoadoutIssueSummary(
  loadout: ArenaLoadout,
  ownedIids: ReadonlySet<string>,
): ArenaLoadoutIssueSummary {
  const emptyEquipmentSlots: V2EquipSlot[] = [];
  const unavailableEquipmentSlots: V2EquipSlot[] = [];
  for (const slot of SLOTS) {
    const iid = loadout.equipment[slot];
    if (!iid) emptyEquipmentSlots.push(slot);
    else if (!ownedIids.has(iid)) unavailableEquipmentSlots.push(slot);
  }

  const directSkills = new Set<string>();
  const coveredRoles = new Set<V2CombatRole>();
  for (const block of loadout.pattern?.blocks ?? []) {
    if (block.action.kind === "skill") directSkills.add(block.action.skillId);
    else if (block.action.kind === "role") coveredRoles.add(block.action.role);
  }
  const categoryRole = {
    attack: "main_attack",
    heal: "heal",
    buff: "buff",
    debuff: "debuff",
  } as const;
  const uncoveredActiveSkills = loadout.pattern
    ? loadout.skills.flatMap((id) => {
        const skill = V2_SKILLS[id];
        if (!skill || skill.passive || skill.category === "passive") return [];
        const role = categoryRole[skill.category];
        return directSkills.has(id) || coveredRoles.has(role)
          ? []
          : [{ id, name: skill.name }];
      })
    : [];

  return {
    emptyEquipmentSlots,
    unavailableEquipmentSlots,
    uncoveredActiveSkills,
  };
}

// 방어적 파싱 — 배열 + 필수 필드(id·name) 있는 엔트리만, 저장순 ≤ MAX. pattern 은 parseCombatPattern
// 으로 재검증(손상 블록 drop). 슬롯/스킬 값은 타입만 거르고 보유 검증은 적용 시점(라우트)에서.
export function parseArenaLoadouts(value: unknown): ArenaLoadout[] {
  if (!Array.isArray(value)) return [];
  const out: ArenaLoadout[] = [];
  for (const e of value) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.name !== "string") continue;
    const skills = Array.isArray(o.skills)
      ? o.skills.filter((s): s is V2SkillId => typeof s === "string")
      : [];
    const equipment: Partial<Record<V2EquipSlot, string>> = {};
    if (o.equipment && typeof o.equipment === "object") {
      const eq = o.equipment as Record<string, unknown>;
      for (const slot of SLOTS) {
        const iid = eq[slot];
        if (typeof iid === "string" && iid.length > 0) equipment[slot] = iid;
      }
    }
    out.push({
      id: o.id,
      name: o.name.slice(0, ARENA_LOADOUT_NAME_MAX),
      savedAt: typeof o.savedAt === "string" ? o.savedAt : "",
      skills,
      pattern: o.pattern != null ? parseCombatPattern(o.pattern) : null,
      equipment,
    });
    if (out.length >= ARENA_LOADOUT_MAX) break;
  }
  return out;
}

export function parseActiveArenaLoadout(value: unknown): ArenaLoadout | null {
  return parseArenaLoadouts(value)[0] ?? null;
}

export function serializeActiveArenaLoadout(
  loadout: ArenaLoadout | null,
): ArenaLoadout[] {
  return loadout ? [loadout] : [];
}

// 적용 — 저장 스킬 중 현재 learned 인 것만(미보유/리셋된 스킬 자동 제외, 순서 보존).
export function loadoutSkillsForApply(
  loadout: ArenaLoadout,
  learned: readonly V2SkillId[],
): V2SkillId[] {
  const have = new Set(learned);
  return loadout.skills.filter((s) => have.has(s));
}

// 적용 — 저장 장비 중 현재 보유(iid)인 슬롯만(판/분해된 장비 자동 제외).
export function loadoutEquipmentForApply(
  loadout: ArenaLoadout,
  ownedIids: ReadonlySet<string>,
): Partial<Record<V2EquipSlot, string>> {
  const out: Partial<Record<V2EquipSlot, string>> = {};
  for (const slot of SLOTS) {
    const iid = loadout.equipment[slot];
    if (iid && ownedIids.has(iid)) out[slot] = iid;
  }
  return out;
}
