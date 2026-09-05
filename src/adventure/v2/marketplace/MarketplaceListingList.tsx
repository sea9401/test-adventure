"use client";

import { equipmentProgressionLock } from "@/adventure/data/v2/equipmentProgression";
import type { V2EnhanceState } from "@/adventure/data/v2/v2Enhance";
import {
  V2_EQUIPMENT,
  type V2CraftQualityState,
  type V2CraftedBy,
  type V2EquipRoll
} from "@/adventure/data/v2/v2Equipment";
import { EquipmentCodexBadge } from "@/adventure/v2/EquipmentCodexBadge";
import { NecklaceIcon, RingIcon } from "@/adventure/v2/EquipmentSlotIcons";
import { GameIcon } from "@/adventure/v2/GameIcon";
import { consumableStatusLine, listingCraftQuality, listingCraftedBy, listingEnhance, remainingLabel } from "@/adventure/v2/marketplace/listingPresentation";
import {
  PricePositionBadge,
  PriceRefLine,
  equipDetail,
  isStackableMarketplaceListing,
  listingEquipRoll,
  marketplacePriceKeyForPayload,
  priceStatForKey,
  priceStatForQuantity,
  type Listing,
  type PriceStat
} from "@/adventure/v2/marketplace/marketplaceShared";
import { MarketplaceTradeReportButton } from "@/adventure/v2/marketplace/MarketplaceTradeReportButton";
import {
  CraftOnlyBadge,
  CraftQualityBadge,
  EnhanceLevelBadge,
  EquipmentTierBadge,
  MasterworkBadge,
  QualityPctText,
  powerNameClass
} from "@/adventure/v2/V2ItemCard";
import {
  type V2ItemTabKey
} from "@/adventure/v2/v2ItemListShared";
import { Card } from "@/components/ui/Card";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { timeAgoKo as timeAgo } from "@/lib/timeFormat";
import {
  Cube,
  Flask,
  HandPalm,
  Shield,
  SneakerMove,
  Star,
  Storefront,
  Sword,
  type Icon
} from "@phosphor-icons/react";

export const LISTING_ICON: Record<V2ItemTabKey, Icon> = {
  weapon: Sword,
  armor: Shield,
  gloves: HandPalm,
  boots: SneakerMove,
  ring: RingIcon,
  necklace: NecklaceIcon,
  material: Cube,
  consumable: Flask,
};



// 구매 확인 모달 — 골드가 HP 회복 통화라 오클릭 방지. 잔액 부족이면 확정 비활성.
export function MarketplaceRecentTradeList({
  rows,
  frontierDepth,
  clockMs,
  emptyText = "아직 체결된 거래가 없어요.",
}: {
  rows: Listing[] | null;
  frontierDepth?: number;
  clockMs: number;
  emptyText?: string;
}) {
  return (
    <ListingList
      rows={rows}
      emptyText={emptyText}
      historical
      priceRef={{}}
      frontierDepth={frontierDepth}
      clockMs={clockMs}
      action={(listing) => (
        <MarketplaceTradeReportButton
          tradeId={listing.id}
          itemName={listing.itemName}
        />
      )}
    />
  );
}



