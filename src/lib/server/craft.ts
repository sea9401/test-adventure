import "server-only";

// 제작 서버 lib — /api/craft 의 핵심 로직.
//
// 이전엔 page.tsx 의 handleCraft 가 클라에서 재료 차감 + 결과 지급을 직접 했다 — devtools 로
// 재료/결과 위조 가능 (audit-findings #1 후속). 서버 권위로 전환: 클라는 recipeId 만 보내고,
// 서버가 inventory.v2 / crafting.v2 를 잠그고 검증한 뒤 한 트랜잭션 안에서 적용. 제작 품질
// 등급(craftTier)도 서버에서 추첨(rollCraftTier)하므로 클라가 등급을 조작할 수 없다.
//
// 순수 계산(computeCraftOutcome)과 DB I/O(applyCraftAction)를 분리 — 전자는 단위 테스트 대상.

import { and, eq } from "drizzle-orm";
import { savesKv } from "@/db/schema";
import { upsertSave, type DbExecutor } from "@/lib/server/savesKv";
import { potionMax } from "@/adventure/data/potions";
import { getRecipeById, recipeHasVariance } from "@/adventure/data/recipes";
import { rollCraftTier, type CraftTier } from "@/adventure/data/craftQuality";
import {
  CRAFT_BATCH_MAX,
  type CraftOutcome,
  type CraftResult,
  type EquipPicks,
} from "@/adventure/crafting/types";
import {
  ENHANCEABLE_ITEM_IDS,
  ENHANCE_INITIAL_ATTEMPTS,
} from "@/adventure/character/enhancement";
import {
  generateInstanceId,
  normalizeInstances,
  type EquipmentInstance,
} from "@/adventure/inventory/equipmentInstances";
import type { ItemId } from "@/adventure/data/items";

export type { CraftOutcome, CraftResult, EquipPicks };

// 호출부(route)가 HTTP 400 으로 매핑 — 모두 "요청이 게임 규칙 위반" 케이스.
export class CraftError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "CraftError";
  }
}

// 가루 공정 3 종은 모든 모험가가 기본으로 아는 공정 — 클라이언트의 useCrafting 도
// readInitial 에서 known 에 자동 보강한다. 서버도 동일하게 보강해 영속 상태가 아직
// 보강 전인 레거시 세이브가 "not_learned" 로 거절되지 않게 한다.
const AUTO_KNOWN_DUST_RECIPES: readonly string[] = [
  "potion_heal_s_dust",
  "potion_heal_m_dust",
  "potion_heal_l_dust",
];

