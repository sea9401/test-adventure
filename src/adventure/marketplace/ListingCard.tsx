"use client";

import { memo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { formatRelativeTime } from "@/lib/format";
import { ITEMS, rarityTextClass, type ItemId } from "@/adventure/data/items";
import {
  craftTierSuffix,
  craftTierTextClass,
  type CraftTier,
} from "@/adventure/data/craftQuality";
import {
  dropQualityPrefix,
  dropQualityTextClass,
  type DropQuality,
} from "@/adventure/data/dropQuality";
import type { Listing } from "./types";
import { hasOwn, listingDetail } from "./listingDetail";
import {
  isStarlitRing,
  starlitRingStatsFromBonus,
} from "@/adventure/inventory/starlitRing";

// listing.variantKey ("base"|"c±N"|"dN") → (craftTier, dropQuality) — UI 라벨용.
function parseListingVariantKey(variantKey: string): {
  tier?: CraftTier;
  quality?: DropQuality;
} {
  if (
    variantKey === "c-2" ||
    variantKey === "c-1" ||
    variantKey === "c1" ||
    variantKey === "c2"
  ) {
    return { tier: Number(variantKey.slice(1)) as CraftTier };
  }
  if (variantKey === "d1" || variantKey === "d2") {
    return { quality: Number(variantKey.slice(1)) as DropQuality };
  }
  return {};
}

type ListingCardProps = {
  item: Listing;
  onCancel?: (listing: Listing) => Promise<void>;
  onBuy?: (listing: Listing) => Promise<void>;
  currentGold?: number;
  alreadyKnown?: boolean;
};

function ListingCardImpl({
  item,
  onCancel,
  onBuy,
  currentGold,
  alreadyKnown,
}: ListingCardProps) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const insufficientGold =
    typeof currentGold === "number" && currentGold < item.price;
  const blocked = alreadyKnown === true;
  const isRecipe = item.itemKind === "recipe";
  const isSkillBook = item.itemKind === "skill_book";
  const isEquip = item.itemKind === "equip";
  // 장비 매물이면 등급색으로 강조 — 다른 종류는 기본 zinc 톤. 스킬북은 보라색 강조.
  const equipDef =
    isEquip && hasOwn(ITEMS, item.itemId) ? ITEMS[item.itemId as ItemId] : null;
  const nameClass = isSkillBook
    ? "text-violet-700 dark:text-violet-300"
    : rarityTextClass(equipDef, "text-zinc-900 dark:text-zinc-100");
  // 등급 라벨 — equip 전용. base 면 prefix/suffix 둘 다 빈 문자열.
  const { tier, quality } = isEquip ? parseListingVariantKey(item.variantKey) : {};
  const detail = listingDetail(item);
  return (
    <Card padding="sm">
      <div className="flex items-center gap-3">
        <span className="flex-1 min-w-0">
          <span
            className={`block truncate text-sm font-medium ${
              detail
                ? "cursor-pointer underline decoration-dotted decoration-zinc-400 underline-offset-2"
                : ""
            }`}
            role={detail ? "button" : undefined}
            tabIndex={detail ? 0 : undefined}
            aria-expanded={detail ? open : undefined}
            onClick={detail ? () => setOpen((v) => !v) : undefined}
            onKeyDown={
              detail
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setOpen((v) => !v);
                    }
                  }
                : undefined
            }
          >
            {isEquip ? (
              <>
                <span className={dropQualityTextClass(quality)}>
                  {dropQualityPrefix(quality)}
                </span>
                <span className={nameClass}>{item.itemName}</span>
                <span className={craftTierTextClass(tier)}>
                  {craftTierSuffix(tier)}
                </span>
              </>
            ) : (
              <span className={nameClass}>
                {isRecipe ? "📜 " : isSkillBook ? "📖 " : ""}
                {item.itemName}
                {item.itemKind === "material" && item.quantity > 1 ? (
                  <span className="ml-1 text-zinc-500">×{item.quantity}</span>
                ) : null}
              </span>
            )}
          </span>
          {item.instance ? (
            <span className="mt-0.5 block text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              {item.instance.enhancementLevel > 0
                ? `+${item.instance.enhancementLevel} `
                : ""}
              {isStarlitRing(item.instance.itemId) && item.instance.rolledBonus
                ? starlitRingStatsFromBonus(item.instance.rolledBonus)
                    .map((s) => `${s.label}${s.value}`)
                    .join(" · ")
                : item.instance.enchantSlots &&
                    item.instance.enchantSlots.length > 0
                  ? `부여 ${item.instance.enchantSlots.length}종`
                  : ""}
            </span>
          ) : null}
          <span className="mt-0.5 block text-[11px] text-zinc-500">
            {formatRelativeTime(item.createdAt)}
            {(() => {
              // 등록 24시간 만료 — 4시간 이하 남았으면 임박 뱃지 노출.
              // 시간 기반 1회성 표시라 Date.now() 가 매 렌더 다른 값이어도 무해.
              // eslint-disable-next-line react-hooks/purity
              const ageMs = Date.now() - new Date(item.createdAt).getTime();
              const remainMs = 24 * 60 * 60 * 1000 - ageMs;
              if (remainMs > 0 && remainMs < 4 * 60 * 60 * 1000) {
                const hours = Math.max(1, Math.round(remainMs / (60 * 60 * 1000)));
                return (
                  <span className="ml-2 text-amber-600 dark:text-amber-400">
                    {hours}시간 후 만료
                  </span>
                );
              }
              return null;
            })()}
            {item.isMine ? (
              <span className="ml-2 text-emerald-600">내 매물</span>
            ) : null}
            {blocked ? (
              <span className="ml-2 font-medium text-amber-600 dark:text-amber-400">
                📚 이미 알고 있음
              </span>
            ) : null}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-base font-semibold text-amber-700 dark:text-amber-400">
            {item.price.toLocaleString()} G
          </span>
          {item.itemKind === "material" && item.quantity > 1 ? (
            <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">
              {Math.ceil(item.price / item.quantity).toLocaleString()} G/개
            </span>
          ) : null}
          {item.isMine && onCancel ? (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onCancel(item);
                } finally {
                  setBusy(false);
                }
              }}
              className="mt-1 rounded-md border border-red-300 bg-white px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              {busy ? "취소 중…" : "취소"}
            </button>
          ) : item.isMine ? (
            <span className="mt-1 block text-[10px] text-zinc-500">내 매물</span>
          ) : onBuy ? (
            <button
              type="button"
              disabled={busy || insufficientGold || blocked}
              title={
                blocked
                  ? "이미 알고 있는 제작서"
                  : insufficientGold
                    ? "골드 부족"
                    : undefined
              }
              onClick={async () => {
                setBusy(true);
                try {
                  await onBuy(item);
                } finally {
                  setBusy(false);
                }
              }}
              className={
                insufficientGold || blocked
                  ? "mt-1 cursor-not-allowed rounded-md border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
                  : "mt-1 rounded-md border border-emerald-700 bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              }
            >
              {busy
                ? "구매 중…"
                : blocked
                  ? "이미 보유"
                  : insufficientGold
                    ? "골드 부족"
                    : "구매"}
            </button>
          ) : null}
        </span>
      </div>
      {open && detail ? (
        <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
          {detail.title ? (
            <div className="mb-1 font-medium text-zinc-700 dark:text-zinc-300">
              {detail.title}
            </div>
          ) : null}
          {detail.lines.length > 0 ? (
            <div className="space-y-0.5">
              {detail.lines.map((s) => (
                <div
                  key={s.label}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {s.label}
                  </span>
                  <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {detail.variance ? (
            <div className="mt-1 text-sky-600 dark:text-sky-400">
              품질에 따라 변동 — {detail.variance}
            </div>
          ) : null}
          {detail.description ? (
            <div className="mt-1.5 border-t border-zinc-200 pt-1.5 italic text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {detail.description}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}


// memo — 부모(ListingsView via MarketplaceTab)의 onCancel/onBuy 콜백이 이미 useCallback
// 이라 같은 item/currentGold/alreadyKnown 인 카드는 렌더 skip.
export const ListingCard = memo(ListingCardImpl);
