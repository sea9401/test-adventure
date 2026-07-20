"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FrameCorners,
  Gift,
  Palette,
  Sparkle,
} from "@phosphor-icons/react";
import { ChatCosmeticBadge } from "@/components/chat/ChatCosmetics";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { PageShell } from "@/components/ui/PageShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TabBar } from "@/components/ui/TabBar";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  MUSEUN_CASH_ITEMS,
  MUSEUN_COSMETIC_BOX_ITEM_IDS,
  type MuseunCashItemCounts,
  type MuseunCosmeticBoxItemId,
} from "@/adventure/data/v2/museunCashItems";
import {
  CHAT_BADGE_RARITIES,
  CHAT_BADGE_VARIANTS,
  CHROMA_NAME_RARITIES,
  CHROMA_NAME_VARIANTS,
  PROFILE_BORDER_RARITIES,
  PROFILE_BORDER_VARIANTS,
  chatBadgeOdds,
  chromaNameOdds,
  parseMuseunCosmetics,
  profileBorderOdds,
  type ChatBadgeItemId,
  type ChromaNameId,
  type ChromaNameRarity,
  type MuseunCosmeticsState,
  type ProfileBorderItemId,
} from "@/adventure/data/v2/museunCosmetics";
import { useGameState } from "./GameStateProvider";
import { useSystemToast } from "./RewardToastProvider";

type CosmeticTab = "chroma" | "border" | "badge";
type CosmeticSlot = "chroma_name" | "profile_border" | "chat_badge";

const RARITY_TEXT_CLASS: Record<ChromaNameRarity, string> = {
  common: "text-zinc-600 dark:text-zinc-300",
  rare: "text-sky-700 dark:text-sky-300",
  epic: "text-violet-700 dark:text-violet-300",
  legendary: "text-amber-700 dark:text-amber-300",
};

function boxRemainingCount(
  itemId: MuseunCosmeticBoxItemId,
  cosmetics: MuseunCosmeticsState,
): number {
  if (itemId === "chroma_name_box") return chromaNameOdds(cosmetics).length;
  if (itemId === "profile_border_box") return profileBorderOdds(cosmetics).length;
  return chatBadgeOdds(cosmetics).length;
}

function boxTotalCount(itemId: MuseunCosmeticBoxItemId): number {
  if (itemId === "chroma_name_box") return CHROMA_NAME_VARIANTS.length;
  if (itemId === "profile_border_box") return PROFILE_BORDER_VARIANTS.length;
  return CHAT_BADGE_VARIANTS.length;
}

function boxOdds(
  itemId: MuseunCosmeticBoxItemId,
  cosmetics: MuseunCosmeticsState,
): Array<{ id: string; name: string; rarity: ChromaNameRarity; probability: number }> {
  if (itemId === "chroma_name_box") {
    return chromaNameOdds(cosmetics).map((entry) => {
      const variant = CHROMA_NAME_VARIANTS.find((item) => item.id === entry.id)!;
      return {
        id: variant.id,
        name: variant.name,
        rarity: variant.rarity,
        probability: entry.probabilityPct,
      };
    });
  }
  if (itemId === "profile_border_box") {
    return profileBorderOdds(cosmetics).map((entry) => {
      const variant = PROFILE_BORDER_VARIANTS.find(
        (item) => item.itemId === entry.itemId,
      )!;
      return {
        id: variant.itemId,
        name: variant.name,
        rarity: variant.rarity,
        probability: entry.probabilityPct,
      };
    });
  }
  return chatBadgeOdds(cosmetics).map((entry) => {
    const variant = CHAT_BADGE_VARIANTS.find(
      (item) => item.itemId === entry.itemId,
    )!;
    return {
      id: variant.itemId,
      name: variant.name,
      rarity: variant.rarity,
      probability: entry.probabilityPct,
    };
  });
}

