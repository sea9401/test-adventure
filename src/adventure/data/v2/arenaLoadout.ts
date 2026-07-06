// 전투 세팅 스냅샷 — 직업/스탯은 저장하지 않고 장착 스킬 + 활성 전투 패턴(겜빗) +
// 장착 장비(슬롯→개체 iid)만 저장한다. 전직 후에는 현재 직업/스탯은 그대로 두고, 이 스냅샷으로
// 현재 캐릭터 장착만 즉시 교체한다. 라이브 전투(사냥·아레나)가 모두 이 장착 상태를 읽으므로
// 캐릭터 전역에 적용된다(아레나 전용 아님).
//
// 저장 위치 = save key `arena-loadouts.v2`(목록). 순수 데이터/헬퍼만 — DB 접근은 라우트에서.

import type { V2SkillId } from "@/adventure/data/v2/v2Skills";
import type { V2EquipSlot } from "@/adventure/data/v2/v2Equipment";
import {
  parseCombatPattern,
  type V2CombatPattern,
} from "@/adventure/v2/combat/combatPattern";

export const ARENA_LOADOUT_MAX = 6;
export const ARENA_LOADOUT_NAME_MAX = 40;

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
