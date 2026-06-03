"use client";

import { useCallback, useEffect, useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import type {
  Outpost,
  OutpostTier,
  OutpostType,
} from "@/adventure/data/v2/types";
import {
  acceptJoinRequest,
  declineJoinRequest,
  GuildError,
} from "@/adventure/guild/api";
import { GuildBrowsePanel } from "@/adventure/guild/GuildBrowsePanel";
import { LineupCard } from "./LineupCard";
import { GuildFoundCard } from "./GuildFoundCard";

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
};

type PendingRequest = {
  requestId: number;
  userId: string;
  name: string;
  level: number;
  requestedAt: string;
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
  isMaster?: boolean;
  pendingRequests?: PendingRequest[];
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type GuildSubTab = "info" | "members" | "requests" | "outposts";

const BASE_SUB_TABS: { key: GuildSubTab; label: string }[] = [
  { key: "info", label: "길드 정보" },
  { key: "members", label: "길드원" },
  { key: "outposts", label: "보유 거점" },
];

type Notice = { kind: "ok" | "err"; text: string };

export function V2GuildHome({
  viewerGuildId,
  occupations,
  onGuildChanged,
}: {
  viewerGuildId: number | null;
  occupations: Occupation[];
  // 길드 소속이 바뀌면(창단 등) 부모의 viewerGuildId 를 다시 받아오게 알린다.
  onGuildChanged?: () => void;
}) {
  const [subTab, setSubTab] = useState<GuildSubTab>("info");
  const [state, setState] = useState<StateResponse | null>(null);
  const [info, setInfo] = useState<GuildInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [acting, setActing] = useState(false);

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

  // 마스터가 가입 신청 수락/거절. 처리 후 info 를 다시 받아 신청 목록·길드원에 반영.
  const handleRequest = useCallback(
    async (reqId: number, name: string, action: "accept" | "decline") => {
      setActing(true);
      setNotice(null);
      try {
        if (action === "accept") {
          await acceptJoinRequest(reqId);
          setNotice({ kind: "ok", text: `${name} 님을 길드원으로 받았어요.` });
        } else {
          await declineJoinRequest(reqId);
          setNotice({ kind: "ok", text: `${name} 님의 신청을 거절했어요.` });
        }
        await refresh();
      } catch (e) {
        setNotice({
          kind: "err",
          text:
            e instanceof GuildError
              ? e.message
              : "처리에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
      } finally {
        setActing(false);
      }
    },
    [refresh],
  );

  // 길드 id — 방금 창단했으면 부모 prop(viewerGuildId)이 아직 stale 일 수 있어
  // 자체 fetch 한 state.guild.id 를 우선한다(없으면 prop 폴백).
  const guildId = state?.guild?.id ?? viewerGuildId;

  // 보유 거점.
  const ownedOutposts: Outpost[] =
    guildId != null
      ? OUTPOSTS.filter((o) =>
          occupations.some(
            (occ) =>
              occ.outpostId === o.id && occ.occupiedByGuildId === guildId,
          ),
        )
      : [];
  const occByOutpost = new Map(occupations.map((o) => [o.outpostId, o]));

  // 무소속이면 창단 + 둘러보기를 노출. 점령/길드원 등 모든 sub-tab 의 prerequisite 가 길드.
  if (!loading && !state?.guild) {
    return (
      <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
        <header>
          <h1 className="text-lg font-bold">길드</h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            아직 무소속이다. 새 길드를 창단하거나, 마음에 드는 길드에 가입
            신청하자.
          </p>
        </header>

        {notice && <NoticeBanner notice={notice} />}

        <GuildFoundCard
          onCreated={() => {
            refresh();
            onGuildChanged?.();
          }}
        />

        <div className="flex items-center gap-2 pt-1 text-xs text-zinc-400 dark:text-zinc-500">
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          또는 기존 길드에 가입
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <GuildBrowsePanel
          busy={false}
          leaveCooldownUntil={null}
          onToast={(text) => setNotice({ kind: "ok", text })}
          onError={(text) => setNotice({ kind: "err", text })}
        />
      </main>
    );
  }

  // 마스터에게만 "가입 신청" 탭을 추가(대기 건수 뱃지). 길드원 다음, 거점 앞.
  const isMaster = info?.isMaster ?? false;
  const pendingRequests = info?.pendingRequests ?? [];
  const subTabs: { key: GuildSubTab; label: string }[] = isMaster
    ? [
        ...BASE_SUB_TABS.slice(0, 2),
        {
          key: "requests",
          label:
            pendingRequests.length > 0
              ? `가입 신청 (${pendingRequests.length})`
              : "가입 신청",
        },
        ...BASE_SUB_TABS.slice(2),
      ]
    : BASE_SUB_TABS;
  // 선택된 탭이 목록에서 사라지면(예: 마스터 해제) "정보"로 폴백 — 빈 화면 방지.
  const activeTab: GuildSubTab = subTabs.some((t) => t.key === subTab)
    ? subTab
    : "info";

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">{state?.guild?.name ?? "길드"}</h1>
      </header>

      <TabBar
        tabs={subTabs}
        active={activeTab}
        onChange={setSubTab}
        ariaLabel="길드 하위 탭"
        size="sm"
        variant="highlight"
      />

      {activeTab === "info" && (
        info?.guild ? (
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 text-sm dark:border-zinc-800 dark:bg-zinc-900">
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

      {activeTab === "members" && (
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
                  className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
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
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="px-3 pt-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              3:3 토너먼트 라인업
            </div>
            <LineupCard />
          </div>
        </div>
      )}

      {activeTab === "requests" && isMaster && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            가입 신청을 수락하면 길드원으로 합류해요. 정원은 {info?.members?.length ?? 0}/3.
          </p>
          {notice && <NoticeBanner notice={notice} />}
          {pendingRequests.length === 0 ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              {loading ? "불러오는 중…" : "대기 중인 가입 신청이 없어요."}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {pendingRequests.map((r) => (
                <li
                  key={r.requestId}
                  className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="min-w-0 flex-1">
                    <span className="truncate text-sm font-medium">
                      {r.name}
                    </span>
                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      Lv.{r.level} · 신청 {fmtDate(r.requestedAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        void handleRequest(r.requestId, r.name, "accept")
                      }
                      disabled={acting}
                      className="rounded-md border border-emerald-700 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      수락
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void handleRequest(r.requestId, r.name, "decline")
                      }
                      disabled={acting}
                      className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      거절
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === "outposts" && (
        guildId == null ? (
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
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
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

    </main>
  );
}

// 가입 신청·수락 등 액션 결과를 알리는 인라인 배너. v2 길드 탭 전용(공용 토스트 없음).
function NoticeBanner({ notice }: { notice: Notice }) {
  const ok = notice.kind === "ok";
  return (
    <div
      role="status"
      className={
        ok
          ? "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
      }
    >
      {notice.text}
    </div>
  );
}