export function ListingList({
  rows,
  emptyText,
  action,
  historical = false,
  priceRef,
  frontierDepth,
  clockMs,
  onOpenCard,
  favoriteKeys,
  onToggleFavorite,
}: {
  rows: Listing[] | null;
  emptyText: string;
  action: (l: Listing) => React.ReactNode;
  historical?: boolean;
  priceRef: Record<string, PriceStat>;
  frontierDepth?: number;
  clockMs: number;
  favoriteKeys?: Set<string>;
  onToggleFavorite?: (key: string) => void;
  // 장비 클릭 → 옵션 카드. (재료는 옵션 없어 미클릭.)
  onOpenCard?: (
    itemId: string,
    roll: V2EquipRoll | undefined,
    enhance: V2EnhanceState | undefined,
    craftQuality: V2CraftQualityState | undefined,
    craftedBy: V2CraftedBy | undefined,
    el: HTMLElement,
  ) => void;
}) {
  if (rows === null) {
    return (
      <div className="space-y-2" aria-label="매물 불러오는 중">
        {[0, 1, 2].map((index) => (
          <Card key={index} padding="none" className="overflow-hidden">
            <div className="flex animate-pulse gap-3 p-4">
              <div className="h-12 w-12 shrink-0 rounded-md bg-zinc-200 dark:bg-zinc-800" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/5 rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-2.5 w-4/5 rounded bg-zinc-100 dark:bg-zinc-800" />
                <div className="h-2.5 w-1/3 rounded bg-zinc-100 dark:bg-zinc-800" />
              </div>
            </div>
            <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <div className="h-4 w-1/4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
          </Card>
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <Card padding="md">
        <div className="flex flex-col items-center gap-2 py-6 text-zinc-600 dark:text-zinc-400">
          <Storefront size={32} weight="duotone" />
          <div className="text-sm">{emptyText}</div>
        </div>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((l) => {
        const item =
          l.kind === "equip"
            ? V2_EQUIPMENT[l.itemId as keyof typeof V2_EQUIPMENT]
            : undefined;
        const roll = item
          ? listingEquipRoll(item, l.instancePayload)
          : undefined;
        const detail =
          l.kind === "equip"
            ? equipDetail(
                l.itemId,
                roll,
                listingEnhance(l.instancePayload),
                listingCraftQuality(l.instancePayload),
              )
            : null;
        const progressionLock =
          item && frontierDepth != null
            ? equipmentProgressionLock(item, frontierDepth)
            : null;
        const enhance =
          l.kind === "equip" ? listingEnhance(l.instancePayload) : undefined;
        const craftQuality =
          l.kind === "equip" ? listingCraftQuality(l.instancePayload) : undefined;
        const craftedBy =
          l.kind === "equip" ? listingCraftedBy(l.instancePayload) : undefined;
        const priceKey =
          l.kind === "equip"
            ? marketplacePriceKeyForPayload(l.itemId, l.instancePayload)
            : l.itemId;
        const priceStat = priceStatForKey(priceRef, l.itemId, priceKey);
        const comparablePriceStat =
          l.kind === "equip"
            ? priceStat
            : priceStatForQuantity(priceStat, l.quantity);
        const listingTabKey: V2ItemTabKey =
          l.kind === "equip"
            ? (item?.slot ?? "weapon")
            : l.kind === "material"
              ? "material"
              : "consumable";
        const ListingKindIcon = LISTING_ICON[listingTabKey];
        const clickable = l.kind === "equip" && !!onOpenCard;
        const relation = historical
          ? null
          : l.isMine
            ? {
                key: "mine",
                label: "내 매물",
                className:
                  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
              }
            : l.isHighestBidder
              ? {
                  key: "leading",
                  label: "최고 입찰 중",
                  className:
                    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                }
              : l.hasMyBid
                ? {
                    key: "bid",
                    label: "내 입찰",
                    className:
                      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                  }
                : null;
        const info = (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`text-sm font-medium ${
                  item
                    ? powerNameClass(
                        item,
                        roll,
                        detail?.enhance,
                        detail?.craftQuality,
                      )
                    : ""
                } ${
                  clickable
                    ? "group-hover:underline group-focus-visible:underline"
                    : ""
                }`}
              >
                {l.itemName}
              </span>
              {item ? <EquipmentTierBadge tier={item.tier} compact /> : null}
              {item ? <EquipmentCodexBadge itemId={item.id} /> : null}
              {relation ? (
                <span
                  data-marketplace-relation={relation.key}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${relation.className}`}
                >
                  {relation.label}
                </span>
              ) : null}
              <EnhanceLevelBadge enhance={detail?.enhance} />
              <CraftQualityBadge craftQuality={detail?.craftQuality} />
              {craftedBy?.masterwork ? <MasterworkBadge /> : null}
              {l.kind !== "equip" && l.quantity > 1 && (
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">×{l.quantity}</span>
              )}
              {detail?.pct != null && (
                <span className="inline-flex items-center gap-1 text-[11px] tabular-nums">
                  <span className="text-zinc-500 dark:text-zinc-400">품질</span>
                  <QualityPctText pct={detail.pct} className="font-semibold" />
                </span>
              )}
              {item?.craftOnly ? <CraftOnlyBadge /> : null}
            </div>
            {l.kind === "consumable" &&
              (() => {
                const st = consumableStatusLine(l.itemId, l.instancePayload, clockMs);
                return st ? (
                  <div
                    className={`mt-0.5 flex items-center gap-1 text-[11px] ${
                      st.expired
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-sky-700 dark:text-sky-400"
                    }`}
                  >
                    <GameIcon name="MapTrifold" size={14} className="shrink-0" />
                    {st.text}
                  </div>
                ) : null;
              })()}
            {detail && (
              <div className="mt-0.5 break-words text-[11px] text-zinc-600 dark:text-zinc-300">
                {detail.line}
              </div>
            )}
            {progressionLock && (
              <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                <GameIcon name="Lock" size={13} className="shrink-0" />
                착용 조건: {progressionLock.label}
              </div>
            )}
          </>
        );
        return (
          <Card key={l.id} padding="none" className="overflow-hidden">
            <div className="flex items-start gap-3 p-3 sm:p-4">
              <div
                className={`${SURFACE_INSET} flex h-12 w-12 shrink-0 items-center justify-center text-sky-700 dark:text-sky-300`}
              >
                <ListingKindIcon size={25} weight="duotone" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  {clickable ? (
                    <button
                      type="button"
                      onClick={(e) =>
                        onOpenCard!(
                          l.itemId,
                          roll,
                          enhance,
                          craftQuality,
                          craftedBy,
                          e.currentTarget,
                        )
                      }
                      className="group min-w-0 text-left"
                    >
                      {info}
                    </button>
                  ) : (
                    <div className="min-w-0">{info}</div>
                  )}
                  {onToggleFavorite ? (
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(`${l.kind}:${l.itemId}`)}
                      aria-label={`${l.itemName} 즐겨찾기 ${favoriteKeys?.has(`${l.kind}:${l.itemId}`) ? "해제" : "추가"}`}
                      className="shrink-0 rounded-md p-1.5 text-amber-500 transition hover:bg-amber-50 dark:hover:bg-amber-950"
                    >
                      <Star
                        size={17}
                        weight={favoriteKeys?.has(`${l.kind}:${l.itemId}`) ? "fill" : "regular"}
                      />
                    </button>
                  ) : null}
                </div>
                {craftedBy ? (
                  <div className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                    제작:{" "}
                    <PlayerNameLink
                      name={craftedBy.name}
                      className="font-medium"
                      fallback="모험가"
                    />{" "}
                    · 대장장이 Lv {craftedBy.level.toLocaleString()}
                  </div>
                ) : null}
                <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                  {historical ? "체결" : "등록"} {timeAgo(l.createdAt)}
                </div>
              </div>
            </div>
            <div
              data-testid="marketplace-listing-footer"
              className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between border-t border-zinc-200 px-3 py-2.5 sm:px-4 dark:border-zinc-700"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {historical
                      ? "체결가"
                      : isStackableMarketplaceListing(l)
                        ? "묶음 시작가"
                        : "시작 입찰가"}
                  </span>
                  <span className="text-base font-bold tabular-nums text-amber-700 dark:text-amber-400">
                    {l.price.toLocaleString()}G
                  </span>
                  {historical && l.kind !== "equip" && l.quantity > 1 ? (
                    <span className="text-[11px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                      개당 {Math.ceil(l.price / l.quantity).toLocaleString()}G
                    </span>
                  ) : null}
                  {!historical && l.highestBid != null ? (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                      현재 입찰 {l.highestBid.toLocaleString()}G · {l.bidCount}건
                    </span>
                  ) : null}
                  <PricePositionBadge price={l.price} stat={comparablePriceStat} />
                  {!historical ? (
                    <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      {new Date(l.bidEndsAt).getTime() > clockMs
                        ? `경매 · ${remainingLabel(l.bidEndsAt, clockMs)}`
                        : "입찰 종료 · 정산 중"}
                    </span>
                  ) : null}
                </div>
                <PriceRefLine
                  stat={comparablePriceStat}
                  scoped={priceKey !== l.itemId && !!priceRef[priceKey]}
                />
              </div>
              <div
                data-testid="marketplace-listing-action"
                className="w-full sm:w-auto [&>*]:w-full sm:[&>*]:w-auto"
              >
                {action(l)}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
