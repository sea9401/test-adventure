"use client";

import type { EnrichedRow, SortDir, SortKey } from "./useAdminStats";

function formatHours(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}분`;
  if (h < 24) return `${h.toFixed(1)}시간`;
  return `${Math.floor(h / 24)}일`;
}

export function StatsTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  loading,
}: {
  rows: EnrichedRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  loading: boolean;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold">유저별 상세</h2>
      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        현재 v2 세이브 기준의 진척입니다. 직업 숙련도는 현재 직업 기준, 총 숙련도는 전 직군 합계입니다.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[1080px] text-xs">
          <thead className="text-zinc-500">
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="py-1 text-left font-medium">유저</th>
              <SortHeader
                sortKey="level"
                current={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="right"
              >
                Lv
              </SortHeader>
              <SortHeader
                sortKey="frontierDepth"
                current={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="right"
              >
                프론티어
              </SortHeader>
              <th className="py-1 text-left font-medium">직업</th>
              <SortHeader
                sortKey="currentMastery"
                current={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="right"
              >
                현 숙련
              </SortHeader>
              <SortHeader
                sortKey="totalMastery"
                current={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="right"
              >
                총 숙련
              </SortHeader>
              <SortHeader
                sortKey="reincarnations"
                current={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="right"
              >
                환생
              </SortHeader>
              <SortHeader
                sortKey="spBudget"
                current={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="right"
              >
                SP
              </SortHeader>
              <SortHeader
                sortKey="battleCount"
                current={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="right"
              >
                전투
              </SortHeader>
              <SortHeader
                sortKey="fishCaught"
                current={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="right"
              >
                낚시
              </SortHeader>
              <th className="py-1 text-right font-medium">장비</th>
              <SortHeader
                sortKey="createdAt"
                current={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="right"
              >
                가입 후
              </SortHeader>
              <SortHeader
                sortKey="lastSeenAt"
                current={sortKey}
                dir={sortDir}
                onClick={onSort}
                align="right"
              >
                마지막 접속
              </SortHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              return (
                <tr
                  key={r.userId}
                  className="border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-800/40"
                >
                  <td className="py-1">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">
                      {r.name ?? "(이름 없음)"}
                    </div>
                    <div className="font-mono text-[10px] text-zinc-500">
                      {r.email ?? r.userId}
                    </div>
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {r.level ?? "—"}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {r.frontierDepth || "—"}
                  </td>
                  <td className="py-1">
                    <div>{r.jobName ?? "—"}</div>
                    <div className="text-[10px] text-zinc-500">
                      {r.jobTier != null ? `T${r.jobTier}` : "미선택"}
                    </div>
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {r.currentMastery.toLocaleString()}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {r.totalMastery.toLocaleString()}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {r.reincarnations}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {r.spUsed}/{r.spBudget}
                    <div className="text-[10px] text-zinc-500">
                      학습 {r.skillsLearned}
                    </div>
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {r.battleCount.toLocaleString()}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {r.fishCaught.toLocaleString()}
                    <div className="text-[10px] text-zinc-500">
                      종 {r.fishSpecies} · 유물 {r.antiquesFound}
                    </div>
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {r.equipmentEquipped}/{r.equipmentOwned}
                    <div className="text-[10px] text-zinc-500">
                      최고 +{r.maxEnhanceLevel}
                    </div>
                  </td>
                  <td className="py-1 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                    {formatHours(r.hoursSinceJoin)}
                  </td>
                  <td className="py-1 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                    {formatHours(r.hoursSinceLastSeen)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={14} className="py-3 text-center text-zinc-500">
                  표시할 유저가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SortHeader({
  sortKey,
  current,
  dir,
  onClick,
  children,
  align = "left",
}: {
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const active = sortKey === current;
  return (
    <th className={`py-1 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={
          "inline-flex items-center gap-0.5 hover:text-zinc-900 dark:hover:text-zinc-100 " +
          (active ? "text-zinc-900 dark:text-zinc-100" : "")
        }
      >
        {children}
        {active ? <span>{dir === "asc" ? "▲" : "▼"}</span> : null}
      </button>
    </th>
  );
}
