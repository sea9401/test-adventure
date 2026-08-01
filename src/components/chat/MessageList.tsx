"use client";

import { useEffect, useRef } from "react";
import { formatRelative } from "@/lib/notifications";
import type { ChatMessage } from "../ChatPanel";
import { MessageBody } from "./MessageBody";
import {
  ArenaChampionshipBadge,
  ChatCosmeticBadge,
  chatNameClass,
} from "./ChatCosmetics";

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
      el.scrollTop = el.scrollHeight;
      initialScrolledRef.current = true;
      return;
    }
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, open]);

  // 탭을 바꾸면 그 탭의 맨 아래(최신)로 한 번 정렬.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tab]);

  return (
    <div
      ref={listRef}
      className="no-scrollbar flex-1 space-y-2 overflow-y-auto px-4 py-3"
    >
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
          {tab === "notice"
            ? "협동 보스 알림이 없습니다."
            : "아직 메시지가 없습니다."}
        </div>
      ) : (
        // 일반 채팅은 메타 정보와 본문을 두 줄로, 시스템 알림은 한 줄로 표시한다.
        messages.map((m) => (
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
              <ArenaChampionshipBadge badge={m.cosmetics?.championshipBadge} />
              <ChatCosmeticBadge badge={m.cosmetics?.chatBadge} />
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
                  <MessageBody content={m.content} />
                </span>
              )}
            </div>
            {tab !== "notice" && (
                  <div className="whitespace-pre-wrap break-words leading-relaxed">
                <MessageBody content={m.content} />
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
