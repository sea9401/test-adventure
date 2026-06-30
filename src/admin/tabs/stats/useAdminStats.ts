"use client";

import { useMemo, useState } from "react";
import { useAsyncData } from "@/lib/useAsyncData";
import type { AdminStatsRow } from "@/app/api/admin/stats/route";

export type SortKey =
  | "createdAt"
  | "lastSeenAt"
  | "level"
  | "frontierDepth"
  | "battleCount"
  | "totalMastery"
  | "currentMastery"
  | "reincarnations"
  | "spBudget"
  | "fishCaught";

export type SortDir = "asc" | "desc";

export type EnrichedRow = AdminStatsRow & {
  hoursSinceJoin: number;
  hoursSinceLastSeen: number | null;
};

function hoursSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 3_600_000;
}

function sortValue(r: EnrichedRow, k: SortKey): number | null {
  if (k === "createdAt") return r.hoursSinceJoin;
  if (k === "lastSeenAt") return r.hoursSinceLastSeen;
  if (k === "level") return r.level ?? null;
  if (k === "frontierDepth") return r.frontierDepth;
  if (k === "battleCount") return r.battleCount;
  if (k === "totalMastery") return r.totalMastery;
  if (k === "currentMastery") return r.currentMastery;
  if (k === "reincarnations") return r.reincarnations;
  if (k === "spBudget") return r.spBudget;
  return r.fishCaught;
}

async function fetchStats(signal: AbortSignal): Promise<AdminStatsRow[]> {
  const r = await fetch("/api/admin/stats", { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as AdminStatsRow[];
}

export function useAdminStats() {
  const { data, loading, error, refetch } = useAsyncData<AdminStatsRow[]>(
    fetchStats,
    [],
    { errorMessage: "로드 실패" },
  );
  const rows = useMemo(() => data ?? [], [data]);

  const [sortKey, setSortKey] = useState<SortKey>("frontierDepth");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [hideEmpty, setHideEmpty] = useState(true);

  // 클라이언트에서 시간 표시용 컬럼 계산.
  const enriched = useMemo<EnrichedRow[]>(() => {
    return rows.map((r) => {
      const hoursSinceJoin = hoursSince(r.createdAt) ?? 0;
      const hoursSinceLastSeen = hoursSince(r.lastSeenAt);
      return { ...r, hoursSinceJoin, hoursSinceLastSeen };
    });
  }, [rows]);

  const filtered = useMemo(() => {
    return hideEmpty
      ? enriched.filter((r) => (r.level ?? 0) > 1 || r.battleCount > 0)
      : enriched;
  }, [enriched, hideEmpty]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const aNull = av == null;
      const bNull = bv == null;
      if (aNull && bNull) return 0;
      if (aNull) return 1; // null 항상 뒤
      if (bNull) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const onSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  return {
    filtered,
    sorted,
    loading,
    error,
    refetch,
    sortKey,
    sortDir,
    onSort,
    hideEmpty,
    setHideEmpty,
  };
}
