"use client";

import {
  useCallback,
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
  CaretRight,
  ChatCircle,
  ChatsCircle,
  GlobeHemisphereWest,
  LockSimple,
  Plus,
  ShieldChevron,
  SignOut,
  Ticket,
  UserPlus,
  X,
} from "@phosphor-icons/react";
import { isNoticeMessage } from "@/lib/chat-config";
import {
  CHAT_INAPPROPRIATE_CONTENT_MESSAGE,
  isChatContentAllowed,
} from "@/lib/chat-moderation";
import { postMessage, translateChatError } from "./chat/chatApi";
import { MessageList } from "./chat/MessageList";
import { ChatComposer } from "./chat/ChatComposer";
import type { MuseunCosmeticAppearance } from "@/adventure/data/v2/museunCosmetics";
import {
  EquippedCosmeticBadge,
  chatNameClass,
} from "./chat/ChatCosmetics";
import { ChatRoomManager } from "./chat/ChatRoomManager";
import {
  fetchCustomRoomMessages,
  fetchJoinedChatRooms,
  inviteToChatRoom,
  translateChatRoomError,
  updateChatRoomMembership,
  type CustomChatRoom,
  type CustomChatRoomInvite,
} from "./chat/chatRoomsApi";
import {
  latestChatMessageId,
  mergeChatMessages,
} from "./chat/chatMessagesApi";
import { LotteryRoom } from "./chat/LotteryRoom";
import { ChatEquipmentPicker } from "./chat/ChatEquipmentPicker";
import type { V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import {
  chatEquipmentLinkFromInstance,
  chatEquipmentLinkLabel,
  type ChatEquipmentLink,
} from "@/lib/chat-item-link";

export type ChatChannel = "global" | "guild" | "room";
type ChatRoomKey = "chat" | "guild" | "notice" | "lottery";

export type ChatMessage = {
  id: number;
  channel: ChatChannel;
  roomId?: number | null;
  name: string;
  className: string;
  title: string | null;
  content: string;
  itemLink?: ChatEquipmentLink | null;
  createdAt: number;
  mine: boolean;
  cosmetics?: MuseunCosmeticAppearance | null;
};

// 데스크톱 채팅창 크기 영속 + 최소 크기(드래그 리사이즈).
const CHAT_SIZE_KEY = "chat-panel-size.v2";
const CHAT_MIN_W = 400;
const CHAT_MIN_H = 420;
const CUSTOM_ROOM_LIST_POLL_MS = 5000;
const CUSTOM_ROOM_MESSAGE_POLL_MS = 1500;

// 모바일 채팅은 독립된 전체 화면으로 동작한다. 메인 메뉴 드롭다운(z-50)보다 위에서
// 배경 터치를 막아, 반쯤 가려진 탭이 눌리고 드롭다운이 채팅 위로 솟는 일을 방지한다.
// 데스크톱(sm+)에서는 기존 비모달 도킹을 유지해 게임 화면과 채팅을 함께 조작할 수 있다.
export const CHAT_OVERLAY_CLASS =
  "pointer-events-auto fixed inset-0 z-[55] flex items-end justify-end sm:pointer-events-none sm:z-[45] sm:p-4";
export const CHAT_PANEL_CLASS =
  "ui-chat-panel ui-popover-reveal pointer-events-auto relative flex h-full max-h-full w-full max-w-none flex-col rounded-none bg-white shadow-2xl dark:bg-zinc-900 sm:h-[680px] sm:max-h-[90vh] sm:max-w-xl sm:rounded-xl";
export const CHAT_HEADER_CLASS =
  "relative z-20 flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 pb-3.5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.875rem,env(safe-area-inset-top))] sm:px-4 sm:py-3.5 dark:border-zinc-700";
export const CHAT_CLOSE_BUTTON_CLASS =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700";
export const CHAT_MOBILE_BACK_BUTTON_CLASS =
  "fixed bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] left-4 z-30 inline-flex h-14 items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 shadow-lg transition-colors hover:bg-zinc-100 sm:hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700";

const clampInt = (v: number, min: number, max: number) =>
  Math.round(Math.max(min, Math.min(max, v)));
const customRoomSeenKey = (roomId: number) => `chat:lastSeenRoom:${roomId}`;

// 비동기 요청이 폴링 주기보다 오래 걸려도 요청을 겹치지 않는다. 브라우저 탭이
// 숨겨지면 타이머를 멈추고, 다시 보이는 순간 즉시 동기화한다.
function startVisiblePolling(task: () => Promise<unknown>, intervalMs: number) {
  let stopped = false;
  let running = false;
  let timeoutId: number | null = null;

  const clearScheduled = () => {
    if (timeoutId == null) return;
    window.clearTimeout(timeoutId);
    timeoutId = null;
  };
  const schedule = () => {
    clearScheduled();
    if (stopped || document.visibilityState === "hidden") return;
    timeoutId = window.setTimeout(() => void run(), intervalMs);
  };
  const run = async () => {
    if (stopped || running || document.visibilityState === "hidden") return;
    running = true;
    try {
      await task();
    } catch {
      // 일시적인 네트워크 오류는 다음 폴링에서 재시도한다.
    } finally {
      running = false;
      schedule();
    }
  };
  const onVisibilityChange = () => {
    clearScheduled();
    if (document.visibilityState === "visible") void run();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  if (document.visibilityState === "visible") void run();
  return () => {
    stopped = true;
    clearScheduled();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

const CHAT_ROOM_LABELS: Record<ChatRoomKey, string> = {
  chat: "전체 채팅방",
  guild: "길드 채팅방",
  notice: "시스템 알림",
  lottery: "복권방",
};

function ChatRoomIcon({ room, size = 22 }: { room: ChatRoomKey; size?: number }) {
  if (room === "guild") {
    return <ShieldChevron size={size} weight="duotone" />;
  }
  if (room === "notice") {
    return <BellRinging size={size} weight="duotone" />;
  }
  if (room === "lottery") {
    return <Ticket size={size} weight="duotone" />;
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

function chatMessagePreview(message: ChatMessage): string {
  const text = message.content.replace(/\s+/g, " ").trim();
  const item = message.itemLink
    ? `[아이템] ${chatEquipmentLinkLabel(message.itemLink)}`
    : "";
  return [text, item].filter(Boolean).join(" · ");
}

function ChatRoomList({
  rooms,
  onEnter,
}: {
  rooms: Array<{
    id: string;
    builtin: ChatRoomKey | null;
    custom: CustomChatRoom | null;
    label: string;
    latest: ChatMessage | null;
    description?: string;
    unread: boolean;
    available: boolean;
  }>;
  onEnter: (room: {
    builtin: ChatRoomKey | null;
    custom: CustomChatRoom | null;
  }) => void;
}) {
  return (
    <div className="no-scrollbar flex-1 overflow-y-auto py-2">
      {rooms.map((room) => {
        const latest = room.latest;
        const iconClass = !room.available
          ? "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
          : room.custom
            ? "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300"
            : room.builtin === "chat"
            ? "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300"
            : room.builtin === "guild"
              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"
              : room.builtin === "lottery"
                ? "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300"
              : "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300";

        return (
          <button
            key={room.id}
            type="button"
            disabled={!room.available}
            onClick={() => onEnter(room)}
            className="group flex w-full items-center gap-3 border-b border-zinc-100 px-5 py-4 text-left transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:hover:bg-zinc-800"
          >
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
            >
              {room.custom ? (
                <ChatsCircle size={22} weight="duotone" />
              ) : (
                <ChatRoomIcon room={room.builtin ?? "chat"} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-zinc-800 group-disabled:text-zinc-400 dark:text-zinc-100 dark:group-disabled:text-zinc-500">
                  {room.label}
                </span>
                {room.custom && (
                  <span
                    title={room.custom.visibility === "private" ? "비공개" : "공개"}
                    className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-zinc-400 dark:text-zinc-500"
                  >
                    {room.custom.visibility === "private" ? (
                      <LockSimple size={11} weight="bold" />
                    ) : (
                      <GlobeHemisphereWest size={11} weight="bold" />
                    )}
                    {room.custom.memberCount}명
                  </span>
                )}
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
                  room.builtin === "notice" ? (
                    chatMessagePreview(latest)
                  ) : (
                    <>
                      <EquippedCosmeticBadge cosmetics={latest.cosmetics} />
                      <span
                        className={chatNameClass(
                          latest.cosmetics?.chatNameEffect,
                          "font-medium text-zinc-600 dark:text-zinc-300",
                        )}
                      >
                        {latest.name}
                      </span>
                      {`: ${chatMessagePreview(latest)}`}
                    </>
                  )
                ) : (
                  room.description ?? "메시지가 없습니다."
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
  const [draft, setDraft] = useState("");
  const [itemAttachment, setItemAttachment] = useState<{
    iid: string;
    link: ChatEquipmentLink;
  } | null>(null);
  const [equipmentPickerOpen, setEquipmentPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 채팅방 목록에서 방을 선택한 뒤 메시지 화면으로 진입한다.
  const [activeRoom, setActiveRoom] = useState<ChatRoomKey | null>(null);
  const [activeCustomRoom, setActiveCustomRoom] =
    useState<CustomChatRoom | null>(null);
  const [roomManagerOpen, setRoomManagerOpen] = useState(false);
  const [customRooms, setCustomRooms] = useState<CustomChatRoom[]>([]);
  const [roomInvites, setRoomInvites] = useState<CustomChatRoomInvite[]>([]);
  const [customMessages, setCustomMessages] = useState<ChatMessage[]>([]);
  const [customLastSeen, setCustomLastSeen] = useState<Record<number, number>>({});
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [roomActionBusy, setRoomActionBusy] = useState(false);
  const tab = activeRoom ?? "chat";
  // 낙관적 전송 — 서버 응답 전 임시 메시지 큐. 응답 도착 시 큐에서 제거.
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const tempIdRef = useRef(0);

  useEffect(() => {
    const openLottery = () => {
      setActiveRoom("lottery");
      setActiveCustomRoom(null);
      setRoomManagerOpen(false);
    };
    window.addEventListener("chat:open-lottery", openLottery);
    return () => window.removeEventListener("chat:open-lottery", openLottery);
  }, []);

  const refreshCustomRooms = useCallback(async () => {
    const result = await fetchJoinedChatRooms();
    setCustomRooms(result.rooms);
    setRoomInvites(result.invites);
    setCustomLastSeen((previous) => {
      const next = { ...previous };
      for (const room of result.rooms) {
        if (next[room.id] != null) continue;
        const stored = Number(window.localStorage.getItem(customRoomSeenKey(room.id)));
        const latestId = room.latestMessage?.id ?? 0;
        next[room.id] = Number.isFinite(stored) && stored > 0 ? stored : latestId;
        if (!(Number.isFinite(stored) && stored > 0) && latestId > 0) {
          window.localStorage.setItem(customRoomSeenKey(room.id), String(latestId));
        }
      }
      return next;
    });
    setActiveCustomRoom((current) =>
      current
        ? (result.rooms.find((room) => room.id === current.id) ?? current)
        : null,
    );
    return result.rooms;
  }, []);

  const markCustomRoomSeen = useCallback((roomId: number, lastId: number) => {
    if (lastId <= 0) return;
    setCustomLastSeen((previous) => {
      if (lastId <= (previous[roomId] ?? 0)) return previous;
      window.localStorage.setItem(customRoomSeenKey(roomId), String(lastId));
      return { ...previous, [roomId]: lastId };
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    return startVisiblePolling(refreshCustomRooms, CUSTOM_ROOM_LIST_POLL_MS);
  }, [open, refreshCustomRooms]);

  useEffect(() => {
    if (!open || !activeCustomRoom) return;
    let cancelled = false;
    let initialized = false;
    let afterId = 0;
    const roomId = activeCustomRoom.id;
    const tick = async () => {
      const next = await fetchCustomRoomMessages(
        roomId,
        initialized ? afterId : undefined,
      );
      if (cancelled) return;
      afterId = Math.max(afterId, latestChatMessageId(next));
      if (initialized) {
        setCustomMessages((previous) => mergeChatMessages(previous, next));
      } else {
        initialized = true;
        // 방 진입 직후 전송한 메시지가 느린 최초 조회보다 먼저 도착해도 보존한다.
        setCustomMessages((previous) => mergeChatMessages(previous, next));
      }
      markCustomRoomSeen(roomId, afterId);
    };
    const stopPolling = startVisiblePolling(
      tick,
      CUSTOM_ROOM_MESSAGE_POLL_MS,
    );
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [open, activeCustomRoom, markCustomRoomSeen]);

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
    return (
      baseMessages: ChatMessage[],
      channel: ChatChannel,
      roomId?: number,
    ) => {
      const channelPending = pending.filter(
        (message) =>
          message.channel === channel &&
          (channel !== "room" || message.roomId === roomId),
      );
      if (channelPending.length === 0) return baseMessages;
      const remainingPending = [...channelPending];
      for (const m of baseMessages) {
        if (!m.mine) continue;
        const i = remainingPending.findIndex(
          (p) =>
            p.content === m.content &&
            (p.itemLink?.itemId ?? null) === (m.itemLink?.itemId ?? null),
        );
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
  const visibleCustomMessages = useMemo(
    () =>
      activeCustomRoom
        ? visibleMessagesFor(customMessages, "room", activeCustomRoom.id)
        : [],
    [activeCustomRoom, customMessages, visibleMessagesFor],
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
  const shownMessages = activeCustomRoom
    ? visibleCustomMessages
    : tab === "chat"
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
  const roomEntries = useMemo(
    () => [
      {
        id: "chat",
        builtin: "chat" as const,
        custom: null,
        label: CHAT_ROOM_LABELS.chat,
        latest: chatMessages.at(-1) ?? null,
        unread: unreadChat,
        available: true,
      },
      {
        id: "guild",
        builtin: "guild" as const,
        custom: null,
        label: CHAT_ROOM_LABELS.guild,
        latest: visibleGuildMessages.at(-1) ?? null,
        unread: unreadGuild,
        available: guildAvailable,
      },
      {
        id: "notice",
        builtin: "notice" as const,
        custom: null,
        label: CHAT_ROOM_LABELS.notice,
        latest: noticeMessages.at(-1) ?? null,
        unread: unreadNotice,
        available: true,
      },
      {
        id: "lottery",
        builtin: "lottery" as const,
        custom: null,
        label: CHAT_ROOM_LABELS.lottery,
        latest: null,
        description: "4시간마다 추첨 · /복권 1~10",
        unread: false,
        available: true,
      },
      ...customRooms.map((room) => ({
        id: `room:${room.id}`,
        builtin: null,
        custom: room,
        label: room.name,
        latest: room.latestMessage,
        unread:
          !!room.latestMessage &&
          !room.latestMessage.mine &&
          room.latestMessage.id > (customLastSeen[room.id] ?? 0),
        available: true,
      })),
    ],
    [
      chatMessages,
      guildAvailable,
      noticeMessages,
      unreadChat,
      unreadGuild,
      unreadNotice,
      visibleGuildMessages,
      customRooms,
      customLastSeen,
    ],
  );

  // 실제로 들어간 채팅방의 최신 메시지만 읽은 것으로 보고한다.
  useEffect(() => {
    if (!open || !activeRoom || !onSeen) return;
    if (activeRoom === "chat" && lastChatId > 0) onSeen("chat", lastChatId);
    if (activeRoom === "guild" && lastGuildId > 0) onSeen("guild", lastGuildId);
    if (activeRoom === "notice" && lastNoticeId > 0) onSeen("notice", lastNoticeId);
  }, [open, activeRoom, lastChatId, lastGuildId, lastNoticeId, onSeen]);

  const enterRoom = (room: {
    builtin: ChatRoomKey | null;
    custom: CustomChatRoom | null;
  }) => {
    if (room.builtin === "guild" && !guildAvailable) return;
    setActiveRoom(room.builtin);
    setActiveCustomRoom(room.custom);
    setCustomMessages([]);
    setRoomManagerOpen(false);
    setInviteOpen(false);
    setInviteFeedback(null);
    setDraft("");
    setItemAttachment(null);
    setEquipmentPickerOpen(false);
    setError(null);
  };

  const enterCustomRoom = (room: CustomChatRoom) =>
    enterRoom({ builtin: null, custom: room });

  const returnToRooms = () => {
    setActiveRoom(null);
    setActiveCustomRoom(null);
    setRoomManagerOpen(false);
    setInviteOpen(false);
    setInviteFeedback(null);
    setItemAttachment(null);
    setEquipmentPickerOpen(false);
    setError(null);
  };

  const closePanel = () => {
    setActiveRoom(null);
    setActiveCustomRoom(null);
    setRoomManagerOpen(false);
    setInviteOpen(false);
    setInviteName("");
    setInviteFeedback(null);
    setItemAttachment(null);
    setEquipmentPickerOpen(false);
    setError(null);
    onClose();
  };

  const openRoomManager = () => {
    setRoomManagerOpen(true);
    setActiveRoom(null);
    setActiveCustomRoom(null);
    setError(null);
  };

  const sendRoomInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeCustomRoom || !inviteName.trim() || roomActionBusy) return;
    setRoomActionBusy(true);
    setInviteFeedback(null);
    try {
      const result = await inviteToChatRoom(activeCustomRoom.id, inviteName);
      setInviteName("");
      setInviteFeedback(`${result.targetName}님에게 초대장을 보냈습니다.`);
    } catch (err) {
      setInviteFeedback(
        translateChatRoomError(err instanceof Error ? err.message : ""),
      );
    } finally {
      setRoomActionBusy(false);
    }
  };

  const leaveCustomRoom = async () => {
    if (!activeCustomRoom || roomActionBusy) {
      return;
    }
    const confirmation =
      activeCustomRoom.role === "owner"
        ? activeCustomRoom.memberCount > 1
          ? `${activeCustomRoom.name} 채팅방에서 나갈까요?\n\n방장 권한은 가장 먼저 참여한 멤버에게 넘어갑니다.`
          : `${activeCustomRoom.name} 채팅방에서 나갈까요?\n\n마지막 참여자이므로 채팅방과 대화 내용이 삭제됩니다.`
        : `${activeCustomRoom.name} 채팅방에서 나갈까요?`;
    if (!window.confirm(confirmation)) return;
    setRoomActionBusy(true);
    try {
      await updateChatRoomMembership(activeCustomRoom.id, "leave");
      returnToRooms();
      await refreshCustomRooms();
    } catch (err) {
      setError(translateChatRoomError(err instanceof Error ? err.message : ""));
    } finally {
      setRoomActionBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    const outgoingAttachment = itemAttachment;
    if (!trimmed && !outgoingAttachment) return;
    if (trimmed && !isChatContentAllowed(trimmed)) {
      setError(CHAT_INAPPROPRIATE_CONTENT_MESSAGE);
      return;
    }
    // 임시 id 는 음수 — 서버 id (양수) 와 절대 충돌하지 않음.
    const tempId = --tempIdRef.current;
    const targetChannel: ChatChannel = activeCustomRoom
      ? "room"
      : tab === "guild"
        ? "guild"
        : "global";
    const temp: ChatMessage = {
      id: tempId,
      channel: targetChannel,
      roomId: activeCustomRoom?.id ?? null,
      name,
      className,
      title,
      content: trimmed,
      itemLink: outgoingAttachment?.link ?? null,
      createdAt: Date.now(),
      mine: true,
    };
    setPending((prev) => [...prev, temp]);
    setDraft("");
    setItemAttachment(null);
    setError(null);
    try {
      const sent = await postMessage({
        name,
        className,
        title,
        channel: targetChannel,
        roomId: activeCustomRoom?.id ?? null,
        content: trimmed,
        itemIid: outgoingAttachment?.iid,
      });
      // 서버 응답 도착 — 부모 messages 에 합류. visibleMessages 가 content 매칭으로
      // pending 의 임시 항목을 자동 숨겨주므로 setPending 정리는 다음 폴링 후에 해도 OK.
      // 다만 명시적으로 제거해 메모리/길이 누적을 막는다.
      setPending((prev) => prev.filter((m) => m.id !== tempId));
      if (sent.channel === "room") {
        setCustomMessages((previous) =>
          previous.some((message) => message.id === sent.id)
            ? previous
            : [...previous, sent],
        );
        void refreshCustomRooms();
      } else {
        onMessageSent(sent);
      }
    } catch (err) {
      // 실패 — 임시 메시지 회수 + 본문 복원해 재시도 유도.
      setPending((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(trimmed);
      setItemAttachment((current) => current ?? outgoingAttachment);
      const msg = err instanceof Error ? err.message : "";
      setError(translateChatError(msg));
    }
  };

  // 모바일 키보드 대응 — 오버레이를 시각 뷰포트(키보드로 줄어든 영역)에 맞춰
  // 하단 입력창이 키보드 뒤로 가려지지 않게 한다. 일부 모바일 브라우저는 키보드
  // 애니메이션이 끝난 뒤 viewport 값을 늦게 확정하므로 focus 전환 후 한 번 더 보정한다.
  // visualViewport 미지원 브라우저는 인라인 스타일 미적용 → CSS(inset-0) 기본 동작 폴백.
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const el = overlayRef.current;
    if (!vv || !el) return;
    let animationFrameId: number | null = null;
    let settleTimerId: number | null = null;
    const apply = () => {
      el.style.top = `${vv.offsetTop}px`;
      el.style.left = `${vv.offsetLeft}px`;
      el.style.width = `${vv.width}px`;
      el.style.height = `${vv.height}px`;
      el.style.right = "auto";
      el.style.bottom = "auto";
    };
    const scheduleApply = () => {
      if (animationFrameId != null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        apply();
      });
    };
    const applyAfterKeyboardTransition = () => {
      scheduleApply();
      if (settleTimerId != null) window.clearTimeout(settleTimerId);
      settleTimerId = window.setTimeout(scheduleApply, 400);
    };
    apply();
    vv.addEventListener("resize", scheduleApply);
    vv.addEventListener("scroll", scheduleApply);
    el.addEventListener("focusin", applyAfterKeyboardTransition);
    el.addEventListener("focusout", applyAfterKeyboardTransition);
    window.addEventListener("orientationchange", applyAfterKeyboardTransition);
    return () => {
      vv.removeEventListener("resize", scheduleApply);
      vv.removeEventListener("scroll", scheduleApply);
      el.removeEventListener("focusin", applyAfterKeyboardTransition);
      el.removeEventListener("focusout", applyAfterKeyboardTransition);
      window.removeEventListener(
        "orientationchange",
        applyAfterKeyboardTransition,
      );
      if (animationFrameId != null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      if (settleTimerId != null) window.clearTimeout(settleTimerId);
      // 닫힐 때 인라인 스타일 제거 → CSS(inset-0) 로 복귀.
      // (effect 진입 때 캡처한 el — 이 effect 인스턴스가 다룬 바로 그 노드.)
      el.style.top = "";
      el.style.left = "";
      el.style.width = "";
      el.style.height = "";
      el.style.right = "";
      el.style.bottom = "";
    };
  }, [open]);

  if (!open) return null;

  // body 로 portal — V2TopBar 의 backdrop-blur(=backdrop-filter)가 fixed 자손의
  // containing block 이 돼 패널이 헤더 기준으로 떠 화면 위로 튀어나가던 버그 회피. open 일
  // 때만 렌더(=클릭 후 클라 only)라 SSR 에선 위 null 로 빠져 document.body 접근 안전.
  //
  // 모바일은 전체 화면 모달형 — 배경 입력을 차단하고 z-50 메인 메뉴보다 위에 둔다.
  // 데스크톱은 비모달 도킹 — 래퍼가 pointer-events-none 이라 아래 게임 UI 를 그대로
  // 조작할 수 있고(낚시 등 컨텐츠를 채팅과 동시에), 패널만 pointer-events-auto 이다.
  return createPortal(
    <div
      ref={overlayRef}
      className={CHAT_OVERLAY_CLASS}
    >
      <div
        role="dialog"
        aria-label="채팅"
        className={CHAT_PANEL_CLASS}
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
        <header className={CHAT_HEADER_CLASS}>
          {activeRoom || activeCustomRoom || roomManagerOpen ? (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <button
                type="button"
                onClick={returnToRooms}
                aria-label="채팅방 목록으로 돌아가기"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <ArrowLeft size={20} weight="bold" />
              </button>
              {!roomManagerOpen && (
                <span
                  className={`shrink-0 ${
                    activeCustomRoom
                      ? "text-amber-600 dark:text-amber-300"
                      : activeRoom === "chat"
                        ? "text-blue-600 dark:text-blue-300"
                        : activeRoom === "guild"
                          ? "text-emerald-600 dark:text-emerald-300"
                          : activeRoom === "lottery"
                            ? "text-amber-600 dark:text-amber-300"
                          : "text-violet-600 dark:text-violet-300"
                  }`}
                >
                  {activeCustomRoom ? (
                    <ChatsCircle size={20} weight="duotone" />
                  ) : (
                    <ChatRoomIcon room={activeRoom ?? "chat"} size={20} />
                  )}
                </span>
              )}
              <span className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                {roomManagerOpen
                  ? "채팅방 추가"
                  : activeCustomRoom?.name ??
                    CHAT_ROOM_LABELS[activeRoom ?? "chat"]}
              </span>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2 px-1 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              <ChatCircle size={22} weight="duotone" />
              채팅
            </div>
          )}
          <div className="flex shrink-0 items-center gap-1">
            {!activeRoom && !activeCustomRoom && !roomManagerOpen && (
              <button
                type="button"
                onClick={openRoomManager}
                aria-label="채팅방 추가"
                title="채팅방 추가"
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <Plus size={20} weight="bold" />
                {roomInvites.length > 0 && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500" />
                )}
              </button>
            )}
            {activeCustomRoom?.role === "owner" && (
              <button
                type="button"
                onClick={() => {
                  setInviteOpen((value) => !value);
                  setInviteFeedback(null);
                }}
                aria-expanded={inviteOpen}
                aria-label="사용자 초대"
                title="사용자 초대"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <UserPlus size={19} weight="duotone" />
              </button>
            )}
            {activeCustomRoom && (
              <button
                type="button"
                disabled={roomActionBusy}
                onClick={leaveCustomRoom}
                aria-label="채팅방 나가기"
                title="채팅방 나가기"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed dark:text-zinc-300 dark:hover:bg-rose-950 dark:hover:text-rose-300"
              >
                <SignOut size={19} weight="duotone" />
              </button>
            )}
            <button
              type="button"
              onClick={closePanel}
              aria-label="채팅 닫기"
              title="채팅 닫기"
              className={CHAT_CLOSE_BUTTON_CLASS}
            >
              <X size={20} weight="bold" />
            </button>
          </div>
        </header>

        {inviteOpen && activeCustomRoom?.role === "owner" && (
          <form
            onSubmit={sendRoomInvite}
            className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="flex items-center gap-2">
              <input
                value={inviteName}
                onChange={(event) => setInviteName(event.target.value)}
                maxLength={24}
                placeholder="초대할 캐릭터 이름"
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <button
                type="submit"
                disabled={!inviteName.trim() || roomActionBusy}
                className="shrink-0 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
              >
                초대
              </button>
            </div>
            {inviteFeedback && (
              <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                {inviteFeedback}
              </div>
            )}
          </form>
        )}

        {roomManagerOpen ? (
          <ChatRoomManager
            invites={roomInvites}
            refreshRooms={refreshCustomRooms}
            onOpenRoom={enterCustomRoom}
          />
        ) : activeRoom === "lottery" ? (
          <LotteryRoom />
        ) : activeRoom || activeCustomRoom ? (
          <>
            <MessageList
              open={open}
              tab={activeRoom ?? "chat"}
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
                itemLink={itemAttachment?.link}
                onDraftChange={setDraft}
                onOpenItemPicker={() => setEquipmentPickerOpen(true)}
                onRemoveItemLink={() => setItemAttachment(null)}
                onSubmit={submit}
              />
            )}
          </>
        ) : (
          <ChatRoomList rooms={roomEntries} onEnter={enterRoom} />
        )}
        {(activeRoom || activeCustomRoom || roomManagerOpen) && (
          <button
            type="button"
            onClick={returnToRooms}
            aria-label="채팅방 목록으로 돌아가기"
            title="채팅방 목록으로 돌아가기"
            data-testid="mobile-chat-room-back"
            className={CHAT_MOBILE_BACK_BUTTON_CLASS}
          >
            <ArrowLeft size={20} weight="bold" />
            <span>방 목록</span>
          </button>
        )}
        <ChatEquipmentPicker
          open={equipmentPickerOpen}
          onClose={() => setEquipmentPickerOpen(false)}
          onSelect={(instance: V2EquipInstance) => {
            setItemAttachment({
              iid: instance.iid,
              link: chatEquipmentLinkFromInstance(instance),
            });
            setEquipmentPickerOpen(false);
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
