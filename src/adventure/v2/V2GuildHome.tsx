"use client";

import { useCallback, useEffect, useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import type {
  Outpost,
  OutpostTier,
  OutpostType,
} from "@/adventure/data/v2/types";
import type { V2Resources } from "@/adventure/data/v2/resources";
import { LineupCard } from "./LineupCard";

// 길드 탭 — sub-tab nav 로 4 영역 분리 (info / members / outposts / resources).
// 라인업은 members 탭 안 (멤버 배치라 자연스러움).

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

type GuildSubTab = "info" | "members" | "outposts" | "resources";

const SUB_TABS: { key: GuildSubTab; label: string }[] = [
  { key: "info", label: "길드 정보" },
  { key: "members", label: "길드원" },
  { key: "outposts", label: "보유 거점" },
  { key: "resources", label: "공용 자원" },
];

export function V2GuildHome({
  viewerGuildId,
  viewerUserId,
  occupations,
}: {
  viewerGuildId: number | null;
  viewerUserId: string | null;
  occupations: Occupation[];
}) {
  const [subTab, setSubTab] = useState<GuildSubTab>("info");
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

  // 보유 거점.
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

  // 무소속이면 안내만 노출. 점령/길드원 등 모든 sub-tab 의 prerequisite 가 길드.
  if (!loading && !state?.guild) {
    return (
      <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
        <header>
          <h1 className="text-lg font-bold">길드</h1>
        </header>
        <div className="rounded-md border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-zinc-700 dark:text-zinc-300">아직 무소속이다.</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            마을 → 길드 회관에서 새 길드를 창단하거나 초대를 기다리자.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">{state?.guild?.name ?? "길드"}</h1>
      </header>

      <TabBar
        tabs={SUB_TABS}
        active={subTab}
        onChange={setSubTab}
        ariaLabel="길드 하위 탭"
        size="sm"
        variant="highlight"
      />

      {subTab === "info" && (
        info?.guild ? (
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 text-sm dark:border-zinc-800 dark:bg-zinc-900/50">
            <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <dt className="text-zinc-500 dark:text-zinc-400">길드마스터</dt>
                <dd className="truncate font-medium">
                  {info.members?.find((m) => m.role === "master")?.name ?? "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <dt className="text-zinc-500 dark:text-zinc-400">길드원 수</dt>
                <dd className="font-medium tabular-nums">
                  {info.members?.length ?? 0} / 3
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <dt className="text-zinc-500 dark:text-zinc-400">명성</dt>
                <dd className="font-medium tabular-nums">
                  {info.guild.fameTotal.toLocaleString()}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <dt className="text-zinc-500 dark:text-zinc-400">창설</dt>
                <dd className="font-medium tabular-nums">
                  {fmtDate(info.guild.createdAt)}
                </dd>
              </div>
            </dl>
            {info.guild.description && (
              <div className="border-t border-zinc-200 px-3 py-2.5 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                {info.guild.description}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            {loading ? "불러오는 중…" : "—"}
          </div>
        )
      )}

      {subTab === "members" && (
        <div className="space-y-3">
          {!info?.members || info.members.length === 0 ? (
            <div className="text-sm text-zinc-500 dark:text-zinc-400">
              {loading ? "불러오는 중…" : "—"}
            </div>
          ) : (
            <ul className="space-y-1.5">
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

          {/* 라인업 — 멤버 배치라 같은 탭에 */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/30">
            <div className="px-3 pt-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              3:3 토너먼트 라인업
            </div>
            <LineupCard />
          </div>
        </div>
      )}

      {subTab === "outposts" && (
        viewerGuildId == null ? (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            소속 길드가 없어요.
          </div>
        ) : ownedOutposts.length === 0 ? (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            점령한 거점이 아직 없어요. 지도 탭에서 거점을 점령해 보세요.
          </div>
        ) : (
          <ul className="space-y-1.5">
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
        )
      )}

      {subTab === "resources" && (
        state?.resources ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <ResourceCell label="광물" value={state.resources.stone} />
              <ResourceCell label="주문서" value={state.resources.scrolls} />
            </div>
            <ScrollActivationCard
              resources={state.resources}
              isMaster={viewerUserId != null && info?.guild?.masterId === viewerUserId}
              onActivated={refresh}
            />
          </div>
        ) : (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            {loading ? "불러오는 중…" : "—"}
          </div>
        )
      )}
    </main>
  );
}

// PR-6 주문서 활성화 카드 — 길드 자원 탭. 마스터만 활성화 버튼, 비마스터는 상태만.
function ScrollActivationCard({
  resources,
  isMaster,
  onActivated,
}: {
  resources: V2Resources;
  isMaster: boolean;
  onActivated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // 1초마다 카운트다운 갱신 — 활성 중일 때만.
  useEffect(() => {
    const exp = resources.activeScrollExpiresAt;
    if (!exp || exp <= now) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [resources.activeScrollExpiresAt, now]);

  const exp = resources.activeScrollExpiresAt;
  const active = exp != null && exp > now;
  const remaining = active && exp ? Math.max(0, exp - now) : 0;
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  const handleActivate = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/guild/scroll/activate", {
        method: "POST",
      });
      const j = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!j?.ok) {
        setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      onActivated();
    } catch (err) {
      setMsg(`✗ network: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium">주문서 활성화</div>
        {active ? (
          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
            활성 · {minutes}분 {String(seconds).padStart(2, "0")}초 남음
          </span>
        ) : (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">비활성</span>
        )}
      </div>
      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        주문서 1 소비, 1시간 동안 길드원 모두의 토너먼트·본 병사 전쟁에서 atk +10%.
      </div>
      {isMaster && !active && (
        <button
          type="button"
          onClick={handleActivate}
          disabled={busy || resources.scrolls < 1}
          className="mt-2 w-full rounded-md border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "활성화 중…" : `활성화 (주문서 1 소비)`}
        </button>
      )}
      {!isMaster && !active && (
        <div className="mt-2 text-xs text-zinc-400">마스터만 활성화 가능.</div>
      )}
      {msg && (
        <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">{msg}</div>
      )}
    </div>
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

