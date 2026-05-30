"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

// 점령 길드 전용 — 거점에 침입한 다른 길드 캐릭 목록 + 토벌 버튼.
// 점령 길드 멤버일 때만 OutpostView 가 렌더.

type Intruder = {
  userId: string;
  name: string;
  level: number;
  huntedAt: number;
};

type EjectResult = {
  ok: boolean;
  won?: boolean;
  turns?: number;
  attackerName?: string;
  defenderName?: string;
  attackerHpBefore?: number;
  attackerHpAfter?: number;
  attackerMaxHp?: number;
  defenderHpBefore?: number;
  defenderHpAfter?: number;
  defenderMaxHp?: number;
  error?: string;
  requiredStamina?: number;
};

function fmtElapsed(huntedAt: number, now: number): string {
  const ms = Math.max(0, now - huntedAt);
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "방금";
  return `${min}분 전`;
}

export function IntruderPanel({ outpostId }: { outpostId: string }) {
  const [intruders, setIntruders] = useState<Intruder[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<EjectResult | null>(null);
  // fetch 시점 기준 elapsed 표시용 — Date.now() 를 render 중 직접 호출하면 impure.
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v2/outpost/intruders?outpostId=${encodeURIComponent(outpostId)}`,
      );
      if (res.ok) {
        const j = (await res.json()) as { intruders?: Intruder[] };
        setIntruders(j.intruders ?? []);
      } else {
        setIntruders([]);
      }
    } catch {
      setIntruders([]);
    } finally {
      setNowMs(Date.now());
      setLoading(false);
    }
  }, [outpostId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function eject(targetUserId: string) {
    setBusyUserId(targetUserId);
    setLastResult(null);
    try {
      const res = await fetch("/api/v2/outpost/eject", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outpostId, targetUserId }),
      });
      const j = (await res.json().catch(() => null)) as EjectResult | null;
      setLastResult(j ?? { ok: false, error: `http ${res.status}` });
      // 결과와 상관없이 목록 갱신 (TTL 변동·승리 시 제거 등).
      await refresh();
    } catch (err) {
      setLastResult({ ok: false, error: `network: ${(err as Error).message}` });
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <Card padding="md">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          현재 침입자
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

      {loading && intruders.length === 0 ? (
        <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">불러오는 중…</div>
      ) : intruders.length === 0 ? (
        <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          최근 10분 안에 침입한 다른 길드 캐릭이 없습니다.
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {intruders.map((it) => (
            <li
              key={it.userId}
              className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-2 py-1.5 dark:border-zinc-800"
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-zinc-700 dark:text-zinc-200">
                  {it.name}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Lv {it.level} · {fmtElapsed(it.huntedAt, nowMs)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => eject(it.userId)}
                disabled={busyUserId !== null}
                className="shrink-0 rounded border border-rose-600 bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {busyUserId === it.userId ? "교전 중…" : "토벌"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {lastResult && (
        <div
          className={`mt-3 rounded-md border p-2 text-xs ${
            lastResult.ok && lastResult.won
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
              : lastResult.ok
                ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200"
                : "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          }`}
        >
          {lastResult.ok ? (
            lastResult.won ? (
              <>
                ✓ {lastResult.attackerName} → {lastResult.defenderName} 토벌 성공 (
                {lastResult.turns}턴) · 침입자 강제 퇴장
              </>
            ) : (
              <>
                ✗ {lastResult.attackerName} 패배 ({lastResult.turns}턴) · 침입자
                남음
              </>
            )
          ) : (
            <>
              ✗ {lastResult.error ?? "unknown"}
              {lastResult.requiredStamina
                ? ` (필요 스태미너 ${lastResult.requiredStamina})`
                : ""}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
