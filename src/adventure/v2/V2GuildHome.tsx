"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretRight } from "@phosphor-icons/react";
import { TabBar } from "@/components/ui/TabBar";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";
import type { Outpost, OutpostType } from "@/adventure/data/v2/types";
import {
  acceptJoinRequest,
  declineJoinRequest,
  inviteToGuild,
  GuildError,
} from "@/adventure/guild/api";
import { GuildBrowsePanel } from "@/adventure/guild/GuildBrowsePanel";
import { GUILD_MAX_MEMBERS } from "@/adventure/data/guild";
import { GuildOrgChart } from "./GuildOrgChart";
import { GuildGoldDepositPanel } from "./GuildGoldDepositPanel";
import {
  GuildActivityList,
  type GuildActivity,
} from "./GuildActivityList";
import { LineupCard } from "./LineupCard";
import { OutpostPolicyEditor } from "./OutpostPolicyEditor";
import { GuildFoundCard } from "./GuildFoundCard";

// 길드 탭 — sub-tab nav 분리 (info / members / manage / outposts).
// 라인업은 members 탭 안 (멤버 배치라 자연스러움).
// 관리(manage) 탭 = 마스터/관리자(manager) 전용 — 멤버 초대·가입 신청·거점 정책/세율·직책.

const TYPE_LABEL: Record<OutpostType, string> = {
  mine: "광산",
  tower: "마탑",
  fort: "요새",
  village: "마을",
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
  taxRate?: string;
  // 마을 건설 시 길드가 지은 이름 — 있으면 거점 표시 이름을 덮는다.
  villageName?: string | null;
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
    nationName: string | null;
    nationDeclaredAt: string | null;
  } | null;
  members?: {
    userId: string;
    role: string;
    joinedAt: string;
    name: string;
    level: number;
    lastSeenAt: string | null;
  }[];
  isMaster?: boolean;
  isManager?: boolean;
  pendingRequests?: PendingRequest[];
  // 국가 선포 — 정원 한도(국가 시 상향)·대도시 보유·선포 가능 여부.
  memberCap?: number;
  hasMetropolis?: boolean;
  canDeclareNation?: boolean;
  // 길드 공용 골드 풀 보유량.
  guildGold?: number;
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type GuildSubTab = "info" | "members" | "manage" | "outposts";

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
  onOccupationsChanged,
}: {
  viewerGuildId: number | null;
  occupations: Occupation[];
  // 길드 소속이 바뀌면(창단 등) 부모의 viewerGuildId 를 다시 받아오게 알린다.
  onGuildChanged?: () => void;
  // 관리탭에서 거점 정책/세율 저장 후 부모 occupations 재조회.
  onOccupationsChanged?: () => void;
}) {
  const router = useRouter();
  const [subTab, setSubTab] = useState<GuildSubTab>("info");
  const [state, setState] = useState<StateResponse | null>(null);
  const [info, setInfo] = useState<GuildInfoResponse | null>(null);
  const [activity, setActivity] = useState<GuildActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [acting, setActing] = useState(false);
  const [inviteName, setInviteName] = useState("");
  // 관리탭 — 거점 정책 에디터 펼침 (한 번에 하나).
  const [policyOpenId, setPolicyOpenId] = useState<string | null>(null);
  // 국가 선포 — 국가명 입력.
  const [nationInput, setNationInput] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [stateRes, infoRes, actRes] = await Promise.all([
        fetch("/api/v2/me/state").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/v2/me/guild/info").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/v2/guild/activity").then((r) => (r.ok ? r.json() : null)),
      ]);
      setState(stateRes as StateResponse | null);
      setInfo(infoRes as GuildInfoResponse | null);
      setActivity(
        (actRes as { activity?: GuildActivity[] } | null)?.activity ?? [],
      );
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 fetch(refresh 가 state 시드)
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

  // 마스터가 닉네임으로 멤버 초대 — 상대 우편함에 guild_invite 가 도착, 상대가 수락하면 합류.
  const handleInvite = useCallback(async () => {
    const name = inviteName.trim();
    if (name.length === 0 || guildId == null || acting) return;
    setActing(true);
    setNotice(null);
    try {
      const r = await inviteToGuild(guildId, name);
      setNotice({
        kind: "ok",
        text: `${r.targetName} 님을 초대했어요. 상대가 우편함에서 수락하면 합류합니다.`,
      });
      setInviteName("");
    } catch (e) {
      setNotice({
        kind: "err",
        text:
          e instanceof GuildError
            ? e.message
            : "초대에 실패했어요. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setActing(false);
    }
  }, [inviteName, guildId, acting]);

  // 마스터가 국가 선포 — 대도시 마을 보유 시. 성공하면 길드 정원이 늘어난다.
  const handleDeclareNation = useCallback(async () => {
    const name = nationInput.trim();
    if (name.length === 0 || acting) return;
    setActing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v2/guild/nation/declare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        reason?: string;
        requiredTier?: string;
      } | null;
      if (j?.ok) {
        setNotice({
          kind: "ok",
          text: `${name} 국가를 선포했어요. 길드 정원이 늘어납니다.`,
        });
        setNationInput("");
        await refresh();
      } else {
        const msg =
          j?.error === "no_metropolis"
            ? `${j.requiredTier ?? "대도시"} 등급 마을이 있어야 선포할 수 있어요.`
            : j?.error === "already_nation"
              ? "이미 국가를 선포했어요."
              : j?.error === "not_master"
                ? "마스터만 선포할 수 있어요."
                : j?.error === "invalid_name"
                  ? (j.reason ?? "국가명을 확인해 주세요.")
                  : `선포에 실패했어요 (${j?.error ?? `http ${res.status}`}).`;
        setNotice({ kind: "err", text: msg });
      }
    } catch {
      setNotice({ kind: "err", text: "선포에 실패했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setActing(false);
    }
  }, [nationInput, acting, refresh]);

  // 마스터가 직책 변경 — guild_members.role (부마스터/관리자/일반).
  const handleRole = useCallback(
    async (
      targetUserId: string,
      name: string,
      role: "vice_master" | "manager" | "member",
    ) => {
      setActing(true);
      setNotice(null);
      try {
        const res = await fetch("/api/v2/guild/role", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetUserId, role }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (j?.ok) {
          setNotice({
            kind: "ok",
            text:
              role === "vice_master"
                ? `${name} 님을 부마스터로 임명했어요.`
                : role === "manager"
                  ? `${name} 님을 관리자로 임명했어요.`
                  : `${name} 님의 직책을 해제했어요.`,
          });
          await refresh();
        } else {
          setNotice({
            kind: "err",
            text: `처리에 실패했어요 (${j?.error ?? `http ${res.status}`}).`,
          });
        }
      } catch {
        setNotice({ kind: "err", text: "처리에 실패했어요. 잠시 후 다시 시도해 주세요." });
      } finally {
        setActing(false);
      }
    },
    [refresh],
  );

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
        <HeaderPanel>
          <h1 className="text-lg font-bold">길드</h1>
        </HeaderPanel>

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

  // 마스터/관리자에게만 "관리" 탭을 추가(가입 신청 대기 건수 뱃지). 길드원 다음, 거점 앞.
  const isMaster = info?.isMaster ?? false;
  const isManager = info?.isManager ?? false;
  const canManage = isMaster || isManager;
  const pendingRequests = info?.pendingRequests ?? [];
  const subTabs: { key: GuildSubTab; label: string }[] = canManage
    ? [
        ...BASE_SUB_TABS.slice(0, 2),
        {
          key: "manage",
          label:
            pendingRequests.length > 0
              ? `관리 (${pendingRequests.length})`
              : "관리",
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
      <HeaderPanel>
        <h1 className="text-lg font-bold">{state?.guild?.name ?? "길드"}</h1>
      </HeaderPanel>

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
          <div className="space-y-3">
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {info.guild.nationName && (
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <dt className="text-zinc-500 dark:text-zinc-400">국가</dt>
                  <dd className="truncate font-semibold text-indigo-600 dark:text-indigo-400">
                    {info.guild.nationName}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <dt className="text-zinc-500 dark:text-zinc-400">길드마스터</dt>
                <dd className="truncate font-medium">
                  {info.members?.find((m) => m.role === "master")?.name ?? "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <dt className="text-zinc-500 dark:text-zinc-400">길드원 수</dt>
                <dd className="font-medium tabular-nums">
                  {info.members?.length ?? 0} / {info.memberCap ?? GUILD_MAX_MEMBERS}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <dt className="text-zinc-500 dark:text-zinc-400">명성</dt>
                <dd className="font-medium tabular-nums">
                  {info.guild.fameTotal.toLocaleString()}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <dt className="text-zinc-500 dark:text-zinc-400">길드 자금</dt>
                <dd className="font-medium tabular-nums text-amber-700 dark:text-amber-400">
                  {(info.guildGold ?? 0).toLocaleString()} G
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

            {/* 길드 금고 입금 — 거점 화면에서 이관. 점령/공성 비용 재원 충원.
                입금 후 refresh 로 정보 카드 '길드 자금'·활동 내역도 갱신. */}
            <GuildGoldDepositPanel onChanged={refresh} />

            {/* 길드원 활동 내역 — 가입·임명·입금·국가선포·창단. */}
            <GuildActivityList activity={activity} loading={loading} />
          </div>
        ) : (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            {loading ? "불러오는 중…" : "—"}
          </div>
        )
      )}

      {activeTab === "members" && (
        <div className="space-y-3">
          {/* 멤버 초대는 관리 탭으로 이동 (마스터/관리자 전용). */}
          {!info?.members || info.members.length === 0 ? (
            <div className="text-sm text-zinc-500 dark:text-zinc-400">
              {loading ? "불러오는 중…" : "—"}
            </div>
          ) : (
            // 길드원 조직도 — 마스터→부마스터→관리자→일반 위계 트리(회사 조직도 느낌).
            <GuildOrgChart members={info.members} />
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

      {activeTab === "manage" && canManage && (
        <div className="space-y-4">
          {notice && <NoticeBanner notice={notice} />}

          {/* 멤버 초대 — 길드원 탭에서 이동 */}
          {guildId != null && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                멤버 초대
              </div>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                닉네임으로 초대하면 상대 우편함에 도착해요. 상대가 수락하면 합류합니다 (정원{" "}
                {info?.members?.length ?? 0}/{info?.memberCap ?? GUILD_MAX_MEMBERS}).
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="초대할 닉네임"
                  disabled={acting}
                  maxLength={64}
                  className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-400"
                />
                <button
                  type="button"
                  onClick={handleInvite}
                  disabled={acting || inviteName.trim().length === 0}
                  className="shrink-0 rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  초대
                </button>
              </div>
            </div>
          )}

          {/* 가입 신청 — 옛 전용 탭에서 이동 */}
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              가입 신청
            </div>
            {pendingRequests.length === 0 ? (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
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
                        <PlayerNameLink name={r.name} />
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

          {/* 보유 거점 정책·세율 — 점령자 본인이 아니어도 마스터/관리자가 일괄 관리 */}
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              보유 거점 정책·세율
            </div>
            {ownedOutposts.length === 0 ? (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                점령한 거점이 아직 없어요.
              </div>
            ) : (
              <div className="space-y-1.5">
                {ownedOutposts.map((o) => {
                  const occ = occByOutpost.get(o.id);
                  return (
                    <OutpostPolicyEditor
                      key={o.id}
                      outpostId={o.id}
                      title={`${occ?.villageName?.trim() || o.name} (${TYPE_LABEL[o.type]})`}
                      currentPolicy={occ?.policy ?? "open"}
                      currentTaxRate={Number(occ?.taxRate ?? "0")}
                      open={policyOpenId === o.id}
                      onToggle={() =>
                        setPolicyOpenId((cur) => (cur === o.id ? null : o.id))
                      }
                      onSaved={() => onOccupationsChanged?.()}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* 직책 관리 — 마스터 전용. 관리자 임명/해임. */}
          {isMaster && (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                직책 관리
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                부마스터·관리자는 이 관리 탭(초대·가입 신청·거점 정책/세율)을 쓸
                수 있어요.
              </p>
              <ul className="space-y-1.5">
                {(info?.members ?? [])
                  .filter((m) => m.role !== "master")
                  .map((m) => (
                    <li
                      key={m.userId}
                      className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        {m.role === "vice_master" && (
                          <span className="shrink-0 rounded bg-violet-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            부마스터
                          </span>
                        )}
                        {m.role === "manager" && (
                          <span className="shrink-0 rounded bg-sky-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            관리자
                          </span>
                        )}
                        <span className="truncate text-sm font-medium">
                          <PlayerNameLink name={m.name} />
                        </span>
                      </div>
                      <select
                        value={
                          m.role === "vice_master" || m.role === "manager"
                            ? m.role
                            : "member"
                        }
                        onChange={(e) =>
                          void handleRole(
                            m.userId,
                            m.name,
                            e.target.value as
                              | "vice_master"
                              | "manager"
                              | "member",
                          )
                        }
                        disabled={acting}
                        className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                      >
                        <option value="member">일반</option>
                        <option value="manager">관리자</option>
                        <option value="vice_master">부마스터</option>
                      </select>
                    </li>
                  ))}
                {(info?.members ?? []).filter((m) => m.role !== "master")
                  .length === 0 && (
                  <li className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    임명할 길드원이 없어요.
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* 국가 선포 — 마스터 전용. 대도시 마을 보유 시 선포 → 길드 정원 증가. */}
          {isMaster && (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                국가 선포
              </div>
              {info?.guild?.nationName ? (
                <div className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2.5 dark:border-indigo-900/60 dark:bg-indigo-950/40">
                  <div className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                    {info.guild.nationName}
                  </div>
                  <p className="mt-0.5 text-xs text-indigo-600/80 dark:text-indigo-400/80">
                    {info.guild.nationDeclaredAt
                      ? `${fmtDate(info.guild.nationDeclaredAt)} 선포`
                      : "선포됨"}{" "}
                    · 길드 정원 {info.memberCap ?? GUILD_MAX_MEMBERS}명
                  </p>
                </div>
              ) : info?.canDeclareNation ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    대도시 마을을 보유했어요. 국가를 선포하면 길드가 성장합니다
                    (정원 증가). 국가명은 한 번 정하면 바꿀 수 없어요.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={nationInput}
                      onChange={(e) => setNationInput(e.target.value)}
                      placeholder="국가명 (2~16자)"
                      disabled={acting}
                      maxLength={16}
                      className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-400"
                    />
                    <button
                      type="button"
                      onClick={handleDeclareNation}
                      disabled={acting || nationInput.trim().length === 0}
                      className="shrink-0 rounded-md border border-indigo-700 bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      국가 선포
                    </button>
                  </div>
                </div>
              ) : (
                <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  대도시 등급 마을을 보유하면 국가를 선포할 수 있어요. 선포하면
                  길드 정원이 늘어납니다.
                </p>
              )}
            </div>
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
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/outpost/${o.id}`)}
                    className="flex w-full items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {occ?.villageName?.trim() || o.name}
                        </span>
                        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                          {TYPE_LABEL[o.type]}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                        정책 {POLICY_LABEL[policy] ?? policy} · 관리하기
                      </span>
                    </span>
                    <CaretRight
                      size={16}
                      weight="bold"
                      aria-hidden
                      className="shrink-0 text-zinc-400 dark:text-zinc-500"
                    />
                  </button>
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

