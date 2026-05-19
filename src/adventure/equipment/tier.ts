import { useCallback, useState } from "react";
import { ITEMS, type EquipItem, type EquipTier, type ItemId } from "@/adventure/data/items";

// 진행 구간 5단계 — 인벤·도감·대장간이 공통으로 쓰는 그룹 키.
// 미지정 장비는 1 ("입문") 로 fallback — 초반 잡템·tier 안 적은 신규 장비가 여기로 모임.
export const EQUIP_TIER_FALLBACK: EquipTier = 1;

export type EquipTierMeta = {
  tier: EquipTier;
  // 헤더 한글명.
  label: string;
  // 헤더 옆 부제 — 대표 지역/레벨대 힌트.
  hint: string;
};

export const EQUIP_TIER_METAS: readonly EquipTierMeta[] = [
  { tier: 1, label: "입문", hint: "시작 마을 ~ 디올라 · 1~15" },
  { tier: 2, label: "정착", hint: "산기슭 ~ 운향 · 15~30" },
  { tier: 3, label: "다리 구간", hint: "운저 평원 ~ 잿빛 협로 · 30~45" },
  { tier: 4, label: "봉황·화산", hint: "봉황령 ~ 화산 · 45~60" },
  { tier: 5, label: "엔드", hint: "천공 ~ 만렙 후 · 60+" },
  { tier: 6, label: "별빛", hint: "별빛 사냥터 · 100+" },
] as const;

// 장비의 tier — items.ts 에 명시된 값, 없으면 fallback.
// id 가 ITEMS 에 없으면 (orphan / 동적 생성 등) 도 fallback.
export function getItemTier(idOrItem: ItemId | EquipItem | null | undefined): EquipTier {
  if (!idOrItem) return EQUIP_TIER_FALLBACK;
  const item: EquipItem | undefined =
    typeof idOrItem === "string"
      ? (ITEMS[idOrItem as keyof typeof ITEMS] as EquipItem | undefined)
      : idOrItem;
  return item?.tier ?? EQUIP_TIER_FALLBACK;
}

// 검색 쿼리(부분 일치) — 공백 trim, 소문자/한글 그대로 substring.
// 빈 문자열이면 항상 true(필터 비활성).
export function matchesEquipQuery(item: EquipItem | null | undefined, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (!item) return false;
  const hay = `${item.name} ${item.description ?? ""}`;
  return hay.toLowerCase().includes(q.toLowerCase());
}

// 인벤·도감·대장간 공용 — tier 그룹 접기/펴기 토글 상태.
// 기본은 모두 접힘. 검색 활성 시(query.length > 0) 모든 가시 tier 가 자동 펼침 — UI 측에서 OR 처리.
// 같은 화면 안의 다른 탭(슬롯/카테고리) 으로 옮겨도 토글이 유지되도록 컴포넌트 마운트 동안만 가짐.
export function useTierToggle() {
  const [expanded, setExpanded] = useState<ReadonlySet<EquipTier>>(new Set());
  const toggle = useCallback((tier: EquipTier) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  }, []);
  // 멱등 펼침 — 이미 펼쳐져 있으면 no-op. 슬롯 진입 시 "장착중 tier 자동 펼침" 같은 시드용.
  const expand = useCallback((tier: EquipTier) => {
    setExpanded((prev) => {
      if (prev.has(tier)) return prev;
      const next = new Set(prev);
      next.add(tier);
      return next;
    });
  }, []);
  const isExpanded = useCallback(
    (tier: EquipTier) => expanded.has(tier),
    [expanded],
  );
  return { isExpanded, toggle, expand };
}

// 임의 entry 배열을 tier 별로 묶어 [{ tier, meta, entries }] 로 반환.
// 빈 tier 는 생략. tier 오름차순 정렬.
export function groupByTier<T>(
  entries: readonly T[],
  getTier: (entry: T) => EquipTier,
): Array<{ tier: EquipTier; meta: EquipTierMeta; entries: T[] }> {
  const buckets = new Map<EquipTier, T[]>();
  for (const e of entries) {
    const t = getTier(e);
    let arr = buckets.get(t);
    if (!arr) {
      arr = [];
      buckets.set(t, arr);
    }
    arr.push(e);
  }
  return EQUIP_TIER_METAS.flatMap((meta) => {
    const arr = buckets.get(meta.tier);
    if (!arr || arr.length === 0) return [];
    return [{ tier: meta.tier, meta, entries: arr }];
  });
}
