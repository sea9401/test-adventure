"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { CHAT_RETENTION_DAYS } from "@/lib/chat-config";
import type {
  AdminChatKind,
  AdminChatMessage,
  AdminChatMessagesResponse,
  AdminChatRoomsKind,
  AdminChatRoomsResponse,
  AdminChatTarget,
  AdminChatVisibility,
} from "@/lib/admin-chat-monitor";
import { useAsyncData } from "@/lib/useAsyncData";
import { MessageBody } from "@/components/chat/MessageBody";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { adminGet } from "../api";

const PAGE_SIZE = 50;

const KIND_LABELS: Record<AdminChatRoomsKind, string> = {
  all: "모든 종류",
  global: "전체 채팅",
  trade: "거래 채팅",
  guild: "길드 채팅",
  room: "사용자 채팅방",
};

const kindLabel = (kind: AdminChatKind) => KIND_LABELS[kind];

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("ko-KR") : "기록 없음";
}

function messageUrl(target: AdminChatTarget, beforeId?: number | null) {
  const searchParams = new URLSearchParams({ kind: target.kind });
  if ("scopeId" in target) {
    searchParams.set("scopeId", String(target.scopeId));
  }
  if (beforeId != null) searchParams.set("beforeId", String(beforeId));
  return `/api/admin/chat-monitor/messages?${searchParams.toString()}`;
}

export function mergeOlderAdminChatMessages(
  current: readonly AdminChatMessage[],
  older: readonly AdminChatMessage[],
): AdminChatMessage[] {
  const seen = new Set(current.map((message) => message.id));
  return [...current, ...older.filter((message) => !seen.has(message.id))];
}

