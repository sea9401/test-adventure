import {
  EMBLEM_KINDS,
  emblemGrowthMax,
  type EmblemGrade,
  type EmblemKind,
  type EmblemState,
} from "@/adventure/data/v2/emblems";

// 같은 종류·같은 등급 문장은 서로 똑같으므로 화면에서는 개체가 아니라 묶음으로 다룬다.
export type EmblemGroup = {
  kind: EmblemKind;
  grade: EmblemGrade;
  count: number;
  equipped: number;
  /** 5등급이 아니고, 장착하지 않은 같은 문장이 재료로 1개 이상 남는다. */
  fusible: boolean;
};

export type EmblemKindRow = { kind: EmblemKind; groups: EmblemGroup[] };

/** 보유한 종류만 종류 순서(HP·MP·능력치)대로, 각 종류 안에서는 높은 등급부터. */
export function groupEmblems(state: EmblemState): EmblemKindRow[] {
  const equippedIids = new Set(state.slots.filter((iid): iid is string => iid != null));
  const rows: EmblemKindRow[] = [];
  for (const kind of EMBLEM_KINDS) {
    const ofKind = state.owned.filter((item) => item.kind === kind);
    if (ofKind.length === 0) continue;
    const grades = [...new Set(ofKind.map((item) => item.grade))].sort((a, b) => b - a);
    rows.push({
      kind,
      groups: grades.map((grade) => {
        const same = ofKind.filter((item) => item.grade === grade);
        const equipped = same.filter((item) => equippedIids.has(item.iid)).length;
        return {
          kind,
          grade,
          count: same.length,
          equipped,
          fusible: grade < 5 && same.length >= 2 && same.length - equipped >= 1,
        };
      }),
    });
  }
  return rows;
}

/** 장착한 문장의 레벨업당 최대 성장치를 종류별로 합산한다(최소는 항상 0). */
export function emblemGrowthSummary(state: EmblemState): { kind: EmblemKind; max: number }[] {
  const totals = new Map<EmblemKind, number>();
  for (const iid of state.slots) {
    const item = iid ? state.owned.find((entry) => entry.iid === iid) : undefined;
    if (!item) continue;
    totals.set(item.kind, (totals.get(item.kind) ?? 0) + emblemGrowthMax(item));
  }
  return EMBLEM_KINDS.filter((kind) => totals.has(kind)).map((kind) => ({ kind, max: totals.get(kind)! }));
}

/** 합성 대상은 장착 중인 문장을 우선해 장착 칸이 바로 좋아지게 하고, 재료는 장착하지 않은 문장에서 고른다. */
export function pickFusionPair(
  state: EmblemState,
  kind: EmblemKind,
  grade: EmblemGrade,
): { targetIid: string; materialIid: string } | null {
  if (grade >= 5) return null;
  const same = state.owned.filter((item) => item.kind === kind && item.grade === grade);
  const isEquipped = (iid: string) => state.slots.includes(iid);
  const target = same.find((item) => isEquipped(item.iid)) ?? same[0];
  const material = same.find((item) => item.iid !== target?.iid && !isEquipped(item.iid));
  return target && material ? { targetIid: target.iid, materialIid: material.iid } : null;
}

/** 장착에 쓸 문장 — 장착하지 않은 같은 문장. 모두 장착 중이면 null. */
export function pickEquipInstance(state: EmblemState, kind: EmblemKind, grade: EmblemGrade): string | null {
  return state.owned.find((item) => item.kind === kind && item.grade === grade && !state.slots.includes(item.iid))?.iid ?? null;
}
