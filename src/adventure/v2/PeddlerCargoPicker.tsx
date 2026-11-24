"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { cookingQualityName, type CookingQuality } from "./cooking/foodShared";
import { ItemSearchInput } from "./ItemSearchInput";
import {
  filterPeddlerCargo,
  peddlerCargoDishQualities,
  peddlerCargoPayload,
  peddlerMaxLoadable,
  peddlerSelectionTotals,
  type PeddlerCargoView,
  type PeddlerRouteView,
} from "./peddlerClient";
import {
  PEDDLER_CARGO_GROUP_NAMES,
  PEDDLER_CARGO_KIND_LIMIT,
  PEDDLER_DISPATCH_HOURS,
  PEDDLER_MIN_CARGO_POINTS,
  peddlerTokenReward,
  type PeddlerCargoGroup,
  type PeddlerDispatchHours,
} from "./peddlerRules";

const SELECT_CLASS =
  "min-h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
const SELECT_LABEL_CLASS = "flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300";

const HOUR_OPTIONS = PEDDLER_DISPATCH_HOURS.map((hours) => ({ key: String(hours), label: `${hours}시간` }));

function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
}

// 교역로 카드 안에서 여는 짐 싣기. 파견 시간과 품목 수량을 고르고 출발한다.
export function PeddlerCargoPicker({
  route,
  cargo,
  tokenCarry,
  busy,
  onDispatch,
  onClose,
}: {
  route: PeddlerRouteView;
  cargo: readonly PeddlerCargoView[];
  tokenCarry: number;
  busy: boolean;
  onDispatch: (hours: PeddlerDispatchHours, cargo: Record<string, number>) => void;
  onClose: () => void;
}) {
  const [hours, setHours] = useState<PeddlerDispatchHours>(8);
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [group, setGroup] = useState<PeddlerCargoGroup | "all">("all");
  const [quality, setQuality] = useState<CookingQuality | "all">("all");
  const [query, setQuery] = useState("");

  const preferredIds = route.preferred.map((item) => item.id);
  const totals = peddlerSelectionTotals(cargo, selection, preferredIds);
  const tokens = peddlerTokenReward({ ...totals, hours, carry: tokenCarry }).tokens;
  const over = totals.points > route.capacity;
  const tooManyKinds = totals.kinds > PEDDLER_CARGO_KIND_LIMIT;
  const canDepart = totals.points >= PEDDLER_MIN_CARGO_POINTS && !over && !tooManyKinds;

  const groups = [...new Set(cargo.map((item) => item.group))];
  // 품질이 두 가지 이상일 때만 고르게 한다. 요리가 안 보이는 계열을 고른 동안에는 숨긴다.
  const qualities = peddlerCargoDishQualities(cargo);
  const showQuality = qualities.length > 1 && (group === "all" || group === "dish");
  const visible = filterPeddlerCargo(cargo, { group, quality: showQuality ? quality : "all", query });
  const setQuantity = (item: PeddlerCargoView, quantity: number) =>
    setSelection((current) => ({
      ...current,
      [item.id]: Math.max(0, Math.min(item.held, Math.floor(quantity) || 0)),
    }));

  return (
    <div className={`${SURFACE_INSET} mt-3 space-y-3 p-3`}>
      <SegmentedControl
        ariaLabel="파견 시간"
        options={HOUR_OPTIONS}
        value={String(hours)}
        onChange={(key) => setHours(Number(key) as PeddlerDispatchHours)}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 text-sm tabular-nums">
          <p
            className={`font-semibold ${
              over ? "text-rose-600 dark:text-rose-400" : "text-zinc-900 dark:text-zinc-100"
            }`}
          >
            적재 {formatNumber(totals.points)} / {formatNumber(route.capacity)}점
          </p>
          <p className="text-zinc-700 dark:text-zinc-200">받을 증표 {formatNumber(tokens)}개</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button
            variant="primary"
            disabled={!canDepart}
            loading={busy}
            onClick={() => onDispatch(hours, peddlerCargoPayload(cargo, selection))}
          >
            출발
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
      {tooManyKinds ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">
          한 번에 {PEDDLER_CARGO_KIND_LIMIT}종까지 실을 수 있습니다.
        </p>
      ) : null}

      {cargo.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          실을 수 있는 산물이 없습니다. 원목, 광석, 가공재, 작물, 축산물, 어획물, 요리를 실을 수 있습니다.
        </p>
      ) : (
        <>
          <ItemSearchInput value={query} onChange={setQuery} label="실을 품목 검색" placeholder="품목 이름 검색" />
          {groups.length > 1 || showQuality ? (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {groups.length > 1 ? (
                <label className={SELECT_LABEL_CLASS}>
                  계열
                  <select
                    value={group}
                    onChange={(event) => setGroup(event.target.value as PeddlerCargoGroup | "all")}
                    className={SELECT_CLASS}
                  >
                    <option value="all">전체</option>
                    {groups.map((id) => (
                      <option key={id} value={id}>
                        {PEDDLER_CARGO_GROUP_NAMES[id]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {showQuality ? (
                <label className={SELECT_LABEL_CLASS}>
                  요리 품질
                  <select
                    value={quality}
                    onChange={(event) => setQuality(event.target.value as CookingQuality | "all")}
                    className={SELECT_CLASS}
                  >
                    <option value="all">전체</option>
                    {qualities.map((id) => (
                      <option key={id} value={id}>
                        {cookingQualityName(id)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
          {visible.length === 0 ? (
            <p className="py-2 text-sm text-zinc-600 dark:text-zinc-300">조건에 맞는 품목이 없습니다.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
              {visible.map((item) => (
                <li key={item.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {item.name}
                      {preferredIds.includes(item.id) ? (
                        <span className="ml-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">우대</span>
                      ) : null}
                    </p>
                    <p className="text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
                      개당 {formatNumber(item.points)}점 · 보유 {formatNumber(item.held)}
                    </p>
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={item.held}
                    aria-label={`${item.name} 수량`}
                    value={selection[item.id] || ""}
                    placeholder="0"
                    onChange={(event) => setQuantity(item, Number(event.target.value))}
                    className="min-h-10 w-20 shrink-0 rounded-md border border-zinc-300 bg-white px-2 text-right text-sm tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <Button
                    variant="ghost"
                    className="min-h-10 shrink-0"
                    aria-label={`${item.name} 최대`}
                    onClick={() => setQuantity(item, peddlerMaxLoadable(item, cargo, selection, route.capacity))}
                  >
                    최대
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
