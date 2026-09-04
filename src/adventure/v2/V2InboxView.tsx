"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Envelope, PaperPlaneTilt, Trash, X } from "@phosphor-icons/react";
import { timeAgoKo as timeAgo } from "@/lib/timeFormat";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import { SendMessageModal } from "@/adventure/marketplace/SendMessageModal";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import {
  MUSEUN_CASH_ITEMS,
  isMuseunShopItemId,
} from "@/adventure/data/v2/museunCashItems";
import {
  deleteReceivedInbox,
  fetchInbox,
  fetchInboxSent,
  markInboxRead,
  type InboxItem,
} from "@/adventure/marketplace/api";
import {
  acceptGuildInvite,
  declineGuildInvite,
  GuildError,
} from "@/adventure/guild/api";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import {
  useRewardToast,
  useSystemMessageState,
} from "@/adventure/v2/RewardToastProvider";
import { TITLES } from "@/adventure/data/titles";
import { ContentSafetyActions } from "@/components/safety/ContentSafetyActions";
import { confirmGameAction } from "@/components/ui/gameDialog";
import {
  COOKING_PANTRY_ITEMS,
  COOKING_PROCESSING_RECIPES,
} from "@/adventure/v2/cooking/kitchen";
import { FARM_ITEMS } from "@/adventure/v2/farm";
import { FISHING_CATCH_ITEMS } from "@/adventure/v2/fishingStock";
import { bulkClaimIds, isUnreadInboxItem } from "./inboxViewState";
import {
  isTradeSuspensionMessagePayload,
  tradeSuspensionMessage,
} from "@/lib/tradeSuspension";

const EQUIPMENT_BY_ID = V2_EQUIPMENT as unknown as Readonly<
  Record<string, { name: string } | undefined>
>;

// v2 우편함 — 받은 쪽지(user_message) + 마켓 정산·선물·길드 보상 등 수령.
// 백엔드(/api/marketplace/inbox 목록 + /claim)는 이미 v2 호환(claim 이 character.v2 골드/
// inventory.v2 에 적용). 옛 V1 InboxView 는 GameContext·V1 데이터에 얽혀 죽은 채 삭제됐고,
// v2 엔 이 읽기/수령 UI 가 빠져 있어 신설한다.
//
// 구성:
//   - "쪽지 쓰기" — 우편함에서 바로 글만 보내는 쪽지(SendMessageModal). 게시판에만 있던 진입점 추가.
//   - "받은 우편" 탭 — 미확인·미수령·완료 우편을 한 목록에 표시.
//   - "보낸 우편" 탭 — 내가 보낸 쪽지/선물 최근 기록. 상대 확인 여부(readAt)도 표시.
//   - 우편 클릭 — 상세 모달을 즉시 열고 받은 우편이면 읽음 처리.

// 길드 초대(guild_invite)는 수령(claim)이 아니라 수락/거절 — payload.invite_id 로 accept/decline.
// 마켓 정산·선물 등 나머지는 수령(claim).
const IS_INVITE = (it: InboxItem) => it.kind === "guild_invite";

// 표시 본문 — user_message 는 본문이 payload.text 에 있고 message 컬럼은 비어있다(보내기
// 라우트가 text 를 payload 에만 저장). guild_invite 는 길드명 안내. 그 외는 message ?? 라벨.
function bodyOf(it: InboxItem): string {
  if (it.kind === "user_message") {
    const t = (it.payload as { text?: unknown })?.text;
    return typeof t === "string" && t.length > 0 ? t : "(내용 없음)";
  }
  if (it.kind === "price_alert") {
    const text = (it.payload as { text?: unknown })?.text;
    return typeof text === "string" && text.length > 0
      ? text
      : (it.message ?? KIND_LABEL[it.kind]);
  }
  if (it.kind === "guild_invite") {
    const g = (it.payload as { guild_name?: unknown })?.guild_name;
    return typeof g === "string" && g.length > 0
      ? `${g} 길드에서 초대했어요.`
      : (it.message ?? KIND_LABEL[it.kind]);
  }
  return it.message ?? KIND_LABEL[it.kind];
}

function asCount(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.max(0, Math.floor(v))
    : 0;
}

