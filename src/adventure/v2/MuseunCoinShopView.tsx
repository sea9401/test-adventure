"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  CheckCircle,
  CoinVertical,
  FrameCorners,
  Gauge,
  IdentificationCard,
  Lightning,
  Percent,
  Palette,
  Sparkle,
  Storefront,
  Sword,
  Trophy,
  X,
} from "@phosphor-icons/react";
import {
  ADVENTURE_SUPPORT_PASS,
  MUSEUN_COIN_PACKAGES,
  PREMIUM_ADVENTURE_SUPPORT_PASS,
} from "@/adventure/data/v2/adventureSupport";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/components/ui/PageShell";
import { ProfileDecorationMotion } from "@/components/ui/ProfileDecorationMotion";
import { PlumpGameIcon } from "@/components/icons/PlumpGameIcon";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { ChatCosmeticBadge } from "@/components/chat/ChatCosmetics";
import { MAX_STAMINA } from "@/adventure/v2/stamina";
import {
  MUSEUN_CASH_ITEMS,
  MUSEUN_COIN_SHOP_MAX_PURCHASE_QUANTITY,
  MUSEUN_COSMETIC_BOX_ITEM_IDS,
  maxMuseunCoinShopPurchaseQuantity,
  type MuseunCashItemCounts,
  type MuseunCashItemId,
} from "@/adventure/data/v2/museunCashItems";
import {
  CHROMA_NAME_RARITIES,
  CHROMA_NAME_VARIANTS,
  CHAT_BADGE_RARITIES,
  CHAT_BADGE_VARIANTS,
  COSMETIC_RARITY_DISPLAY_ORDER,
  PROFILE_BORDER_RARITIES,
  PROFILE_BORDER_VARIANTS,
  chatBadgeOdds,
  chromaNameOdds,
  profileBorderOdds,
  sortCosmeticVariantsByRarity,
  type ChatBadgeId,
  type ChromaNameRarity,
  type CosmeticItemRarity,
  type MuseunCosmeticsState,
  type ProfileBorderId,
  isMuseunCosmeticItemId,
  parseMuseunCosmetics,
} from "@/adventure/data/v2/museunCosmetics";
import { useSystemToast } from "./RewardToastProvider";
import { PROFILE_BADGE_STAND_ITEM_ID } from "@/adventure/profile/profileShowcase";
import {
  GROWTH_LEAP_PACKAGE_ITEM_ID,
  MONTHLY_STAMINA_BUNDLE_ITEM_ID,
} from "@/adventure/data/v2/growthLeap";

export type LimitedBundleShopState = {
  monthlyStaminaBundle: {
    purchases: number;
    remaining: number;
    limit: number;
  };
  growthLeapPackage: { owned: boolean };
};

const INITIAL_LIMITED_BUNDLE_STATE: LimitedBundleShopState = {
  monthlyStaminaBundle: { purchases: 0, remaining: 3, limit: 3 },
  growthLeapPackage: { owned: false },
};

export function bundlePurchaseUsesFixedQuantity(
  itemId: MuseunCashItemId,
): boolean {
  return MUSEUN_CASH_ITEMS[itemId].delivery === "bundle";
}

export function limitedBundlePurchaseState(
  itemId: MuseunCashItemId,
  state: LimitedBundleShopState,
): { label: string; blocked: boolean } | null {
  if (itemId === MONTHLY_STAMINA_BUNDLE_ITEM_ID) {
    const { purchases, remaining, limit } = state.monthlyStaminaBundle;
    return {
      label:
        remaining <= 0
          ? `이번 달 구매 완료 (${purchases}/${limit})`
          : `이번 달 ${purchases}/${limit}회 구매`,
      blocked: remaining <= 0,
    };
  }
  if (itemId === GROWTH_LEAP_PACKAGE_ITEM_ID) {
    return {
      label: state.growthLeapPackage.owned
        ? "계정 구매 완료"
        : "계정당 평생 1회",
      blocked: state.growthLeapPackage.owned,
    };
  }
  return null;
}

const COSMETIC_RARITY_BADGE_CLASS: Record<
  ChromaNameRarity | CosmeticItemRarity,
  string
