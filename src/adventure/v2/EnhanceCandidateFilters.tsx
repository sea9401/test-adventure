"use client";

import type { V2EquipDisplayTier } from "@/adventure/data/v2/v2Equipment";
import { ItemSearchInput } from "./ItemSearchInput";
import { EquipmentLockFilterButton } from "./inventory/EquipmentTab";
import type { EnhanceCandidateFilter } from "./v2EnhanceList";

// 대장간 장비 선택 목록 위 찾기 줄 — 이름 검색, 보유 티어 선택, 잠금 보기(건의 #791).
export function EnhanceCandidateFilters({
  filter,
  onChange,
  tierOptions,
  totalCount,
  lockedCount,
}: {
  filter: EnhanceCandidateFilter;
  onChange: (next: EnhanceCandidateFilter) => void;
  tierOptions: ReadonlyArray<{ tier: V2EquipDisplayTier; count: number }>;
  totalCount: number;
  lockedCount: number;
}) {
  return (
    <div className="space-y-2">
      <ItemSearchInput
        value={filter.search}
        onChange={(search) => onChange({ ...filter, search })}
        label="강화 장비 검색"
      />
      <div className="flex items-center gap-2">
        <select
          aria-label="강화 장비 티어"
          value={filter.tier}
          onChange={(event) => {
            const value = event.currentTarget.value;
            onChange({
              ...filter,
              tier: value === "all" ? "all" : (Number(value) as V2EquipDisplayTier),
            });
          }}
          className="min-h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white py-1 pl-2 pr-7 text-sm font-semibold text-zinc-800 [color-scheme:light] outline-none focus:ring-2 focus:ring-focus sm:min-h-9 sm:flex-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:[color-scheme:dark]"
        >
          <option value="all" className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
            모든 티어 ({totalCount})
          </option>
          {tierOptions.map(({ tier, count }) => (
            <option
              key={tier}
              value={tier}
              className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {tier}티어 ({count})
            </option>
          ))}
        </select>
        <EquipmentLockFilterButton
          value={filter.lock}
          onChange={(lock) => onChange({ ...filter, lock })}
          totalCount={totalCount}
          lockedCount={lockedCount}
        />
      </div>
    </div>
  );
}
