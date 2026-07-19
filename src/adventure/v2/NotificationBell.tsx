"use client";

// 알림 종 — 미읽음 수는 경량 폴링하고, 버튼을 열 때만 최근 알림을 조회한다.
// 미리보기에서는 읽음 처리하지 않으며 항목/전체 보기를 누르면 알림 페이지로 이동한다.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CaretRight } from "@phosphor-icons/react";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import { formatRelative } from "@/lib/notifications";
import {
  NOTIF_POLL_MS,
  type V2NotificationEntry,
} from "@/lib/v2-notification-config";

const PREVIEW_LIMIT = 5;

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
  }
}

export function NotificationBell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<V2NotificationEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/notifications?count=1");
      if (!res.ok) return;
      const json = (await res.json()) as { ok?: boolean; unreadCount?: number };
      if (json.ok) setUnread(json.unreadCount ?? 0);
    } catch {
      /* 폴링 — 조용히 무시 */
    }
  }, []);

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/v2/notifications");
      if (!res.ok) throw new Error("notification preview failed");
      const json = (await res.json()) as {
        ok?: boolean;
        notifications?: V2NotificationEntry[];
        unreadCount?: number;
      };
      if (!json.ok) throw new Error("notification preview failed");
      setItems((json.notifications ?? []).slice(0, PREVIEW_LIMIT));
      setUnread(json.unreadCount ?? 0);
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
    const onRead = () => void fetchCount();
    window.addEventListener("v2notif:read", onRead);
    return () => {
      clearInterval(id);
      window.removeEventListener("v2notif:read", onRead);
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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={togglePreview}
        aria-label={unread > 0 ? `알림 ${unread}개` : "알림"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <Bell size={18} weight="duotone" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="최근 알림 미리보기"
          className={`${SURFACE_CARD} ui-dropdown-reveal absolute right-0 top-full z-[70] mt-2 w-[min(22rem,calc(100vw-2rem))] origin-top-right overflow-hidden shadow-xl`}
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              최근 알림
            </h2>
            {unread > 0 && (
              <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                읽지 않음 {unread}개
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
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={openNotifications}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt === null ? "bg-rose-500" : "bg-zinc-300 dark:bg-zinc-600"}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm leading-5 text-zinc-800 dark:text-zinc-200">
                          {previewText(item)}
                        </span>
                        <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                          {formatRelative(item.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                도착한 알림이 없습니다.
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
