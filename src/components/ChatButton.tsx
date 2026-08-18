"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatCircle, X } from "@phosphor-icons/react";
import { isNoticeMessage } from "@/lib/chat-config";
import { ChatPanel, type ChatMessage } from "./ChatPanel";
import { CHAT_CLOSE_REQUEST_EVENT } from "./chat/useMobileChatHistory";
import {
  fetchMainChatMessages,
  latestChatMessageId,
  mergeChatMessages,
} from "./chat/chatMessagesApi";
import { chatPollDelayMs } from "./chat/chatPollingPolicy";

// 패널이 닫혀 있을 땐 unread 배지 갱신용으로 느리게,
// 열려 있을 땐 상대 메시지 수신감을 살리려 짧게 폴링.
// 배경 폴링은 모든 로그인 유저에게서 영구히 도는 비용이라 보수적으로 길게.
// 모바일 전체화면에는 헤더 닫기 버튼이 있으므로 열린 플로팅 토글을 숨겨
// 하단 전송 버튼과 겹치지 않게 한다. 데스크톱에서는 도킹 패널(z-45) 위에 남긴다.
export const CHAT_FLOATING_CLOSED_LAYER_CLASS = "z-[44]";
export const CHAT_FLOATING_OPEN_LAYER_CLASS =
  "invisible pointer-events-none z-[44] sm:visible sm:pointer-events-auto sm:z-[46]";
// 채팅 / 알림(협동 보스 등) 의 "마지막으로 본 메시지 id" 를 따로 저장 — 둘이 섞이지 않게.
const LAST_SEEN_KEY = "chat:lastSeenId";
const LAST_SEEN_TRADE_KEY = "chat:lastSeenTradeId";
const LAST_SEEN_NOTICE_KEY = "chat:lastSeenNoticeId";
const LAST_SEEN_GUILD_KEY = "chat:lastSeenGuildId";

function readId(key: string): number {
  if (typeof window === "undefined") return 0;
  const v = window.localStorage.getItem(key);
  const n = v ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
}

function writeId(key: string, id: number) {
  window.localStorage.setItem(key, String(id));
}

