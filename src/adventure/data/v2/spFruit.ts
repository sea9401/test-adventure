// SP 열매 — 협동 보스가 드랍하는 거래 가능 소모성 아이템. 사용 시 SP 최대치 +1(영구·캐릭터당
//   사용 캡). docs: 협동 보스 리워크. 보스별 등급(I/II/III/IV)·캡 도달 시 사용 차단(거래만).
//   사용분만큼 SP 예산을 올린다(calcSpBudget 2번째 인자).
//
// 🔑 타입-only import 만 둔다(런타임 순환 회피): dungeonDrops 가 SP_FRUIT_MATERIALS(값)를
//    spread 하고, 여기선 V2Material/CoopBossKindId 를 타입으로만 참조.

import type { V2Material } from "./dungeonDrops";
import type { CoopBossKindId } from "./coopBosses";

export const SP_FRUIT_TIERS = [1, 2, 3, 4] as const;
export type SpFruitTier = (typeof SP_FRUIT_TIERS)[number];

type SpFruitDef = {
  /** 재료 id(인벤/거래소 키). */
  materialId: string;
  /** 표시 이름. */
  name: string;
  /** 캐릭터당 사용 가능 횟수(캡). 도달하면 더 못 쓰고 보유·거래만. */
  useCap: number;
  /** 이 등급을 드랍하는 협동 보스 kind. */
  bossKind: CoopBossKindId;
  /** 사용 1회당 SP 최대치 증가량. */
  spPerUse: number;
};

// 등급 → 정의. 사용 캡 I=3·II=3·III=5·IV=3 → 캐릭터당 최대 +14 SP(오너 확정).
export const SP_FRUIT: Record<SpFruitTier, SpFruitDef> = {
  1: { materialId: "sp_fruit_1", name: "SP 열매 I", useCap: 3, bossKind: "mountain_chief", spPerUse: 1 },
  2: { materialId: "sp_fruit_2", name: "SP 열매 II", useCap: 3, bossKind: "canyon_predator", spPerUse: 1 },
  3: { materialId: "sp_fruit_3", name: "SP 열매 III", useCap: 5, bossKind: "lake_sovereign", spPerUse: 1 },
  4: { materialId: "sp_fruit_4", name: "SP 열매 IV", useCap: 3, bossKind: "void_priest", spPerUse: 1 },
};

// V2_MATERIALS 에 spread 등재(거래소 자동 거래·NPC 비매 — V2_MATERIAL_SELL_PRICE 미등록).
export const SP_FRUIT_MATERIALS: Record<string, V2Material> = {
  sp_fruit_1: {
    id: "sp_fruit_1",
    name: "SP 열매 I",
    description:
      "산군을 토벌하고 얻는 결정. 사용하면 SP 최대치가 영구히 +1 오른다(캐릭터당 3회). 거래 가능.",
  },
  sp_fruit_2: {
    id: "sp_fruit_2",
    name: "SP 열매 II",
    description:
      "스콜피온 킹을 토벌하고 얻는 결정. 사용하면 SP 최대치가 영구히 +1 오른다(캐릭터당 3회). 거래 가능.",
  },
  sp_fruit_3: {
    id: "sp_fruit_3",
    name: "SP 열매 III",
    description:
      "호수의 괴물을 토벌하고 얻는 결정. 사용하면 SP 최대치가 영구히 +1 오른다(캐릭터당 5회). 거래 가능.",
  },
  sp_fruit_4: {
    id: "sp_fruit_4",
    name: "SP 열매 IV",
    description:
      "공허의 대사제를 토벌하고 얻는 결정. 사용하면 SP 최대치가 영구히 +1 오른다(캐릭터당 3회). 거래 가능.",
  },
};

// 캐릭터당 등급별 "사용 횟수"(character.v2.spFruitUsed). 캡 클램프.
export type SpFruitUsed = Record<SpFruitTier, number>;

// 저장값 파싱 — 기본 0·캡 클램프·불량입력 방어. 결정론.
export function parseSpFruitUsed(raw: unknown): SpFruitUsed {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = Object.fromEntries(SP_FRUIT_TIERS.map((t) => [t, 0])) as SpFruitUsed;
  for (const t of SP_FRUIT_TIERS) {
    const v = Number(r[t]);
    out[t] = Number.isFinite(v)
      ? Math.max(0, Math.min(SP_FRUIT[t].useCap, Math.floor(v)))
      : 0;
  }
  return out;
}

// 사용 횟수 → SP 최대치 보너스(각 등급 캡 클램프 후 × spPerUse 합). 미장착/없음=0. 최대 14.
export function spCapBonusFromFruits(used: SpFruitUsed | null | undefined): number {
  if (!used) return 0;
  let sum = 0;
  for (const t of SP_FRUIT_TIERS) {
    const u = Math.max(0, Math.min(SP_FRUIT[t].useCap, Math.floor(Number(used[t]) || 0)));
    sum += u * SP_FRUIT[t].spPerUse;
  }
  return sum;
}

// 저장 raw → SP 보너스(파싱+합산). calcSpBudget 콜러가 character.v2.spFruitUsed 로 호출.
export function spCapBonusFromRaw(raw: unknown): number {
  return spCapBonusFromFruits(parseSpFruitUsed(raw));
}

// 보스 kind → 드랍 등급(없으면 null).
export function fruitTierForBoss(bossKind: string): SpFruitTier | null {
  for (const t of SP_FRUIT_TIERS) {
    if (SP_FRUIT[t].bossKind === bossKind) return t;
  }
  return null;
}

// 재료 id → 등급(없으면 null·사용 라우트가 검증).
export function fruitTierForMaterial(materialId: string): SpFruitTier | null {
  for (const t of SP_FRUIT_TIERS) {
    if (SP_FRUIT[t].materialId === materialId) return t;
  }
  return null;
}
