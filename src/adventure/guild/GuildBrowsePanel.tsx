"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MagnifyingGlass, UsersThree } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  cancelJoinRequest,
  fetchGuildBrowse,
  requestJoinGuild,
  GuildError,
  type GuildBrowseEntry,
  type GuildBrowseResponse,
} from "./api";

// 길드 둘러보기 — 미소속 유저용. 활성 길드 목록(명성순) + 이름 검색 + 가입 신청/취소.
// 신청은 마스터 수락 전까지 pending. 유저당 동시 1건 — 다른 길드에 신청하려면 먼저 취소.
export function GuildBrowsePanel({
  busy,
  leaveCooldownUntil,
  onToast,
  onError,
}: {
  busy: boolean;
  /** 탈퇴/추방 쿨다운 — 만료 전까지 가입 신청 불가. */
  leaveCooldownUntil: string | null;
  onToast: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<GuildBrowseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lastQueryRef = useRef("");

  const cooldownUntilMs = leaveCooldownUntil
    ? new Date(leaveCooldownUntil).getTime()
    : null;
  const cooldownActive = cooldownUntilMs !== null && cooldownUntilMs > now;
  useEffect(() => {
    if (!cooldownActive) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [cooldownActive]);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    lastQueryRef.current = q;
    try {
      const r = await fetchGuildBrowse(q);
      // 응답이 늦게 와도 최신 검색어 결과만 반영.
      if (lastQueryRef.current === q) setData(r);
    } catch (e) {
      onError(e instanceof GuildError ? e.message : "길드 목록을 불러오지 못했습니다.");
    } finally {
      if (lastQueryRef.current === q) setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load("");
  }, [load]);

  // 검색어 디바운스 (300ms).
  useEffect(() => {
    const t = setTimeout(() => void load(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query, load]);

  const handleRequest = async (g: GuildBrowseEntry) => {
    setActing(true);
    try {
      await requestJoinGuild(g.id);
      onToast(`${g.name} 길드에 가입 신청했습니다.`);
      await load(lastQueryRef.current);
    } catch (e) {
      onError(e instanceof GuildError ? e.message : "가입 신청에 실패했습니다.");
    } finally {
      setActing(false);
    }
  };

  const handleCancel = async (requestId: number, name: string) => {
    setActing(true);
    try {
      await cancelJoinRequest(requestId);
      onToast(`${name} 길드 가입 신청을 취소했습니다.`);
      await load(lastQueryRef.current);
    } catch (e) {
      onError(e instanceof GuildError ? e.message : "신청 취소에 실패했습니다.");
    } finally {
      setActing(false);
    }
  };

  const pendingGuildId = data?.myPendingRequest?.guildId ?? null;
  const pendingRequestId = data?.myPendingRequest?.requestId ?? null;
  const maxMembers = data?.maxMembers ?? 0;
  const lock = busy || acting;

  return (
    <Card padding="md">
      <div className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold">길드 둘러보기</h4>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            마음에 드는 길드에 가입 신청하면 마스터가 수락/거절합니다. 한 번에 한
            길드에만 신청할 수 있어요.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 dark:border-zinc-700 dark:bg-zinc-900">
          <MagnifyingGlass size={14} className="shrink-0 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="길드명 검색"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        {cooldownActive ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
            탈퇴/추방 쿨다운 중에는 가입 신청을 보낼 수 없습니다.
          </div>
        ) : null}

        {loading && !data ? (
          <Skeleton rows={3} />
        ) : (data?.guilds.length ?? 0) === 0 ? (
          <EmptyState
            icon={<UsersThree size={36} weight="duotone" />}
            title={query.trim() ? "검색 결과가 없습니다" : "아직 길드가 없습니다"}
            message={query.trim() ? "다른 이름으로 검색해 보세요." : "첫 길드를 만들어 보세요."}
          />
        ) : (
          <ul className="space-y-2">
            {data!.guilds.map((g) => {
              // 길드별 정원 — 국가 선포 시 상향(응답에 per-guild maxMembers). 없으면 기본값 폴백.
              const cap = g.maxMembers ?? maxMembers;
              const isFull = g.memberCount >= cap;
              const requested = pendingGuildId === g.id;
              const hasOtherPending = pendingGuildId !== null && !requested;
              return (
                <li
                  key={g.id}
                  className="rounded-md border border-zinc-200 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {g.name}
                        </span>
                        <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                          {g.grade}급
                        </span>
                        {g.nationName ? (
                          <span className="shrink-0 truncate rounded bg-indigo-500/10 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-400">
                            {g.nationName}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        명성 {g.fameTotal.toLocaleString()} · 인원 {g.memberCount}/
                        {cap}
                      </p>
                      {g.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300">
                          {g.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0">
                      {requested ? (
                        <button
                          type="button"
                          onClick={() =>
                            pendingRequestId != null &&
                            void handleCancel(pendingRequestId, g.name)
                          }
                          disabled={lock}
                          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          신청 취소
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleRequest(g)}
                          disabled={
                            lock ||
                            cooldownActive ||
                            isFull ||
                            !g.acceptingRequests ||
                            hasOtherPending
                          }
                          title={
                            isFull
                              ? "정원이 가득 찼습니다"
                              : !g.acceptingRequests
                                ? "가입 신청을 받지 않습니다"
                                : hasOtherPending
                                  ? "다른 길드에 신청 중 — 먼저 취소하세요"
                                  : undefined
                          }
                          className="rounded-md border border-emerald-700 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {isFull
                            ? "정원 마감"
                            : !g.acceptingRequests
                              ? "모집 안 함"
                              : "가입 신청"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
