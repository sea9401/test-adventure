"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  X,
} from "@phosphor-icons/react";
import {
  ADVENTURE_SUPPORT_PASS,
  MUSEUN_COIN_PACKAGES,
} from "@/adventure/data/v2/adventureSupport";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { ChatCosmeticBadge } from "@/components/chat/ChatCosmetics";
import { MAX_STAMINA } from "@/adventure/v2/stamina";
import {
  MUSEUN_CASH_ITEMS,
  MUSEUN_COSMETIC_BOX_ITEM_IDS,
  type MuseunCashItemCounts,
  type MuseunCashItemId,
} from "@/adventure/data/v2/museunCashItems";
import {
  CHROMA_NAME_RARITIES,
  CHROMA_NAME_VARIANTS,
  CHAT_BADGE_RARITIES,
  CHAT_BADGE_VARIANTS,
  PROFILE_BORDER_RARITIES,
  PROFILE_BORDER_VARIANTS,
  chatBadgeOdds,
  chromaNameOdds,
  profileBorderOdds,
  type ChatBadgeId,
  type ChromaNameRarity,
  type CosmeticItemRarity,
  type MuseunCosmeticsState,
  type ProfileBorderId,
  isMuseunCosmeticItemId,
  parseMuseunCosmetics,
} from "@/adventure/data/v2/museunCosmetics";

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

export const COSMETIC_RARITY_DISPLAY_ORDER = [
  "legendary",
  "epic",
  "rare",
  "common",
] as const satisfies readonly CosmeticItemRarity[];

const COSMETIC_RARITY_DISPLAY_RANK = Object.fromEntries(
  COSMETIC_RARITY_DISPLAY_ORDER.map((rarity, index) => [rarity, index]),
) as Record<CosmeticItemRarity, number>;

export function sortCosmeticPreviewEntries<
  T extends { rarity: CosmeticItemRarity },
>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (left, right) =>
      COSMETIC_RARITY_DISPLAY_RANK[left.rarity] -
      COSMETIC_RARITY_DISPLAY_RANK[right.rarity],
  );
}

function itemSummary(itemId: MuseunCashItemId): string {
  const item = MUSEUN_CASH_ITEMS[itemId];
  if (item.effect.kind === "adventure_support") {
    return `${item.effect.days}일간 모험 편의 혜택을 활성화합니다.`;
  }
  if (item.effect.kind === "rename") return "캐릭터 이름을 한 번 변경합니다.";
  if (item.effect.kind === "profile_image") {
    return "게임 내 이미지 선택 또는 직접 등록으로 프로필 이미지를 한 번 변경합니다.";
  }
  if (item.effect.kind === "chroma_name_box") {
    return "미보유 크로마 닉네임 한 종류를 중복 없이 획득합니다.";
  }
  if (item.effect.kind === "profile_border_box") {
    return "미보유 프로필 테두리 한 종류를 중복 없이 획득합니다.";
  }
  if (item.effect.kind === "chat_badge_box") {
    return "미보유 채팅 배지 한 종류를 중복 없이 획득합니다.";
  }
  if (item.effect.kind === "cosmetic_extension") {
    return `해금된 꾸미기 한 종류의 사용 기간을 ${item.effect.days}일 연장합니다.`;
  }
  return item.effect.slot === "profile_border"
    ? "프로필 카드에 적용할 테두리를 해금하고 30일간 사용합니다."
    : "채팅 닉네임 앞에 표시할 배지를 해금하고 30일간 사용합니다.";
}

export const SHOP_ITEM_GROUPS = [
  {
    id: "consumable",
    title: "이용권·소모품",
    description: "구매 후 가방에서 사용하는 기능성 상품입니다.",
    itemIds: ["adventure_support_30d", "rename_permit", "profile_image_permit"],
  },
  {
    id: "cosmetic",
    title: "꾸미기",
    description: "꾸미기 상자와 해금된 꾸미기에 사용하는 30일 연장권입니다.",
    itemIds: [...MUSEUN_COSMETIC_BOX_ITEM_IDS, "cosmetic_extension_30d"],
  },
] as const;