function asId(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function materialName(id: string): string {
  return V2_MATERIALS[id]?.name ?? id;
}

function equipName(id: string): string {
  return EQUIPMENT_BY_ID[id]?.name ?? id;
}

function cashItemName(id: string): string {
  return isMuseunShopItemId(id) ? MUSEUN_CASH_ITEMS[id].name : id;
}

function cookingIngredientName(id: string): string {
  const [kind, itemId] = id.split(":");
  if (kind === "farm" && Object.hasOwn(FARM_ITEMS, itemId)) {
    return FARM_ITEMS[itemId as keyof typeof FARM_ITEMS].name;
  }
  if (kind === "fishing" && Object.hasOwn(FISHING_CATCH_ITEMS, itemId)) {
    return FISHING_CATCH_ITEMS[itemId as keyof typeof FISHING_CATCH_ITEMS].name;
  }
  return (
    COOKING_PANTRY_ITEMS.find((item) => item.id === id)?.name ??
    COOKING_PROCESSING_RECIPES.find((recipe) => recipe.outputId === id)?.name ??
    id
  );
}

function pushReward(lines: string[], label: string, count: number) {
  if (count > 0) lines.push(`${label} x${count.toLocaleString()}`);
}

function pushMaterialRewards(lines: string[], raw: unknown) {
  if (!Array.isArray(raw)) return;
  for (const m of raw) {
    if (typeof m !== "object" || m === null) continue;
    const row = m as { materialId?: unknown; count?: unknown };
    const id = asId(row.materialId);
    const count = asCount(row.count);
    if (id && count > 0) pushReward(lines, materialName(id), count);
  }
}

function pushEquipRewards(lines: string[], raw: unknown) {
  if (!Array.isArray(raw)) return;
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as { itemId?: unknown; count?: unknown };
    const id = asId(row.itemId);
    const count = asCount(row.count);
    if (id && count > 0) pushReward(lines, equipName(id), count);
  }
}

function pushCookingIngredientRewards(lines: string[], raw: unknown) {
  if (!Array.isArray(raw)) return;
  for (const ingredient of raw) {
    if (typeof ingredient !== "object" || ingredient === null) continue;
    const row = ingredient as { ingredientId?: unknown; count?: unknown };
    const id = asId(row.ingredientId);
    const count = asCount(row.count);
    if (id && count > 0) pushReward(lines, cookingIngredientName(id), count);
  }
}

function pushCashItemRewards(lines: string[], raw: unknown) {
  if (!Array.isArray(raw)) return;
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as { itemId?: unknown; count?: unknown };
    const id = asId(row.itemId);
    const count = asCount(row.count);
    if (id && count > 0) pushReward(lines, cashItemName(id), count);
  }
}

function pushTitleRewards(lines: string[], raw: unknown) {
  if (!Array.isArray(raw)) return;
  for (const value of raw) {
    const id = asId(value);
    if (id && TITLES[id]) lines.push(`칭호 ‘${TITLES[id].name}’`);
  }
}

function rewardLinesOf(it: InboxItem): string[] {
  const p = it.payload ?? {};
  const lines: string[] = [];

  switch (it.kind) {
    case "sale_proceeds":
    case "bid_refund":
    case "buy_order_refund":
      pushReward(lines, "골드", asCount(p.gold));
      break;
    case "buy_order_item": {
      const kind = asId(p.item_kind);
      const id = asId(p.item_id);
      const qty = asCount(p.quantity);
      if (id && qty > 0) {
        const label =
          kind === "material"
            ? materialName(id)
            : kind === "cash"
              ? cashItemName(id)
              : "완성 음식";
        pushReward(lines, label, qty);
      }
      break;
    }
    case "buy_order_equipment": {
      const id = asId(p.item_id);
      if (id) pushReward(lines, equipName(id), 1);
      break;
    }
    case "purchase_item":
    case "cancel_return":
    case "listing_expired": {
      const kind = asId(p.item_kind);
      const id = asId(p.item_id);
      const qty = asCount(p.quantity);
      if (id && qty > 0) {
        const label =
          kind === "equip"
            ? equipName(id)
            : kind === "material"
              ? materialName(id)
              : kind === "recipe"
                ? `제작서: ${id}`
                : id;
        pushReward(lines, label, qty);
      }
      break;
    }
    case "recipe_gift": {
      const name = asId(p.recipe_name) ?? asId(p.recipe_id);
      if (name) lines.push(`제작서: ${name}`);
      break;
    }
    case "guild_quest_reward":
      pushReward(lines, "골드", asCount(p.gold));
      pushMaterialRewards(lines, p.materials);
      pushEquipRewards(lines, p.items);
      break;
    case "season_reward": {
      const coinLabel: Record<string, string> = {
        pvp: "투기장 코인",
        fishing: "낚시 코인",
      };
      const season = asId(p.season) ?? "";
      pushReward(lines, coinLabel[season] ?? "코인", asCount(p.coins));
      break;
    }
    case "admin_gift":
      pushReward(lines, "골드", asCount(p.gold));
      pushReward(lines, "무슨 코인", asCount(p.museunCoins));
      pushMaterialRewards(lines, p.materials);
      pushCookingIngredientRewards(lines, p.cookingIngredients);
      pushEquipRewards(lines, p.items);
      pushCashItemRewards(lines, p.cashItems);
      pushReward(lines, "스태미나 회복약", asCount(p.staminaPotions));
      pushReward(lines, "월간 모험 지원권", asCount(p.adventureSupportDays));
      pushTitleRewards(lines, p.titleIds);
      break;
    case "user_message":
    case "price_alert":
    case "guild_invite":
      break;
  }

  return lines;
}

