"use client";

// 우편 배지 — 미수령 수는 경량 폴링하고, 버튼을 열 때만 최근 우편을 조회한다.
// 미리보기의 항목/전체 보기를 누르면 우편함으로 이동한다.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretRight, Envelope } from "@phosphor-icons/react";
import {
  fetchInbox,
  type InboxItem,
} from "@/adventure/marketplace/api";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import { timeAgoKo } from "@/lib/timeFormat";
import { NOTIF_POLL_MS } from "@/lib/v2-notification-config";

const PREVIEW_LIMIT = 5;

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

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function previewTitle(item: InboxItem): string {
  if (item.kind === "user_message" && item.fromName) {
    return `${item.fromName}님의 쪽지`;
  }
  return KIND_LABEL[item.kind];
}

function previewBody(item: InboxItem): string {
  if (item.kind === "user_message") {
    return stringValue(item.payload.text) ?? "(내용 없음)";
  }
  if (item.kind === "guild_invite") {
    const guildName = stringValue(item.payload.guild_name);
    if (guildName) return `${guildName} 길드에서 초대했어요.`;
  }
  return item.message ?? KIND_LABEL[item.kind];
}

export function MailboxBell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/marketplace/inbox?count=1");
      if (!res.ok) return;
      const json = (await res.json()) as { unclaimedCount?: number };
      setUnread(json.unclaimedCount ?? 0);
    } catch {
      /* 폴링 — 조용히 무시 */
    }
  }, []);

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await fetchInbox();
      setItems(result.items.slice(0, PREVIEW_LIMIT));
      setUnread(result.unclaimedCount);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 비동기 fetch 후 setState — cascading render 아님(NotificationBell 동일 패턴).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCount();
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchCount();
    };
    const id = setInterval(tick, NOTIF_POLL_MS);
    const onRefresh = () => void fetchCount();
    window.addEventListener("v2inbox:refresh", onRefresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("v2inbox:refresh", onRefresh);
    };
  }, [fetchCount]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const togglePreview = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) void fetchPreview();
  };

  const openInbox = () => {
    setOpen(false);
    router.push("/plaza/inbox");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={togglePreview}
        aria-label={unread > 0 ? `우편 ${unread}개` : "우편함"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <Envelope size={18} weight="duotone" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="최근 우편 미리보기"
          className={`${SURFACE_CARD} ui-dropdown-reveal absolute right-0 top-full z-[70] mt-2 w-[min(22rem,calc(100vw-2rem))] origin-top-right overflow-hidden shadow-xl`}
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              최근 우편
            </h2>
            {unread > 0 && (
              <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                새 우편 {unread}개
              </span>
            )}
          </div>

          <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                우편을 불러오는 중…
              </p>
            ) : error ? (
              <button
                type="button"
                onClick={() => void fetchPreview()}
                className="w-full px-4 py-8 text-center text-sm text-rose-600 hover:bg-zinc-50 dark:text-rose-400 dark:hover:bg-zinc-800"
              >
                불러오지 못했습니다. 다시 시도
              </button>
            ) : items?.length ? (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={openInbox}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        <Envelope size={16} weight="duotone" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {previewTitle(item)}
                        </span>
                        <span className="mt-0.5 line-clamp-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                          {previewBody(item)}
                        </span>
                        <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                          {timeAgoKo(item.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                도착한 우편이 없습니다.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={openInbox}
            className="flex w-full items-center justify-center gap-1 border-t border-zinc-200 px-4 py-3 text-sm font-medium text-amber-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-amber-300 dark:hover:bg-zinc-800"
          >
            우편함 전체 보기
            <CaretRight size={14} weight="bold" />
          </button>
        </section>
      )}
    </div>
  );
}