const SUPPORT_BENEFITS = [
  {
    Icon: Gauge,
    label: `최대 에너지 ${ADVENTURE_SUPPORT_PASS.staminaMaxBonus.toLocaleString()} 증가 (기본 ${MAX_STAMINA.toLocaleString()} → ${(MAX_STAMINA + ADVENTURE_SUPPORT_PASS.staminaMaxBonus).toLocaleString()})`,
  },
  {
    Icon: Lightning,
    label: `에너지 회복량 ${ADVENTURE_SUPPORT_PASS.staminaRegenBonusPct}% 증가`,
  },
  {
    Icon: Storefront,
    label: `거래소 등록 ${ADVENTURE_SUPPORT_PASS.marketplaceSlotBonus}개 추가`,
  },
  {
    Icon: Percent,
    label: `거래소 수수료 ${ADVENTURE_SUPPORT_PASS.marketplaceTaxRate * 100}%로 감소`,
  },
  {
    Icon: Sword,
    label: `일괄 전투 최대 ${ADVENTURE_SUPPORT_PASS.activeMaxHuntBatch}회`,
  },
] as const;

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

export function MuseunCoinShopView() {
  const [chargeOpen, setChargeOpen] = useState(false);
  const [detailItemId, setDetailItemId] =
    useState<MuseunCashItemId | null>(null);
  const [coins, setCoins] = useState(0);
  const [cashItems, setCashItems] = useState<MuseunCashItemCounts>({});
  const [cosmetics, setCosmetics] = useState<MuseunCosmeticsState>(() =>
    parseMuseunCosmetics(null),
  );
  const [buying, setBuying] = useState<MuseunCashItemId | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/v2/museun-coin-shop", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (data: {
          coins?: number;
          cashItems?: MuseunCashItemCounts;
          cosmetics?: MuseunCosmeticsState;
        } | null) => {
          if (!alive || !data) return;
          setCoins(Math.max(0, Math.floor(data.coins ?? 0)));
          setCashItems(data.cashItems ?? {});
          setCosmetics(parseMuseunCosmetics(data.cosmetics));
        },
      )
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function purchase(itemId: MuseunCashItemId) {
    if (buying) return;
    setBuying(itemId);
    setMessage(null);
    try {
      const res = await fetch("/api/v2/museun-coin-shop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        itemName?: string;
        coins?: number;
        cashItems?: MuseunCashItemCounts;
        cosmetics?: MuseunCosmeticsState;
        delivery?: "inventory" | "entitlement";
      } | null;
      if (!res.ok || !data?.ok) {
        setMessage(
          data?.error === "insufficient_coins"
            ? "무슨 코인이 부족합니다."
            : data?.error === "already_owned"
              ? "이미 해금한 꾸미기 상품입니다."
              : "상품을 구매하지 못했습니다.",
        );
        return;
      }
      setCoins(data.coins ?? 0);
      setCashItems(data.cashItems ?? {});
      setCosmetics(parseMuseunCosmetics(data.cosmetics));
      setMessage(
        data.delivery === "entitlement"
          ? `${data.itemName ?? "꾸미기 상품"}을 해금하고 30일 사용 기간을 적용했습니다.`
          : `${data.itemName ?? "캐시 아이템"}을 가방에 넣었습니다.`,
      );
    } catch {
      setMessage("상품을 구매하지 못했습니다.");
    } finally {
      setBuying(null);
    }
  }

  return (
    <PageShell spacing="loose">
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

      {message && (
        <StatusBanner
          tone={
            message.includes("넣었습니다") || message.includes("적용했습니다")
              ? "success"
              : "error"
          }
        >
          {message}
        </StatusBanner>
      )}

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
                    onClick={() => setDetailItemId(itemId)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </Card>

      <div className="text-center">
        <Link
          href="/"
          className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          모험으로 돌아가기
        </Link>
      </div>

      {chargeOpen && (
        <MuseunCoinChargeDialog onClose={() => setChargeOpen(false)} />
      )}
      {detailItemId && (
        <CashItemDetailDialog
          itemId={detailItemId}
          coins={coins}
          owned={cashItems[detailItemId] ?? 0}
          permanentOwned={
            isMuseunCosmeticItemId(detailItemId) &&
            cosmetics.owned.includes(detailItemId)
          }
          cosmetics={cosmetics}
          buying={buying === detailItemId}
          purchaseBlocked={buying !== null}
          onPurchase={() => void purchase(detailItemId)}
          onClose={() => setDetailItemId(null)}
        />
      )}
    </PageShell>
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
  const iconClass =
    effect.kind === "adventure_support"
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
      {effect.kind === "adventure_support" ? (
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
  onClick,
}: {
  itemId: MuseunCashItemId;
  owned: number;
  onClick: () => void;
}) {
  const item = MUSEUN_CASH_ITEMS[itemId];
  const summary = itemSummary(itemId);
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
          {owned > 0 && (
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {item.delivery === "entitlement"
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
  onPurchase: () => void;
  onClose: () => void;
}) {
  useEscapeKey(onClose);
  const item = MUSEUN_CASH_ITEMS[itemId];
  const insufficient = coins < item.coinPrice;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cash-item-detail-title"
        className={`${SURFACE_CARD} max-h-[90vh] w-full max-w-xl overflow-y-auto`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-zinc-200 p-4 dark:border-zinc-700">
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

        <div className="p-4">
          {itemId === "adventure_support_30d" ? (
            <>
              <div className={`${SURFACE_INSET} grid gap-2 p-3 sm:grid-cols-2`}>
                {SUPPORT_BENEFITS.map(({ Icon, label }) => (
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
                구매하면 가방에 들어오며, 사용한 시점부터 30일이 적용됩니다. 거래소에서
                다른 모험가와 거래할 수도 있습니다. 지원권이 없으면 일괄 전투는 최대{" "}
                {ADVENTURE_SUPPORT_PASS.freeMaxHuntBatch}회까지 이용할 수 있습니다. 최초
                활성화 시 에너지{" "}
                {ADVENTURE_SUPPORT_PASS.staminaActivationGrant.toLocaleString()}이 즉시
                지급됩니다.
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
              있습니다. 게임에 포함된 캐릭터·NPC·몬스터 이미지는 변경권 없이 24시간마다
              선택할 수 있으며, 변경권은 사용하기 전에 거래소에 등록할 수 있습니다.
            </p>
          ) : itemId === "cosmetic_extension_30d" ? (
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              구매 후 설정의 꾸미기 화면에서 도감에 해금된 크로마 닉네임, 프로필
              테두리 또는 채팅 배지 한 종류를 골라 사용 기간을 30일 연장할 수
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
              {item.delivery === "entitlement"
                ? permanentOwned
                  ? "도감 해금 · 기간 중 장착"
                  : "계정 귀속 · 30일 사용"
                : `가방에 ${owned}개 보유`}
            </span>
          </div>
          <button
            type="button"
            onClick={onPurchase}
            disabled={purchaseBlocked || insufficient || permanentOwned}
            className="ui-game-button mt-3 w-full rounded-md border border-amber-500 bg-amber-500 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-700"
          >
            {buying
              ? "구매 중…"
              : permanentOwned
                ? "보유 중"
                : insufficient
                  ? "코인 부족"
                  : "구매"}
          </button>
        </div>
      </div>
    </div>
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
        미보유 닉네임 색상 중 한 종류를 등급별 확률로 획득합니다. 중복은 나오지
        않으며, 획득 즉시 30일 사용 기간이 시작됩니다. 기간 중 설정에서 자유롭게
        바꿔 적용할 수 있고, 사용 전 상자는 거래소에 등록할 수 있습니다.
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
        위 수치는 아무 색상도 보유하지 않았을 때의 최초 등급 확률입니다.
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
            모든 크로마 닉네임을 보유하고 있습니다.
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
  const itemLabel = isProfileBorder ? "프로필 테두리" : "채팅 배지";
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
        <div
          className={`${SURFACE_CARD} ui-profile-frame-cosmetic ui-profile-frame-${style as ProfileBorderId} p-4`}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 text-sm font-black text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              모
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                프로필 카드
              </div>
              <div className="truncate font-bold text-zinc-900 dark:text-zinc-100">
                별을 걷는 모험가{" "}
                <span className="text-xs font-normal">Lv.42</span>
              </div>
            </div>
          </div>
        </div>
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
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        {item.description}
      </p>
      {item.effect.slot === "profile_border" ? (
        <div
          className={`${SURFACE_CARD} ui-profile-frame-cosmetic ui-profile-frame-${item.effect.style} p-4`}
        >
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            프로필 미리보기
          </div>
          <div className="mt-1 font-bold text-zinc-900 dark:text-zinc-100">
            별을 걷는 모험가 <span className="text-xs font-normal">Lv.42</span>
          </div>
        </div>
      ) : (
        <div className={`${SURFACE_INSET} p-3 text-sm`}>
          <ChatCosmeticBadge badge={item.effect.style} />
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
