"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import type {
  Outpost,
  OutpostTier,
  OutpostType,
} from "@/adventure/data/v2/types";
import type { V2Resources } from "@/adventure/data/v2/resources";
import { LineupCard } from "./LineupCard";

// 길드 탭 — 길드 정보 + 자원풀 + 보유 거점 list + 토너먼트 라인업.
// outpost 진입은 지도 탭으로 (여기서는 정보만).

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
const POLICY_LABEL: Record<string, string> = {
  open: "자유 입장",
  "guild-only": "자길드만",
};

type Occupation = {
  outpostId: string;
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  policy?: string;
};

type StateResponse = {
  guild?: { id: number; name: string };
  resources?: V2Resources;
};

export function V2GuildHome({
  viewerGuildId,
  occupations,
}: {
  viewerGuildId: number | null;
  occupations: Occupation[];
}) {
  const [state, setState] = useState<StateResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v2/me/state");
      const j = (await res.json().catch(() => null)) as StateResponse | null;
      setState(j);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 보유 거점 — viewerGuildId 와 occupations 의 occupiedByGuildId 매치.
  const ownedOutposts: Outpost[] =
    viewerGuildId != null
      ? OUTPOSTS.filter((o) =>
          occupations.some(
            (occ) =>
              occ.outpostId === o.id && occ.occupiedByGuildId === viewerGuildId,
          ),
        )
      : [];
  const occByOutpost = new Map(occupations.map((o) => [o.outpostId, o]));

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">{state?.guild?.name ?? "길드"}</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          길드 자원·보유 거점·3:3 토너먼트 라인업.
        </p>
      </header>

      {/* 자원풀 */}
      <Card padding="md">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          공용 자원
        </div>
        {state?.resources ? (
          <div className="mt-2 grid grid-cols-3 gap-2">
            <ResourceCell label="광물" value={state.resources.stone} />
            <ResourceCell label="병사" value={state.resources.soldiers} />
            <ResourceCell label="주문서" value={state.resources.scrolls} />
          </div>
        ) : (
          <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {loading ? "불러오는 중…" : "—"}
          </div>
        )}
      </Card>

      {/* 보유 거점 */}
      <Card padding="md">
        <div className="flex items-baseline justify-between">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            보유 거점
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {ownedOutposts.length}개
          </span>
        </div>
        {viewerGuildId == null ? (
          <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            길드 정보 불러오는 중…
          </div>
        ) : ownedOutposts.length === 0 ? (
          <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            점령한 거점이 아직 없어요. 지도 탭에서 거점을 점령해 보세요.
          </div>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {ownedOutposts.map((o) => {
              const occ = occByOutpost.get(o.id);
              const policy = occ?.policy ?? "open";
              return (
                <li
                  key={o.id}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {o.name}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                      {TIER_LABEL[o.tier]} · {TYPE_LABEL[o.type]}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    정책 {POLICY_LABEL[policy] ?? policy}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* 토너먼트 라인업 */}
      <Card padding="md">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          3:3 토너먼트 라인업
        </div>
        <div className="mt-2">
          <LineupCard />
        </div>
      </Card>
    </main>
  );
}

function ResourceCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-0.5 text-base font-medium tabular-nums">{value}</div>
    </div>
  );
}
