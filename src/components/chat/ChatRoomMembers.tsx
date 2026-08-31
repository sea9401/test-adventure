"use client";

import { useCallback, useState } from "react";
import { CrownSimple, Users } from "@phosphor-icons/react";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import {
  fetchChatRoomMembers,
  type CustomChatRoomMember,
} from "./chatRoomsApi";

export function ChatRoomMembers({
  roomId,
  memberCount,
  onSelectName,
}: {
  roomId: number;
  memberCount: number;
  onSelectName: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<CustomChatRoomMember[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchChatRoomMembers(roomId);
      setMembers(result.members);
    } catch {
      setError("참여자 명단을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  const toggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && members == null && !loading) void loadMembers();
  };

  const visibleCount = members?.length ?? memberCount;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={`채팅방 참여자 ${visibleCount}명 ${open ? "닫기" : "보기"}`}
        title={`참여자 ${visibleCount}명`}
        className="inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-md px-2 text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <Users size={19} weight="duotone" />
        <span className="text-xs font-semibold tabular-nums">{visibleCount}</span>
      </button>

      {open && (
        <section
          role="region"
          aria-label="채팅방 참여자"
          className={`${SURFACE_CARD} absolute right-3 top-full z-40 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden text-left sm:right-4`}
        >
          <div className="border-b border-zinc-200 px-3.5 py-3 dark:border-zinc-700">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              참여자 {visibleCount}명
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              이 채팅방에 참여 중인 캐릭터입니다.
            </p>
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {loading ? (
              <p className="px-2 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                참여자 명단을 불러오는 중입니다.
              </p>
            ) : error ? (
              <div className={`${SURFACE_INSET} px-3 py-4 text-center`}>
                <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadMembers()}
                  className="mt-3 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  다시 시도
                </button>
              </div>
            ) : members?.length ? (
              <ul className="space-y-1">
                {members.map((member) => (
                  <li key={member.userId}>
                    <button
                      type="button"
                      onClick={() => onSelectName(member.name)}
                      aria-label={`${member.name} 프로필 보기`}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {member.name}
                      </span>
                      {member.role === "owner" && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                          <CrownSimple size={12} weight="fill" />
                          방장
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                표시할 참여자가 없습니다.
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