export function ChatMonitorTab() {
  const [kind, setKind] = useState<AdminChatRoomsKind>("all");
  const [visibility, setVisibility] =
    useState<AdminChatVisibility>("all");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AdminChatTarget | null>(null);
  const [detail, setDetail] = useState<AdminChatMessagesResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [olderLoading, setOlderLoading] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const detailRequestRef = useRef(0);

  const roomsUrl = useMemo(() => {
    const searchParams = new URLSearchParams({
      kind,
      visibility,
      q: query,
      offset: String(offset),
      limit: String(PAGE_SIZE),
    });
    return `/api/admin/chat-monitor/rooms?${searchParams.toString()}`;
  }, [kind, offset, query, visibility]);

  const {
    data: roomsData,
    loading: roomsLoading,
    error: roomsError,
    refetch: refreshRooms,
  } = useAsyncData<AdminChatRoomsResponse>(
    (signal) => adminGet(roomsUrl, signal),
    [roomsUrl],
  );

  const selectTarget = async (target: AdminChatTarget) => {
    const requestId = ++detailRequestRef.current;
    setSelected(target);
    setDetail(null);
    setDetailError(null);
    setOlderError(null);
    setDetailLoading(true);
    try {
      const response = await adminGet<AdminChatMessagesResponse>(
        messageUrl(target),
      );
      if (detailRequestRef.current === requestId) setDetail(response);
    } catch (error) {
      if (detailRequestRef.current === requestId) {
        setDetailError(
          error instanceof Error
            ? error.message
            : "대화를 불러오지 못했습니다.",
        );
      }
    } finally {
      if (detailRequestRef.current === requestId) setDetailLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!selected) return;
    const requestId = ++detailRequestRef.current;
    setDetailLoading(true);
    setDetailError(null);
    setOlderError(null);
    try {
      const response = await adminGet<AdminChatMessagesResponse>(
        messageUrl(selected),
      );
      if (detailRequestRef.current === requestId) setDetail(response);
    } catch (error) {
      if (detailRequestRef.current === requestId) {
        setDetailError(
          error instanceof Error
            ? error.message
            : "대화를 새로고침하지 못했습니다.",
        );
      }
    } finally {
      if (detailRequestRef.current === requestId) setDetailLoading(false);
    }
  };

  const loadOlder = async () => {
    if (!selected || !detail?.nextBeforeId || olderLoading) return;
    const requestId = detailRequestRef.current;
    setOlderLoading(true);
    setOlderError(null);
    try {
      const response = await adminGet<AdminChatMessagesResponse>(
        messageUrl(selected, detail.nextBeforeId),
      );
      if (detailRequestRef.current !== requestId) return;
      setDetail((current) =>
        current
          ? {
              ...current,
              messages: mergeOlderAdminChatMessages(
                current.messages,
                response.messages,
              ),
              hasMore: response.hasMore,
              nextBeforeId: response.nextBeforeId,
            }
          : current,
      );
    } catch (error) {
      if (detailRequestRef.current === requestId) {
        setOlderError(
          error instanceof Error
            ? error.message
            : "이전 메시지를 불러오지 못했습니다.",
        );
      }
    } finally {
      if (detailRequestRef.current === requestId) setOlderLoading(false);
    }
  };

  const targets = roomsData?.targets ?? [];

  return (
    <section className="space-y-4">
      <div className={`${SURFACE_CARD} p-4`}>
        <h3 className="text-sm font-semibold">채팅 모니터링</h3>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
          최고 관리자 전용 · 읽기 전용 · 최근 {CHAT_RETENTION_DAYS}일
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          관리자는 방에 참여하지 않으며 참여자 명단과 인원수에 포함되지 않습니다.
        </p>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]">
        <div className={`${SURFACE_CARD} space-y-3 p-4`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold">채팅방</h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {roomsData ? `검색 결과 ${roomsData.total}개` : "목록 조회"}
              </p>
            </div>
            <button
              type="button"
              onClick={refreshRooms}
              disabled={roomsLoading}
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {roomsLoading ? "조회 중…" : "목록 새로고침"}
            </button>
          </div>

          <div className={`${SURFACE_INSET} grid gap-2 p-3 sm:grid-cols-2`}>
            <label className="space-y-1 text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">종류</span>
              <select
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as AdminChatRoomsKind);
                  setOffset(0);
                }}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
              >
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">공개 여부</span>
              <select
                value={visibility}
                onChange={(event) => {
                  setVisibility(event.target.value as AdminChatVisibility);
                  setOffset(0);
                }}
                disabled={kind !== "all" && kind !== "room"}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="all">전체</option>
                <option value="public">공개</option>
                <option value="private">비공개</option>
              </select>
            </label>
            <label className="space-y-1 text-xs sm:col-span-2">
              <span className="text-zinc-500 dark:text-zinc-400">
                이름 또는 ID 검색
              </span>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setOffset(0);
                }}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>

          {roomsError ? (
            <p className="text-xs text-red-600 dark:text-red-400">
              목록을 불러오지 못했습니다: {roomsError}
            </p>
          ) : null}
          {!roomsLoading && !roomsError && targets.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
              조건에 맞는 채팅방이 없습니다.
            </p>
          ) : null}
          <div className="space-y-2">
            {targets.map((target) => (
              <button
                key={target.targetKey}
                type="button"
                onClick={() => void selectTarget(target)}
                className={`${SURFACE_INSET} w-full p-3 text-left transition hover:border-sky-400 ${
                  selected?.targetKey === target.targetKey
                    ? "ring-2 ring-sky-500"
                    : ""
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {target.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-zinc-500 dark:text-zinc-400">
                      {kindLabel(target.kind)} · {target.targetKey}
                    </span>
                  </span>
                  {target.kind === "room" ? (
                    <span className="shrink-0 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] dark:bg-zinc-800">
                      {target.visibility === "private" ? "비공개" : "공개"}
                    </span>
                  ) : null}
                </span>
                <span className="mt-2 flex justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span>
                    {target.kind === "room"
                      ? `${target.memberCount}명 · 방장 ${target.ownerName}`
                      : "읽기 전용"}
                  </span>
                  <span>{formatDate(target.latestMessageAt)}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={offset === 0 || roomsLoading}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs disabled:opacity-50 dark:border-zinc-700"
            >
              이전 목록
            </button>
            <button
              type="button"
              disabled={!roomsData?.hasMore || roomsLoading}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs disabled:opacity-50 dark:border-zinc-700"
            >
              다음 목록
            </button>
          </div>
        </div>

        <div className={`${SURFACE_CARD} min-h-[28rem] p-4`}>
          {!selected ? (
            <div className="flex min-h-[24rem] items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
              왼쪽에서 확인할 채팅방을 선택하세요.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold">{selected.label}</h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {kindLabel(selected.kind)} · {selected.targetKey}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshDetail()}
                  disabled={detailLoading}
                  className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  {detailLoading ? "조회 중…" : "대화 새로고침"}
                </button>
              </div>

              {detailError ? (
                <div className={`${SURFACE_INSET} p-3 text-xs text-red-600 dark:text-red-400`}>
                  대화를 불러오지 못했습니다: {detailError}
                </div>
              ) : null}

              {detail?.participants ? (
                <div className={`${SURFACE_INSET} p-3`}>
                  <h5 className="text-xs font-semibold">
                    참여자 {detail.participants.length}명
                  </h5>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {detail.participants.map((participant) => (
                      <Link
                        key={participant.userId}
                        href={`/admin?tab=users&q=${encodeURIComponent(participant.userId)}`}
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:border-sky-400 dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <span className="font-medium">{participant.name}</span>
                        {participant.role === "owner" ? " · 방장" : ""}
                        <span className="ml-1 text-[10px] text-zinc-400">
                          {participant.userId}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}

              {detail && detail.messages.length === 0 ? (
                <div className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  보존 중인 메시지가 없습니다.
                </div>
              ) : null}

              {detail?.messages.length ? (
                <div className="space-y-2">
                  {detail.messages.map((message) => (
                    <article key={message.id} className={`${SURFACE_INSET} p-3`}>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <Link
                          href={`/admin?tab=users&q=${encodeURIComponent(message.authorUserId)}`}
                          className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300"
                        >
                          {message.name}
                        </Link>
                        <span className="text-[10px] text-zinc-400">
                          {message.authorUserId}
                        </span>
                        <span className="ml-auto text-[10px] text-zinc-400">
                          {formatDate(message.createdAt)}
                        </span>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-100">
                        <MessageBody
                          content={message.content}
                          itemLink={message.itemLink}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}

              {olderError ? (
                <div className="flex items-center justify-between gap-2 text-xs text-red-600 dark:text-red-400">
                  <span>이전 메시지를 불러오지 못했습니다: {olderError}</span>
                  <button
                    type="button"
                    onClick={() => void loadOlder()}
                    className="rounded-md border border-red-300 px-2 py-1 font-medium dark:border-red-800"
                  >
                    이전 메시지 다시 시도
                  </button>
                </div>
              ) : null}
              {detail?.hasMore && !olderError ? (
                <button
                  type="button"
                  onClick={() => void loadOlder()}
                  disabled={olderLoading}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-zinc-700"
                >
                  {olderLoading ? "불러오는 중…" : "이전 메시지 더 보기"}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
