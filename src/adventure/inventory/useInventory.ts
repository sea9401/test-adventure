"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConsumableId } from "../data/consumables";
import { ITEMS, type ItemId } from "../data/items";
import { SKILL_BOOKS, type SkillBookId } from "../data/skillBooks";
import type { CraftTier } from "../data/craftQuality";
import {
  NON_ZERO_DROP_QUALITY_KEYS,
  type DropQuality,
} from "../data/dropQuality";
import type { MaterialId } from "../data/materials";
import { potionMax, type PotionId } from "../data/potions";
import {
  RUNE_GRADES,
  type RuneGrade,
  type RuneId,
} from "../data/runes";
import {
  applyDisassemble,
  planDisassemble,
  type DisassemblePlan,
  type DisassembleRequest,
} from "../crafting/disassemble";
import type { EquippedSlots } from "../character/types";
import { isEnhanceable } from "../character/enhancement";
import { isStarlitRing } from "./starlitRing";
import {
  normalizeInstances,
  type EquipmentInstance,
} from "./equipmentInstances";
import { useSavedValue } from "@/lib/storage/SaveProvider";
import { useRemotePatch } from "@/lib/storage/useRemotePatch";
import { depositToVaultPure, withdrawFromVaultPure } from "./vaultOps";

// 제작산 품질 등급 인스턴스 — itemId → (등급 문자열 "-2"|"-1"|"1"|"2" → 개수).
// 등급 0(일반)은 베이스와 동일하므로 별도로 두지 않고 equipment[] 에 합산한다.
export type CraftedEquipmentState = Partial<
  Record<ItemId, Partial<Record<string, number>>>
>;

// 드랍산 품질 등급 인스턴스 — itemId → (등급 문자열 "1"|"2" → 개수). 등급 0(기본)은 equipment[] 에 합산.
export type DroppedEquipmentState = Partial<
  Record<ItemId, Partial<Record<string, number>>>
>;

// 비-기본(0 제외) 등급. craftedEquipment 가 담는 키.
const NON_ZERO_TIERS: readonly string[] = ["-2", "-1", "1", "2"];

// 도감 보관함 — itemId → 변형 키("base"|"c±1"|"c±2"|"d1"|"d2") → 개수.
// 인벤에서 도감으로 넣은 장비를 보관하고, 꺼내면 인벤으로 돌아온다. discovered 로그와는 별개.
export type VaultState = Partial<Record<ItemId, Partial<Record<string, number>>>>;

// vault 에 들어갈 수 있는 변형 키. discoveredEquipment 의 EquipVariantKey 와 동일.
const VAULT_VARIANT_KEYS: readonly string[] = [
  "base",
  "c-2",
  "c-1",
  "c1",
  "c2",
  "d1",
  "d2",
];

export type InventoryState = {
  potions: Partial<Record<PotionId, number>>;
  equipment: Partial<Record<ItemId, number>>;
  /** 제작 품질 등급이 0(일반)이 아닌 장비. 항상 존재 — readInitial 에서 {} 로 채움. */
  craftedEquipment: CraftedEquipmentState;
  /** 드랍 품질 등급이 0(기본)이 아닌 장비(정교한/빼어난). 항상 존재 — readInitial 에서 {} 로 채움. */
  droppedEquipment: DroppedEquipmentState;
  /** 도감 보관함. 항상 존재 — readInitial 에서 {} 로 채움. */
  vault: VaultState;
  materials: Partial<Record<MaterialId, number>>;
  consumables: Partial<Record<ConsumableId, number>>;
  /**
   * 스킬북 — 사용 시 1개 소비되어 캐릭터에 AP 스킬 학습. 학습 후엔 책 자체는 의미 X
   * (학습 1회만 효과). 미학습 책은 마켓 거래 가능 (SKILL_BOOKS[id].tradable).
   */
  skillBooks?: Partial<Record<SkillBookId, number>>;
  // 종류별 포션 최대 보유 수의 추가 보너스. 보상으로 영구 누적.
  potionCapacityBonus?: number;
  /**
   * 룬 보유 — 룬 id × 등급(1~6) → 개수. 장착은 별도(CharacterDynamicState.equippedRunes),
   * 여기는 가방. 폐기/판매 개념은 없고 합성·장착 시 소비.
   */
  runes?: Partial<Record<RuneId, Partial<Record<RuneGrade, number>>>>;
  /**
   * 인스턴스 기반 장비 풀 — 별빛 재단 무구 5종(ENHANCEABLE_ITEM_IDS) 한정.
   * 한 자루 한 자루 고유 ID + 강화 단계 보존. craftTier 도 인스턴스 단위로 같이.
   * 일반 장비는 여기 들어가지 않는다 (equipment[] 그대로).
   */
  equipmentInstances?: EquipmentInstance[];
};