function withAutoKnownDustRecipes(known: readonly string[]): string[] {
  const out = [...known];
  for (const id of AUTO_KNOWN_DUST_RECIPES) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

type CountMap = Record<string, number>;
// 등급별 인스턴스 맵 — itemId → (등급키 → 개수). 제작산(craftedEquipment, 키 "-2".."2")과
// 드랍산(droppedEquipment, 키 "1"|"2")이 같은 모양.
type GradedMap = Record<string, Record<string, number>>;

// 낮은 등급부터 소비할 때의 순서.
const NON_ZERO_TIERS = ["-2", "-1", "1", "2"] as const;
const NON_ZERO_DROP_QUALITIES = ["1", "2"] as const;

// 한 인스턴스의 결과 등급 bias — 빼어난(드랍 2) / 걸작(제작 +2) = 3.0, 정교한(드랍 1) / 고급(제작 +1) = 2.0,
// 그 외(기본·하급·불량·일반) = 1.0. 음수 제작 등급은 "상등품" 아니므로 보정 없음.
function instanceTagBias(kind: "crafted" | "dropped", key: string): number {
  if (kind === "crafted") {
    if (key === "2") return 3;
    if (key === "1") return 2;
    return 1; // -2, -1
  }
  // dropped
  if (key === "2") return 3;
  if (key === "1") return 2;
  return 1;
}

export type CraftComputeInput = {
  potions: CountMap;
  materials: CountMap;
  equipment: CountMap;
  craftedEquipment: GradedMap;
  /** 드랍 고품질 인스턴스. equip 재료 소비 시 equipment[] → craftedEquipment 다음 순서로 빠진다. 미동봉이면 빈 맵. */
  droppedEquipment?: GradedMap;
  /** 인스턴스 기반 장비 (별빛 재단 무구). 미동봉이면 빈 배열. */
  equipmentInstances?: EquipmentInstance[];
  potionCapacityBonus: number;
  known: string[];
};

export type CraftComputeResult = {
  potions: CountMap;
  materials: CountMap;
  equipment: CountMap;
  craftedEquipment: GradedMap;
  droppedEquipment: GradedMap;
  equipmentInstances: EquipmentInstance[];
  // 배치 제작 시 호출 수량만큼 채워지고 단일 제작이면 길이 1. 등급 추첨은 회마다 독립.
  results: CraftResult[];
};

export type CraftComputeOptions = {
  /** 한 번에 만들 수량(1 ≤ q ≤ CRAFT_BATCH_MAX). 미지정 = 1. */
  quantity?: number;
  /** 등급 추첨 RNG 주입(테스트용). 미지정 = Math.random. */
  rng?: () => number;
  /** "고급 재료 사용" opt-in. 명시된 itemId 만 picks 대로 차감 + 결과 등급 bias 적용. */
  equipPicks?: EquipPicks;
  /**
   * 이 레시피의 첫 제작 — 배치 첫 회만 tier ≥ 0 으로 클램프(불량/하급 차단, 고급/걸작은 유지).
   * 처음 만들어 보는 경험을 보호한다. 두 번째 회부터는 평소 분포.
   */
  firstCraft?: boolean;
};

function cloneGraded(src: GradedMap): GradedMap {
  const out: GradedMap = {};
  for (const [k, v] of Object.entries(src)) out[k] = { ...v };
  return out;
}

function gradedTotal(map: GradedMap, itemId: string): number {
  const grades = map[itemId];
  if (!grades) return 0;
  let total = 0;
  for (const v of Object.values(grades)) total += v ?? 0;
  return total;
}

// equip 재료 한 종을 count 개 소비 — equipment[] → graded 맵의 keyOrder 순서로. 부족하면 남은 수 반환.
function drainGraded(
  map: GradedMap,
  itemId: string,
  keyOrder: readonly string[],
  remaining: number,
): number {
  if (remaining <= 0) return 0;
  const grades = map[itemId] ?? {};
  for (const k of keyOrder) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, grades[k] ?? 0);
    if (take > 0) {
      grades[k] = (grades[k] ?? 0) - take;
      remaining -= take;
    }
  }
  map[itemId] = grades;
  return remaining;
}

function pickTotal(pick: EquipPicks[string]): number {
  let sum = pick.base ?? 0;
  for (const n of Object.values(pick.crafted ?? {})) sum += n;
  for (const n of Object.values(pick.dropped ?? {})) sum += n;
  return sum;
}

// 모든 카운트가 비음수 정수인지 검증. 음수가 섞이면 sum 검사를 통과한 뒤 차감 시
// inventory bucket 이 +로 증가하는 위조 공격이 가능하므로 사전에 막는다.
function isValidPick(pick: EquipPicks[string]): boolean {
  const checks: (number | undefined)[] = [
    pick.base,
    ...Object.values(pick.crafted ?? {}),
    ...Object.values(pick.dropped ?? {}),
  ];
  for (const n of checks) {
    if (n === undefined) continue;
    if (!Number.isInteger(n) || n < 0) return false;
  }
  return true;
}

