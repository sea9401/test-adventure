"use client";

// 통합 알림 종 — 일반 알림 미읽음 수와 미확인 우편 수를 합산한다.
// 버튼을 열면 두 채널의 최근 항목을 시간순으로 섞어 보여주고 통합 알림 센터로 이동한다.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CaretRight, Envelope } from "@phosphor-icons/react";
import { fetchInbox, type InboxItem } from "@/adventure/marketplace/api";
import { unreadInboxItems } from "@/adventure/v2/inboxViewState";
import { acknowledgeFarmReadyNotification } from "@/adventure/v2/farmReadyNotificationClient";
import { acknowledgeV2Notification } from "@/adventure/v2/notificationReadClient";
import { coopBossSessionHref } from "@/adventure/v2/coop/coopRoutes";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import { feedbackReplyHref } from "@/lib/feedbackNavigation";
import { formatRelative } from "@/lib/notifications";
import {
  NOTIF_POLL_MS,
  unreadV2Notifications,
  type V2NotificationEntry,
} from "@/lib/v2-notification-config";

const PREVIEW_LIMIT = 5;

const MAIL_KIND_LABEL: Record<InboxItem["kind"], string> = {
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

function previewText(notification: V2NotificationEntry): string {
  const payload = notification.payload;
  switch (notification.type) {
    case "outpost_attacked":
      return "길드 시설이 공격받았습니다.";
    case "outpost_lost":
      return "길드 시설 상태가 변경되었습니다.";
    case "ejected": {
      const p = payload as { byName?: string };
      return `${p.byName ?? "상대"}와의 이전 전투 기록이 있습니다.`;
    }
    case "title_unlocked": {
      const p = payload as { titleName: string; hidden?: boolean };
      return `${p.hidden ? "히든 " : ""}칭호 '${p.titleName}'을(를) 획득했습니다.`;
    }
    case "guild_join_requested": {
      const p = payload as { applicantName: string; guildName: string };
      return `${p.applicantName} 님이 ${p.guildName} 길드에 가입을 신청했습니다.`;
    }
    case "guild_join_accepted": {
      const p = payload as { guildName: string };
      return `${p.guildName} 길드 가입 신청이 수락되었습니다.`;
    }
    case "guild_join_declined": {
      const p = payload as { guildName: string };
      return `${p.guildName} 길드 가입 신청이 거절되었습니다.`;
    }
    case "coop_defeated": {
      const p = payload as { bossName: string };
      return `협동 보스 ${p.bossName}이(가) 처치되었습니다.`;
    }
    case "feedback_replied": {
      const p = payload as { feedbackId: number };
      return `내 건의 #${p.feedbackId}에 관리자 답변이 등록되었습니다.`;
    }
    case "farm_ready": {
      const p = payload as { readyCount: number };
      return `수확 가능한 작물이 ${p.readyCount}개 있어요.`;
    }
    case "codex_research_trophy": {
      const p = payload as { seasonId: string; themeName: string; tier: import("@/adventure/data/v2/codexMasteryTrophies").CodexMasteryTrophyTier; finalRank: number };
      const labels = { bronze: "동", silver: "은", gold: "금", platinum: "백금", diamond: "다이아", legendary: "전설" } as const;
      return `${p.seasonId} ${p.themeName} 최종 ${p.finalRank}위 · ${labels[p.tier]} 트로피`;
    }
  }
}

function mailPreviewText(item: InboxItem): string {
  if (item.kind === "user_message") {
    const text = item.payload.text;
    return typeof text === "string" && text.length > 0 ? text : "(내용 없음)";
  }
  if (item.kind === "guild_invite") {
    const guildName = item.payload.guild_name;
    if (typeof guildName === "string" && guildName.length > 0) {
      return `${guildName} 길드에서 초대했어요.`;
    }
  }
  return item.message ?? MAIL_KIND_LABEL[item.kind];
}

type PreviewEntry =
  | { kind: "notification"; timestamp: number; item: V2NotificationEntry }
  | { kind: "mail"; timestamp: number; item: InboxItem };

export function NotificationBell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [notificationUnread, setNotificationUnread] = useState(0);
  const [mailUnread, setMailUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PreviewEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchCount = useCallback(async () => {
    const [notificationResult, mailResult] = await Promise.allSettled([
      fetch("/api/v2/notifications?count=1").then(async (res) => {
        if (!res.ok) throw new Error("notification count failed");
        return (await res.json()) as { ok?: boolean; unreadCount?: number };
      }),
      fetch("/api/marketplace/inbox?count=1").then(async (res) => {
        if (!res.ok) throw new Error("mail count failed");
        return (await res.json()) as { unreadCount?: number };
      }),
    ]);

    if (
      notificationResult.status === "fulfilled" &&
      notificationResult.value.ok
    ) {
      setNotificationUnread(notificationResult.value.unreadCount ?? 0);
    }
    if (mailResult.status === "fulfilled") {
      setMailUnread(mailResult.value.unreadCount ?? 0);
    }
  }, []);

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [notificationRes, inbox] = await Promise.all([
        fetch("/api/v2/notifications"),
        fetchInbox(),
      ]);
      if (!notificationRes.ok) throw new Error("notification preview failed");
      const notificationJson = (await notificationRes.json()) as {
        ok?: boolean;
        notifications?: V2NotificationEntry[];
        unreadCount?: number;
      };
      if (!notificationJson.ok) throw new Error("notification preview failed");

      const combined: PreviewEntry[] = [
        ...unreadV2Notifications(notificationJson.notifications ?? []).map(
          (item) => ({
            kind: "notification" as const,
            timestamp: item.createdAt,
            item,
          }),
        ),
        ...unreadInboxItems(inbox.items).map((item) => ({
          kind: "mail" as const,
          timestamp: Date.parse(item.createdAt),
          item,
        })),
      ];
      setItems(
        combined
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, PREVIEW_LIMIT),
      );
      setNotificationUnread(notificationJson.unreadCount ?? 0);
      setMailUnread(inbox.unreadCount);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 비동기 fetch 후 setState — cascading render 아님(ServerFeedView 동일 패턴).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCount();
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchCount();
    };
    const id = setInterval(tick, NOTIF_POLL_MS);
    const onRefresh = () => void fetchCount();
    window.addEventListener("v2notif:read", onRefresh);
    window.addEventListener("v2inbox:refresh", onRefresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("v2notif:read", onRefresh);
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

  const openNotifications = () => {
    setOpen(false);
    router.push("/notifications");
  };

  const openNotification = (notification: V2NotificationEntry) => {
    if (notification.type === "coop_defeated") {
      const { sessionId } = notification.payload as { sessionId: string };
      setOpen(false);
      setNotificationUnread((current) => Math.max(0, current - 1));
      setItems((current) =>
        current?.filter(
          (entry) =>
            entry.kind !== "notification" || entry.item.id !== notification.id,
        ) ?? null,
      );
      void acknowledgeV2Notification(notification.id);
      router.push(coopBossSessionHref(sessionId));
      return;
    }
    if (notification.type === "feedback_replied") {
      const { feedbackId } = notification.payload as { feedbackId: number };
      setOpen(false);
      setNotificationUnread((current) => Math.max(0, current - 1));
      setItems((current) =>
        current?.filter(
          (entry) =>
            entry.kind !== "notification" ||
            entry.item.id !== notification.id,
        ) ?? null,
      );
      void acknowledgeV2Notification(notification.id);
      router.push(feedbackReplyHref(feedbackId));
      return;
    }
    if (notification.type !== "farm_ready") {
      openNotifications();
      return;
    }
    setOpen(false);
    void acknowledgeFarmReadyNotification();
    router.push("/town/farm");
  };

  const openMail = () => {
    setOpen(false);
    router.push("/plaza/inbox");
  };

  const totalUnread = notificationUnread + mailUnread;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={togglePreview}
        aria-label={
          totalUnread > 0 ? `알림 및 우편 ${totalUnread}개` : "알림 및 우편"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative flex min-h-11 min-w-11 items-center justify-center rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 sm:min-h-0 sm:min-w-0 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <Bell size={18} weight="duotone" />
        {totalUnread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="최근 알림 및 우편 미리보기"
          className={`${SURFACE_CARD} ui-dropdown-reveal fixed inset-x-4 top-14 z-[70] mt-2 w-auto origin-top overflow-hidden shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:w-[min(22rem,calc(100vw-2rem))] sm:origin-top-right`}
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              최근 알림 및 우편
            </h2>
            {totalUnread > 0 && (
              <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                확인할 항목 {totalUnread}개
              </span>
            )}
          </div>

          <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                알림을 불러오는 중…
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
                {items.map((entry) =>
                  entry.kind === "notification" ? (
                    <li key={`notification-${entry.item.id}`}>
                      <button
                        type="button"
                        onClick={() => openNotification(entry.item)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${entry.item.readAt === null ? "bg-rose-500" : "bg-zinc-300 dark:bg-zinc-600"}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-sm leading-5 text-zinc-800 dark:text-zinc-200">
                            {previewText(entry.item)}
                          </span>
                          <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                            {formatRelative(entry.timestamp)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ) : (
                    <li key={`mail-${entry.item.id}`}>
                      <button
                        type="button"
                        onClick={openMail}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          <Envelope size={16} weight="duotone" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {MAIL_KIND_LABEL[entry.item.kind]}
                            {entry.item.fromName
                              ? ` · ${entry.item.fromName}`
                              : ""}
                          </span>
                          <span className="mt-0.5 line-clamp-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                            {mailPreviewText(entry.item)}
                          </span>
                          <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                            {formatRelative(entry.timestamp)} · 미확인
                          </span>
                        </span>
                      </button>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                도착한 알림과 우편이 없습니다.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={openNotifications}
            className="flex w-full items-center justify-center gap-1 border-t border-zinc-200 px-4 py-3 text-sm font-medium text-amber-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-amber-300 dark:hover:bg-zinc-800"
          >
            전체 알림 보기
            <CaretRight size={14} weight="bold" />
          </button>
        </section>
      )}
    </div>
  );
}