export const emptyInventory = (): InventoryState => ({
  potions: { potion_heal_s: 10 },
  equipment: {},
  craftedEquipment: {},
  droppedEquipment: {},
  vault: {},
  materials: { branch: 2 },
  consumables: {},
  skillBooks: {},
  runes: {},
  equipmentInstances: [],
});

function readRunes(
  raw: unknown,
): Partial<Record<RuneId, Partial<Record<RuneGrade, number>>>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<RuneId, Partial<Record<RuneGrade, number>>>> = {};
  for (const [rid, grades] of Object.entries(raw as Record<string, unknown>)) {
    // id/grade 의 "의미 인식"이 아니라 "모양"만 본다 — 미인식 룬 id 나 미래 등급도
    // 모양만 멀쩡하면 보존해 구버전 클라가 파괴하지 않게 한다(carry-through).
    if (!rid || !grades || typeof grades !== "object") continue;
    const map: Partial<Record<RuneGrade, number>> = {};
    for (const [g, n] of Object.entries(grades as Record<string, unknown>)) {
      const gradeNum = Number(g);
      if (
        Number.isInteger(gradeNum) &&
        gradeNum > 0 &&
        typeof n === "number" &&
        Number.isInteger(n) &&
        n > 0
      ) {
        map[gradeNum as RuneGrade] = n;
      }
    }
    if (Object.keys(map).length) out[rid as RuneId] = map;
  }
  return out;
}


// craftedEquipment / droppedEquipment 는 같은 모양(itemId → 등급키 → 개수) — 허용 등급키만 다르다.
function readGradedEquipment(
  raw: unknown,
  validKeys: readonly string[],
): Partial<Record<ItemId, Partial<Record<string, number>>>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<ItemId, Partial<Record<string, number>>>> = {};
  for (const [itemId, grades] of Object.entries(raw as Record<string, unknown>)) {
    if (!(itemId in ITEMS) || !grades || typeof grades !== "object") continue;
    const map: Partial<Record<string, number>> = {};
    for (const [g, n] of Object.entries(grades as Record<string, unknown>)) {
      if (
        validKeys.includes(g) &&
        typeof n === "number" &&
        Number.isInteger(n) &&
        n > 0
      ) {
        map[g] = n;
      }
    }
    if (Object.keys(map).length) out[itemId as ItemId] = map;
  }
  return out;
}

function readInitial(raw: unknown): InventoryState {
  if (!raw || typeof raw !== "object") return emptyInventory();
  const parsed = raw as Partial<InventoryState>;
  return {
    potions: parsed.potions ?? {},
    equipment: parsed.equipment ?? {},
    craftedEquipment: readGradedEquipment(parsed.craftedEquipment, NON_ZERO_TIERS),
    droppedEquipment: readGradedEquipment(
      parsed.droppedEquipment,
      NON_ZERO_DROP_QUALITY_KEYS,
    ),
    vault: readGradedEquipment(parsed.vault, VAULT_VARIANT_KEYS),
    materials: parsed.materials ?? {},
    consumables: parsed.consumables ?? {},
    skillBooks: readSkillBooks(parsed.skillBooks),
    potionCapacityBonus: Math.max(0, parsed.potionCapacityBonus ?? 0),
    runes: readRunes(parsed.runes),
    equipmentInstances: normalizeInstances(parsed.equipmentInstances),
  };
}