// picks 의 모든 비-기본 인스턴스 → bias 값을 강한 등급부터 정렬해 회별 1 개씩 배정.
// 한 회당 한 인스턴스 — 회 i 의 bias 는 i 번째 인스턴스(0 등급 제외)의 bias. 부족하면 1.
function computeBiasPerRound(
  picks: EquipPicks,
  quantity: number,
): number[] {
  const biases: number[] = [];
  for (const pick of Object.values(picks)) {
    for (const [k, n] of Object.entries(pick.crafted ?? {})) {
      const b = instanceTagBias("crafted", k);
      if (b > 1) for (let i = 0; i < n; i++) biases.push(b);
    }
    for (const [k, n] of Object.entries(pick.dropped ?? {})) {
      const b = instanceTagBias("dropped", k);
      if (b > 1) for (let i = 0; i < n; i++) biases.push(b);
    }
  }
  // 강한 bias 부터.
  biases.sort((a, b) => b - a);
  const out: number[] = new Array(quantity).fill(1);
  for (let i = 0; i < quantity && i < biases.length; i++) out[i] = biases[i];
  return out;
}

function cleanupGraded(map: GradedMap): void {
  for (const k of Object.keys(map)) {
    const grades = map[k];
    for (const g of Object.keys(grades)) if (!grades[g]) delete grades[g];
    if (Object.keys(grades).length === 0) delete map[k];
  }
}

