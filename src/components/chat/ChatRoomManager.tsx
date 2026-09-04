"use client";

import { useState } from "react";
import {
  Check,
  GlobeHemisphereWest,
  LockSimple,
  Plus,
  Users,
  X,
} from "@phosphor-icons/react";
import {
  CHAT_ROOM_NAME_MAX,
  type ChatRoomVisibility,
} from "@/lib/chat-rooms";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  createChatRoom,
  fetchPublicChatRooms,
  respondToChatRoomInvite,
  translateChatRoomError,
  updateChatRoomMembership,
  type CustomChatRoom,
  type CustomChatRoomInvite,
  type PublicChatRoom,
} from "./chatRoomsApi";

type ManagerTab = "create" | "public" | "invites";

export function ChatRoomManager({
  invites,
  refreshRooms,
  onOpenRoom,
}: {
  invites: CustomChatRoomInvite[];
  refreshRooms: () => Promise<CustomChatRoom[]>;
  onOpenRoom: (room: CustomChatRoom) => void;
}) {
  const [tab, setTab] = useState<ManagerTab>("create");
  const [name, setName] = useState("");
  const [visibility, setVisibility] =
    useState<ChatRoomVisibility>("private");
  const [publicRooms, setPublicRooms] = useState<PublicChatRoom[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openTab = (nextTab: ManagerTab) => {
    setTab(nextTab);
    setError(null);
    if (nextTab !== "public") return;
    setLoadingPublic(true);
    fetchPublicChatRooms()
      .then((result) => {
        setPublicRooms(result.rooms);
      })
      .catch((err) => {
        setError(
          translateChatRoomError(err instanceof Error ? err.message : ""),
        );
      })
      .finally(() => {
        setLoadingPublic(false);
      });
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createChatRoom({ name, visibility });
      await refreshRooms();
      onOpenRoom(result.room);
    } catch (err) {
      setError(translateChatRoomError(err instanceof Error ? err.message : ""));
    } finally {
      setBusy(false);
    }
  };

  const join = async (room: PublicChatRoom) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateChatRoomMembership(room.id, "join");
      const joined = await refreshRooms();
      const next = joined.find((candidate) => candidate.id === room.id);
      if (next) onOpenRoom(next);
    } catch (err) {
      setError(translateChatRoomError(err instanceof Error ? err.message : ""));
    } finally {
      setBusy(false);
    }
  };

  const respond = async (
    invite: CustomChatRoomInvite,
    action: "accept" | "decline",
  ) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await respondToChatRoomInvite(invite.id, action);
      const joined = await refreshRooms();
      if (action === "accept") {
        const room = joined.find((candidate) => candidate.id === invite.roomId);
        if (room) onOpenRoom(room);
      }
    } catch (err) {
      setError(translateChatRoomError(err instanceof Error ? err.message : ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-3 border-b border-zinc-200 dark:border-zinc-700">
        {(
          [
            ["create", "만들기", null],
            ["public", "공개방", null],
            ["invites", "받은 초대", invites.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => openTab(key)}
            className={`flex items-center justify-center gap-1.5 px-2 py-3 text-sm font-semibold transition-colors ${
              tab === key
                ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-300"
                : "border-b-2 border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {label}
            {count != null && count > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 text-[11px] text-white">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto p-4">
        {tab === "create" && (
          <form onSubmit={create} className="mx-auto max-w-md space-y-5">
            <div>
              <label
                htmlFor="chat-room-name"
                className="mb-2 block text-sm font-semibold text-zinc-800 dark:text-zinc-100"
              >
                채팅방 이름
              </label>
              <input
                id="chat-room-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={CHAT_ROOM_NAME_MAX}
                placeholder="채팅방 이름을 입력하세요"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-3 text-sm text-zinc-900 outline-none transition-colors focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <div className="mt-1 text-right text-xs tabular-nums text-zinc-400">
                {name.length}/{CHAT_ROOM_NAME_MAX}
              </div>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                공개 설정
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility("private")}
                  className={`${SURFACE_INSET} flex min-h-24 flex-col items-center justify-center gap-1.5 px-3 py-3 text-center transition-colors ${
                    visibility === "private"
                      ? "border-blue-500 text-blue-700 dark:border-blue-500 dark:text-blue-300"
                      : "text-zinc-600 hover:border-zinc-400 dark:text-zinc-300"
                  }`}
                >
                  <LockSimple size={24} weight="duotone" />
                  <span className="text-sm font-semibold">비공개</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    초대로만 입장
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility("public")}
                  className={`${SURFACE_INSET} flex min-h-24 flex-col items-center justify-center gap-1.5 px-3 py-3 text-center transition-colors ${
                    visibility === "public"
                      ? "border-blue-500 text-blue-700 dark:border-blue-500 dark:text-blue-300"
                      : "text-zinc-600 hover:border-zinc-400 dark:text-zinc-300"
                  }`}
                >
                  <GlobeHemisphereWest size={24} weight="duotone" />
                  <span className="text-sm font-semibold">공개</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    누구나 둘러보고 참여
                  </span>
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                새 채팅방은 기본적으로 비공개로 설정됩니다.
              </p>
            </fieldset>

            <button
              type="submit"
              disabled={busy || name.trim().length < 2}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
            >
              <Plus size={18} weight="bold" />
              채팅방 만들기
            </button>
          </form>
        )}

        {tab === "public" && (
          <div className="space-y-2">
            {loadingPublic ? (
              <div className="py-12 text-center text-sm text-zinc-500">
                공개 채팅방을 불러오는 중입니다.
              </div>
            ) : publicRooms.length === 0 ? (
              <div className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
                새로 참여할 수 있는 공개 채팅방이 없습니다.
              </div>
            ) : (
              publicRooms.map((room) => (
                <div
                  key={room.id}
                  className={`${SURFACE_INSET} flex items-center gap-3 p-3.5`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-300">
                    <GlobeHemisphereWest size={21} weight="duotone" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                      {room.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <span>방장 {room.ownerName}</span>
                      <span className="inline-flex items-center gap-1">
                        <Users size={12} /> {room.memberCount}명
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => join(room)}
                    className="shrink-0 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
                  >
                    참여
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "invites" && (
          <div className="space-y-2">
            {invites.length === 0 ? (
              <div className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
                받은 채팅방 초대가 없습니다.
              </div>
            ) : (
              invites.map((invite) => (
                <div
                  key={invite.id}
                  className={`${SURFACE_INSET} flex items-center gap-3 p-3.5`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300">
                    <LockSimple size={21} weight="duotone" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                      {invite.roomName}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {invite.inviterName}님의 초대
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => respond(invite, "accept")}
                      aria-label={`${invite.roomName} 초대 수락`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
                    >
                      <Check size={17} weight="bold" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => respond(invite, "decline")}
                      aria-label={`${invite.roomName} 초대 거절`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-zinc-200 text-zinc-600 hover:bg-zinc-300 disabled:cursor-not-allowed dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
                    >
                      <X size={17} weight="bold" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-zinc-950 dark:text-rose-300">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
