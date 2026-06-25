"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { ReplayBattleScene } from "./ReplayBattleScene";
import type { StoredReplayEnvelope } from "@/adventure/data/v2/replayPayload";
import type { Gender } from "@/adventure/profile/avatars";

// 이 거점에 행해진 최근 공격 기록 (공성/NPC 정기 공격, 승패 포함).
// 소유 탭과 비-소유(공격자 정찰) 탭 양쪽에서 렌더 — API 는 읽기 전용·인증만 게이트.
// hasReplay 행은 "전투 보기"로 리플레이 단건 lazy 조회 (한 번에 하나만 펼침).

type AttackRow = {
  id: number;
  attackerName: string | null;
  attackerGuildName: string | null;
  npc: boolean;
  attackerWon: boolean;
  turns: number;
  at: string;
  hasReplay: boolean;
};

// 페이지당 노출 행 수 — 카드가 너무 길어지지 않게 클라 페이지네이션(서버는 최신 20건 캡).
const PAGE_SIZE = 5;

function fmtAgo(iso: string, now: number): string {
  const ms = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export function OutpostAttackLog({
  outpostId,
  // 부모가 bump 하면(약탈/정복 직후) 자동 refetch — 방금 시도한 공격 기록을 바로 노출.
  reloadKey = 0,
}: {
  outpostId: string;
  reloadKey?: number;
}) {
  const [attacks, setAttacks] = useState<AttackRow[]>([]);
  const [loading, setLoading] = useState(true);
  // 현재 페이지(0-index). refetch 시 0 으로 리셋(아래 finally).
  const [page, setPage] = useState(0);
  // fetch 시점 기준 elapsed 표시용 — Date.now() 를 render 중 직접 호출하면 impure.
  const [nowMs, setNowMs] = useState(() => Date.now());
  // 펼친 리플레이 — 한 번에 하나. envelope null = 로딩 중.
  const [openReplay, setOpenReplay] = useState<{
    attemptId: number;
    envelope: StoredReplayEnvelope | null;
    error?: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v2/outpost/attacks?outpostId=${encodeURIComponent(outpostId)}`,
      );
      if (res.ok) {
        const j = (await res.json()) as { attacks?: AttackRow[] };
        setAttacks(j.attacks ?? []);
      } else {
        setAttacks([]);
      }
    } catch {
      setAttacks([]);
    } finally {
      setNowMs(Date.now());
      setLoading(false);
      setPage(0);
      setOpenReplay(null);
    }
  }, [outpostId]);

  useEffect(() => {
    refresh();
    // reloadKey 변화 = 부모의 공격 시도 후 갱신 신호 → 같은 outpost 라도 재조회.
  }, [refresh, reloadKey]);

  async function toggleReplay(attemptId: number) {
    if (openReplay?.attemptId === attemptId) {
      setOpenReplay(null);
      return;
    }
    setOpenReplay({ attemptId, envelope: null });
    try {
      const res = await fetch(
        `/api/v2/outpost/attacks/replay?attemptId=${attemptId}`,
      );
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        replay?: StoredReplayEnvelope;
      } | null;
      if (j?.ok && j.replay) {
        const envelope = j.replay;
        setOpenReplay((cur) =>
          cur?.attemptId === attemptId ? { attemptId, envelope } : cur,
        );
      } else {
        setOpenReplay((cur) =>
          cur?.attemptId === attemptId
            ? {
                attemptId,
                envelope: null,
                error: `불러오기 실패 (http ${res.status})`,
              }
            : cur,
        );
      }
    } catch {
      setOpenReplay((cur) =>
        cur?.attemptId === attemptId
          ? { attemptId, envelope: null, error: "네트워크 오류" }
          : cur,
      );
    }
  }

  const totalPages = Math.max(1, Math.ceil(attacks.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visible = attacks.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  return (
    <Card padding="md">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          최근 공격 기록
          {attacks.length > 0 && (
            <span className="ml-1 text-xs font-normal text-zinc-400">
              ({attacks.length})
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="text-xs text-zinc-500 hover:text-zinc-700 disabled:opacity-50 dark:hover:text-zinc-300"
        >
          새로고침
        </button>
      </div>

      {loading && attacks.length === 0 ? (
        <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          불러오는 중…
        </div>
      ) : attacks.length === 0 ? (
        <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          이 거점에 기록된 공격이 없습니다.
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {visible.map((a) => (
            <li
              key={a.id}
              className="rounded-md border border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <div className="min-w-0">
                  <div className="truncate text-sm text-zinc-700 dark:text-zinc-200">
                    {a.npc ? (
                      <>
                        NPC 정기 공격
                        {a.attackerName ? ` — ${a.attackerName}` : ""}
                      </>
                    ) : (
                      <>
                        {a.attackerName ?? "모험가"}
                        {a.attackerGuildName && (
                          <span className="text-zinc-500 dark:text-zinc-400">
                            {" "}
                            · {a.attackerGuildName}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {fmtAgo(a.at, nowMs)} · {a.turns}턴
                    {a.hasReplay && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          onClick={() => toggleReplay(a.id)}
                          className="underline decoration-dotted underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
                        >
                          {openReplay?.attemptId === a.id
                            ? "전투 닫기"
                            : "전투 보기"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                    a.attackerWon
                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {a.attackerWon
                    ? a.npc
                      ? "점령 해제"
                      : "성벽 타격"
                    : "격퇴"}
                </span>
              </div>
              {openReplay?.attemptId === a.id && (
                <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
                  {openReplay.envelope ? (
                    <>
                      {/* 리플레이 시점 안내 — "player" 사이드 = claim 공격이면
                          공격자, NPC 정기 공격이면 점령자(수비). */}
                      <div className="mb-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {openReplay.envelope.playerName} 시점
                      </div>
                      <ReplayBattleScene
                        payload={openReplay.envelope.payload}
                        playerName={openReplay.envelope.playerName}
                        gender={
                          (openReplay.envelope.gender ?? "male1") as Gender
                        }
                        exp={0}
                        maxExp={1}
                      />
                    </>
                  ) : (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {openReplay.error ?? "리플레이 불러오는 중…"}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <button
            type="button"
            onClick={() => {
              setOpenReplay(null);
              setPage((p) => Math.max(0, p - 1));
            }}
            disabled={safePage <= 0}
            className="rounded px-2 py-1 hover:text-zinc-700 disabled:opacity-40 dark:hover:text-zinc-200"
          >
            ◀ 이전
          </button>
          <span className="tabular-nums">
            {safePage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => {
              setOpenReplay(null);
              setPage((p) => Math.min(totalPages - 1, p + 1));
            }}
            disabled={safePage >= totalPages - 1}
            className="rounded px-2 py-1 hover:text-zinc-700 disabled:opacity-40 dark:hover:text-zinc-200"
          >
            다음 ▶
          </button>
        </div>
      )}
    </Card>
  );
}