// 알 수 없는 SkillBookId 는 버려서 SKILL_BOOKS 카탈로그 외 잔재가 안 남게.
function readSkillBooks(
  raw: unknown,
): Partial<Record<SkillBookId, number>> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Partial<Record<SkillBookId, number>> = {};
  for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
    if (!(id in SKILL_BOOKS)) continue;
    const num = typeof n === "number" ? n : Number(n);
    if (Number.isFinite(num) && num > 0) {
      out[id as SkillBookId] = Math.floor(num);
    }
  }
  return out;
}

export function useInventory() {
  const initial = useSavedValue("inventory.v2");
  const [state, setState] = useState<InventoryState>(() => readInitial(initial));
  const stateRef = useRef<InventoryState>(state);
  useRemotePatch("inventory.v2", state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // 포션은 종류 별 potionMax(bonus) 까지만 보유 — 초과분은 silently 잘림.
  // 실제로 추가된 수량을 반환 (호출 측이 골드 환불·메시지 처리에 활용).
  const add = useCallback((id: PotionId, n = 1): number => {
    const cur = stateRef.current;
    const have = cur.potions[id] ?? 0;
    const cap = potionMax(cur.potionCapacityBonus ?? 0);
    const room = Math.max(0, cap - have);
    const added = Math.min(n, room);
    if (added <= 0) return 0;
    const next: InventoryState = {
      ...cur,
      potions: { ...cur.potions, [id]: have + added },
    };
    stateRef.current = next;
    setState(next);
    return added;
  }, []);

  const addPotionCapacity = useCallback((n = 1) => {
    if (n <= 0) return;
    const cur = stateRef.current;
    const next: InventoryState = {
      ...cur,
      potionCapacityBonus: (cur.potionCapacityBonus ?? 0) + n,
    };
    stateRef.current = next;
    setState(next);
  }, []);

  const consume = useCallback((id: PotionId, n = 1): boolean => {
    const cur = stateRef.current;
    const have = cur.potions[id] ?? 0;
    if (have < n) return false;
    const next: InventoryState = {
      ...cur,
      potions: { ...cur.potions, [id]: have - n },
    };
    stateRef.current = next;
    setState(next);
    return true;
  }, []);

  const count = useCallback((id: PotionId): number => state.potions[id] ?? 0, [
    state,
  ]);

  const totalPotions = useCallback((): number => {
    let total = 0;
    for (const v of Object.values(state.potions)) total += v ?? 0;
    return total;
  }, [state]);

  const addEquipment = useCallback((id: ItemId, n = 1) => {
    const cur = stateRef.current;
    const next: InventoryState = {
      ...cur,
      equipment: {
        ...cur.equipment,
        [id]: (cur.equipment[id] ?? 0) + n,
      },
    };
    stateRef.current = next;
    setState(next);
  }, []);

  const consumeEquipment = useCallback((id: ItemId, n = 1): boolean => {
    const cur = stateRef.current;
    const have = cur.equipment[id] ?? 0;
    if (have < n) return false;
    const next: InventoryState = {
      ...cur,
      equipment: { ...cur.equipment, [id]: have - n },
    };
    stateRef.current = next;
    setState(next);
    return true;
  }, []);

  // 제작산 등급 인스턴스. tier 0(일반)은 equipment[] 와 동일하므로 그쪽으로 합산.
  const addCraftedEquipment = useCallback(
    (id: ItemId, tier: CraftTier, n = 1) => {
      if (n <= 0) return;
      const cur = stateRef.current;
      if (tier === 0) {
        const next: InventoryState = {
          ...cur,
          equipment: { ...cur.equipment, [id]: (cur.equipment[id] ?? 0) + n },
        };
        stateRef.current = next;
        setState(next);
        return;
      }
      const key = String(tier);
      const tierMap = { ...(cur.craftedEquipment[id] ?? {}) };
      tierMap[key] = (tierMap[key] ?? 0) + n;
      const next: InventoryState = {
        ...cur,
        craftedEquipment: { ...cur.craftedEquipment, [id]: tierMap },
      };
      stateRef.current = next;
      setState(next);
    },
    [],
  );

  const consumeCraftedEquipment = useCallback(
    (id: ItemId, tier: CraftTier, n = 1): boolean => {
      if (tier === 0) return consumeEquipment(id, n);
      const cur = stateRef.current;
      const key = String(tier);
      const have = cur.craftedEquipment[id]?.[key] ?? 0;
      if (have < n) return false;
      const tierMap = { ...(cur.craftedEquipment[id] ?? {}) };
      const left = have - n;
      if (left > 0) tierMap[key] = left;
      else delete tierMap[key];
      const crafted = { ...cur.craftedEquipment };
      if (Object.keys(tierMap).length) crafted[id] = tierMap;
      else delete crafted[id];
      const next: InventoryState = { ...cur, craftedEquipment: crafted };
      stateRef.current = next;
      setState(next);
      return true;
    },
    [consumeEquipment],
  );

  // 드랍산 등급 인스턴스(정교한/빼어난). q 0(기본)은 equipment[] 와 동일하므로 그쪽으로 합산.
  const addDroppedEquipment = useCallback(
    (id: ItemId, q: DropQuality, n = 1) => {
      if (n <= 0) return;
      const cur = stateRef.current;
      if (q === 0) {
        const next: InventoryState = {
          ...cur,
          equipment: { ...cur.equipment, [id]: (cur.equipment[id] ?? 0) + n },
        };
        stateRef.current = next;
        setState(next);
        return;
      }
      const key = String(q);
      const map = { ...(cur.droppedEquipment[id] ?? {}) };
      map[key] = (map[key] ?? 0) + n;
      const next: InventoryState = {
        ...cur,
        droppedEquipment: { ...cur.droppedEquipment, [id]: map },
      };
      stateRef.current = next;
      setState(next);
    },
    [],
  );

  const consumeDroppedEquipment = useCallback(
    (id: ItemId, q: DropQuality, n = 1): boolean => {
      if (q === 0) return consumeEquipment(id, n);
      const cur = stateRef.current;
      const key = String(q);
      const have = cur.droppedEquipment[id]?.[key] ?? 0;
      if (have < n) return false;
      const map = { ...(cur.droppedEquipment[id] ?? {}) };
      const left = have - n;
      if (left > 0) map[key] = left;
      else delete map[key];
      const dropped = { ...cur.droppedEquipment };
      if (Object.keys(map).length) dropped[id] = map;
      else delete dropped[id];
      const next: InventoryState = { ...cur, droppedEquipment: dropped };
      stateRef.current = next;
      setState(next);
      return true;
    },
    [consumeEquipment],
  );

  // 인스턴스 기반 장비 — 별빛 재단 무구 5종 한정. 한 자루 한 자루 고유 ID 보존.
  // craft 결과(서버 권위) 가 instance 를 만들어 내려 주면 클라가 받아 add. 강화는 enhance.
  // 차감은 equip / disassemble / craft 가 재료로 쓸 때 (현재는 equip 만).
  const addEquipmentInstance = useCallback((inst: EquipmentInstance) => {
    if (!isEnhanceable(inst.itemId) && !isStarlitRing(inst.itemId)) return;
    const cur = stateRef.current;
    const list = cur.equipmentInstances ?? [];
    // 동일 instanceId 중복 방지 — 서버 권위지만 클라 reconciliation 시 dedupe.
    if (list.some((i) => i.instanceId === inst.instanceId)) return;
    const next: InventoryState = {
      ...cur,
      equipmentInstances: [...list, inst],
    };
    stateRef.current = next;
    setState(next);
  }, []);

  const consumeEquipmentInstance = useCallback(
    (instanceId: string): boolean => {
      const cur = stateRef.current;
      const list = cur.equipmentInstances ?? [];
      const idx = list.findIndex((i) => i.instanceId === instanceId);
      if (idx < 0) return false;
      const next: InventoryState = {
        ...cur,
        equipmentInstances: [...list.slice(0, idx), ...list.slice(idx + 1)],
      };
      stateRef.current = next;
      setState(next);
      return true;
    },
    [],
  );

  const findEquipmentInstance = useCallback(
    (instanceId: string): EquipmentInstance | undefined =>
      state.equipmentInstances?.find((i) => i.instanceId === instanceId),
    [state],
  );

  // 도감 보관함 ↔ 인벤토리 이동. atomic — 한 번의 setState 로 인벤 차감 + vault 증가(또는 그 반대).
  // 실제 상태 변환은 vaultOps 의 순수 함수가 담당.
  const depositToVault = useCallback(
    (id: ItemId, tier?: CraftTier, quality?: DropQuality, n = 1): boolean => {
      const next = depositToVaultPure(stateRef.current, id, tier, quality, n);
      if (!next) return false;
      stateRef.current = next;
      setState(next);
      return true;
    },
    [],
  );

  const withdrawFromVault = useCallback(
    (id: ItemId, variantKey: string, n = 1): boolean => {
      const next = withdrawFromVaultPure(stateRef.current, id, variantKey, n);
      if (!next) return false;
      stateRef.current = next;
      setState(next);
      return true;
    },
    [],
  );

  const vaultCount = useCallback(
    (id: ItemId, variantKey: string): number =>
      state.vault[id]?.[variantKey] ?? 0,
    [state],
  );

  const addMaterial = useCallback((id: MaterialId, n = 1) => {
    const cur = stateRef.current;
    const next: InventoryState = {
      ...cur,
      materials: {
        ...cur.materials,
        [id]: (cur.materials[id] ?? 0) + n,
      },
    };
    stateRef.current = next;
    setState(next);
  }, []);

  const consumeMaterial = useCallback((id: MaterialId, n = 1): boolean => {
    const cur = stateRef.current;
    const have = cur.materials[id] ?? 0;
    if (have < n) return false;
    const next: InventoryState = {
      ...cur,
      materials: { ...cur.materials, [id]: have - n },
    };
    stateRef.current = next;
    setState(next);
    return true;
  }, []);

  const materialCount = useCallback(
    (id: MaterialId): number => state.materials[id] ?? 0,
    [state],
  );

  // 제작산 등급 인스턴스 보유 수 — 등급 합산(equipment[] 의 무등급/일반은 제외).
  const craftedTotalCount = useCallback(
    (id: ItemId): number => {
      const tierMap = state.craftedEquipment[id];
      if (!tierMap) return 0;
      let total = 0;
      for (const v of Object.values(tierMap)) total += v ?? 0;
      return total;
    },
    [state],
  );

  // 드랍산 등급 인스턴스 보유 수 — 등급 합산(equipment[] 의 기본 등급은 제외).
  const droppedTotalCount = useCallback(
    (id: ItemId): number => {
      const map = state.droppedEquipment[id];
      if (!map) return 0;
      let total = 0;
      for (const v of Object.values(map)) total += v ?? 0;
      return total;
    },
    [state],
  );

  const addConsumable = useCallback((id: ConsumableId, n = 1) => {
    if (n <= 0) return;
    const cur = stateRef.current;
    const next: InventoryState = {
      ...cur,
      consumables: {
        ...cur.consumables,
        [id]: (cur.consumables[id] ?? 0) + n,
      },
    };
    stateRef.current = next;
    setState(next);
  }, []);

  const consumeConsumable = useCallback(
    (id: ConsumableId, n = 1): boolean => {
      const cur = stateRef.current;
      const have = cur.consumables[id] ?? 0;
      if (have < n) return false;
      const next: InventoryState = {
        ...cur,
        consumables: { ...cur.consumables, [id]: have - n },
      };
      stateRef.current = next;
      setState(next);
      return true;
    },
    [],
  );

  const consumableCount = useCallback(
    (id: ConsumableId): number => state.consumables[id] ?? 0,
    [state],
  );

  const addSkillBook = useCallback((id: SkillBookId, n = 1) => {
    if (n <= 0) return;
    const cur = stateRef.current;
    const next: InventoryState = {
      ...cur,
      skillBooks: {
        ...(cur.skillBooks ?? {}),
        [id]: ((cur.skillBooks ?? {})[id] ?? 0) + n,
      },
    };
    stateRef.current = next;
    setState(next);
  }, []);

  const consumeSkillBook = useCallback((id: SkillBookId, n = 1): boolean => {
    const cur = stateRef.current;
    const have = (cur.skillBooks ?? {})[id] ?? 0;
    if (have < n) return false;
    const next: InventoryState = {
      ...cur,
      skillBooks: { ...(cur.skillBooks ?? {}), [id]: have - n },
    };
    stateRef.current = next;
    setState(next);
    return true;
  }, []);

  const skillBookCount = useCallback(
    (id: SkillBookId): number => (state.skillBooks ?? {})[id] ?? 0,
    [state],
  );

  // 룬 보유량 +n.
  const addRune = useCallback(
    (id: RuneId, grade: RuneGrade, n = 1) => {
      if (n <= 0) return;
      const cur = stateRef.current;
      const runes = cur.runes ?? {};
      const idMap = runes[id] ?? {};
      const next: InventoryState = {
        ...cur,
        runes: {
          ...runes,
          [id]: { ...idMap, [grade]: (idMap[grade] ?? 0) + n },
        },
      };
      stateRef.current = next;
      setState(next);
    },
    [],
  );

  // 룬 보유량 −n. 잔량 부족 시 false 반환(소비 안 함).
  const consumeRune = useCallback(
    (id: RuneId, grade: RuneGrade, n = 1): boolean => {
      const cur = stateRef.current;
      const have = cur.runes?.[id]?.[grade] ?? 0;
      if (have < n) return false;
      const runes = cur.runes ?? {};
      const idMap = { ...(runes[id] ?? {}) };
      const remaining = have - n;
      if (remaining > 0) idMap[grade] = remaining;
      else delete idMap[grade];
      const nextRunes = { ...runes };
      if (Object.keys(idMap).length > 0) nextRunes[id] = idMap;
      else delete nextRunes[id];
      const next: InventoryState = { ...cur, runes: nextRunes };
      stateRef.current = next;
      setState(next);
      return true;
    },
    [],
  );

  const runeCount = useCallback(
    (id: RuneId, grade: RuneGrade): number =>
      state.runes?.[id]?.[grade] ?? 0,
    [state],
  );

  const runeTotalCount = useCallback((): number => {
    let total = 0;
    for (const id of Object.keys(state.runes ?? {}) as RuneId[]) {
      const idMap = state.runes?.[id];
      if (!idMap) continue;
      for (const g of RUNE_GRADES) total += idMap[g] ?? 0;
    }
    return total;
  }, [state]);

  // 분해 — 대장간 분해실(PR E)의 진입점. 잉여 장비/재료를 갈아 마력가루로 환산한다.
  // 엔진은 crafting/disassemble.ts (순수 함수). 여기서는 현 state + 장착 슬롯을 받아
  // 계획을 세우고, 차단된 항목은 호출자에게 그대로 돌려준다 (UI 가 사유 표시).
  const disassemble = useCallback(
    (request: DisassembleRequest, slots: EquippedSlots): DisassemblePlan => {
      const cur = stateRef.current;
      const plan = planDisassemble(request, cur, slots);
      if (plan.totalDust > 0) {
        const next = applyDisassemble(plan, cur);
        stateRef.current = next;
        setState(next);
      }
      return plan;
    },
    [],
  );

  // 서버 권위 액션(상점 등)의 응답으로 받은 inventory.v2 값으로 통째 교체.
  // 이후 useRemotePatch 가 동일 값을 다시 PATCH 하지만 서버 version 과 409 재시도로 자가 수렴.
  const replaceFromSaved = useCallback((raw: unknown) => {
    const next = readInitial(raw);
    stateRef.current = next;
    setState(next);
  }, []);

  const potionMaxValue = potionMax(state.potionCapacityBonus ?? 0);

  return {
    state,
    hydrated: true,
    add,
    consume,
    count,
    totalPotions,
    addEquipment,
    consumeEquipment,
    addCraftedEquipment,
    consumeCraftedEquipment,
    craftedTotalCount,
    addDroppedEquipment,
    consumeDroppedEquipment,
    droppedTotalCount,
    addEquipmentInstance,
    consumeEquipmentInstance,
    findEquipmentInstance,
    depositToVault,
    withdrawFromVault,
    vaultCount,
    addMaterial,
    consumeMaterial,
    materialCount,
    addConsumable,
    consumeConsumable,
    consumableCount,
    addSkillBook,
    consumeSkillBook,
    skillBookCount,
    addRune,
    consumeRune,
    runeCount,
    runeTotalCount,
    addPotionCapacity,
    disassemble,
    replaceFromSaved,
    potionMax: potionMaxValue,
  };
}
