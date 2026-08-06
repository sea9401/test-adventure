"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { formatRelative } from "@/lib/notifications";
import { parseChatMessageContent } from "@/lib/chat-config";
import type { ChatMessage } from "../ChatPanel";
import { MessageBody } from "./MessageBody";
import {
  EquippedCosmeticBadge,
  chatNameClass,
} from "./ChatCosmetics";

export const CHAT_BOTTOM_THRESHOLD_PX = 100;

type ScrollMetrics = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
};

export function isChatMessageListNearBottom({
  scrollHeight,
  scrollTop,
  clientHeight,
}: ScrollMetrics) {
  return scrollHeight - scrollTop - clientHeight < CHAT_BOTTOM_THRESHOLD_PX;
}

// 스크롤 가능한 메시지 리스트 — 채팅/길드/알림 탭의 메시지를 렌더하고 자동 스크롤을 처리.
export function MessageList({
  open,
  tab,
  messages,
  onSelectName,
}: {
  open: boolean;
  tab: "chat" | "guild" | "notice";
  messages: ChatMessage[];
  onSelectName: (name: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  // 키보드가 열리기 전 최신 메시지를 보고 있었는지 보존한다. 높이가 줄어든 뒤
  // 현재 scrollTop 으로 다시 계산하면 하단에서 멀어진 것으로 오인할 수 있다.
  const pinnedToBottomRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pinnedToBottomRef.current = true;
  }, []);

  // 패널을 처음 열었을 때 한 번은 무조건 맨 아래로 — 최신 메시지부터 보이게.
  // open 이 false 가 되면 다음 열림에 다시 한 번 트리거되도록 ref 리셋.
  const initialScrolledRef = useRef(false);
  useEffect(() => {
    if (!open) initialScrolledRef.current = false;
  }, [open]);

  // 새 메시지가 추가되면 자동 스크롤 (이미 하단 근처에 있을 때만).
  // 단, open 직후 첫 메시지 도착 시점엔 강제로 맨 아래로 한 번 정렬.
  // visibleMessages 를 관찰 — 낙관적 임시 메시지에도 즉시 스크롤이 따라간다.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (open && !initialScrolledRef.current && messages.length > 0) {
      scrollToBottom();
      initialScrolledRef.current = true;
      return;
    }
    if (pinnedToBottomRef.current) scrollToBottom();
  }, [messages, open, scrollToBottom]);

  // 탭을 바꾸면 그 탭의 맨 아래(최신)로 한 번 정렬.
  useEffect(() => {
    scrollToBottom();
  }, [tab, scrollToBottom]);

  // 모바일 키보드가 열리면 visual viewport에 맞춰 패널과 목록 높이가 단계적으로
  // 줄어든다. 직전에 최신 메시지를 보고 있던 경우에만 각 높이 변경 후 하단을
  // 다시 맞춰 입력창이 최근 메시지를 가리지 않게 한다.
  useEffect(() => {
    const el = listRef.current;
    if (!open || !el || typeof ResizeObserver === "undefined") return;

    let animationFrameId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (!pinnedToBottomRef.current) return;
      if (animationFrameId != null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        if (pinnedToBottomRef.current) scrollToBottom();
      });
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (animationFrameId != null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [open, scrollToBottom]);

  return (
    <div
      ref={listRef}
      onScroll={() => {
        const el = listRef.current;
        if (el) {
          pinnedToBottomRef.current = isChatMessageListNearBottom(el);
        }
      }}
      className="no-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3"
    >
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
          {tab === "notice"
            ? "시스템 알림이 없습니다."
            : "아직 메시지가 없습니다."}
        </div>
      ) : (
        // 일반 채팅은 메타 정보와 본문을 두 줄로, 시스템 알림은 한 줄로 표시한다.
        messages.map((m) => {
          const body = parseChatMessageContent(m);
          return (
            <div
              key={m.id}
              className="text-sm text-zinc-800 dark:text-zinc-100"
            >
              <div
                className={
                  tab === "notice"
                    ? "flex min-w-0 items-baseline overflow-hidden whitespace-nowrap leading-relaxed"
                    : "flex min-w-0 items-center overflow-hidden whitespace-nowrap leading-5"
                }
              >
              <EquippedCosmeticBadge cosmetics={m.cosmetics} />
              {m.title && (
                <span className="mr-1 shrink-0 whitespace-nowrap text-xs font-medium text-amber-600 dark:text-amber-400">
                  [{m.title}]
                </span>
              )}
              {m.mine ? (
                <>
                  <span
                    title={m.name}
                    className={chatNameClass(
                      m.cosmetics?.chatNameEffect,
                      "min-w-0 truncate font-semibold text-blue-600 dark:text-blue-400",
                    )}
                  >
                    {m.name}
                  </span>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onSelectName(m.name)}
                    title={`${m.name} 프로필 보기`}
                    className={chatNameClass(
                      m.cosmetics?.chatNameEffect,
                      "min-w-0 truncate font-semibold text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-200",
                    )}
                  >
                    {m.name}
                  </button>
                </>
              )}
              <span className="ml-1.5 shrink-0 text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
                {formatRelative(m.createdAt)}
              </span>
              {tab === "notice" && (
                <span className="ml-1.5 min-w-0 truncate">
                  <MessageBody content={body.text} itemLink={m.itemLink} />
                </span>
              )}
              {tab === "notice" && body.action && (
                <Link
                  href={body.action.href}
                  prefetch={false}
                  className="ml-2 shrink-0 rounded border border-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-zinc-800"
                >
                  {body.action.label}
                </Link>
              )}
              </div>
              {tab !== "notice" && (
                <div className="whitespace-pre-wrap break-words leading-relaxed">
                  <MessageBody content={body.text} itemLink={m.itemLink} />
                </div>
              )}
              </div>
          );
        })
      )}
    </div>
  );
}
