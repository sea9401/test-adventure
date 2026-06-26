// v2 거래소 공용 — 타입·시세/시가 헬퍼·시세줄/가격입력 leaf 컴포넌트.
//   V2MarketplaceView(코디네이터)와 판매 탭 컴포넌트들이 공유(중복 방지).

import {
  V2_EQUIPMENT,
  effectiveStats,
  v2EquipStatRows,
  type V2Equipment,
  type V2EquipRoll,
} from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";
import { type V2EnhanceState } from "@/adventure/data/v2/v2Enhance";
import { NumberInput } from "@/components/ui/NumberInput";

// 판매세는 서버 권위 — 여기 0.05 는 순수령 미리보기용(표시 advisory).
export const TAX_RATE_DISPLAY = 0.05;
export const netPreview = (price: number) =>
  Math.floor(price * (1 - TAX_RATE_DISPLAY));

// 시세 집계(/api/v2/marketplace/prices) — itemId 별 최근 판매 통계.
export type PriceStat = { n: number; avg: number; min: number; max: number };

export type Listing = {
  id: number;
  sellerId: string;
  sellerName: string;
  kind: "equip" | "material" | "consumable";
  itemId: string;
  itemName: string;
  quantity: number;
  price: number;
  instancePayload: unknown;
  createdAt: string;
};

// 페이지네이션 결과 중 탭 컴포넌트가 쓰는 부분집합(usePagination 반환과 구조 호환).
export type MarketplacePager<T> = {
  page: number;
  pageCount: number;
  pageItems: T[];
  setPage: (n: number) => void;
};

// 장비 스탯 한 줄(개체 굴림 반영) — 위력 + 슬롯 옵션. V2InventoryView 의 cardStatLine 과 동형
//   (무기 element 는 폐지 정책으로 항상 neutral → 표기 생략). 구매자가 무엇을 사는지 보이게.
function equipStatLine(item: V2Equipment, roll?: V2EquipRoll): string {
  const eff = effectiveStats(item, roll);
  const parts = [`위력 ${eff.power}`, `무게 ${eff.weight}`];
  for (const row of v2EquipStatRows(item, roll)) {
    if (row.label === "위력" || row.label === "무게") continue;
    parts.push(`${row.label} ${row.value}`);
  }
  return parts.join(" · ");
}

// 장비 매물/개체의 굴림% + 스탯줄 — itemId(카탈로그) + roll(개체 편차).
export function equipDetail(
  itemId: string,
  roll: V2EquipRoll | undefined,
  enhance?: V2EnhanceState,
) {
  const item = V2_EQUIPMENT[itemId as keyof typeof V2_EQUIPMENT];
  if (!item) return null;
  return {
    pct: rollQualityPct(item, roll),
    line: equipStatLine(item, roll),
    enhance,
  };
}

// 시세 한 줄 — 최근 거래가 참고. 기록 없으면 표시 안 함.
export function PriceRefLine({ stat }: { stat?: PriceStat }) {
  if (!stat || stat.n <= 0) return null;
  const range =
    stat.min === stat.max
      ? ""
      : ` · ${stat.min.toLocaleString()}~${stat.max.toLocaleString()}`;
  return (
    <span className="text-[11px] text-sky-600 dark:text-sky-400">
      시세 평균 {stat.avg.toLocaleString()}골드 ({stat.n}건{range})
    </span>
  );
}

export function PriceInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <NumberInput
      placeholder="가격"
      value={value}
      onValueChange={onChange}
      className="w-24 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
    />
  );
}
