"use client";

import { useCallback, useEffect, useState } from "react";
import { useSystemMessageState } from "@/adventure/v2/RewardToastProvider";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

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

type CombatOperations = {
  weekKey: string;
  tier: number;
  maxTier: number;
  nextCost: number | null;
  goldPct: number;
  expPct: number;
  proficiencyChancePct: number;
};

type CombatSupplyResponse = {
  ok: true;
  fameTotal: number;
  fameAvailable: number;
  guildGold: number;
  canUpgrade: boolean;
  supplies: Supply[];
  operations: CombatOperations;
};

type ErrorResponse = { ok: false; error: string };

export function confirmCombatSupplyUpgrade({
  supply,
  onUpgrade,
  confirm = (message) => window.confirm(message),
}: {
  supply: Pick<Supply, "id" | "name" | "level" | "nextEffect" | "nextCost">;
  onUpgrade: (supplyId: string) => void;
  confirm?: (message: string) => boolean;
}): boolean {
  if (supply.nextCost == null || supply.nextEffect == null) return false;
  if (
    !confirm(
      `${supply.name}을(를) Lv.${supply.level + 1}(으)로 올릴까요?\n${supply.nextCost.toLocaleString()} 명성이 사용되며, ${supply.nextEffect} 효과가 적용됩니다.`,
    )
  ) {
    return false;
  }
  onUpgrade(supply.id);
  return true;
}

export function confirmCombatOperationsFunding({
  operations,
  onFund,
  confirm = (message) => window.confirm(message),
}: {
  operations: Pick<CombatOperations, "tier" | "nextCost">;
  onFund: () => void;
  confirm?: (message: string) => boolean;
}): boolean {
  if (operations.nextCost == null) return false;
  const nextTier = operations.tier + 1;
  if (
    !confirm(
      `주간 전투보급 운용을 Lv.${nextTier}(으)로 강화할까요?\n길드 자금 ${operations.nextCost.toLocaleString()} G가 사용되며, 이번 주 사냥 골드·EXP +${nextTier}%p와 추가 숙달 확률 +${nextTier * 5}%p가 적용됩니다.\n운용 단계는 월요일 00:00 KST에 초기화됩니다.`,
    )
  ) {
    return false;
  }
  onFund();
  return true;
}

const SUPPLY_ACCENT: Record<
  string,
  {
    dot: string;
    bar: string;
    badge: string;
  }
> = {
  combat_gold: {
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    badge:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300",
  },
  combat_exp: {
    dot: "bg-sky-500",
    bar: "bg-sky-500",
    badge:
      "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-300",
  },
  combat_proficiency: {
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    badge:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300",
  },
};

function errorLabel(error: string): string {
  switch (error) {
    case "insufficient_fame":
      return "길드 명성이 부족합니다.";
    case "insufficient_gold":
      return "길드 자금이 부족합니다.";
    case "not_allowed":
      return "관리 권한이 필요합니다.";
    case "maxed":
      return "이미 최대 단계입니다.";
    case "operations_maxed":
      return "이번 주 전투보급 운용이 이미 최대 단계입니다.";
    case "no_guild":
      return "길드 소속이 필요합니다.";
    default:
      return "처리하지 못했습니다.";
  }
}

function useGuildCombatSupply() {
  const [data, setData] = useState<CombatSupplyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useSystemMessageState();

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
        setMessage(null);
      } else {
        setMessage(errorLabel(json?.error ?? "unknown"));
      }
    } catch {
      setMessage("불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [setMessage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 연구 상태 fetch
    void load();
  }, [load]);

  return { data, setData, loading, message, setMessage };
}