const KIND_LABEL: Record<InboxItem["kind"], string> = {
  user_message: "쪽지",
  sale_proceeds: "판매 대금",
  bid_refund: "입찰금 반환",
  buy_order_refund: "구매 주문 환불",
  buy_order_item: "구매 주문 체결",
  buy_order_equipment: "장비 구매 주문 체결",
  price_alert: "시세 알림",
  purchase_item: "구매 물품",
  cancel_return: "취소 반환",
  recipe_gift: "제작서 선물",
  listing_expired: "매물 만료",
  guild_invite: "길드 초대",
  guild_quest_reward: "길드 의뢰 보상",
  season_reward: "순위 보상",
  admin_gift: "운영자 우편",
};

function formatFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Tab = "inbox" | "sent";

type InboxClaimErrorPayload = {
  error?: string;
  reason?: string;
  expiresAt?: string;
  permanent?: boolean;
};

export function inboxClaimErrorLabel(
  payload: InboxClaimErrorPayload | null,
  status: number,
): string {
  if (isTradeSuspensionMessagePayload(payload)) {
    return tradeSuspensionMessage(payload);
  }
  return payload?.error ?? `수령 실패 (${status})`;
}

export function V2InboxView({
  onBack,
  embedded = false,
}: {
  onBack?: () => void;
  embedded?: boolean;
}) {
  // 초대 수락 시 공유 길드 상태(viewerGuildId) 갱신용 — 수락하면 길드에 합류하므로.
  const { applyResourcePatch, refreshGameState, refreshGuildId } = useGameState();
  const { notifyReward } = useRewardToast();
  const [tab, setTab] = useState<Tab>("inbox");
  const [items, setItems] = useState<InboxItem[] | null>(null);
  // 보낸 우편(기록) — 탭 진입 시 지연 로드. 쪽지 전송 후엔 null 로 무효화한다.
  const [sent, setSent] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useSystemMessageState();
  const [composeOpen, setComposeOpen] = useState(false);
  // 상세 모달로 내용을 보고 있는 우편(없으면 닫힘).
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetchInbox();
      setItems(r.items);
      // 상단 통합 알림 배지 재동기화 — 우편함 (재)로드 시(수령/초대 후) 60s 폴링 안 기다림.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("v2inbox:refresh"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "우편함 로드 실패");
      setItems([]);
    }
  }, []);

  const loadSent = useCallback(async () => {
    setError(null);
    try {
      const r = await fetchInboxSent();
      setSent(r.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "보낸 우편 기록 로드 실패");
      setSent([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 로드
    void load();
  }, [load]);

  const switchTab = useCallback(
    (t: Tab) => {
      setTab(t);
      if (t === "sent" && sent === null) void loadSent();
    },
    [loadSent, sent],
  );

  const openMail = useCallback((item: InboxItem) => {
    setSelected(item);
    setReadError(null);
    if (item.direction === "sent" || item.readAt) return;

    void markInboxRead(item.id)
      .then((result) => {
        const applyRead = (current: InboxItem): InboxItem =>
          current.id === item.id
            ? {
                ...current,
                readAt: result.readAt,
                claimedAt: result.claimedAt,
                claimState: result.claimState,
                hasReward: result.claimState === "claimable",
              }
            : current;
        setItems((current) => current?.map(applyRead) ?? []);
        setSelected((current) => (current ? applyRead(current) : null));
        window.dispatchEvent(new Event("v2inbox:refresh"));
      })
      .catch((cause: unknown) => {
        setReadError(cause instanceof Error ? cause.message : "읽음 처리 실패");
      });
  }, []);

  const claim = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0 || busy) return;
      setBusy(true);
      setError(null);
      setMsg(null);
      try {
        const res = await fetch("/api/marketplace/inbox/claim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          goldAdded?: number;
          bankedGoldAdded?: number;
          newGold?: number | null;
          newBankedGold?: number | null;
          coinsAdded?: { season: string; coins: number }[];
          museunCoinsAdded?: number;
          museunCoins?: number | null;
          cashItemsAdded?: { itemId: string; count: number }[];
          cookingIngredientsAdded?: { ingredientId: string; count: number }[];
          staminaPotionsAdded?: number;
          staminaPotions?: number | null;
          adventureSupportDaysAdded?: number;
          adventureSupportActiveUntil?: number | null;
          titleIdsAdded?: string[];
          itemsAdded?: { quantity: number }[];
          equipV2Added?: { count: number }[];
          materialsV2Added?: { count: number }[];
          instancesAdded?: unknown[];
          error?: string;
          reason?: string;
          expiresAt?: string;
          permanent?: boolean;
        } | null;
        if (!res.ok || !j?.ok) {
          setError(inboxClaimErrorLabel(j, res.status));
          return;
        }
        const gold = j.goldAdded ?? 0;
        const bankedGold = j.bankedGoldAdded ?? 0;
        // 코인은 시즌별로 다른 지갑이라 합산하지 않고 종류별로 표시.
        const coinLabel: Record<string, string> = {
          pvp: "투기장 코인",
          fishing: "낚시 코인",
        };
        const parts: string[] = [];
        if (gold > 0) parts.push(`+${gold.toLocaleString()} 골드`);
        if (bankedGold > 0) {
          parts.push(`+${bankedGold.toLocaleString()} 은행 골드`);
        }
        applyResourcePatch({
          gold: typeof j.newGold === "number" ? j.newGold : undefined,
          bankedGold:
            typeof j.newBankedGold === "number" ? j.newBankedGold : undefined,
        });
        for (const c of j.coinsAdded ?? []) {
          if (c.coins > 0) {
            parts.push(
              `+${c.coins.toLocaleString()} ${coinLabel[c.season] ?? "코인"}`,
            );
          }
        }
        if ((j.museunCoinsAdded ?? 0) > 0) {
          parts.push(`+${(j.museunCoinsAdded ?? 0).toLocaleString()} 무슨 코인`);
        }
        for (const item of j.cashItemsAdded ?? []) {
          if (item.count > 0) {
            parts.push(`+${cashItemName(item.itemId)} ${item.count}개`);
          }
        }
        for (const ingredient of j.cookingIngredientsAdded ?? []) {
          if (ingredient.count > 0) {
            parts.push(
              `+${cookingIngredientName(ingredient.ingredientId)} ${ingredient.count}개`,
            );
          }
        }
        if ((j.staminaPotionsAdded ?? 0) > 0) {
          parts.push(`+스태미나 회복약 ${j.staminaPotionsAdded}개`);
        }
        if (typeof j.staminaPotions === "number") {
          applyResourcePatch({ staminaPotions: j.staminaPotions });
        }
        if ((j.adventureSupportDaysAdded ?? 0) > 0) {
          const until = j.adventureSupportActiveUntil;
          parts.push(
            `+월간 모험 지원권 ${j.adventureSupportDaysAdded}일${
              typeof until === "number"
                ? ` (${new Date(until).toLocaleDateString("ko-KR")}까지)`
                : ""
            }`,
          );
          // 최대 스태미나·회복 보너스·50회 전투 권한을 즉시 전역 상태에 반영한다.
          await refreshGameState();
        }
        const titleNames = (j.titleIdsAdded ?? [])
          .map((id) => TITLES[id]?.name)
          .filter((name): name is string => Boolean(name));
        for (const name of titleNames) parts.push(`+칭호 ‘${name}’`);
        if (titleNames.length > 0) await refreshGameState();
        // 재료/장비(운영자 우편·길드 보상 등) — 총 수량으로 요약.
        const itemQty = (j.itemsAdded ?? []).reduce(
          (s, it) => s + (it.quantity ?? 0),
          0,
        );
        const equipV2Qty = (j.equipV2Added ?? []).reduce(
          (s, e) => s + (e.count ?? 0),
          0,
        );
        const materialsV2Qty = (j.materialsV2Added ?? []).reduce(
          (s, m) => s + (m.count ?? 0),
          0,
        );
        const totalItems =
          itemQty + equipV2Qty + materialsV2Qty + (j.instancesAdded?.length ?? 0);
        if (totalItems > 0) parts.push(`+아이템 ${totalItems}개`);
        const text = parts.join(" · ");
        setMsg(parts.length > 0 ? `✓ 수령 완료 — ${text}` : "✓ 수령 완료");
        notifyReward("우편 수령 완료", text);
        setSelected(null);
        // 완료 우편도 같은 받은 우편 목록에 남으므로 통합 목록을 다시 불러온다.
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "수령 실패");
      } finally {
        setBusy(false);
      }
    },
    [applyResourcePatch, busy, load, notifyReward, refreshGameState, setMsg],
  );

  const respondInvite = useCallback(
    async (it: InboxItem, accept: boolean) => {
      const inviteId = (it.payload as { invite_id?: unknown })?.invite_id;
      if (typeof inviteId !== "number" || busy) return;
      setBusy(true);
      setError(null);
      setMsg(null);
      try {
        if (accept) {
          const r = await acceptGuildInvite(inviteId);
          setMsg(`✓ ${r.guildName} 길드에 합류했어요.`);
          // 합류로 소속이 바뀌었으니 공유 길드 상태 갱신(길드 탭·거점 로직이 viewerGuildId 사용).
          await refreshGuildId();
        } else {
          await declineGuildInvite(inviteId);
          setMsg("초대를 거절했어요.");
        }
        setSelected(null);
        await load();
      } catch (e) {
        setError(
          e instanceof GuildError
            ? e.message
            : e instanceof Error
              ? e.message
              : "처리 실패",
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, load, refreshGuildId, setMsg],
  );

  const deleteMail = useCallback(
    async (item: InboxItem) => {
      if (busy) return;
      const confirmed = await confirmGameAction({
        title: "받은 우편 삭제",
        message:
          "이 우편을 삭제할까요?\n삭제한 우편은 받은 우편함에서 다시 확인할 수 없습니다.",
        confirmLabel: "삭제",
        tone: "danger",
      });
      if (!confirmed) return;

      setBusy(true);
      setError(null);
      setMsg(null);
      try {
        await deleteReceivedInbox(item.id);
        setItems((current) =>
          current?.filter((currentItem) => currentItem.id !== item.id) ?? [],
        );
        setSelected((current) => (current?.id === item.id ? null : current));
        setMsg("우편을 삭제했어요.");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("v2inbox:refresh"));
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "우편 삭제 실패");
      } finally {
        setBusy(false);
      }
    },
    [busy, setMsg],
  );

  const displayed = (tab === "inbox" ? items : sent) ?? [];
  const loading = tab === "inbox" ? items === null : sent === null;
  const claimableIds = bulkClaimIds(items ?? []);

  const unreadCount = items?.filter(isUnreadInboxItem).length ?? 0;

  const Root = embedded ? "section" : "main";

  return (
    <Root
      className={
        embedded
          ? "space-y-4 text-zinc-900 dark:text-zinc-100"
          : "mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100"
      }
    >
      {!embedded && (
        <SubViewHeader
          title="우편함"
          onBack={() => onBack?.()}
          right={
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <PaperPlaneTilt size={16} weight="fill" />
              쪽지 쓰기
            </button>
          }
        />
      )}

      {embedded && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            <PaperPlaneTilt size={16} weight="fill" />
            쪽지 쓰기
          </button>
        </div>
      )}

      {/* 받은 우편 / 보낸 우편 탭 */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
        <TabButton
          active={tab === "inbox"}
          onClick={() => switchTab("inbox")}
          label={`받은 우편${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
        />
        <TabButton
          active={tab === "sent"}
          onClick={() => switchTab("sent")}
          label="보낸 우편"
        />
      </div>

      {/* 받은 우편 탭에서만 전체 수령 */}
      {tab === "inbox" && claimableIds.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => claim(claimableIds)}
            disabled={busy}
            className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            전체 수령 ({claimableIds.length})
          </button>
        </div>
      )}

      {msg && (
        <div className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</div>
      )}
      {error && (
        <div className="text-sm text-rose-600 dark:text-rose-400">{error}</div>
      )}

      {loading ? (
        <Card padding="md">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">불러오는 중…</div>
        </Card>
      ) : displayed.length === 0 ? (
        <Card padding="md">
          <div className="flex flex-col items-center gap-2 py-6 text-zinc-600 dark:text-zinc-400">
            <Envelope size={32} weight="duotone" />
            <div className="text-sm">
              {tab === "inbox"
                ? "받은 우편이 없어요."
                : "보낸 우편 기록이 없어요."}
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {displayed.map((item) => (
            <InboxMailCard
              key={item.id}
              item={item}
              busy={busy}
              onOpen={openMail}
              onClaim={(id) => claim([id])}
              onRespondInvite={respondInvite}
              onDelete={deleteMail}
            />
          ))}
        </div>
      )}

      {selected && (
        <MailDetailModal
          item={selected}
          busy={busy}
          readError={readError}
          onClose={() => {
            setSelected(null);
            setReadError(null);
          }}
          onClaim={(id) => claim([id])}
          onRespondInvite={respondInvite}
          onDelete={deleteMail}
          onBlocked={(blockedUserId) => {
            setItems((current) =>
              current?.filter((item) => item.fromUserId !== blockedUserId) ?? [],
            );
            setSelected(null);
          }}
        />
      )}

      {composeOpen && (
        <SendMessageModal
          onClose={() => setComposeOpen(false)}
          onSent={(name) => {
            setSent(null);
            setMsg(`✓ ${name} 님에게 쪽지를 보냈어요.`);
            if (tab === "sent") void loadSent();
          }}
        />
      )}
    </Root>
  );
}

export function InboxMailCard({
  item,
  busy,
  onOpen,
  onClaim,
  onRespondInvite,
  onDelete,
}: {
  item: InboxItem;
  busy: boolean;
  onOpen: (item: InboxItem) => void;
  onClaim: (id: number) => void;
  onRespondInvite: (item: InboxItem, accept: boolean) => void;
  onDelete: (item: InboxItem) => void;
}) {
  const rewards = rewardLinesOf(item);
  const unread = isUnreadInboxItem(item);
  const pending = item.claimedAt == null;
  const claimable =
    item.direction !== "sent" &&
    pending &&
    item.claimState === "claimable";
  const actionable =
    item.direction !== "sent" && pending && item.claimState === "action";
  const deletable = item.direction !== "sent" && !pending;

  return (
    <article
      className={`${unread ? SURFACE_ACCENT : SURFACE_CARD} ui-game-card ui-inbox-card ui-lift-card p-3 ${rewards.length > 0 ? "has-reward" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {KIND_LABEL[item.kind]}
            </span>
            {item.direction === "sent" ? (
              <>
                <span>· 받는이 {item.recipientName ?? "알 수 없음"}</span>
                <span>· {item.readAt ? "읽음" : "미확인"}</span>
              </>
            ) : (
              item.fromName && <span>· {item.fromName}</span>
            )}
            {claimable && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                미수령
              </span>
            )}
            <span>· {timeAgo(item.createdAt)}</span>
          </div>
          <div
            className={`mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-100 ${unread ? "font-semibold" : ""}`}
          >
            {bodyOf(item)}
          </div>
          {rewards.length > 0 && (
            <div className="mt-2 line-clamp-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {rewards.join(" · ")}
            </div>
          )}
        </button>
        {actionable ? (
          <div className="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              onClick={() => onRespondInvite(item, true)}
              disabled={busy}
              className="rounded-md border border-emerald-700 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              수락
            </button>
            <button
              type="button"
              onClick={() => onRespondInvite(item, false)}
              disabled={busy}
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              거절
            </button>
          </div>
        ) : claimable ? (
          <button
            type="button"
            onClick={() => onClaim(item.id)}
            disabled={busy}
            className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            수령
          </button>
        ) : deletable ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(item);
            }}
            disabled={busy}
            aria-label={`${item.fromName ? `${item.fromName}님의 ` : ""}${KIND_LABEL[item.kind]} 삭제`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:bg-zinc-900 dark:text-rose-300 dark:hover:bg-rose-950"
          >
            <Trash size={14} aria-hidden />
            삭제
          </button>
        ) : null}
      </div>
    </article>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-emerald-600 text-zinc-900 dark:text-zinc-100"
          : "border-transparent text-zinc-600 hover:text-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-100"
      }`}
    >
      {label}
    </button>
  );
}

// 우편 상세 — 본문 전체 + 발신자/시각. 미수령 우편이면 수령/확인/초대응답 버튼도 노출.
export function MailDetailModal({
  item,
  busy,
  readError,
  onClose,
  onClaim,
  onRespondInvite,
  onBlocked,
  onDelete,
}: {
  item: InboxItem;
  busy: boolean;
  readError?: string | null;
  onClose: () => void;
  onClaim: (id: number) => void;
  onRespondInvite: (it: InboxItem, accept: boolean) => void;
  onBlocked: (blockedUserId: string) => void;
  onDelete: (item: InboxItem) => void;
}) {
  const sent = item.direction === "sent";
  const read = item.readAt != null;
  const claimed = item.claimedAt != null;
  const isInvite = IS_INVITE(item);
  const claimable = item.claimState === "claimable";
  const rewards = rewardLinesOf(item);
  useEscapeKey(onClose);
  const contentRef = useRef<HTMLDivElement>(null);
  useModalA11y(contentRef);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mail-detail-title"
      onClick={onClose}
      className="ui-modal-reveal fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4"
    >
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        className={`ui-modal-panel ${SURFACE_CARD} flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden shadow-xl`}
      >
        <div className="shrink-0 border-b border-zinc-200 px-5 py-4 dark:border-zinc-700 sm:px-6">
          <div className="flex items-start justify-between gap-2">
            <h2
              id="mail-detail-title"
              className="flex items-center gap-1.5 text-base font-semibold text-zinc-900 dark:text-zinc-100"
            >
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {KIND_LABEL[item.kind]}
              </span>
              {(sent || read) && (
                <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">
                  {sent ? (read ? "읽음" : "미확인") : "읽음"}
                </span>
              )}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            {sent ? (
              <span>
                받는이:{" "}
                {item.recipientName ? (
                  <PlayerNameLink name={item.recipientName} />
                ) : (
                  "알 수 없음"
                )}
              </span>
            ) : (
              item.fromName && (
                <span>
                  보낸이: <PlayerNameLink name={item.fromName} />
                </span>
              )
            )}
            <span>
              {(sent ? item.recipientName : item.fromName) ? "· " : ""}
              {sent ? "보낸 시각" : "받은 시각"}: {formatFull(item.createdAt)}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className={`${SURFACE_INSET} min-h-36 whitespace-pre-wrap break-words p-4 text-[15px] leading-7 text-zinc-800 dark:text-zinc-100 sm:p-5`}>
            {bodyOf(item)}
          </div>

          {!sent && item.kind === "user_message" && item.fromName && (
            <ContentSafetyActions
              sourceType="inbox_message"
              sourceId={item.id}
              targetName={item.fromName}
              className="mt-2"
              onBlocked={onBlocked}
            />
          )}

          {rewards.length > 0 && (
            <div className={`${SURFACE_INSET} mt-4 p-4`}>
              <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                포함된 보상
              </div>
              <div className="mt-2 space-y-1 text-sm text-emerald-950 dark:text-emerald-100">
                {rewards.map((reward, i) => (
                  <div key={`${reward}-${i}`}>{reward}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-zinc-200 px-5 py-3.5 dark:border-zinc-700 sm:px-6">
          {readError && (
            <p className="mr-auto self-center text-xs text-rose-600 dark:text-rose-400">
              {readError}
            </p>
          )}
          {sent ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              닫기
            </button>
          ) : !claimed && isInvite ? (
            <>
              <button
                type="button"
                onClick={() => onRespondInvite(item, false)}
                disabled={busy}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
              >
                거절
              </button>
              <button
                type="button"
                onClick={() => onRespondInvite(item, true)}
                disabled={busy}
                className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                수락
              </button>
            </>
          ) : !claimed && claimable ? (
            <button
              type="button"
              onClick={() => onClaim(item.id)}
              disabled={busy}
              className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              수령
            </button>
          ) : (
            <>
              {claimed && (
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  disabled={busy}
                  aria-label="우편 삭제"
                  className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:bg-zinc-900 dark:text-rose-300 dark:hover:bg-rose-950"
                >
                  <Trash size={15} aria-hidden />
                  삭제
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                닫기
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
