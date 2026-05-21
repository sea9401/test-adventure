// 별빛 고리 — 잊힌 봉인(6막 협동 레이드) legend 랜덤 롤 장신구.
//
// {힘·활력·민첩·속도·행운} 중 서로 다른 2개가 붙고, 각 수치는 1~20 랜덤. 강화·부여 없음 —
// 랜덤 롤 그 자체가 파밍 동력("원하는 조합·수치 나올 때까지"). 무기·방어구가 종류 확장으로
// 선택지를 주는 것과 대비되는, 운+반복 축.
//
// 드랍마다 다른 결과라 인스턴스(자루별 고유)로 저장된다 — 롤 생성은 서버 권위. 이 모듈은
// 순수 로직(롤 + 표시용 변환)만 담아 단위 테스트가 쉽게.

import { ITEMS, type EquipBonus } from "@/adventure/data/items";
import type { EquippedItem } from "@/adventure/character/types";

export const STARLIT_RING_ITEM_ID = "starlit_ring" as const;

/** itemId 가 별빛 고리(롤 인스턴스)인지 — equip/instance 분기용. */
export function isStarlitRing(id: string): boolean {
  return id === STARLIT_RING_ITEM_ID;
}

// 롤 대상 스탯 — EquipBonus 키와 동일. atk/def 는 제외(베이스 스탯만).
export const STARLIT_RING_STAT_KEYS = [
  "str",
  "vit",
  "dex",
  "spd",
  "luk",
] as const;
export type StarlitRingStat = (typeof STARLIT_RING_STAT_KEYS)[number];

/** 붙는 옵션 개수(서로 다른 스탯). */
export const STARLIT_RING_OPTION_COUNT = 2;
/** 옵션당 수치 상한 (1 ~ 이 값). */
export const STARLIT_RING_OPTION_MAX = 20;

const STAT_LABEL: Record<StarlitRingStat, string> = {
  str: "힘",
  vit: "활력",
  dex: "민첩",
  spd: "속도",
  luk: "행운",
};

/**
 * 별빛 고리 1회 롤 — 서로 다른 2개 스탯 × 각 1~20.
 * rand 는 [0,1) 난수 주입(테스트). 통상은 서버에서 생성(권위)하고 클라는 받기만 한다.
 * 반환은 EquipBonus (그 2개 스탯 키만 채워짐).
 */
export function rollStarlitRingBonus(rand: () => number = Math.random): EquipBonus {
  // 부분 Fisher-Yates 로 서로 다른 2개 스탯 추출.
  const pool: StarlitRingStat[] = [...STARLIT_RING_STAT_KEYS];
  const picked: StarlitRingStat[] = [];
  for (let i = 0; i < STARLIT_RING_OPTION_COUNT; i++) {
    const j = i + Math.floor(rand() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    picked.push(pool[i]);
  }
  const bonus: EquipBonus = {};
  for (const stat of picked) {
    bonus[stat] = 1 + Math.floor(rand() * STARLIT_RING_OPTION_MAX); // 1..MAX
  }
  return bonus;
}

/** 롤된 bonus → 표시용 stats 배열 ({label, value}). 강화/부여가 없어 그대로 노출. */
export function starlitRingStatsFromBonus(
  bonus: EquipBonus,
): { label: string; value: string }[] {
  return STARLIT_RING_STAT_KEYS.filter((k) => (bonus[k] ?? 0) > 0).map((k) => ({
    label: STAT_LABEL[k],
    value: `+${bonus[k]}`,
  }));
}

/**
 * 인스턴스(rolledBonus + instanceId)에서 장착용 EquippedItem 생성.
 * 강화·부여가 없으니 base 정의 + 롤 bonus 그대로 — stats 도 롤에서 재생성.
 * rolledBonus 를 EquippedItem 에도 박아 회수→풀 복원·재계산에 보존한다.
 */
export function resolveStarlitRing(
  rolledBonus: EquipBonus,
  instanceId: string,
): EquippedItem {
  return {
    ...ITEMS[STARLIT_RING_ITEM_ID],
    bonus: { ...rolledBonus },
    stats: starlitRingStatsFromBonus(rolledBonus),
    instanceId,
    rolledBonus: { ...rolledBonus },
  };
}

/** 롤 bonus 유효성 — 서버/로드 검증용. 정확히 N개, 각 1~MAX, 키는 허용 스탯. */
export function isValidStarlitRingBonus(bonus: unknown): bonus is EquipBonus {
  if (!bonus || typeof bonus !== "object") return false;
  const entries = Object.entries(bonus as Record<string, unknown>);
  if (entries.length !== STARLIT_RING_OPTION_COUNT) return false;
  return entries.every(
    ([k, v]) =>
      (STARLIT_RING_STAT_KEYS as readonly string[]).includes(k) &&
      typeof v === "number" &&
      Number.isInteger(v) &&
      v >= 1 &&
      v <= STARLIT_RING_OPTION_MAX,
  );
}