export function GuildCombatSupplySummary() {
  const { data, loading, message } = useGuildCombatSupply();
  const supplies = data?.supplies ?? [];

  return (
    <div className="rounded-md border border-zinc-200 bg-white text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-700">
        <div>
          <h2 className="text-sm font-semibold">길드 버프</h2>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium tabular-nums">
          {(data?.operations.tier ?? 0) > 0 && (
            <span className="text-emerald-700 dark:text-emerald-400">
              주간 운용 Lv.{data?.operations.tier}
            </span>
          )}
          <span className="text-amber-700 dark:text-amber-400">
            명성 {(data?.fameAvailable ?? 0).toLocaleString()}
          </span>
        </div>
      </div>

      {loading && supplies.length === 0 ? (
        <div className="px-3 py-4 text-xs text-zinc-500 dark:text-zinc-400">
          불러오는 중…
        </div>
      ) : message && supplies.length === 0 ? (
        <div className="px-3 py-4 text-xs text-zinc-500 dark:text-zinc-400">
          {message}
        </div>
      ) : (
        <div className="grid gap-2 p-3 sm:grid-cols-3">
          {supplies.map((supply) => {
            const accent = SUPPLY_ACCENT[supply.id] ?? SUPPLY_ACCENT.combat_gold;
            return (
              <div
                key={supply.id}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${accent.dot}`} />
                    <span className="truncate text-xs font-semibold">
                      {supply.shortName}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    Lv {supply.level}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className={`h-full rounded-full ${accent.bar}`}
                    style={{
                      width: `${Math.round((supply.level / supply.maxLevel) * 100)}%`,
                    }}
                  />
                </div>
                <div className="mt-2 truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">
                  {supply.currentEffect}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GuildCombatSupplyPanel() {
  const { data, setData, loading, message, setMessage } =
    useGuildCombatSupply();
  const [busyId, setBusyId] = useState<string | null>(null);

  const upgrade = useCallback(
    async (supplyId: string) => {
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
    },
    [setData, setMessage],
  );

  const fundOperations = useCallback(async () => {
    setBusyId("operations");
    setMessage(null);
    try {
      const res = await fetch("/api/v2/guild/combat-supply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "fund_operations" }),
      });
      const json = (await res.json().catch(() => null)) as
        | CombatSupplyResponse
        | ErrorResponse
        | null;
      if (json?.ok) {
        setData(json);
        setMessage(`주간 전투보급 운용을 Lv.${json.operations.tier}로 강화했습니다.`);
      } else {
        setMessage(errorLabel(json?.error ?? "unknown"));
      }
    } catch {
      setMessage("처리하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }, [setData, setMessage]);

  if (loading && !data) {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data && (
        <section className={`${SURFACE_CARD} overflow-hidden text-sm`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-3 py-3 dark:border-zinc-700">
            <div>
              <h2 className="font-semibold">주간 전투보급 운용</h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                길드 자금으로 영구 전투보급 효과를 이번 주 동안 강화합니다.
              </p>
            </div>
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              Lv.{data.operations.tier} / {data.operations.maxTier}
            </span>
          </div>

          <div className="grid gap-2 p-3 sm:grid-cols-3">
            <div className={`${SURFACE_INSET} px-3 py-2`}>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">적용 주차</div>
              <div className="mt-1 font-semibold tabular-nums">
                {data.operations.weekKey}
              </div>
            </div>
            <div className={`${SURFACE_INSET} px-3 py-2`}>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">현재 추가 효과</div>
              <div className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                골드·EXP +{data.operations.goldPct}%p · 숙달 +
                {data.operations.proficiencyChancePct}%p
              </div>
            </div>
            <div className={`${SURFACE_INSET} px-3 py-2`}>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">길드 자금</div>
              <div className="mt-1 font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                {data.guildGold.toLocaleString()} G
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-3 py-3 dark:border-zinc-700">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {data.operations.nextCost == null ? (
                "이번 주 최대 운용 단계입니다. 월요일 00:00 KST에 초기화됩니다."
              ) : (
                <>
                  다음 단계 비용 {data.operations.nextCost.toLocaleString()} G ·
                  월요일 00:00 KST 초기화
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() =>
                confirmCombatOperationsFunding({
                  operations: data.operations,
                  onFund: () => void fundOperations(),
                })
              }
              disabled={
                busyId !== null ||
                !data.canUpgrade ||
                data.operations.nextCost == null ||
                data.guildGold < (data.operations.nextCost ?? 0)
              }
              className="ui-game-button min-h-10 rounded-md border border-amber-700 bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 disabled:opacity-70 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
            >
              {data.operations.nextCost == null
                ? "이번 주 최대"
                : busyId === "operations"
                  ? "처리 중…"
                  : `${data.operations.nextCost.toLocaleString()} G 결제`}
            </button>
          </div>
          {!data.canUpgrade && (
            <p className="border-t border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              마스터와 관리자만 운용비를 결제할 수 있습니다.
            </p>
          )}
          {data.canUpgrade &&
            data.operations.nextCost != null &&
            data.guildGold < data.operations.nextCost && (
              <p className="border-t border-zinc-200 px-3 py-2 text-xs text-rose-600 dark:border-zinc-700 dark:text-rose-400">
                다음 단계에 필요한 길드 자금이 부족합니다.
              </p>
            )}
        </section>
      )}

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">길드 연구</h2>
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                전투보급
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 text-xs">
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-medium tabular-nums text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300">
                사용 가능 {(data?.fameAvailable ?? 0).toLocaleString()}
              </span>
              <span className="rounded-md border border-zinc-200 bg-white px-2 py-1 tabular-nums text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                누적 {(data?.fameTotal ?? 0).toLocaleString()}
              </span>
            </div>
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
            const accent = SUPPLY_ACCENT[supply.id] ?? SUPPLY_ACCENT.combat_gold;
            return (
              <div key={supply.id} className="px-3 py-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${accent.dot}`} />
                      <h3 className="text-sm font-semibold">{supply.name}</h3>
                      <span className={`rounded border px-1.5 py-0.5 text-xs font-medium tabular-nums ${accent.badge}`}>
                        Lv {supply.level} / {supply.maxLevel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {supply.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      confirmCombatSupplyUpgrade({
                        supply,
                        onUpgrade: (supplyId) => void upgrade(supplyId),
                      })
                    }
                    disabled={disabled}
                    className="ui-game-button min-h-10 rounded-md border border-zinc-300 bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 disabled:opacity-70 dark:border-zinc-700 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                  >
                    {supply.maxed
                      ? "최대"
                      : busyId === supply.id
                        ? "처리 중…"
                        : `${(supply.nextCost ?? 0).toLocaleString()} 명성`}
                  </button>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className={`h-full rounded-full ${accent.bar}`}
                      style={{
                        width: `${Math.round((supply.level / supply.maxLevel) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="font-medium text-zinc-800 dark:text-zinc-100">
                      {supply.currentEffect}
                    </span>
                    {supply.nextEffect && (
                      <span className="text-zinc-500 dark:text-zinc-400">
                        다음 {supply.nextEffect}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {message && (
        <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          {message}
        </div>
      )}
    </div>
  );
}