> = {
  common: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
  rare: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  epic: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  legendary:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

export { COSMETIC_RARITY_DISPLAY_ORDER };

export function sortCosmeticPreviewEntries<
  T extends { rarity: CosmeticItemRarity },
>(entries: readonly T[]): T[] {
  return sortCosmeticVariantsByRarity(entries);
}

export const CASH_ITEM_DETAIL_OVERLAY_CLASS =
  "fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/50 px-4 sm:items-center sm:p-4";
export const CASH_ITEM_DETAIL_PANEL_CLASS =
  "flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden";
export const CASH_ITEM_DETAIL_HEADER_CLASS =
  "flex shrink-0 items-center gap-3 border-b border-zinc-200 p-4 dark:border-zinc-700";
export const CASH_ITEM_DETAIL_BODY_CLASS =
  "min-h-0 flex-1 overflow-y-auto overscroll-contain p-4";
export const CASH_ITEM_PURCHASE_CONFIRM_OVERLAY_CLASS =
  "fixed inset-0 z-[110] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center";
export const CASH_ITEM_ART_PATHS: Partial<Record<MuseunCashItemId, string>> = {
  adventure_support_premium_30d:
    "/images/items/cash/adventure_support_premium_30d.svg",
  adventure_support_30d: "/images/items/cash/adventure_support_30d.svg",
  rename_permit: "/images/items/cash/rename_permit.svg",
  profile_image_permit: "/images/items/cash/profile_image_permit.svg",
  chroma_name_box: "/images/items/cash/chroma_name_box.svg",
  profile_border_box: "/images/items/cash/profile_border_box.svg",
  chat_badge_box: "/images/items/cash/chat_badge_box.svg",
  cosmetic_extension_30d: "/images/items/cash/cosmetic_extension_30d.svg",
};

function itemSummary(itemId: MuseunCashItemId): string {
  const item = MUSEUN_CASH_ITEMS[itemId];
  if (
    item.effect.kind === "adventure_support" ||
    item.effect.kind === "adventure_support_premium"
  ) {
    return `${item.effect.days}일간 모험 편의 혜택을 활성화합니다.`;
  }
  if (item.effect.kind === "rename") return "캐릭터 이름을 한 번 변경합니다.";
  if (item.effect.kind === "profile_image") {
    return "직접 등록한 이미지로 프로필 이미지를 한 번 변경합니다.";
  }
  if (item.effect.kind === "chroma_name_box") {
    return "미보유 닉네임 꾸미기 한 종류를 중복 없이 획득합니다.";
  }
  if (item.effect.kind === "profile_border_box") {
    return "미보유 프로필 꾸미기 한 종류를 중복 없이 획득합니다.";
  }
  if (item.effect.kind === "chat_badge_box") {
    return "미보유 채팅 배지 한 종류를 중복 없이 획득합니다.";
  }
  if (item.effect.kind === "cosmetic_extension") {
    return `해금된 꾸미기 한 종류의 사용 기간을 ${item.effect.days}일 연장합니다.`;
  }
  if (item.effect.kind === "profile_badge_stand") {
    return "프로필에 업적 배지 3개를 전시하는 전시대를 영구 해금합니다.";
  }
  if (item.effect.kind === "cultivation_reset") {
    return "골드 소모 없이 수행 한계치를 초기화하고 숙달 포인트를 돌려받으며, 레벨 1·경험치 0으로 돌아갑니다.";
  }
  if (item.effect.kind === "level_target") {
    return `사용 즉시 ${item.effect.level}레벨을 달성합니다.`;
  }
  if (item.effect.kind === "stamina_potion_bundle") {
    return `귀속 스태미나 회복약 ${item.effect.potions}개를 받습니다.`;
  }
  if (item.effect.kind === "growth_leap") {
    return `귀속 회복약 ${item.effect.potions}개와 ${item.effect.missionDays}일 성장 의뢰를 받습니다.`;
  }
  return item.effect.slot === "profile_border"
    ? "프로필 바깥 테두리와 상단 배경 꾸미기를 해금하고 30일간 사용합니다."
    : "채팅 닉네임 앞에 표시할 배지를 해금하고 30일간 사용합니다.";
}

export const SHOP_ITEM_GROUPS = [
  {
    id: "consumable",
    title: "이용권·소모품",
    description: "구매 후 가방에서 사용하는 기능성 상품입니다.",
    itemIds: [
      "adventure_support_premium_30d",
      "adventure_support_30d",
      MONTHLY_STAMINA_BUNDLE_ITEM_ID,
      GROWTH_LEAP_PACKAGE_ITEM_ID,
      "rename_permit",
      "profile_image_permit",
    ],
  },
  {
    id: "cosmetic",
    title: "꾸미기",
    description: "프로필 전시 기능, 꾸미기 상자와 30일 연장권입니다.",
    itemIds: [
      PROFILE_BADGE_STAND_ITEM_ID,
      ...MUSEUN_COSMETIC_BOX_ITEM_IDS,
      "cosmetic_extension_30d",
    ],
  },
] as const;

export function supportBenefitsForItem(
  itemId:
    | "adventure_support_30d"
    | "adventure_support_premium_30d",
) {
  const premium = itemId === "adventure_support_premium_30d";
  const pass = premium
    ? PREMIUM_ADVENTURE_SUPPORT_PASS
    : ADVENTURE_SUPPORT_PASS;
  return [
    {
      Icon: Gauge,
      label: `최대 에너지 ${pass.staminaMaxBonus.toLocaleString()} 증가 (기본 ${MAX_STAMINA.toLocaleString()} → ${(MAX_STAMINA + pass.staminaMaxBonus).toLocaleString()})`,
    },
    {
      Icon: Lightning,
      label: `에너지 회복량 ${pass.staminaRegenBonusPct}% 증가`,
    },
    {
      Icon: Storefront,
      label: `거래소 등록 ${pass.marketplaceSlotBonus}개 추가`,
    },
    {
      Icon: Percent,
      label: `거래소 수수료 ${pass.marketplaceTaxRate * 100}%로 감소`,
    },
    {
      Icon: Sword,
      label: `일괄 전투 최대 ${pass.activeMaxHuntBatch}회`,
    },
    ...(premium
      ? [
          {
            Icon: Palette,
            label: `꾸미기 30일 연장권 ${PREMIUM_ADVENTURE_SUPPORT_PASS.cosmeticExtensionGrant}개 지급`,
          },
        ]
      : []),
  ];
}

function MuseunCoinMark({ size = "md" }: { size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-8" : "size-12";
  const iconSize = size === "sm" ? 25 : 38;
  return (
    <span
      aria-hidden
      className={`${box} relative inline-flex shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 ring-1 ring-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800`}
    >
      <CoinVertical size={iconSize} weight="duotone" />
      <span className="absolute text-[10px] font-black text-amber-900 dark:text-amber-100">
        ?
      </span>
    </span>
  );
}

export function MuseunCoinShopView({ embedded = false }: { embedded?: boolean }) {
  const [chargeOpen, setChargeOpen] = useState(false);
  const [detailItemId, setDetailItemId] =
    useState<MuseunCashItemId | null>(null);
  const [confirmItemId, setConfirmItemId] =
    useState<MuseunCashItemId | null>(null);
  const [coins, setCoins] = useState(0);
  const [cashItems, setCashItems] = useState<MuseunCashItemCounts>({});
  const [cosmetics, setCosmetics] = useState<MuseunCosmeticsState>(() =>
    parseMuseunCosmetics(null),
  );
  const [profileBadgeStandOwned, setProfileBadgeStandOwned] = useState(false);
  const [limitedBundles, setLimitedBundles] =
    useState<LimitedBundleShopState>(INITIAL_LIMITED_BUNDLE_STATE);
  const [buying, setBuying] = useState<MuseunCashItemId | null>(null);
  const { notifySystem } = useSystemToast();

  useEffect(() => {
    let alive = true;
    void fetch("/api/v2/museun-coin-shop", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (data: {
          coins?: number;
          cashItems?: MuseunCashItemCounts;
          cosmetics?: MuseunCosmeticsState;
          profileBadgeStandOwned?: boolean;
          monthlyStaminaBundle?: LimitedBundleShopState["monthlyStaminaBundle"];
          growthLeapPackage?: LimitedBundleShopState["growthLeapPackage"];
        } | null) => {
          if (!alive || !data) return;
          setCoins(Math.max(0, Math.floor(data.coins ?? 0)));
          setCashItems(data.cashItems ?? {});
          setCosmetics(parseMuseunCosmetics(data.cosmetics));
          setProfileBadgeStandOwned(data.profileBadgeStandOwned === true);
          setLimitedBundles({
            monthlyStaminaBundle:
              data.monthlyStaminaBundle ??
              INITIAL_LIMITED_BUNDLE_STATE.monthlyStaminaBundle,
            growthLeapPackage:
              data.growthLeapPackage ??
              INITIAL_LIMITED_BUNDLE_STATE.growthLeapPackage,
          });
        },
      )
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function purchase(itemId: MuseunCashItemId, quantity: number) {
    if (buying) return;
    setBuying(itemId);
    try {
      const res = await fetch("/api/v2/museun-coin-shop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, quantity }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        itemName?: string;
        quantity?: number;
        coins?: number;
        cashItems?: MuseunCashItemCounts;
        cosmetics?: MuseunCosmeticsState;
        profileBadgeStandOwned?: boolean;
        monthlyStaminaBundle?: LimitedBundleShopState["monthlyStaminaBundle"];
        growthLeapPackage?: LimitedBundleShopState["growthLeapPackage"];
        delivery?: "inventory" | "entitlement" | "permanent" | "bundle";
      } | null;
      if (!res.ok || !data?.ok) {
        const errorMessage =
          data?.error === "insufficient_coins"
            ? "무슨 코인이 부족합니다."
            : data?.error === "already_owned"
              ? itemId === GROWTH_LEAP_PACKAGE_ITEM_ID
                ? "계정당 한 번만 구매할 수 있는 상품입니다."
                : "이미 해금한 꾸미기 상품입니다."
              : data?.error === "monthly_limit"
                ? "이번 달 구매 한도를 모두 사용했습니다."
              : "상품을 구매하지 못했습니다.";
        notifySystem(`✗ ${errorMessage}`);
        return;
      }
      setCoins(data.coins ?? 0);
      setCashItems(data.cashItems ?? {});
      setCosmetics(parseMuseunCosmetics(data.cosmetics));
      setProfileBadgeStandOwned(data.profileBadgeStandOwned === true);
      if (data.monthlyStaminaBundle && data.growthLeapPackage) {
        setLimitedBundles({
          monthlyStaminaBundle: data.monthlyStaminaBundle,
          growthLeapPackage: data.growthLeapPackage,
        });
      }
      notifySystem(
        data.delivery === "bundle"
          ? `✓ 구매 완료 — ${data.itemName ?? "패키지"}의 구성품을 지급했습니다.`
          : data.delivery === "permanent"
          ? `✓ 구매 완료 — ${data.itemName ?? "영구 상품"}을 영구 해금했습니다.`
          : data.delivery === "entitlement"
          ? `✓ 구매 완료 — ${data.itemName ?? "꾸미기 상품"}을 해금하고 30일 사용 기간을 적용했습니다.`
          : `✓ 구매 완료 — ${data.itemName ?? "캐시 아이템"} ${(data.quantity ?? quantity).toLocaleString()}개를 가방에 넣었습니다.`,
      );
      setDetailItemId(null);
    } catch {
      notifySystem("✗ 상품을 구매하지 못했습니다.");
    } finally {
      setBuying(null);
      setConfirmItemId(null);
    }
  }

  return (
    <PageShell
      as={embedded ? "section" : "main"}
      spacing="loose"
      className={embedded ? "!max-w-none !px-0 !py-0" : undefined}
    >
      <Card padding="lg">
        <div className="flex items-center gap-3">
          <MuseunCoinMark />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              관리자 전용 UI 미리보기
            </p>
            <h1 className="mt-0.5 text-xl font-bold">무슨 코인 상점</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              결제 기능은 아직 연결되지 않았습니다.
            </p>
          </div>
        </div>
      </Card>

      <Card padding="md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">보유 재화</p>
            <p className="mt-1 text-lg font-bold tabular-nums">
              무슨 코인 {coins.toLocaleString()}개
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              미리보기 잔액
            </span>
            <button
              type="button"
              onClick={() => setChargeOpen(true)}
              className="ui-game-button rounded-md border border-amber-500 bg-amber-500 px-3 py-1.5 text-sm font-bold text-white transition hover:bg-amber-600"
            >
              충전
            </button>
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <div>
          <h2 className="text-base font-bold">아이템 목록</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            아이템을 누르면 효과와 이용 방법을 확인할 수 있습니다.
          </p>
        </div>
        <div className="mt-5 space-y-6">
          {SHOP_ITEM_GROUPS.map((group) => (
            <section key={group.id}>
              <div className="mb-2">
                <h3 className="text-sm font-bold">{group.title}</h3>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {group.description}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.itemIds.map((itemId) => (
                  <CashItemCard
                    key={itemId}
                    itemId={itemId}
                    owned={cashItems[itemId] ?? 0}
                    permanentOwned={
                      itemId === PROFILE_BADGE_STAND_ITEM_ID
                        ? profileBadgeStandOwned
                        : false
                    }
                    limitedState={limitedBundles}
                    onClick={() => setDetailItemId(itemId)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </Card>

      {!embedded && (
        <div className="text-center">
          <Link
            href="/"
            className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            모험으로 돌아가기
          </Link>
        </div>
      )}

      {chargeOpen && (
        <MuseunCoinChargeDialog onClose={() => setChargeOpen(false)} />
      )}
      {detailItemId && !confirmItemId && (
        <CashItemDetailDialog
          itemId={detailItemId}
          coins={coins}
          owned={cashItems[detailItemId] ?? 0}
          permanentOwned={
            detailItemId === PROFILE_BADGE_STAND_ITEM_ID
              ? profileBadgeStandOwned
              : isMuseunCosmeticItemId(detailItemId) &&
                cosmetics.owned.includes(detailItemId)
          }
          cosmetics={cosmetics}
          buying={buying === detailItemId}
          purchaseBlocked={buying !== null}
          limitedState={limitedBundles}
          onPurchase={() => setConfirmItemId(detailItemId)}
          onClose={() => setDetailItemId(null)}
        />
      )}
      {confirmItemId && (
        <CashItemPurchaseConfirmDialog
          itemId={confirmItemId}
          coins={coins}
          buying={buying === confirmItemId}
          onConfirm={(quantity) => void purchase(confirmItemId, quantity)}
          onClose={() => setConfirmItemId(null)}
        />
      )}
    </PageShell>
  );
}

function CashItemPurchaseConfirmDialog({
  itemId,
  coins,
  buying,
  onConfirm,
  onClose,
}: {
  itemId: MuseunCashItemId;
  coins: number;
  buying: boolean;
  onConfirm: (quantity: number) => void;
  onClose: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const closeIfIdle = useCallback(() => {
    if (!buying) onClose();
  }, [buying, onClose]);
  useEscapeKey(closeIfIdle);
  useModalA11y(contentRef);

  const item = MUSEUN_CASH_ITEMS[itemId];
  const permanent = item.delivery === "permanent";
  const fixedQuantity = permanent || bundlePurchaseUsesFixedQuantity(itemId);
  const maxQuantity = fixedQuantity
    ? coins >= item.coinPrice
      ? 1
      : 0
    : maxMuseunCoinShopPurchaseQuantity(coins, item.coinPrice);
  const [quantityInput, setQuantityInput] = useState("1");
  const parsedQuantity = Number(quantityInput);
  const quantity = fixedQuantity
    ? maxQuantity
    : Number.isInteger(parsedQuantity) &&
        parsedQuantity >= 1 &&
        parsedQuantity <= maxQuantity
      ? parsedQuantity
      : 0;
  const totalPrice = item.coinPrice * quantity;
  const balanceAfterPurchase = Math.max(0, coins - totalPrice);
  const canPurchase = !buying && quantity > 0;

  const setClampedQuantity = useCallback(
    (next: number) => {
      const upperBound = Math.max(1, maxQuantity);
      setQuantityInput(
        String(Math.min(upperBound, Math.max(1, Math.floor(next) || 1))),
      );
    },
    [maxQuantity],
  );

  return createPortal(
    <div
      className={CASH_ITEM_PURCHASE_CONFIRM_OVERLAY_CLASS}
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) closeIfIdle();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cash-item-purchase-confirm-title"
        aria-describedby="cash-item-purchase-confirm-description"
        className={`${SURFACE_CARD} ui-modal-panel w-full max-w-sm p-5 shadow-2xl`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <CashItemIcon itemId={itemId} size={26} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              무슨 코인 상품
            </p>
            <h2
              id="cash-item-purchase-confirm-title"
              className="truncate text-lg font-bold"
            >
              구매하시겠습니까?
            </h2>
          </div>
        </div>

        <p
          id="cash-item-purchase-confirm-description"
          className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300"
        >
          <strong className="text-zinc-900 dark:text-zinc-100">
            {item.name}
          </strong>
          {permanent
            ? "을(를) 영구 해금합니다. 구매를 확정하면 무슨 코인이 즉시 차감됩니다."
            : "의 구매 수량을 선택해 주세요. 구매를 확정하면 무슨 코인이 즉시 차감됩니다."}
        </p>

        <div className={`${SURFACE_INSET} mt-4 space-y-2 p-3 text-sm`}>
          {!fixedQuantity ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500 dark:text-zinc-400">상품 가격</span>
                <strong className="tabular-nums text-amber-700 dark:text-amber-300">
                  {item.coinPrice.toLocaleString()}코인
                </strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="cash-item-purchase-quantity"
                  className="text-zinc-500 dark:text-zinc-400"
                >
                  구매 수량
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="구매 수량 1개 줄이기"
                    disabled={buying || quantityInput === "1"}
                    onClick={() => setClampedQuantity((quantity || 1) - 1)}
                    className="ui-game-button flex size-8 items-center justify-center rounded-md border border-zinc-300 bg-white font-bold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                  >
                    −
                  </button>
                  <input
                    id="cash-item-purchase-quantity"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={Math.max(1, maxQuantity)}
                    step={1}
                    value={quantityInput}
                    disabled={buying}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => setQuantityInput(event.target.value)}
                    onBlur={() => setClampedQuantity(parsedQuantity)}
                    className="h-8 w-16 rounded-md border border-zinc-300 bg-white px-2 text-center font-bold tabular-nums text-zinc-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    aria-label="구매 수량 1개 늘리기"
                    disabled={
                      buying || maxQuantity === 0 || quantity >= maxQuantity
                    }
                    onClick={() => setClampedQuantity((quantity || 0) + 1)}
                    className="ui-game-button flex size-8 items-center justify-center rounded-md border border-zinc-300 bg-white font-bold text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    disabled={buying || maxQuantity === 0}
                    onClick={() => setClampedQuantity(maxQuantity)}
                    className="ui-game-button h-8 rounded-md border border-amber-400 bg-amber-50 px-2 text-xs font-bold text-amber-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                  >
                    최대
                  </button>
                </div>
              </div>
            </>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <span className="text-zinc-500 dark:text-zinc-400">총 결제액</span>
            <strong className="tabular-nums text-amber-700 dark:text-amber-300">
              {totalPrice.toLocaleString()}코인
            </strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-zinc-500 dark:text-zinc-400">현재 보유</span>
            <span className="font-medium tabular-nums">
              {coins.toLocaleString()}코인
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-zinc-200 pt-2 dark:border-zinc-700">
            <span className="font-semibold">구매 후 잔액</span>
            <strong className="tabular-nums">
              {balanceAfterPurchase.toLocaleString()}코인
            </strong>
          </div>
        </div>

        {permanent ? (
          <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            계정에 영구 귀속되며 한 번만 구매할 수 있습니다.
          </p>
        ) : fixedQuantity ? (
          <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            구성품이 묶인 한정 상품으로 구매 수량은 1개로 고정됩니다.
          </p>
        ) : (
          <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            보유 코인으로 최대 {maxQuantity.toLocaleString()}개, 한 번에 최대{" "}
            {MUSEUN_COIN_SHOP_MAX_PURCHASE_QUANTITY}개까지 구매할 수 있습니다.
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button size="md" disabled={buying} onClick={onClose}>
            취소
          </Button>
          <Button
            size="md"
            variant="warning"
            disabled={!canPurchase}
            onClick={() => onConfirm(quantity)}
          >
            {buying
              ? "구매 중…"
              : permanent
                ? `${totalPrice.toLocaleString()}코인 영구 구매`
                : quantity > 0
                ? `${quantity.toLocaleString()}개 · ${totalPrice.toLocaleString()}코인 구매`
                : "수량 확인 필요"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CashItemIcon({
  itemId,
  size = 28,
}: {
  itemId: MuseunCashItemId;
  size?: number;
}) {
  const effect = MUSEUN_CASH_ITEMS[itemId].effect;
  const artPath = CASH_ITEM_ART_PATHS[itemId];
  if (artPath) {
    const dimension = size + 16;
    return (
      <span
        aria-hidden
        className="relative inline-flex shrink-0 overflow-hidden rounded-xl"
        style={{ width: dimension, height: dimension }}
      >
        <Image
          src={artPath}
          alt=""
          fill
          sizes={`${dimension}px`}
          unoptimized
          className="object-contain"
        />
      </span>
    );
  }
  const iconClass =
    effect.kind === "profile_badge_stand"
      ? "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300"
      : effect.kind === "adventure_support" ||
          effect.kind === "adventure_support_premium"
      ? "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300"
      : effect.kind === "rename" || effect.kind === "profile_image"
        ? "bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-300"
        : effect.kind === "chroma_name_box"
          ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"
          : effect.kind === "profile_border_box" ||
              (effect.kind === "cosmetic" && effect.slot === "profile_border")
            ? "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300"
            : "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-950 dark:text-fuchsia-300";
  return (
    <span className={`inline-flex shrink-0 rounded-full p-2 ${iconClass}`}>
      {effect.kind === "stamina_potion_bundle" ? (
        <PlumpGameIcon name="stamina_potion" size={size} />
      ) : effect.kind === "growth_leap" ? (
        <PlumpGameIcon name="celebration" size={size} />
      ) : effect.kind === "profile_badge_stand" ? (
        <Trophy size={size} weight="duotone" aria-hidden />
      ) : effect.kind === "adventure_support" ||
        effect.kind === "adventure_support_premium" ? (
        <Sword size={size} weight="duotone" aria-hidden />
      ) : effect.kind === "rename" || effect.kind === "profile_image" ? (
        <IdentificationCard size={size} weight="duotone" aria-hidden />
      ) : effect.kind === "chroma_name_box" ? (
        <Palette size={size} weight="duotone" aria-hidden />
      ) : effect.kind === "profile_border_box" ||
        (effect.kind === "cosmetic" && effect.slot === "profile_border") ? (
        <FrameCorners size={size} weight="duotone" aria-hidden />
      ) : (
        <Sparkle size={size} weight="duotone" aria-hidden />
      )}
    </span>
  );
}

function CashItemCard({
  itemId,
  owned,
  permanentOwned,
  limitedState,
  onClick,
}: {
  itemId: MuseunCashItemId;
  owned: number;
  permanentOwned: boolean;
  limitedState: LimitedBundleShopState;
  onClick: () => void;
}) {
  const item = MUSEUN_CASH_ITEMS[itemId];
  const summary = itemSummary(itemId);
  const limited = limitedBundlePurchaseState(itemId, limitedState);
  return (
    <Card
      as="button"
      type="button"
      padding="md"
      onClick={onClick}
      className="group text-left transition hover:border-amber-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:border-amber-700"
    >
      <div className="flex items-start gap-3">
        <CashItemIcon itemId={itemId} />
        <div className="min-w-0 flex-1">
          <h3 className="font-bold">{item.name}</h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {summary}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
        <div>
          <p className="font-bold tabular-nums text-amber-600 dark:text-amber-300">
            {item.coinPrice.toLocaleString()}코인
          </p>
          {limited ? (
            <p className={`mt-0.5 text-[11px] ${limited.blocked ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"}`}>
              {limited.label}
            </p>
          ) : (owned > 0 || permanentOwned) && (
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {item.delivery === "permanent"
                ? "영구 보유 중"
                : item.delivery === "entitlement"
                ? "도감 해금 · 기간 중 장착 가능"
                : `가방에 ${owned}개 보유`}
            </p>
          )}
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 group-hover:text-amber-600 dark:text-zinc-400 dark:group-hover:text-amber-300">
          자세히
          <ArrowRight size={14} aria-hidden />
        </span>
      </div>
    </Card>
  );
}

function CashItemDetailDialog({
  itemId,
  coins,
  owned,
  permanentOwned,
  cosmetics,
  buying,
  purchaseBlocked,
  limitedState,
  onPurchase,
  onClose,
}: {
  itemId: MuseunCashItemId;
  coins: number;
  owned: number;
  permanentOwned: boolean;
  cosmetics: MuseunCosmeticsState;
  buying: boolean;
  purchaseBlocked: boolean;
  limitedState: LimitedBundleShopState;
  onPurchase: () => void;
  onClose: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);
  useModalA11y(contentRef);
  const item = MUSEUN_CASH_ITEMS[itemId];
  const insufficient = coins < item.coinPrice;
  const limited = limitedBundlePurchaseState(itemId, limitedState);

  return createPortal(
    <div
      className={CASH_ITEM_DETAIL_OVERLAY_CLASS}
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
      onMouseDown={onClose}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cash-item-detail-title"
        className={`${SURFACE_CARD} ${CASH_ITEM_DETAIL_PANEL_CLASS}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={CASH_ITEM_DETAIL_HEADER_CLASS}>
          <CashItemIcon itemId={itemId} size={30} />
          <div className="min-w-0 flex-1">
            <h2 id="cash-item-detail-title" className="font-bold">
              {item.name}
            </h2>
            <p className="mt-0.5 font-bold tabular-nums text-amber-600 dark:text-amber-300">
              {item.coinPrice.toLocaleString()}코인
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="상품 상세 닫기"
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className={CASH_ITEM_DETAIL_BODY_CLASS}>
          {itemId === "adventure_support_30d" ||
          itemId === "adventure_support_premium_30d" ? (
            <>
              <div className={`${SURFACE_INSET} grid gap-2 p-3 sm:grid-cols-2`}>
                {supportBenefitsForItem(itemId).map(({ Icon, label }) => (
                  <div
                    key={label}
                    className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"
                  >
                    <CheckCircle
                      size={17}
                      weight="fill"
                      className="shrink-0 text-emerald-500"
                    />
                    <Icon
                      size={17}
                      weight="duotone"
                      className="shrink-0 text-amber-500"
                    />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                {itemId === "adventure_support_premium_30d" ? (
                  <>
                    구매하면 가방에 들어오며 거래소에서 다른 모험가와 거래할 수 있습니다.
                    사용할 때마다 프리미엄 혜택이 30일 적용되고 에너지{" "}
                    {PREMIUM_ADVENTURE_SUPPORT_PASS.staminaActivationGrant.toLocaleString()}
                    과 꾸미기 30일 연장권{" "}
                    {PREMIUM_ADVENTURE_SUPPORT_PASS.cosmeticExtensionGrant}개를 받습니다.
                    남아 있는 일반 지원권 기간은 프리미엄 이용 중 소모되지 않고 종료 뒤
                    이어집니다.
                  </>
                ) : (
                  <>
                    구매하면 가방에 들어오며, 사용한 시점부터 30일이 적용됩니다. 거래소에서
                    다른 모험가와 거래할 수도 있습니다. 지원권이 없으면 일괄 전투는 최대{" "}
                    {ADVENTURE_SUPPORT_PASS.freeMaxHuntBatch}회까지 이용할 수 있습니다. 최초
                    활성화 시 에너지{" "}
                    {ADVENTURE_SUPPORT_PASS.staminaActivationGrant.toLocaleString()}이 즉시
                    지급됩니다.
                  </>
                )}
              </p>
            </>
          ) : itemId === "rename_permit" ? (
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              구매 후 가방에서 사용하면 캐릭터 이름을 한 번 변경할 수 있습니다. 사용하기
              전에는 거래소에 등록해 다른 모험가와 거래할 수 있습니다.
            </p>
          ) : itemId === "profile_image_permit" ? (
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              구매 후 JPG·PNG·WebP 이미지를 직접 등록해 프로필 이미지를 한 번 변경할 수
              있습니다. 변경권은 사용하기 전에 거래소에 등록해 다른 모험가와 거래할 수
              있습니다.
            </p>
          ) : itemId === MONTHLY_STAMINA_BUNDLE_ITEM_ID ? (
            <div className="space-y-3">
              <div className={`${SURFACE_INSET} space-y-2 p-3 text-sm`}>
                <p className="font-semibold">귀속 스태미나 회복약 20개</p>
                <p className="text-zinc-600 dark:text-zinc-300">
                  개당 200, 총 4,000 스태미나를 회복할 수 있습니다.
                </p>
              </div>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                구매 즉시 귀속 회복약으로 지급되며 거래할 수 없습니다. 한국 시간 기준
                매월 1일에 구매 횟수가 초기화됩니다.
              </p>
            </div>
          ) : itemId === GROWTH_LEAP_PACKAGE_ITEM_ID ? (
            <div className="space-y-3">
              <div className={`${SURFACE_INSET} space-y-1.5 p-3 text-sm`}>
                <p>귀속 스태미나 회복약 30개</p>
                <p>닉네임 꾸미기 상자 1개 · 프로필 꾸미기 상자 1개</p>
                <p>30일 성장 의뢰 · 숙련 증서 최대 5,000개</p>
                <p>의뢰 보상: 귀속 회복약 10개 · 꾸미기 30일 연장권 1개</p>
              </div>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                계정당 평생 한 번만 구매할 수 있습니다. 구매 즉시 의뢰가 시작되며,
                30일 동안 실제 사용한 스태미나가 누적됩니다. 종료 후 7일 동안은 달성한
                보상만 수령할 수 있습니다. 모험 지원권은 포함되지 않습니다.
              </p>
            </div>
          ) : itemId === PROFILE_BADGE_STAND_ITEM_ID ? (
            <div className="space-y-3">
              <div className={`${SURFACE_INSET} flex items-center justify-center gap-3 p-4`}>
                {["브론즈", "골드", "전설"].map((label, index) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <span
                      className={`flex size-12 items-center justify-center rounded-full border-4 shadow-sm ${
                        index === 0
                          ? "border-orange-600 bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                          : index === 1
                            ? "border-amber-500 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            : "border-violet-500 bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                      }`}
                    >
                      <Trophy size={23} weight="duotone" aria-hidden />
                    </span>
                    <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                구매 즉시 프로필의 대표 배지 전시대 3칸이 모두 열립니다. 달성하고
                보상까지 받은 업적 배지를 골라 전시할 수 있으며 기간 제한 없이
                영구 사용합니다.
              </p>
            </div>
          ) : itemId === "cosmetic_extension_30d" ? (
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              구매 후 설정의 꾸미기 화면에서 도감에 해금된 닉네임 꾸미기, 프로필
              꾸미기 또는 채팅 배지 한 종류를 골라 사용 기간을 30일 연장할 수
              있습니다. 남은 기간이 있으면 그 뒤에 30일이 더해지며, 사용 전에는
              거래소에 등록할 수 있습니다.
            </p>
          ) : itemId === "chroma_name_box" ? (
            <ChromaNameBoxPreview cosmetics={cosmetics} />
          ) : itemId === "profile_border_box" ? (
            <CosmeticCollectionBoxPreview
              kind="profile_border"
              cosmetics={cosmetics}
            />
          ) : itemId === "chat_badge_box" ? (
            <CosmeticCollectionBoxPreview
              kind="chat_badge"
              cosmetics={cosmetics}
            />
          ) : (
            <CosmeticItemPreview itemId={itemId} />
          )}

          <div className="mt-4 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>보유 코인 {coins.toLocaleString()}</span>
            <span>
              {limited
                ? limited.label
                : item.delivery === "permanent"
                ? permanentOwned
                  ? "영구 보유 중"
                  : "계정 귀속 · 영구 사용"
                : item.delivery === "entitlement"
                ? permanentOwned
                  ? "도감 해금 · 기간 중 장착"
                  : "계정 귀속 · 30일 사용"
                : `가방에 ${owned}개 보유`}
            </span>
          </div>
          <button
            type="button"
            onClick={onPurchase}
            disabled={
              purchaseBlocked ||
              insufficient ||
              permanentOwned ||
              limited?.blocked === true
            }
            className="ui-game-button mt-3 w-full rounded-md border border-amber-500 bg-amber-500 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-700"
          >
            {buying
              ? "구매 중…"
              : limited?.blocked
                ? "구매 완료"
              : permanentOwned
                ? "보유 중"
                : insufficient
                  ? "코인 부족"
                  : "구매"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ChromaNameBoxPreview({
  cosmetics,
}: {
  cosmetics: MuseunCosmeticsState;
}) {
  const odds = chromaNameOdds(cosmetics);
  const initialOdds = chromaNameOdds(null);
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        미보유 닉네임 색상 또는 특수 효과 중 한 종류를 등급별 확률로 획득합니다.
        중복은 나오지 않으며, 획득 즉시 30일 사용 기간이 시작됩니다. 기간 중
        설정에서 자유롭게 바꿔 적용할 수 있고, 사용 전 상자는 거래소에 등록할 수
        있습니다.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(Object.keys(CHROMA_NAME_RARITIES) as ChromaNameRarity[]).map(
          (rarity) => {
            const config = CHROMA_NAME_RARITIES[rarity];
            const probability = initialOdds
              .filter((entry) => {
                const variant = CHROMA_NAME_VARIANTS.find(
                  (candidate) => candidate.id === entry.id,
                )!;
                return variant.rarity === rarity;
              })
              .reduce((sum, entry) => sum + entry.probabilityPct, 0);
            return (
              <div key={rarity} className={`${SURFACE_CARD} p-2 text-center`}>
                <span
                  className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${COSMETIC_RARITY_BADGE_CLASS[rarity]}`}
                >
                  {config.name}
                </span>
                <div className="mt-1 text-sm font-bold tabular-nums">
                  {probability.toLocaleString("ko-KR", {
                    maximumFractionDigits: 2,
                  })}
                  %
                </div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  {config.effect}
                </div>
              </div>
            );
          },
        )}
      </div>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
        위 수치는 아무 닉네임 꾸미기도 보유하지 않았을 때의 최초 등급 확률입니다.
      </p>
      <div className={`${SURFACE_INSET} p-3`}>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold">현재 획득 확률</span>
          <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
            보유 {cosmetics.chromaNames.length}/{CHROMA_NAME_VARIANTS.length}
          </span>
        </div>
        {odds.length > 0 ? (
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {odds.map((entry) => {
              const variant = CHROMA_NAME_VARIANTS.find(
                (candidate) => candidate.id === entry.id,
              )!;
              return (
                <li
                  key={variant.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-white px-2.5 py-1.5 text-xs dark:bg-zinc-900"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold ${COSMETIC_RARITY_BADGE_CLASS[variant.rarity]}`}
                    >
                      {CHROMA_NAME_RARITIES[variant.rarity].name}
                    </span>
                    <span
                      className={`ui-chat-name-chroma ui-chat-name-chroma--${variant.rarity} ui-chat-name-chroma--${variant.id} truncate font-bold`}
                    >
                      {variant.name}
                    </span>
                  </span>
                  <span className="tabular-nums text-zinc-600 dark:text-zinc-300">
                    {entry.probabilityPct.toLocaleString("ko-KR", {
                      maximumFractionDigits: 2,
                    })}
                    %
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            모든 닉네임 꾸미기를 보유하고 있습니다.
          </p>
        )}
      </div>
      <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        표시된 확률은 현재 미보유 종류 기준입니다. 상자를 열어 한 종류를 얻을 때마다
        다음 상자의 대상과 확률이 갱신됩니다.
      </p>
    </div>
  );
}

function CosmeticCollectionBoxPreview({
  kind,
  cosmetics,
}: {
  kind: "profile_border" | "chat_badge";
  cosmetics: MuseunCosmeticsState;
}) {
  const isProfileBorder = kind === "profile_border";
  const variants = isProfileBorder
    ? PROFILE_BORDER_VARIANTS
    : CHAT_BADGE_VARIANTS;
  const rarities = isProfileBorder
    ? PROFILE_BORDER_RARITIES
    : CHAT_BADGE_RARITIES;
  const odds = isProfileBorder
    ? profileBorderOdds(cosmetics)
    : chatBadgeOdds(cosmetics);
  const initialOdds = isProfileBorder
    ? profileBorderOdds(null)
    : chatBadgeOdds(null);
  const itemLabel = isProfileBorder ? "프로필 꾸미기" : "채팅 배지";
  const previewEntries = sortCosmeticPreviewEntries(
    odds.map((entry) => {
      const variant = variants.find(
        (candidate) => candidate.itemId === entry.itemId,
      )!;
      return {
        itemId: variant.itemId,
        style: variant.id,
        name: variant.name,
        rarity: variant.rarity,
        probabilityPct: entry.probabilityPct,
      };
    }),
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const selectedPreview =
    previewEntries.find((entry) => entry.itemId === selectedItemId) ??
    previewEntries[0] ??
    null;
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        미보유 {itemLabel} 중 한 종류를 등급별 확률로 획득합니다. 중복은 나오지
        않으며 획득 즉시 30일 사용 기간이 시작됩니다. 기간 중 설정에서 자유롭게
        적용할 수 있고, 사용 전 상자는 거래소에 등록할 수 있습니다.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {COSMETIC_RARITY_DISPLAY_ORDER.map((rarity) => {
          const probability = initialOdds
            .filter((entry) =>
              variants.some(
                (variant) =>
                  variant.itemId === entry.itemId &&
                  variant.rarity === rarity,
              ),
            )
            .reduce((sum, entry) => sum + entry.probabilityPct, 0);
          return (
            <div key={rarity} className={`${SURFACE_CARD} p-2 text-center`}>
              <span
                className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${COSMETIC_RARITY_BADGE_CLASS[rarity]}`}
              >
                {rarities[rarity].name}
              </span>
              <div className="mt-1 text-sm font-bold tabular-nums">
                {probability.toLocaleString("ko-KR", {
                  maximumFractionDigits: 2,
                })}
                %
              </div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                {rarities[rarity].effect}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
        최초 등급 확률이며, 보유한 종류가 늘어나면 남은 아이템 기준으로 확률이
        다시 계산됩니다.
      </p>
      <div className={`${SURFACE_INSET} p-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            <span className="font-semibold">현재 획득 확률</span>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              항목을 누르면 실제 표시 모습을 미리 볼 수 있습니다.
            </p>
          </div>
          <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
            보유 {variants.length - odds.length}/{variants.length}
          </span>
        </div>
        {selectedPreview ? (
          <>
            <CosmeticCollectionItemPreview
              kind={kind}
              name={selectedPreview.name}
              rarity={selectedPreview.rarity}
              probabilityPct={selectedPreview.probabilityPct}
              style={selectedPreview.style}
            />
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {previewEntries.map((entry) => {
                const selected = entry.itemId === selectedPreview.itemId;
                return (
                  <li key={entry.itemId}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedItemId(entry.itemId)}
                      className={`${SURFACE_CARD} flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                        selected
                          ? "border-amber-400 ring-1 ring-amber-300 dark:border-amber-600 dark:ring-amber-800"
                          : "hover:border-amber-300 dark:hover:border-amber-700"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold ${COSMETIC_RARITY_BADGE_CLASS[entry.rarity]}`}
                        >
                          {rarities[entry.rarity].name}
                        </span>
                        <span className="truncate font-bold">{entry.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-300">
                        {entry.probabilityPct.toLocaleString("ko-KR", {
                          maximumFractionDigits: 2,
                        })}
                        %
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            모든 {itemLabel}를 보유하고 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}

function ProfileThemePreview({
  style,
  eyebrow,
}: {
  style: ProfileBorderId;
  eyebrow: string;
}) {
  const profileDecoration = PROFILE_BORDER_VARIANTS.find(
    (variant) => variant.id === style,
  );
  const hasProfileTheme =
    profileDecoration != null && profileDecoration.interior !== "none";

  return (
    <div
      className={`${SURFACE_CARD} ui-profile-frame-cosmetic ui-profile-frame-${style} ${profileDecoration?.motion === "static" ? "ui-profile-frame-static" : ""} p-3`}
    >
      <div
        className={
          hasProfileTheme ? "ui-profile-theme-header p-3" : `${SURFACE_INSET} p-3`
        }
      >
        <ProfileDecorationMotion profileBorder={style} />
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-white bg-white text-sm font-black text-zinc-600 shadow-sm">
            모
          </div>
          <div
            className={`${hasProfileTheme ? "ui-profile-theme-copy" : ""} min-w-0 flex-1`}
          >
            <div
              className={`text-[11px] ${
                hasProfileTheme
                  ? "text-zinc-200"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {eyebrow}
            </div>
            <div
              className={`truncate font-bold ${
                hasProfileTheme
                  ? "text-white"
                  : "text-zinc-900 dark:text-zinc-100"
              }`}
            >
              별을 걷는 모험가{" "}
              <span
                className={`text-xs font-normal ${
                  hasProfileTheme
                    ? "text-zinc-200"
                    : "text-zinc-600 dark:text-zinc-300"
                }`}
              >
                Lv.42
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className={`${SURFACE_INSET} mt-2 p-2 text-[10px] text-zinc-500 dark:text-zinc-400`}>
        수치와 장비 영역은 읽기 편한 기본 배경을 유지합니다.
      </div>
    </div>
  );
}

function CosmeticCollectionItemPreview({
  kind,
  name,
  rarity,
  probabilityPct,
  style,
}: {
  kind: "profile_border" | "chat_badge";
  name: string;
  rarity: CosmeticItemRarity;
  probabilityPct: number;
  style: string;
}) {
  const rarityName =
    kind === "profile_border"
      ? PROFILE_BORDER_RARITIES[rarity].name
      : CHAT_BADGE_RARITIES[rarity].name;
  return (
    <div className="mt-3" aria-live="polite">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs">
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${COSMETIC_RARITY_BADGE_CLASS[rarity]}`}
          >
            {rarityName}
          </span>
          <strong className="truncate">{name} 미리보기</strong>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          현재 {probabilityPct.toLocaleString("ko-KR", {
            maximumFractionDigits: 2,
          })}
          %
        </span>
      </div>
      {kind === "profile_border" ? (
        <ProfileThemePreview
          style={style as ProfileBorderId}
          eyebrow="프로필 카드"
        />
      ) : (
        <div className={`${SURFACE_CARD} p-3`}>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            전체 채팅
          </div>
          <div className={`${SURFACE_INSET} mt-2 p-3 text-sm`}>
            <ChatCosmeticBadge badge={style as ChatBadgeId} />
            <span className="font-bold text-zinc-800 dark:text-zinc-100">
              별을 걷는 모험가
            </span>
            <span className="ml-2 text-zinc-600 dark:text-zinc-300">
              오늘도 좋은 모험 되세요!
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function CosmeticItemPreview({ itemId }: { itemId: MuseunCashItemId }) {
  const item = MUSEUN_CASH_ITEMS[itemId];
  if (item.effect.kind !== "cosmetic") return null;
  const cosmeticEffect = item.effect;
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        {item.description}
      </p>
      {cosmeticEffect.slot === "profile_border" ? (
        <ProfileThemePreview
          style={cosmeticEffect.style}
          eyebrow="프로필 미리보기"
        />
      ) : (
        <div className={`${SURFACE_INSET} p-3 text-sm`}>
          <ChatCosmeticBadge badge={cosmeticEffect.style} />
          <span className="font-bold text-zinc-800 dark:text-zinc-100">
            별을 걷는 모험가
          </span>
          <span className="ml-2 text-zinc-600 dark:text-zinc-300">
            오늘도 좋은 모험 되세요!
          </span>
        </div>
      )}
    </div>
  );
}

function MuseunCoinChargeDialog({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="museun-coin-charge-title"
        className={`${SURFACE_CARD} w-full max-w-lg overflow-hidden`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-zinc-200 p-4 dark:border-zinc-700">
          <MuseunCoinMark size="sm" />
          <div className="min-w-0 flex-1">
            <h2 id="museun-coin-charge-title" className="text-base font-bold">
              무슨 코인 충전
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              구매한 코인은 만료되지 않습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="충전창 닫기"
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4">
          {MUSEUN_COIN_PACKAGES.map((item) => (
            <div key={item.id} className={`${SURFACE_INSET} flex flex-col p-3`}>
              <div className="flex items-center gap-2">
                <MuseunCoinMark size="sm" />
                <div className="min-w-0">
                  <p className="font-bold tabular-nums">
                    {item.coins.toLocaleString()}코인
                  </p>
                  <p className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {item.priceKrw.toLocaleString()}원
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled
                className="ui-game-button mt-3 w-full rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-400 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
              >
                결제 준비 중
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
