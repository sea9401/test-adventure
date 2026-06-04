"use client";

import { useCallback, useEffect, useState } from "react";
import { ChatCircle } from "@phosphor-icons/react";
import { isNoticeMessage } from "@/lib/chat-config";
import { ChatPanel, type ChatMessage } from "./ChatPanel";

// 패널이 닫혀 있을 땐 unread 배지 갱신용으로 느리게,
// 열려 있을 땐 상대 메시지 수신감을 살리려 짧게 폴링.
// 배경 폴링은 모든 로그인 유저에게서 영구히 도는 비용이라 보수적으로 길게.
const POLL_INTERVAL_BG_MS = 10000;
const POLL_INTERVAL_OPEN_MS = 1500;
// 채팅 / 알림(협동 보스 등) 의 "마지막으로 본 메시지 id" 를 따로 저장 — 둘이 섞이지 않게.
const LAST_SEEN_KEY = "chat:lastSeenId";
const LAST_SEEN_NOTICE_KEY = "chat:lastSeenNoticeId";

async function fetchMessages(): Promise<ChatMessage[]> {
  const res = await fetch("/api/chat", { cache: "no-store" });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return res.json();
}

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
  onSent,
}: {
  name: string;
  className: string;
  title: string | null;
  /** 메시지 전송 성공 시 1회 호출 — '수다쟁이' 칭호 카운터 등에 사용. */
  onSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastSeenChatId, setLastSeenChatId] = useState<number>(() => readId(LAST_SEEN_KEY));
  const [lastSeenNoticeId, setLastSeenNoticeId] = useState<number>(() =>
    readId(LAST_SEEN_NOTICE_KEY),
  );

  // 패널이 닫혀 있어도 항상 폴링 — 새 메시지 도착 감지용.
  // open 이 바뀌면 effect 가 다시 실행돼 즉시 한 번 fetch + 새 주기로 재시작.
  useEffect(() => {
    let cancelled = false;
    let initialized = false;
    const tick = async () => {
      try {
        const next = await fetchMessages();
        if (cancelled) return;
        setMessages(next);
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
        }
      } catch {
        // 네트워크 오류는 다음 폴링에서 자동 재시도.
      }
    };
    tick();
    const interval = setInterval(
      tick,
      open ? POLL_INTERVAL_OPEN_MS : POLL_INTERVAL_BG_MS,
    );
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open]);

  // ChatPanel 이 보고 있는 탭의 최신 메시지를 본 것으로 처리.
  const handleSeen = useCallback((kind: "chat" | "notice", lastId: number) => {
    if (kind === "chat") {
      setLastSeenChatId((prev) => {
        if (lastId <= prev) return prev;
        writeId(LAST_SEEN_KEY, lastId);
        return lastId;
      });
    } else {
      setLastSeenNoticeId((prev) => {
        if (lastId <= prev) return prev;
        writeId(LAST_SEEN_NOTICE_KEY, lastId);
        return lastId;
      });
    }
  }, []);

  const handleMessageSent = useCallback(
    (m: ChatMessage) => {
      setMessages((prev) =>
        prev.some((x) => x.id === m.id) ? prev : [...prev, m],
      );
      onSent?.();
    },
    [onSent],
  );

  const hasUnreadChat = messages.some(
    (m) => !isNoticeMessage(m) && m.id > lastSeenChatId && !m.mine,
  );
  const hasUnreadNotice = messages.some(
    (m) => isNoticeMessage(m) && m.id > lastSeenNoticeId && !m.mine,
  );

  return (
    <>
      <button
        type="button"
        // 아이콘 토글 — 열려 있으면 다시 눌러 닫는다(X 버튼 외 추가 닫기 경로).
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={
          open
            ? "전체 채팅 닫기"
            : hasUnreadChat
              ? "전체 채팅 열기 (새 메시지 있음)"
              : "전체 채팅 열기"
        }
        title="전체 채팅"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <ChatCircle size={20} weight="duotone" />
        {hasUnreadChat ? (
          <span
            aria-hidden
            className="absolute right-0.5 top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500 ring-2 ring-white dark:ring-zinc-950"
          />
        ) : (
          hasUnreadNotice && (
            // 보스 알림만 새로 있을 땐 덜 시끄러운 호박색 점으로.
            <span
              aria-hidden
              className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white dark:ring-zinc-950"
            />
          )
        )}
      </button>
      <ChatPanel
        open={open}
        onClose={() => setOpen(false)}
        name={name}
        className={className}
        title={title}
        messages={messages}
        onMessageSent={handleMessageSent}
        unreadChat={hasUnreadChat}
        unreadNotice={hasUnreadNotice}
        onSeen={handleSeen}
      />
    </>
  );
}
