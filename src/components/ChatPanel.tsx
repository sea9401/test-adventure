"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BellRinging,
  CaretDown,
  CaretRight,
  ChatCircle,
  GlobeHemisphereWest,
  ShieldChevron,
  Users,
  X,
} from "@phosphor-icons/react";
import { isNoticeMessage } from "@/lib/chat-config";
import { postMessage, translateChatError } from "./chat/chatApi";
import { usePresencePoll } from "./chat/usePresencePoll";
import { MessageList } from "./chat/MessageList";
import { ChatComposer } from "./chat/ChatComposer";
import type { MuseunCosmeticAppearance } from "@/adventure/data/v2/museunCosmetics";
import { ChatCosmeticBadge, chatNameClass } from "./chat/ChatCosmetics";
import { CosmeticAvatar } from "@/components/ui/CosmeticAvatar";

export type ChatChannel = "global" | "guild";
type ChatRoomKey = "chat" | "guild" | "notice";

export type ChatMessage = {
  id: number;
  channel: ChatChannel;
  name: string;
  className: string;
  title: string | null;
  content: string;
  createdAt: number;
  mine: boolean;
  cosmetics?: MuseunCosmeticAppearance | null;
};

// 데스크톱 채팅창 크기 영속 + 최소 크기(드래그 리사이즈).
const CHAT_SIZE_KEY = "chat-panel-size.v2";
const CHAT_MIN_W = 400;
const CHAT_MIN_H = 420;
const clampInt = (v: number, min: number, max: number) =>
  Math.round(Math.max(min, Math.min(max, v)));

const CHAT_ROOM_LABELS: Record<ChatRoomKey, string> = {
  chat: "전체 채팅방",
  guild: "길드 채팅방",
  notice: "시스템 알림",
};

function ChatRoomIcon({ room, size = 22 }: { room: ChatRoomKey; size?: number }) {
  if (room === "guild") {
    return <ShieldChevron size={size} weight="duotone" />;
  }
  if (room === "notice") {
    return <BellRinging size={size} weight="duotone" />;
  }
  return <GlobeHemisphereWest size={size} weight="duotone" />;
}

