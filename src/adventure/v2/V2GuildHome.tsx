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

type GuildInfoResponse = {
  ok?: boolean;
  guild?: {
    id: number;
    name: string;
    masterId: string;
    createdAt: string;
    fameTotal: number;
    description: string | null;
  } | null;
  members?: {
    userId: string;
    role: string;
    joinedAt: string;
    name: string;
    level: number;
  }[];
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function V2GuildHome({
  viewerGuildId,
  occupations,
}: {
  viewerGuildId: number | null;
  occupations: Occupation[];
}) {
  const [state, setState] = useState<StateResponse | null>(null);
  const [info, setInfo] = useState<GuildInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [stateRes, infoRes] = await Promise.all([
        fetch("/api/v2/me/state").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/v2/me/guild/info").then((r) => (r.ok ? r.json() : null)),
      ]);
      setState(stateRes as StateResponse | null);
      setInfo(infoRes as GuildInfoResponse | null);
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

      {/* 길드 정보 */}
      <Card padding="md">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          길드 정보
        </div>
        {info?.guild ? (
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <InfoCell
              label="마스터"
              value={
                info.members?.find((m) => m.role === "master")?.name ?? "—"
              }
            />
            <InfoCell label="멤버" value={`${info.members?.length ?? 0}명`} />
            <InfoCell label="창설" value={fmtDate(info.guild.createdAt)} />
            <InfoCell label="명성" value={info.guild.fameTotal.toLocaleString()} />
            {info.guild.description && (
              <div className="col-span-2 mt-1 rounded-md bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-400">
                {info.guild.description}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {loading ? "불러오는 중…" : "—"}
          </div>
        )}
      </Card>

      {/* 멤버 list */}
      <Card padding="md">
        <div className="flex items-baseline justify-between">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            멤버
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {info?.members?.length ?? 0}명
          </span>
        </div>
        {!info?.members || info.members.length === 0 ? (
          <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            —
          </div>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {info.members.map((m) => (
              <li
                key={m.userId}
                className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {m.role === "master" && (
                      <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                        마스터
                      </span>
                    )}
                    <span className="truncate text-sm font-medium">
                      {m.name}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    Lv.{m.level} · 가입 {fmtDate(m.joinedAt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

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

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium tabular-nums">
        {value}
      </div>
    </div>
  );
}
