"use client";

import { SignOut, UserPlus } from "@phosphor-icons/react";
import type { CustomChatRoom } from "./chatRoomsApi";
import { ChatRoomMembers } from "./ChatRoomMembers";

export function ChatCustomRoomActions({
  room,
  inviteOpen,
  roomActionBusy,
  onToggleInvite,
  onLeave,
  onSelectName,
}: {
  room: CustomChatRoom;
  inviteOpen: boolean;
  roomActionBusy: boolean;
  onToggleInvite: () => void;
  onLeave: () => void;
  onSelectName: (name: string) => void;
}) {
  return (
    <>
      <ChatRoomMembers
        roomId={room.id}
        memberCount={room.memberCount}
        onSelectName={onSelectName}
      />
      {room.role === "owner" && (
        <button
          type="button"
          onClick={onToggleInvite}
          aria-expanded={inviteOpen}
          aria-label="사용자 초대"
          title="사용자 초대"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <UserPlus size={19} weight="duotone" />
        </button>
      )}
      <button
        type="button"
        disabled={roomActionBusy}
        onClick={onLeave}
        aria-label="채팅방 나가기"
        title="채팅방 나가기"
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed dark:text-zinc-300 dark:hover:bg-rose-950 dark:hover:text-rose-300"
      >
        <SignOut size={19} weight="duotone" />
      </button>
    </>
  );
}