// 순수 함수 — savesKv 읽은 값으로 새 상태 + results 를 계산. 위반 시 CraftError.
// quantity 는 1 이상 CRAFT_BATCH_MAX 이하 정수. 재료/포션 한도는 quantity 배로 한 번에 검사하고
// 만족 못 하면 즉시 throw (all-or-nothing). 만족하면 재료를 quantity 배 차감하고 결과는 N 회
// 적용한다. 등급 변동 레시피는 매 회 rollCraftTier 를 다시 굴리므로 results 안에 서로 다른 tier
// 가 섞일 수 있다 — 클라가 results 를 그대로 알림에 풀어 "걸작/일반/불량" 을 개별로 보여 준다.
export function computeCraftOutcome(
  input: CraftComputeInput,
  recipeId: string,
  options: CraftComputeOptions = {},
): CraftComputeResult {
  const quantity = options.quantity ?? 1;
  const rng = options.rng ?? Math.random;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > CRAFT_BATCH_MAX) {
    throw new CraftError("invalid_quantity");
  }

  const recipe = getRecipeById(recipeId);
  if (!recipe) throw new CraftError("unknown_recipe");
  if (!input.known.includes(recipe.id)) throw new CraftError("not_learned");

  const potions = { ...input.potions };
  const materials = { ...input.materials };
  const equipment = { ...input.equipment };
  const crafted = cloneGraded(input.craftedEquipment);
  const dropped = cloneGraded(input.droppedEquipment ?? {});
  const instances: EquipmentInstance[] = [...(input.equipmentInstances ?? [])];
  const equipPicks = options.equipPicks ?? {};

  // 1) 재료 충족 검사 — quantity 배.
  for (const ing of recipe.ingredients) {
    const need = ing.count * quantity;
    if (ing.kind === "material") {
      if ((materials[ing.materialId] ?? 0) < need)
        throw new CraftError("missing_material");
    } else {
      const pick = equipPicks[ing.itemId];
      if (pick) {
        // picks 명시 — 합계가 정확히 need 와 같아야 한다. 음수/비정수 차단 선행.
        if (!isValidPick(pick)) throw new CraftError("invalid_picks");
        const sum = pickTotal(pick);
        if (sum !== need) throw new CraftError("invalid_picks");
        if ((pick.base ?? 0) > (equipment[ing.itemId] ?? 0))
          throw new CraftError("missing_ingredient");
        for (const [k, n] of Object.entries(pick.crafted ?? {})) {
          if ((crafted[ing.itemId]?.[k] ?? 0) < n)
            throw new CraftError("missing_ingredient");
        }
        for (const [k, n] of Object.entries(pick.dropped ?? {})) {
          if ((dropped[ing.itemId]?.[k] ?? 0) < n)
            throw new CraftError("missing_ingredient");
        }
      } else {
        const have =
          (equipment[ing.itemId] ?? 0) +
          gradedTotal(crafted, ing.itemId) +
          gradedTotal(dropped, ing.itemId);
        if (have < need) throw new CraftError("missing_ingredient");
      }
    }
  }

  // 2) 포션 결과 한도 검사 (all-or-nothing, quantity 배 생산 기준)
  if (recipe.result.kind === "potion") {
    const have = potions[recipe.result.potionId] ?? 0;
    const totalProduce = recipe.result.quantity * quantity;
    if (have + totalProduce > potionMax(input.potionCapacityBonus))
      throw new CraftError("potion_full");
  }

  // 3) 재료 차감 — quantity 배.
  for (const ing of recipe.ingredients) {
    const need = ing.count * quantity;
    if (ing.kind === "material") {
      materials[ing.materialId] = (materials[ing.materialId] ?? 0) - need;
    } else {
      const pick = equipPicks[ing.itemId];
      if (pick) {
        // picks 대로 정확히 차감 — 자동 fallback 비활성.
        const fromEquip = pick.base ?? 0;
        equipment[ing.itemId] = (equipment[ing.itemId] ?? 0) - fromEquip;
        for (const [k, n] of Object.entries(pick.crafted ?? {})) {
          const grades = crafted[ing.itemId] ?? {};
          grades[k] = (grades[k] ?? 0) - n;
          crafted[ing.itemId] = grades;
        }
        for (const [k, n] of Object.entries(pick.dropped ?? {})) {
          const grades = dropped[ing.itemId] ?? {};
          grades[k] = (grades[k] ?? 0) - n;
          dropped[ing.itemId] = grades;
        }
      } else {
        // 기본(equipment[]) 카운트 먼저, 모자라면 제작산 낮은 등급부터, 그래도 모자라면 드랍 고품질.
        let remaining = need;
        const fromEquip = Math.min(remaining, equipment[ing.itemId] ?? 0);
        equipment[ing.itemId] = (equipment[ing.itemId] ?? 0) - fromEquip;
        remaining -= fromEquip;
        remaining = drainGraded(crafted, ing.itemId, NON_ZERO_TIERS, remaining);
        remaining = drainGraded(
          dropped,
          ing.itemId,
          NON_ZERO_DROP_QUALITIES,
          remaining,
        );
      }
    }
  }

  // 회별 bias 미리 계산 — picks 의 모든 비-기본 인스턴스를 강한 등급부터 회 0,1,..,N-1 에 1 개씩 배정.
  // 회 i 는 i 번째 인스턴스의 bias 를 받음. 인스턴스가 회보다 적으면 나머지 회는 bias=1.
  const biasPerRound = computeBiasPerRound(equipPicks, quantity);

  // 4) 결과 적용 — quantity 회. 등급은 매 회 독립 추첨.
  const results: CraftResult[] = [];
  for (let i = 0; i < quantity; i++) {
    if (recipe.result.kind === "equipment") {
      const itemId = recipe.result.itemId;
      let tier: CraftTier = recipeHasVariance(recipe)
        ? rollCraftTier(rng, biasPerRound[i] ?? 1)
        : 0;
      // 첫 제작 보호 — 배치 첫 회에 한해 음수 등급 차단(불량/하급 → 일반). 양수는 그대로 살림.
      if (options.firstCraft && i === 0 && tier < 0) tier = 0;
      // 강화 가능 장비(별빛 재단 무구) — 스택 칸이 아닌 인스턴스 풀로. craftTier 도 같이 박힌다.
      if (ENHANCEABLE_ITEM_IDS.has(itemId as ItemId)) {
        instances.push({
          instanceId: generateInstanceId(),
          itemId,
          craftTier: tier === 0 ? undefined : tier,
          enhancementLevel: 0,
          remainingAttempts: ENHANCE_INITIAL_ATTEMPTS,
        });
      } else if (tier === 0) {
        equipment[itemId] = (equipment[itemId] ?? 0) + 1;
      } else {
        const tierMap = crafted[itemId] ?? {};
        const key = String(tier);
        tierMap[key] = (tierMap[key] ?? 0) + 1;
        crafted[itemId] = tierMap;
      }
      results.push({ kind: "equipment", itemId, tier });
    } else {
      const potionId = recipe.result.potionId;
      potions[potionId] = (potions[potionId] ?? 0) + recipe.result.quantity;
      results.push({
        kind: "potion",
        potionId,
        quantity: recipe.result.quantity,
      });
    }
  }

  // 0/빈 항목 정리
  for (const k of Object.keys(materials)) if (!materials[k]) delete materials[k];
  for (const k of Object.keys(equipment)) if (!equipment[k]) delete equipment[k];
  cleanupGraded(crafted);
  cleanupGraded(dropped);

  return {
    potions,
    materials,
    equipment,
    craftedEquipment: crafted,
    droppedEquipment: dropped,
    equipmentInstances: instances,
    results,
  };
}

