"use client";

import { Card } from "@/components/ui/Card";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import type {
  Outpost,
  OutpostTier,
  OutpostType,
} from "@/adventure/data/v2/types";
import type { Occupation } from "@/app/dev/v2-game/V2GameFlow";

// 거점 list 화면 — 라이브 TownScreen 패턴 차용 (EntryCard 와 유사한 형태).
// 점령 상태(내 길드 / 다른 길드 / 빈 / 중립)별 색 칩 + tier·type 라벨.

const TYPE_LABEL: Record<OutpostType, string> = {
  mine: "광산",
  tower: "마탑",
  fort: "요새",
  village: "마을",
};
const TIER_LABEL: Record<OutpostTier, string> = {
  1: "마을",
  2: "거점",
  3: "도시",
  4: "왕국",
};

type OccStatus = "own" | "rival" | "neutral" | "empty";

function statusOf(
  outpost: Outpost,
  occ: Occupation | undefined,
  viewerGuildId: number | null,
): OccStatus {
  if (outpost.neutral) return "neutral";
  if (!occ || occ.occupiedByGuildId == null) return "empty";
  return viewerGuildId != null && occ.occupiedByGuildId === viewerGuildId
    ? "own"
    : "rival";
}

const STATUS_CHIP: Record<OccStatus, { label: string; cls: string }> = {
  own: {
    label: "내 길드",
    cls: "bg-emerald-500 text-white",
  },
  rival: {
    label: "타 길드",
    cls: "bg-rose-500 text-white",
  },
  neutral: {
    label: "절대 중립",
    cls: "bg-amber-400 text-amber-900",
  },
  empty: {
    label: "비어 있음",
    cls: "bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
  },
};

// 정렬 우선순위: 자기 길드 > 빈 > 중립 > 적대. 같은 그룹 안에선 tier 큰 순.
const STATUS_ORDER: Record<OccStatus, number> = {
  own: 0,
  empty: 1,
  neutral: 2,
  rival: 3,
};

export function OutpostListView({
  occupations,
  viewerGuildId,
  onBack,
  onSelect,
}: {
  occupations: Occupation[];
  viewerGuildId: number | null;
  onBack: () => void;
  onSelect: (outpost: Outpost) => void;
}) {
  const occByOutpost = new Map(occupations.map((o) => [o.outpostId, o]));

  const sorted = [...OUTPOSTS].sort((a, b) => {
    const sa = statusOf(a, occByOutpost.get(a.id), viewerGuildId);
    const sb = statusOf(b, occByOutpost.get(b.id), viewerGuildId);
    if (sa !== sb) return STATUS_ORDER[sa] - STATUS_ORDER[sb];
    if (a.tier !== b.tier) return b.tier - a.tier;
    return a.name.localeCompare(b.name);
  });

  return (
    <main className="mx-auto max-w-3xl space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 메인으로
        </button>
        <h1 className="text-lg font-bold">거점 목록</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          총 {OUTPOSTS.length}개 거점. 내 길드 점령부터 빈 자리·중립·타 길드 순.
        </p>
        {viewerGuildId == null && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            길드 정보 불러오는 중 — "내 길드" 분류는 잠시 후 정확해집니다.
          </p>
        )}
      </header>

      <div className="space-y-2">
        {sorted.map((outpost) => {
          const occ = occByOutpost.get(outpost.id);
          const status = statusOf(outpost, occ, viewerGuildId);
          const chip = STATUS_CHIP[status];
          return (
            <button
              key={outpost.id}
              type="button"
              onClick={() => onSelect(outpost)}
              className="block w-full text-left"
            >
              <Card padding="sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-base font-medium">
                      {outpost.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <span>{TIER_LABEL[outpost.tier]}</span>
                      <span>·</span>
                      <span>{TYPE_LABEL[outpost.type]}</span>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs ${chip.cls}`}
                  >
                    {chip.label}
                  </span>
                </div>
              </Card>
            </button>
          );
        })}
      </div>
    </main>
  );
}