export function ChatButton({
  name,
  className,
  title,
  viewerGuildId,
  variant = "inline",
  onSent,
}: {
  name: string;
  className: string;
  title: string | null;
  viewerGuildId: number | null;
  variant?: "inline" | "floating";
  /** 메시지 전송 성공 시 1회 호출 — '수다쟁이' 칭호 카운터 등에 사용. */
  onSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tradeMessages, setTradeMessages] = useState<ChatMessage[]>([]);
  const [guildMessages, setGuildMessages] = useState<ChatMessage[]>([]);
  const [lastSeenChatId, setLastSeenChatId] = useState<number>(() =>
    readId(LAST_SEEN_KEY),
  );
  const [lastSeenGuildId, setLastSeenGuildId] = useState<number>(() =>
    readId(LAST_SEEN_GUILD_KEY),
  );
  const [lastSeenTradeId, setLastSeenTradeId] = useState<number>(() =>
    readId(LAST_SEEN_TRADE_KEY),
  );
  const [lastSeenNoticeId, setLastSeenNoticeId] = useState<number>(() =>
    readId(LAST_SEEN_NOTICE_KEY),
  );
  const guildAvailable = viewerGuildId != null;

  // 패널이 닫혀 있어도 새 메시지 배지를 위해 느리게 폴링한다. 첫 응답만 최신
  // 100개 전체를 받고 이후에는 마지막 id 뒤의 메시지만 받아 합친다. 탭이 숨겨진
  // 동안에는 멈추고, 다시 보이면 즉시 한 번 동기화한다.
  useEffect(() => {
    let cancelled = false;
    let initialized = false;
    let globalAfterId = 0;
    let tradeAfterId = 0;
    let guildAfterId = 0;
    let running = false;
    let timeoutId: number | null = null;

    const clearScheduledTick = () => {
      if (timeoutId == null) return;
      window.clearTimeout(timeoutId);
      timeoutId = null;
    };

    const scheduleNextTick = () => {
      clearScheduledTick();
      if (cancelled || document.visibilityState === "hidden") return;
      timeoutId = window.setTimeout(
        () => void tick(),
        chatPollDelayMs(open),
      );
    };

    const tick = async () => {
      if (cancelled || running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const {
          global: next,
          trade: nextTrade,
          guild: nextGuild,
        } = await fetchMainChatMessages({
          includeGuild: guildAvailable,
          ...(initialized
            ? {
                globalAfterId,
                tradeAfterId,
                guildAfterId,
              }
            : {}),
        });
        if (cancelled) return;
        globalAfterId = Math.max(globalAfterId, latestChatMessageId(next));
        tradeAfterId = Math.max(tradeAfterId, latestChatMessageId(nextTrade));
        guildAfterId = Math.max(guildAfterId, latestChatMessageId(nextGuild));
        // 최초 조회도 기존 상태와 병합한다. 패널을 연 직후 보낸 메시지가 먼저
        // 상태에 들어온 뒤 느린 최초 조회가 끝나더라도 과거 스냅샷으로 덮어쓰지 않는다.
        setMessages((previous) => mergeChatMessages(previous, next));
        setTradeMessages((previous) =>
          mergeChatMessages(previous, nextTrade),
        );
        setGuildMessages((previous) =>
          mergeChatMessages(previous, nextGuild),
        );
        if (!initialized) {
          initialized = true;
          // 한 번도 채팅을 본 적 없는 유저라면 (lastSeen === 0), 첫 폴링 결과의
          // 최신 id 로 점프시켜서 옛 메시지를 모두 unread 로 표시하지 않게 한다.
          const lastChat = next.reduce(
            (mx, m) => (!isNoticeMessage(m) && m.id > mx ? m.id : mx),
            0,
          );
          const lastNotice = next.reduce(
            (mx, m) => (isNoticeMessage(m) && m.id > mx ? m.id : mx),
            0,
          );
          const lastGuild = nextGuild.reduce(
            (mx, m) => (m.id > mx ? m.id : mx),
            0,
          );
          const lastTrade = latestChatMessageId(nextTrade);
          // 두 경우에 prev 를 현재 최신 id 로 맞춤:
          //  (a) 신규 유저 (prev=0) — 옛 메시지 전부 unread 로 표시되는 거 막음.
          //  (b) prev > lastChat — DB 마이그레이션 등으로 messages.id serial 이 작은 값부터
          //      다시 시작했을 때, 옛 localStorage 값이 "미래 id" 라 모든 m.id > prev 가
          //      false 가 되어 빨간/노란 dot 이 영영 안 뜨는 버그. 현재 최신으로 클램프.
          setLastSeenChatId((prev) => {
            if (lastChat === 0) return prev;
            if (prev !== 0 && prev <= lastChat) return prev;
            writeId(LAST_SEEN_KEY, lastChat);
            return lastChat;
          });
          setLastSeenNoticeId((prev) => {
            if (lastNotice === 0) return prev;
            if (prev !== 0 && prev <= lastNotice) return prev;
            writeId(LAST_SEEN_NOTICE_KEY, lastNotice);
            return lastNotice;
          });
          setLastSeenTradeId((prev) => {
            if (lastTrade === 0) return prev;
            if (prev !== 0 && prev <= lastTrade) return prev;
            writeId(LAST_SEEN_TRADE_KEY, lastTrade);
            return lastTrade;
          });
          setLastSeenGuildId((prev) => {
            if (lastGuild === 0) return prev;
            if (prev !== 0 && prev <= lastGuild) return prev;
            writeId(LAST_SEEN_GUILD_KEY, lastGuild);
            return lastGuild;
          });
        }
      } catch {
        // 네트워크 오류는 다음 폴링에서 자동 재시도.
      } finally {
        running = false;
        scheduleNextTick();
      }
    };

    const handleVisibilityChange = () => {
      clearScheduledTick();
      if (document.visibilityState === "visible") void tick();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (document.visibilityState === "visible") void tick();
    return () => {
      cancelled = true;
      clearScheduledTick();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [open, guildAvailable]);

  // ChatPanel 이 보고 있는 탭의 최신 메시지를 본 것으로 처리.
  const handleSeen = useCallback(
    (kind: "chat" | "trade" | "guild" | "notice", lastId: number) => {
      if (kind === "chat") {
        setLastSeenChatId((prev) => {
          if (lastId <= prev) return prev;
          writeId(LAST_SEEN_KEY, lastId);
          return lastId;
        });
      } else if (kind === "trade") {
        setLastSeenTradeId((prev) => {
          if (lastId <= prev) return prev;
          writeId(LAST_SEEN_TRADE_KEY, lastId);
          return lastId;
        });
      } else if (kind === "guild") {
        setLastSeenGuildId((prev) => {
          if (lastId <= prev) return prev;
          writeId(LAST_SEEN_GUILD_KEY, lastId);
          return lastId;
        });
      } else {
        setLastSeenNoticeId((prev) => {
          if (lastId <= prev) return prev;
          writeId(LAST_SEEN_NOTICE_KEY, lastId);
          return lastId;
        });
      }
    },
    [],
  );

  const handleMessageSent = useCallback(
    (m: ChatMessage) => {
      if (m.channel === "guild") {
        setGuildMessages((prev) =>
          prev.some((x) => x.id === m.id) ? prev : [...prev, m],
        );
      } else if (m.channel === "trade") {
        setTradeMessages((prev) =>
          prev.some((x) => x.id === m.id) ? prev : [...prev, m],
        );
      } else {
        setMessages((prev) =>
          prev.some((x) => x.id === m.id) ? prev : [...prev, m],
        );
      }
      onSent?.();
    },
    [onSent],
  );

  const hasUnreadChat = messages.some(
    (m) => !isNoticeMessage(m) && m.id > lastSeenChatId && !m.mine,
  );
  const hasUnreadGuild = guildMessages.some(
    (m) => m.id > lastSeenGuildId && !m.mine,
  );
  const hasUnreadTrade = tradeMessages.some(
    (m) => m.id > lastSeenTradeId && !m.mine,
  );
  const hasUnreadNotice = messages.some(
    (m) => isNoticeMessage(m) && m.id > lastSeenNoticeId && !m.mine,
  );
  const hasUnread =
    hasUnreadChat || hasUnreadTrade || hasUnreadGuild || hasUnreadNotice;
  const floating = variant === "floating";
  const floatingLayerClass = open
    ? CHAT_FLOATING_OPEN_LAYER_CLASS
    : CHAT_FLOATING_CLOSED_LAYER_CLASS;

  return (
    <>
      <button
        type="button"
        // 아이콘 토글 — 열려 있으면 다시 눌러 닫는다(X 버튼 외 추가 닫기 경로).
        onClick={() => {
          if (open) {
            window.dispatchEvent(new Event(CHAT_CLOSE_REQUEST_EVENT));
          } else {
            setOpen(true);
          }
        }}
        aria-expanded={open}
        aria-label={
          open
            ? "채팅 닫기"
            : hasUnread
              ? "채팅 열기 (새 메시지 있음)"
              : "채팅 열기"
        }
        title="채팅"
        data-testid={floating ? "floating-chat-toggle" : undefined}
        className={
          floating
            ? `fixed bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] right-4 ${floatingLayerClass} inline-flex h-14 w-14 items-center justify-center rounded-full border border-indigo-400/50 bg-indigo-600 text-white shadow-[0_10px_28px_rgba(49,46,129,0.4)] transition hover:-translate-y-0.5 hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 active:translate-y-0 sm:bottom-6 sm:right-6 dark:border-indigo-300/40 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:focus-visible:ring-offset-zinc-950 motion-reduce:transform-none`
            : "relative inline-flex h-10 w-10 items-center justify-center rounded-md text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        }
      >
        {open ? (
          <X size={floating ? 27 : 20} weight="bold" />
        ) : (
          <ChatCircle
            size={floating ? 27 : 20}
            weight={floating ? "fill" : "duotone"}
          />
        )}
        {!open &&
          (hasUnreadChat || hasUnreadTrade || hasUnreadGuild ? (
            <span
              aria-hidden
              className={`absolute h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500 ring-2 ring-white dark:ring-zinc-950 ${
                floating ? "right-1.5 top-1.5" : "right-0.5 top-0.5"
              }`}
            />
          ) : (
            hasUnreadNotice && (
              // 보스 알림만 새로 있을 땐 덜 시끄러운 호박색 점으로.
              <span
                aria-hidden
                className={`absolute h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white dark:ring-zinc-950 ${
                  floating ? "right-1.5 top-1.5" : "right-0.5 top-0.5"
                }`}
              />
            )
          ))}
      </button>
      <ChatPanel
        open={open}
        onClose={() => setOpen(false)}
        name={name}
        className={className}
        title={title}
        messages={messages}
        tradeMessages={tradeMessages}
        guildMessages={guildMessages}
        guildAvailable={guildAvailable}
        onMessageSent={handleMessageSent}
        unreadChat={hasUnreadChat}
        unreadTrade={hasUnreadTrade}
        unreadGuild={hasUnreadGuild}
        unreadNotice={hasUnreadNotice}
        onSeen={handleSeen}
      />
    </>
  );
}