export function V2CosmeticsView() {
  const router = useRouter();
  const { refreshGameState } = useGameState();
  const { notifySystem } = useSystemToast();
  const [tab, setTab] = useState<CosmeticTab>("chroma");
  const [cosmetics, setCosmetics] = useState<MuseunCosmeticsState>(() =>
    parseMuseunCosmetics(null),
  );
  const [cashItems, setCashItems] = useState<MuseunCashItemCounts>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/v2/me/cosmetics", {
        cache: "no-store",
        signal,
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        cosmetics?: MuseunCosmeticsState;
        cashItems?: MuseunCashItemCounts;
      } | null;
      if (!res.ok || !data?.ok) throw new Error("load_failed");
      setCosmetics(parseMuseunCosmetics(data.cosmetics));
      setCashItems(data.cashItems ?? {});
    } catch (error) {
      if ((error as Error).name !== "AbortError") setLoadError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 서버 권위 꾸미기 스냅샷 로드
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const equip = useCallback(
    async (
      slot: CosmeticSlot,
      itemId: ChromaNameId | ProfileBorderItemId | ChatBadgeItemId | null,
      label: string,
    ) => {
      setBusy(`${slot}_${itemId ?? "off"}`);
      try {
        const res = await fetch("/api/v2/me/cosmetics", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slot, itemId }),
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          cosmetics?: MuseunCosmeticsState;
        } | null;
        if (!res.ok || !data?.ok) {
          notifySystem(
            `✗ ${data?.error === "not_owned" ? "아직 획득하지 않은 꾸미기입니다" : (data?.error ?? `http ${res.status}`)}`,
          );
          return;
        }
        setCosmetics(parseMuseunCosmetics(data.cosmetics));
        await refreshGameState();
        notifySystem(`✓ ${label}`);
      } catch (error) {
        notifySystem(`✗ ${(error as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [notifySystem, refreshGameState],
  );

  const openBox = useCallback(
    async (itemId: MuseunCosmeticBoxItemId) => {
      setBusy(`box_${itemId}`);
      try {
        const res = await fetch("/api/v2/me/use-cash-item", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          cashItems?: MuseunCashItemCounts;
          cosmetics?: MuseunCosmeticsState;
          chroma?: { name: string; rarity: ChromaNameRarity };
          cosmetic?: {
            name: string;
            rarity: ChromaNameRarity;
            slot: "profile_border" | "chat_badge";
          };
        } | null;
        if (!res.ok || !data?.ok) {
          const message =
            data?.error === "not_owned"
              ? "보유한 상자가 없습니다"
              : data?.error === "collection_complete"
                ? "해당 꾸미기 도감을 모두 수집했습니다"
                : (data?.error ?? `http ${res.status}`);
          notifySystem(`✗ ${message}`);
          return;
        }
        setCashItems(data.cashItems ?? {});
        setCosmetics(parseMuseunCosmetics(data.cosmetics));
        await refreshGameState();
        if (data.chroma) {
          notifySystem(
            `✓ [${CHROMA_NAME_RARITIES[data.chroma.rarity].name}] ${data.chroma.name} 크로마 획득 · 바로 적용했습니다`,
          );
        } else if (data.cosmetic) {
          notifySystem(
            `✓ [${CHROMA_NAME_RARITIES[data.cosmetic.rarity].name}] ${data.cosmetic.name} ${data.cosmetic.slot === "profile_border" ? "테두리" : "배지"} 획득 · 바로 적용했습니다`,
          );
        }
      } catch (error) {
        notifySystem(`✗ ${(error as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [notifySystem, refreshGameState],
  );

  const tabs = useMemo(
    () => [
      {
        key: "chroma" as const,
        label: "크로마",
        icon: <Palette size={16} weight="duotone" />,
        badge: `${cosmetics.chromaNames.length}/${CHROMA_NAME_VARIANTS.length}`,
      },
      {
        key: "border" as const,
        label: "테두리",
        icon: <FrameCorners size={16} weight="duotone" />,
        badge: `${PROFILE_BORDER_VARIANTS.filter((item) => cosmetics.owned.includes(item.itemId)).length}/${PROFILE_BORDER_VARIANTS.length}`,
      },
      {
        key: "badge" as const,
        label: "배지",
        icon: <Sparkle size={16} weight="duotone" />,
        badge: `${CHAT_BADGE_VARIANTS.filter((item) => cosmetics.owned.includes(item.itemId)).length}/${CHAT_BADGE_VARIANTS.length}`,
      },
    ],
    [cosmetics],
  );

  return (
    <PageShell>
      <SubViewHeader title="꾸미기" onBack={() => router.push("/")} />

      <Card padding="md" className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-bold text-violet-700 dark:text-violet-300">
          <Palette size={20} weight="duotone" />
          꾸미기 보관함
        </div>
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          크로마 닉네임, 프로필 테두리와 채팅 배지를 한곳에서 수집하고 적용합니다.
          미개봉 꾸미기 상자도 여기에서 사용할 수 있습니다.
        </p>
      </Card>

      {loadError && <LoadErrorBanner onRetry={() => void load()} />}

      {loading ? (
        <Card padding="md" className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton rows={4} />
        </Card>
      ) : (
        <>
          <CosmeticBoxes
            cashItems={cashItems}
            cosmetics={cosmetics}
            busy={busy}
            onOpen={openBox}
          />

          <Card padding="md" className="space-y-3">
            <TabBar
              tabs={tabs}
              active={tab}
              onChange={setTab}
              ariaLabel="꾸미기 도감 분류"
              variant="highlight"
              scrollable
            />
            {tab === "chroma" ? (
              <ChromaCodex cosmetics={cosmetics} busy={busy} onEquip={equip} />
            ) : tab === "border" ? (
              <BorderCodex cosmetics={cosmetics} busy={busy} onEquip={equip} />
            ) : (
              <BadgeCodex cosmetics={cosmetics} busy={busy} onEquip={equip} />
            )}
          </Card>
        </>
      )}
    </PageShell>
  );
}

function CosmeticBoxes({
  cashItems,
  cosmetics,
  busy,
  onOpen,
}: {
  cashItems: MuseunCashItemCounts;
  cosmetics: MuseunCosmeticsState;
  busy: string | null;
  onOpen: (itemId: MuseunCosmeticBoxItemId) => void;
}) {
  const held = MUSEUN_COSMETIC_BOX_ITEM_IDS.filter(
    (itemId) => (cashItems[itemId] ?? 0) > 0,
  );
  if (held.length === 0) return null;
  return (
    <Card padding="md" className="space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-bold text-amber-700 dark:text-amber-300">
        <Gift size={18} weight="duotone" />
        미개봉 꾸미기 상자
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {held.map((itemId) => {
          const item = MUSEUN_CASH_ITEMS[itemId];
          const count = cashItems[itemId] ?? 0;
          const remaining = boxRemainingCount(itemId, cosmetics);
          const complete = remaining === 0;
          const odds = boxOdds(itemId, cosmetics);
          return (
            <div key={itemId} className={`${SURFACE_INSET} px-3 py-3`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{item.name}</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    보유 {count}개 · 미획득 {remaining}/{boxTotalCount(itemId)}종
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="warning"
                  disabled={busy !== null || complete}
                  onClick={() => onOpen(itemId)}
                  className="shrink-0"
                >
                  {busy === `box_${itemId}`
                    ? "개봉 중…"
                    : complete
                      ? "수집 완료"
                      : "개봉"}
                </Button>
              </div>
              {!complete && (
                <details className="mt-2 border-t border-zinc-200 pt-2 text-[11px] dark:border-zinc-700">
                  <summary className="cursor-pointer font-medium text-zinc-600 dark:text-zinc-300">
                    현재 획득 확률 보기
                  </summary>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1 text-zinc-500 dark:text-zinc-400">
                    {odds.map((entry) => (
                      <li key={entry.id} className="flex justify-between gap-3">
                        <span className="truncate">
                          <span className={RARITY_TEXT_CLASS[entry.rarity]}>
                            [{CHROMA_NAME_RARITIES[entry.rarity].name}]
                          </span>{" "}
                          {entry.name}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {entry.probability.toLocaleString("ko-KR", {
                            maximumFractionDigits: 2,
                          })}
                          %
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ChromaCodex({
  cosmetics,
  busy,
  onEquip,
}: {
  cosmetics: MuseunCosmeticsState;
  busy: string | null;
  onEquip: (
    slot: CosmeticSlot,
    itemId: ChromaNameId | null,
    label: string,
  ) => void;
}) {
  return (
    <CollectionLayout
      title="크로마 닉네임 도감"
      description="채팅과 캐릭터 닉네임에 표시할 색상 효과입니다."
      equipped={Boolean(cosmetics.equippedChromaName)}
      busy={busy}
      onClear={() => onEquip("chroma_name", null, "크로마 닉네임을 해제했습니다")}
    >
      {CHROMA_NAME_VARIANTS.map((variant) => {
        const owned = cosmetics.chromaNames.includes(variant.id);
        const active = cosmetics.equippedChromaName === variant.id;
        return (
          <CosmeticCard
            key={variant.id}
            owned={owned}
            active={active}
            busy={busy !== null}
            onApply={() =>
              onEquip("chroma_name", variant.id, "크로마 닉네임을 변경했습니다")
            }
            title={
              <span
                className={`ui-chat-name-chroma ui-chat-name-chroma--${variant.rarity} ui-chat-name-chroma--${variant.id}`}
              >
                {variant.name}
              </span>
            }
            rarity={variant.rarity}
            detail={`${CHROMA_NAME_RARITIES[variant.rarity].effect} · ${variant.theme}`}
          />
        );
      })}
    </CollectionLayout>
  );
}

function BorderCodex({
  cosmetics,
  busy,
  onEquip,
}: {
  cosmetics: MuseunCosmeticsState;
  busy: string | null;
  onEquip: (
    slot: CosmeticSlot,
    itemId: ProfileBorderItemId | null,
    label: string,
  ) => void;
}) {
  return (
    <CollectionLayout
      title="프로필 테두리 도감"
      description="캐릭터 프로필 카드 바깥쪽에 표시할 테두리입니다."
      equipped={Boolean(cosmetics.equippedProfileBorder)}
      busy={busy}
      onClear={() => onEquip("profile_border", null, "프로필 테두리를 해제했습니다")}
    >
      {PROFILE_BORDER_VARIANTS.map((variant) => {
        const owned = cosmetics.owned.includes(variant.itemId);
        const active = cosmetics.equippedProfileBorder === variant.itemId;
        return (
          <CosmeticCard
            key={variant.itemId}
            owned={owned}
            active={active}
            busy={busy !== null}
            onApply={() =>
              onEquip("profile_border", variant.itemId, "프로필 테두리를 변경했습니다")
            }
            className={`ui-profile-frame-cosmetic ui-profile-frame-${variant.id}`}
            title={`${variant.name} 테두리`}
            rarity={variant.rarity}
            detail={PROFILE_BORDER_RARITIES[variant.rarity].effect}
          />
        );
      })}
    </CollectionLayout>
  );
}

function BadgeCodex({
  cosmetics,
  busy,
  onEquip,
}: {
  cosmetics: MuseunCosmeticsState;
  busy: string | null;
  onEquip: (
    slot: CosmeticSlot,
    itemId: ChatBadgeItemId | null,
    label: string,
  ) => void;
}) {
  return (
    <CollectionLayout
      title="채팅 배지 도감"
      description="채팅과 접속자 목록에서 닉네임 앞에 표시할 배지입니다."
      equipped={Boolean(cosmetics.equippedChatBadge)}
      busy={busy}
      onClear={() => onEquip("chat_badge", null, "채팅 배지를 해제했습니다")}
    >
      {CHAT_BADGE_VARIANTS.map((variant) => {
        const owned = cosmetics.owned.includes(variant.itemId);
        const active = cosmetics.equippedChatBadge === variant.itemId;
        return (
          <CosmeticCard
            key={variant.itemId}
            owned={owned}
            active={active}
            busy={busy !== null}
            onApply={() =>
              onEquip("chat_badge", variant.itemId, "채팅 배지를 변경했습니다")
            }
            title={
              <span className="inline-flex items-center gap-1">
                <ChatCosmeticBadge badge={variant.id} />
                {variant.name} 배지
              </span>
            }
            rarity={variant.rarity}
            detail={CHAT_BADGE_RARITIES[variant.rarity].effect}
          />
        );
      })}
    </CollectionLayout>
  );
}

function CollectionLayout({
  title,
  description,
  equipped,
  busy,
  onClear,
  children,
}: {
  title: string;
  description: string;
  equipped: boolean;
  busy: string | null;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">{title}</h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        </div>
        {equipped && (
          <Button
            size="xs"
            variant="ghost"
            disabled={busy !== null}
            onClick={onClear}
            className="shrink-0"
          >
            해제
          </Button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function CosmeticCard({
  owned,
  active,
  busy,
  onApply,
  title,
  rarity,
  detail,
  className = "",
}: {
  owned: boolean;
  active: boolean;
  busy: boolean;
  onApply: () => void;
  title: React.ReactNode;
  rarity: ChromaNameRarity;
  detail: string;
  className?: string;
}) {
  return (
    <div
      className={`${SURFACE_INSET} ${className} flex min-h-16 items-center justify-between gap-3 px-3 py-2 ${
        active ? "ring-2 ring-violet-500 ring-offset-1 dark:ring-offset-zinc-900" : ""
      }`}
    >
      <div className="min-w-0">
        <div className={`truncate text-sm font-bold ${owned ? "" : "text-zinc-500 dark:text-zinc-400"}`}>
          {title}
        </div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className={`font-semibold ${RARITY_TEXT_CLASS[rarity]}`}>
            {CHROMA_NAME_RARITIES[rarity].name}
          </span>
          <span aria-hidden> · </span>
          {detail}
        </div>
      </div>
      <Button
        size="xs"
        variant={active ? "secondary" : "info"}
        disabled={!owned || active || busy}
        onClick={onApply}
        className="shrink-0"
      >
        {!owned ? "미획득" : active ? "적용 중" : "적용"}
      </Button>
    </div>
  );
}