// ─────────────────────────────────────────────────────────────────────

type SavedInventory = {
  potions?: CountMap;
  materials?: CountMap;
  equipment?: CountMap;
  craftedEquipment?: GradedMap;
  droppedEquipment?: GradedMap;
  equipmentInstances?: unknown;
  consumables?: CountMap;
  potionCapacityBonus?: number;
  [k: string]: unknown;
};
type SavedCrafting = {
  known?: string[];
  crafted?: string[];
  [k: string]: unknown;
};

async function readKv<T>(
  tx: DbExecutor,
  userId: string,
  key: string,
): Promise<T | null> {
  const rows = await tx
    .select()
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, key)))
    .for("update");
  return (rows[0]?.value as T | undefined) ?? null;
}

// 트랜잭션 안에서 호출. inventory.v2 / crafting.v2 를 for-update 로 잠그고 갱신.
export async function applyCraftAction(
  tx: DbExecutor,
  userId: string,
  recipeId: string,
  quantity: number = 1,
  equipPicks?: EquipPicks,
): Promise<CraftOutcome> {
  const inv = (await readKv<SavedInventory>(tx, userId, "inventory.v2")) ?? {};
  const craftingState =
    (await readKv<SavedCrafting>(tx, userId, "crafting.v2")) ?? {};

  const craftedList = Array.isArray(craftingState.crafted)
    ? craftingState.crafted
    : [];
  const firstCraft = !craftedList.includes(recipeId);

  const out = computeCraftOutcome(
    {
      potions: { ...(inv.potions ?? {}) },
      materials: { ...(inv.materials ?? {}) },
      equipment: { ...(inv.equipment ?? {}) },
      craftedEquipment: inv.craftedEquipment ?? {},
      droppedEquipment: inv.droppedEquipment ?? {},
      equipmentInstances: normalizeInstances(inv.equipmentInstances),
      potionCapacityBonus: inv.potionCapacityBonus ?? 0,
      // 가루 공정 3 종은 기본기 — 서버 권위 검증에서도 자동 학습으로 본다
      // (클라이언트는 useCrafting.readInitial 가 known 에 보강. 영속 상태가
      //  아직 보강 전이라도 서버가 거절하지 않도록 한다.)
      known: withAutoKnownDustRecipes(
        Array.isArray(craftingState.known) ? craftingState.known : [],
      ),
    },
    recipeId,
    { quantity, equipPicks, firstCraft },
  );

  const newInventory: SavedInventory = {
    ...inv,
    potions: out.potions,
    materials: out.materials,
    equipment: out.equipment,
    craftedEquipment: out.craftedEquipment,
    droppedEquipment: out.droppedEquipment,
    equipmentInstances: out.equipmentInstances,
  };

  const newCrafting: SavedCrafting = firstCraft
    ? { ...craftingState, crafted: [...craftedList, recipeId] }
    : craftingState;

  await upsertSave(tx, userId, "inventory.v2", newInventory);
  if (newCrafting !== craftingState)
    await upsertSave(tx, userId, "crafting.v2", newCrafting);

  return { inventory: newInventory, crafting: newCrafting, results: out.results };
}
