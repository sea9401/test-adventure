"use client";

import { useCallback, useEffect, useState } from "react";

type Supply = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  level: number;
  maxLevel: number;
  currentEffect: string;
  nextEffect: string | null;
  nextCost: number | null;
  maxed: boolean;
};

type CombatSupplyResponse = {
  ok: true;
  fameTotal: number;
  fameAvailable: number;
  canUpgrade: boolean;
  supplies: Supply[];
};

type ErrorResponse = { ok: false; error: string };

function errorLabel(error: string): string {
  switch (error) {
    case "insufficient_fame":
      return "길드 명성이 부족합니다.";
    case "not_allowed":
      return "관리 권한이 필요합니다.";
    case "maxed":
      return "이미 최대 단계입니다.";
    case "no_guild":
      return "길드 소속이 필요합니다.";
    default:
      return "처리하지 못했습니다.";
  }
}

export function GuildCombatSupplyPanel() {
  const [data, setData] = useState<CombatSupplyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v2/guild/combat-supply");
      const json = (await res.json().catch(() => null)) as
        | CombatSupplyResponse
        | ErrorResponse
        | null;
      if (json?.ok) {
        setData(json);
      } else {
        setMessage(errorLabel(json?.error ?? "unknown"));
      }
    } catch {
      setMessage("불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 연구 상태 fetch
    void load();
  }, [load]);

  const upgrade = useCallback(async (supplyId: string) => {
    setBusyId(supplyId);
    setMessage(null);
    try {
      const res = await fetch("/api/v2/guild/combat-supply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ supplyId }),
      });
      const json = (await res.json().catch(() => null)) as
        | CombatSupplyResponse
        | ErrorResponse
        | null;
      if (json?.ok) {
        setData(json);
        setMessage("전투보급을 업그레이드했습니다.");
      } else {
        setMessage(errorLabel(json?.error ?? "unknown"));
      }
    } catch {
      setMessage("처리하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }, []);

  if (loading && !data) {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">전투보급</h2>
          <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-medium tabular-nums text-amber-700 dark:text-amber-400">
              사용 가능 {(data?.fameAvailable ?? 0).toLocaleString()}
            </span>
            <span className="ml-1 tabular-nums">
              / 누적 {(data?.fameTotal ?? 0).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {(data?.supplies ?? []).map((supply) => {
            const canAfford =
              supply.nextCost != null &&
              (data?.fameAvailable ?? 0) >= supply.nextCost;
            const disabled =
              !data?.canUpgrade ||
              supply.maxed ||
              !canAfford ||
              busyId !== null;
            return (
              <div
                key={supply.id}
                className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="text-sm font-semibold">{supply.name}</h3>
                    <span className="rounded border border-zinc-200 px-1.5 py-0.5 text-xs font-medium tabular-nums text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                      Lv {supply.level} / {supply.maxLevel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {supply.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                      {supply.currentEffect}
                    </span>
                    {supply.nextEffect && (
                      <span className="text-zinc-500 dark:text-zinc-400">
                        다음 {supply.nextEffect}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void upgrade(supply.id)}
                  disabled={disabled}
                  className="ui-game-button min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                >
                  {supply.maxed
                    ? "최대"
                    : busyId === supply.id
                      ? "처리 중…"
                      : `${(supply.nextCost ?? 0).toLocaleString()} 명성`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {message && (
        <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          {message}
        </div>
      )}
    </div>
  );
}
