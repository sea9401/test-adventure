"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  CaretDown,
  ChatCircle,
  Users,
  X,
} from "@phosphor-icons/react";
import { CHAT_MAX_LENGTH, isNoticeMessage } from "@/lib/chat-config";
import {
  encodeItemLink,
  type ChatItemRef,
} from "@/lib/chat-item-link";
import { ChatItemPicker } from "./ChatItemPicker";
import type { InventoryState } from "@/adventure/inventory/useInventory";
import { postMessage, translateChatError } from "./chat/chatApi";
import { usePresencePoll } from "./chat/usePresencePoll";
import { MessageList } from "./chat/MessageList";
import { ChatComposer } from "./chat/ChatComposer";

export type ChatMessage = {
  id: number;
  name: string;
  className: string;
  title: string | null;
  content: string;
  createdAt: number;
  mine: boolean;
};

export function ChatPanel({
  open,
  onClose,
  name,
  className,
  title,
  messages,
  onMessageSent,
  unreadChat = false,
  unreadNotice = false,
  onSeen,
  inventory,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  className: string;
  title: string | null;
  messages: ChatMessage[];
  onMessageSent: (m: ChatMessage) => void;
  /** 채팅/알림 탭별 안 읽은 메시지 유무 — 탭에 점 표시. */
  unreadChat?: boolean;
  unreadNotice?: boolean;
  /** 해당 탭의 최신 메시지를 본 것으로 처리. */
  onSeen?: (kind: "chat" | "notice", lastId: number) => void;
  /** 아이템 링크용 인벤토리. 없으면(예: v2) 아이템 링크 비활성 — 텍스트 채팅만. */
  inventory?: InventoryState;
}) {
  const router = useRouter();
  const presence = usePresencePoll(open);
  const [presenceOpen, setPresenceOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // 채팅 / 알림(협동 보스 등 시스템 메시지) 탭 분리.
  const [tab, setTab] = useState<"chat" | "notice">("chat");
  // 낙관적 전송 — 서버 응답 전 임시 메시지 큐. 응답 도착 시 큐에서 제거.
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const tempIdRef = useRef(0);

  // 권위적 messages + 낙관적 pending 을 합쳐 화면용 리스트 생성.
  // 서버 echo 와 임시 메시지가 일시적으로 겹쳐 보이지 않도록, 본인이 보낸
  // 권위적 메시지가 들어오면 같은 content 의 가장 오래된 pending 을 숨긴다.
  const visibleMessages = useMemo(() => {
    if (pending.length === 0) return messages;
    const remainingPending = [...pending];
    for (const m of messages) {
      if (!m.mine) continue;
      const i = remainingPending.findIndex((p) => p.content === m.content);
      if (i >= 0) remainingPending.splice(i, 1);
    }
    return [...messages, ...remainingPending];
  }, [messages, pending]);

  // 일반 채팅 / 시스템 알림(협동 보스 스폰·토벌 등) 을 className 으로 갈라낸다.
  const chatMessages = useMemo(
    () => visibleMessages.filter((m) => !isNoticeMessage(m)),
    [visibleMessages],
  );
  const noticeMessages = useMemo(
    () => visibleMessages.filter((m) => isNoticeMessage(m)),
    [visibleMessages],
  );
  const shownMessages = tab === "chat" ? chatMessages : noticeMessages;

  // 권위적 messages 만 보고 (낙관적 pending 의 음수 임시 id 제외) 각 카테고리 최신 id 계산.
  const lastChatId = useMemo(
    () => messages.reduce((mx, m) => (!isNoticeMessage(m) && m.id > mx ? m.id : mx), 0),
    [messages],
  );
  const lastNoticeId = useMemo(
    () => messages.reduce((mx, m) => (isNoticeMessage(m) && m.id > mx ? m.id : mx), 0),
    [messages],
  );

  // 패널이 열려 있는 동안 보고 있는 탭의 최신 메시지는 읽은 것으로 보고.
  useEffect(() => {
    if (!open || !onSeen) return;
    if (tab === "chat" && lastChatId > 0) onSeen("chat", lastChatId);
    if (tab === "notice" && lastNoticeId > 0) onSeen("notice", lastNoticeId);
  }, [open, tab, lastChatId, lastNoticeId, onSeen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    // 임시 id 는 음수 — 서버 id (양수) 와 절대 충돌하지 않음.
    const tempId = --tempIdRef.current;
    const temp: ChatMessage = {
      id: tempId,
      name,
      className,
      title,
      content: trimmed,
      createdAt: Date.now(),
      mine: true,
    };
    setPending((prev) => [...prev, temp]);
    setDraft("");
    setError(null);
    try {
      const sent = await postMessage({
        name,
        className,
        title,
        content: trimmed,
      });
      // 서버 응답 도착 — 부모 messages 에 합류. visibleMessages 가 content 매칭으로
      // pending 의 임시 항목을 자동 숨겨주므로 setPending 정리는 다음 폴링 후에 해도 OK.
      // 다만 명시적으로 제거해 메모리/길이 누적을 막는다.
      setPending((prev) => prev.filter((m) => m.id !== tempId));
      onMessageSent(sent);
    } catch (err) {
      // 실패 — 임시 메시지 회수 + 본문 복원해 재시도 유도.
      setPending((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(trimmed);
      const msg = err instanceof Error ? err.message : "";
      setError(translateChatError(msg));
    }
  };

  // 아이템 피커에서 고른 장비를 토큰으로 입력창에 삽입. 200자 초과면 막는다.
  const insertItemLink = (ref: ChatItemRef) => {
    const token = encodeItemLink(ref);
    const sep = draft && !/\s$/.test(draft) ? " " : "";
    const next = `${draft}${sep}${token} `;
    if (next.length > CHAT_MAX_LENGTH) {
      setError("메시지가 너무 깁니다.");
      return;
    }
    setError(null);
    setDraft(next);
  };

  // 모바일 키보드 대응 — 오버레이를 시각 뷰포트(키보드로 줄어든 영역)에 맞춰
  // 하단 입력창이 키보드 뒤로 가려지지 않게 한다. 패널엔 max-h-full 이 걸려 있어
  // 줄어든 오버레이를 넘지 않으므로 헤더~입력창이 모두 보인다.
  // visualViewport 미지원 브라우저는 인라인 스타일 미적용 → CSS(inset-0) 기본 동작 폴백.
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const el = overlayRef.current;
    if (!vv || !el) return;
    const apply = () => {
      el.style.top = `${vv.offsetTop}px`;
      el.style.height = `${vv.height}px`;
      el.style.bottom = "auto";
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      // 닫힐 때 인라인 스타일 제거 → CSS(inset-0) 로 복귀.
      // (effect 진입 때 캡처한 el — 이 effect 인스턴스가 다룬 바로 그 노드.)
      el.style.top = "";
      el.style.height = "";
      el.style.bottom = "";
    };
  }, [open]);

  if (!open) return null;

  // body 로 portal — V2TopBar 의 backdrop-blur(=backdrop-filter)가 fixed 자손의
  // containing block 이 돼 패널이 헤더 기준으로 떠 화면 위로 튀어나가던 버그 회피. open 일
  // 때만 렌더(=클릭 후 클라 only)라 SSR 에선 위 null 로 빠져 document.body 접근 안전.
  //
  // 비모달 도킹 — 바깥을 덮는 래퍼는 pointer-events-none(+dim 없음)이라 아래 게임 UI 를
  // 그대로 조작할 수 있고(낚시 등 컨텐츠를 채팅과 동시에), 패널만 pointer-events-auto.
  // 바깥 탭으로 닫히지 않으며 닫기는 헤더 X 버튼뿐 — 화면을 옮겨도 떠 있다.
  return createPortal(
    <div
      ref={overlayRef}
      className="pointer-events-none fixed inset-0 z-40 flex items-end justify-end sm:p-4"
    >
      <div
        className="pointer-events-auto flex h-[85dvh] max-h-full w-full max-w-md flex-col rounded-t-lg border-t border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 sm:h-[600px] sm:max-h-[85vh] sm:rounded-lg sm:border sm:border-zinc-200 dark:sm:border-zinc-800"
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            <ChatCircle size={20} weight="duotone" />
            전체 채팅
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPresenceOpen((v) => !v)}
              aria-expanded={presenceOpen}
              aria-label="접속자 목록"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Users size={14} weight="duotone" />
              <span className="tabular-nums">접속 {presence.length}명</span>
              <CaretDown
                size={12}
                weight="bold"
                className={`transition-transform ${presenceOpen ? "rotate-180" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="채팅 닫기"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {presenceOpen && (
          <div className="no-scrollbar max-h-40 overflow-y-auto border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
            {presence.length === 0 ? (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                접속 중인 유저가 없습니다.
              </div>
            ) : (
              <ul className="space-y-0.5">
                {presence.map((u) => (
                  <li
                    key={u.name}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    {u.title && (
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {u.title}
                      </span>
                    )}
                    {u.mine ? (
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        {u.name}
                        <span className="ml-1 text-[10px] font-normal text-zinc-500 dark:text-zinc-400">
                          (나)
                        </span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/profile/${encodeURIComponent(u.name)}`)
                        }
                        title="프로필 보기"
                        className="rounded font-semibold text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-200"
                      >
                        {u.name}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex border-b border-zinc-200 dark:border-zinc-800">
          {(
            [
              ["chat", "채팅", chatMessages.length, unreadChat],
              ["notice", "알림", noticeMessages.length, unreadNotice],
            ] as const
          ).map(([key, label, count, unread]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={tab === key}
              className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-3 py-2 text-xs font-semibold transition-colors ${
                tab === key
                  ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-b-2 border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {label}
              {unread && tab !== key && (
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              )}
              {count > 0 && (
                <span className="rounded-full bg-zinc-200 px-1.5 text-[10px] tabular-nums text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        <MessageList
          open={open}
          tab={tab}
          messages={shownMessages}
          onSelectName={(n) =>
            router.push(`/profile/${encodeURIComponent(n)}`)
          }
        />

        {error && (
          <div className="border-t border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        {tab === "notice" ? (
          <div className="border-t border-zinc-200 px-3 py-2.5 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
            협동 보스 알림. 채팅하려면 채팅 탭으로
          </div>
        ) : (
          <ChatComposer
            draft={draft}
            onDraftChange={setDraft}
            onSubmit={submit}
            onOpenPicker={inventory ? () => setPickerOpen(true) : undefined}
          />
        )}
      </div>

      {pickerOpen && inventory && (
        // 비차단 래퍼(pointer-events-none) 아래라 picker(자체 fixed 모달)도 명시적으로 살린다.
        <div className="pointer-events-auto">
          <ChatItemPicker
            inventory={inventory}
            onPick={insertItemLink}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      )}
    </div>,
    document.body,
  );
}