function formatRoomTime(createdAt: number) {
  const date = new Date(createdAt);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  }
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function ChatRoomList({
  rooms,
  onEnter,
}: {
  rooms: Array<{
    key: ChatRoomKey;
    messages: ChatMessage[];
    unread: boolean;
    available: boolean;
  }>;
  onEnter: (room: ChatRoomKey) => void;
}) {
  return (
    <div className="no-scrollbar flex-1 overflow-y-auto py-2">
      {rooms.map((room) => {
        const latest = room.messages.at(-1);
        const iconClass = !room.available
          ? "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
          : room.key === "chat"
            ? "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300"
            : room.key === "guild"
              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300";

        return (
          <button
            key={room.key}
            type="button"
            disabled={!room.available}
            onClick={() => onEnter(room.key)}
            className="group flex w-full items-center gap-3 border-b border-zinc-100 px-5 py-4 text-left transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:hover:bg-zinc-800"
          >
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
            >
              <ChatRoomIcon room={room.key} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-zinc-800 group-disabled:text-zinc-400 dark:text-zinc-100 dark:group-disabled:text-zinc-500">
                  {CHAT_ROOM_LABELS[room.key]}
                </span>
                {room.unread && room.available && (
                  <span
                    aria-label="읽지 않은 메시지"
                    className="h-2 w-2 shrink-0 rounded-full bg-rose-500"
                  />
                )}
              </span>
              <span className="mt-1 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                {!room.available ? (
                  "길드에 가입하면 이용할 수 있습니다."
                ) : latest ? (
                  room.key === "notice" ? (
                    latest.content.replace(/\s+/g, " ")
                  ) : (
                    <>
                      <ChatCosmeticBadge badge={latest.cosmetics?.chatBadge} />
                      <span
                        className={chatNameClass(
                          latest.cosmetics?.chatNameEffect,
                          "font-medium text-zinc-600 dark:text-zinc-300",
                        )}
                      >
                        {latest.name}
                      </span>
                      {`: ${latest.content.replace(/\s+/g, " ")}`}
                    </>
                  )
                ) : (
                  "메시지가 없습니다."
                )}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2 self-start pt-0.5">
              {latest && room.available && (
                <span className="text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
                  {formatRoomTime(latest.createdAt)}
                </span>
              )}
              <CaretRight
                size={16}
                weight="bold"
                className="mt-0.5 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-disabled:hidden dark:text-zinc-600"
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ChatPanel({
  open,
  onClose,
  name,
  className,
  title,
  messages,
  guildMessages,
  guildAvailable,
  onMessageSent,
  unreadChat = false,
  unreadGuild = false,
  unreadNotice = false,
  onSeen,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  className: string;
  title: string | null;
  messages: ChatMessage[];
  guildMessages: ChatMessage[];
  guildAvailable: boolean;
  onMessageSent: (m: ChatMessage) => void;
  /** 채팅방별 안 읽은 메시지 유무 — 목록에 점 표시. */
  unreadChat?: boolean;
  unreadGuild?: boolean;
  unreadNotice?: boolean;
  /** 해당 채팅방의 최신 메시지를 본 것으로 처리. */
  onSeen?: (kind: "chat" | "guild" | "notice", lastId: number) => void;
}) {
  const router = useRouter();
  const presence = usePresencePoll(open);
  const [presenceOpen, setPresenceOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // 채팅방 목록에서 방을 선택한 뒤 메시지 화면으로 진입한다.
  const [activeRoom, setActiveRoom] = useState<ChatRoomKey | null>(null);
  const tab = activeRoom ?? "chat";
  // 낙관적 전송 — 서버 응답 전 임시 메시지 큐. 응답 도착 시 큐에서 제거.
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const tempIdRef = useRef(0);

  // 데스크톱 채팅창 크기 조절 — 좌상단 모서리 드래그(우하단 고정 패널이라 좌/위로 키운다).
  //   localStorage 영속. 모바일(<sm)은 전체폭이라 미적용. 기본 = 560 × 680.
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 560, h: 680 });
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 전용 media query 초기 동기화
    setIsDesktop(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    try {
      const raw = localStorage.getItem(CHAT_SIZE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { w?: unknown; h?: unknown };
        if (typeof p.w === "number" && typeof p.h === "number") {
          setSize({
            w: clampInt(p.w, CHAT_MIN_W, 4000),
            h: clampInt(p.h, CHAT_MIN_H, 4000),
          });
        }
      }
    } catch {
      /* 손상/미설정 무시 — 기본값 사용 */
    }
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // 진행 중인 리사이즈 정리 함수 보관 — 드래그 도중 패널이 사라져도(언마운트) 누수 없게.
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      resizeCleanupRef.current?.();
    },
    [],
  );

  // 좌상단 핸들 포인터 드래그 → 크기 변경(우하단 고정). 종료(up/cancel) 시 localStorage 저장.
  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.w;
    const startH = size.h;
    const maxW = Math.round(window.innerWidth * 0.95);
    const maxH = Math.round(
      (window.visualViewport?.height ?? window.innerHeight) * 0.9,
    );
    let latest = { w: startW, h: startH };
    const onMove = (ev: PointerEvent) => {
      latest = {
        w: clampInt(startW - (ev.clientX - startX), CHAT_MIN_W, maxW),
        h: clampInt(startH - (ev.clientY - startY), CHAT_MIN_H, maxH),
      };
      setSize(latest);
    };
    // 리스너/스타일 원복 — onEnd(정상 종료)와 언마운트 cleanup 양쪽에서 호출(멱등).
    function cleanup() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
      document.body.style.userSelect = "";
      resizeCleanupRef.current = null;
    }
    function onEnd() {
      cleanup();
      try {
        localStorage.setItem(CHAT_SIZE_KEY, JSON.stringify(latest));
      } catch {
        /* 저장 실패 무시 */
      }
    }
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onEnd);
    document.addEventListener("pointercancel", onEnd);
    resizeCleanupRef.current = cleanup;
  };

  // 권위적 messages + 낙관적 pending 을 합쳐 화면용 리스트 생성.
  // 서버 echo 와 임시 메시지가 일시적으로 겹쳐 보이지 않도록, 본인이 보낸
  // 권위적 메시지가 들어오면 같은 content 의 가장 오래된 pending 을 숨긴다.
  const visibleMessagesFor = useMemo(() => {
    return (baseMessages: ChatMessage[], channel: ChatChannel) => {
      const channelPending = pending.filter((m) => m.channel === channel);
      if (channelPending.length === 0) return baseMessages;
      const remainingPending = [...channelPending];
      for (const m of baseMessages) {
        if (!m.mine) continue;
        const i = remainingPending.findIndex((p) => p.content === m.content);
        if (i >= 0) remainingPending.splice(i, 1);
      }
      return [...baseMessages, ...remainingPending];
    };
  }, [pending]);
  const visibleGlobalMessages = useMemo(
    () => visibleMessagesFor(messages, "global"),
    [messages, visibleMessagesFor],
  );
  const visibleGuildMessages = useMemo(
    () => visibleMessagesFor(guildMessages, "guild"),
    [guildMessages, visibleMessagesFor],
  );

  // 일반 채팅 / 시스템 알림(협동 보스 스폰·토벌 등) 을 className 으로 갈라낸다.
  const chatMessages = useMemo(
    () => visibleGlobalMessages.filter((m) => !isNoticeMessage(m)),
    [visibleGlobalMessages],
  );
  const noticeMessages = useMemo(
    () => visibleGlobalMessages.filter((m) => isNoticeMessage(m)),
    [visibleGlobalMessages],
  );
  const shownMessages =
    tab === "chat"
      ? chatMessages
      : tab === "guild"
        ? visibleGuildMessages
        : noticeMessages;

  // 권위적 messages 만 보고 (낙관적 pending 의 음수 임시 id 제외) 각 카테고리 최신 id 계산.
  const lastChatId = useMemo(
    () => messages.reduce((mx, m) => (!isNoticeMessage(m) && m.id > mx ? m.id : mx), 0),
    [messages],
  );
  const lastNoticeId = useMemo(
    () => messages.reduce((mx, m) => (isNoticeMessage(m) && m.id > mx ? m.id : mx), 0),
    [messages],
  );
  const lastGuildId = useMemo(
    () => guildMessages.reduce((mx, m) => (m.id > mx ? m.id : mx), 0),
    [guildMessages],
  );

  const rooms = useMemo(
    () => [
      {
        key: "chat" as const,
        messages: chatMessages,
        unread: unreadChat,
        available: true,
      },
      {
        key: "guild" as const,
        messages: visibleGuildMessages,
        unread: unreadGuild,
        available: guildAvailable,
      },
      {
        key: "notice" as const,
        messages: noticeMessages,
        unread: unreadNotice,
        available: true,
      },
    ],
    [
      chatMessages,
      guildAvailable,
      noticeMessages,
      unreadChat,
      unreadGuild,
      unreadNotice,
      visibleGuildMessages,
    ],
  );

  // 실제로 들어간 채팅방의 최신 메시지만 읽은 것으로 보고한다.
  useEffect(() => {
    if (!open || !activeRoom || !onSeen) return;
    if (activeRoom === "chat" && lastChatId > 0) onSeen("chat", lastChatId);
    if (activeRoom === "guild" && lastGuildId > 0) onSeen("guild", lastGuildId);
    if (activeRoom === "notice" && lastNoticeId > 0) onSeen("notice", lastNoticeId);
  }, [open, activeRoom, lastChatId, lastGuildId, lastNoticeId, onSeen]);

  const enterRoom = (room: ChatRoomKey) => {
    if (room === "guild" && !guildAvailable) return;
    setActiveRoom(room);
    setPresenceOpen(false);
    setDraft("");
    setError(null);
  };

  const returnToRooms = () => {
    setActiveRoom(null);
    setPresenceOpen(false);
    setError(null);
  };

  const closePanel = () => {
    setActiveRoom(null);
    setPresenceOpen(false);
    setError(null);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    // 임시 id 는 음수 — 서버 id (양수) 와 절대 충돌하지 않음.
    const tempId = --tempIdRef.current;
    const temp: ChatMessage = {
      id: tempId,
      channel: tab === "guild" ? "guild" : "global",
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
        channel: tab === "guild" ? "guild" : "global",
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
  // z-[45] — 게임 내 z-40 오버레이/모바일 액션보다 위, 모달 z-50 계층보다 아래.
  return createPortal(
    <div
      ref={overlayRef}
      className="pointer-events-none fixed inset-0 z-[45] flex items-end justify-end sm:p-4"
    >
      <div
        className="ui-chat-panel ui-popover-reveal pointer-events-auto relative flex h-[88dvh] max-h-full w-full max-w-xl flex-col rounded-t-xl bg-white shadow-2xl dark:bg-zinc-900 sm:h-[680px] sm:max-h-[90vh] sm:rounded-xl"
        // 데스크톱만 크기 조절(인라인이 기본 크기보다 우선). 모바일은 전체폭 유지.
        style={
          isDesktop
            ? {
                width: size.w,
                height: size.h,
                maxWidth: "95vw",
                maxHeight: "90dvh",
              }
            : undefined
        }
      >
        {/* 크기 조절 핸들 — 좌상단 모서리(우하단 고정 패널). 데스크톱 전용. */}
        {isDesktop && (
          <div
            onPointerDown={startResize}
            role="separator"
            aria-label="채팅창 크기 조절"
            title="드래그해서 크기 조절"
            className="absolute left-0 top-0 z-20 flex h-5 w-5 cursor-nwse-resize touch-none items-start justify-start rounded-tl-xl p-1 text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path
                d="M9 1 L1 9 M9 5 L5 9"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3.5 dark:border-zinc-700">
          {activeRoom ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={returnToRooms}
                aria-label="채팅방 목록으로 돌아가기"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <ArrowLeft size={20} weight="bold" />
              </button>
              <span
                className={`shrink-0 ${
                  activeRoom === "chat"
                    ? "text-blue-600 dark:text-blue-300"
                    : activeRoom === "guild"
                      ? "text-emerald-600 dark:text-emerald-300"
                      : "text-violet-600 dark:text-violet-300"
                }`}
              >
                <ChatRoomIcon room={activeRoom} size={20} />
              </span>
              <span className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                {CHAT_ROOM_LABELS[activeRoom]}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-1 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              <ChatCircle size={22} weight="duotone" />
              채팅
            </div>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPresenceOpen((v) => !v)}
              aria-expanded={presenceOpen}
              aria-label="접속자 목록"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Users size={16} weight="duotone" />
              <span className="tabular-nums">접속 {presence.length}명</span>
              <CaretDown
                size={12}
                weight="bold"
                className={`transition-transform ${presenceOpen ? "rotate-180" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={closePanel}
              aria-label="채팅 닫기"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {presenceOpen && (
          <div className="ui-dropdown-reveal no-scrollbar max-h-40 overflow-y-auto border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
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
                    <span className="relative shrink-0">
                      <CosmeticAvatar
                        avatar={u.avatar}
                        name={u.name}
                        profileBorder={u.cosmetics?.profileBorder}
                        width={24}
                        height={24}
                        sizes="24px"
                        className="h-6 w-6 rounded-md"
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 z-10 h-2 w-2 rounded-full border border-zinc-50 bg-emerald-500 dark:border-zinc-900" />
                    </span>
                    {u.title && (
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {u.title}
                      </span>
                    )}
                    <ChatCosmeticBadge badge={u.cosmetics?.chatBadge} />
                    {u.mine ? (
                      <span
                        className={chatNameClass(
                          u.cosmetics?.chatNameEffect,
                          "font-semibold text-emerald-700 dark:text-emerald-400",
                        )}
                      >
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
                        className={chatNameClass(
                          u.cosmetics?.chatNameEffect,
                          "rounded font-semibold text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-200",
                        )}
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

        {activeRoom ? (
          <>
            <MessageList
              open={open}
              tab={activeRoom}
              messages={shownMessages}
              onSelectName={(n) =>
                router.push(`/profile/${encodeURIComponent(n)}`)
              }
            />

            {error && (
              <div className="border-t border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                {error}
              </div>
            )}

            {activeRoom === "notice" ? (
              <div className="border-t border-zinc-200 px-3 py-2.5 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
                시스템 알림은 읽기 전용입니다.
              </div>
            ) : (
              <ChatComposer
                draft={draft}
                onDraftChange={setDraft}
                onSubmit={submit}
              />
            )}
          </>
        ) : (
          <ChatRoomList rooms={rooms} onEnter={enterRoom} />
        )}
      </div>
    </div>,
    document.body,
  );
}
