import { useCallback, useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import {
  acceptJoinRequest,
  declineJoinRequest,
  inviteToGuild,
  GuildError,
} from "@/adventure/guild/api";
import { GUILD_MAX_MEMBERS, GUILD_NAME_MAX } from "@/adventure/data/guild";
import { GUILD_EMBLEMS } from "@/adventure/data/guild-emblems-icons";
import { GUILD_COLORS } from "@/adventure/data/guild-colors";
import { OutpostPolicyEditor } from "../OutpostPolicyEditor";
import LordPanel from "../LordPanel";
import { NoticeBanner } from "./NoticeBanner";
import { GuildCombatSupplyPanel } from "./GuildCombatSupplyPanel";
import {
  fmtDate,
  type GuildInfoResponse,
  type GuildManageTab,
  type Notice,
  type PendingRequest,
  type PolicyTarget,
} from "./guildShared";

// 길드 관리 탭 — 마스터/관리자 전용. 멤버(초대·신청·직책)·거점 정책·길드 설정(엠블럼·색·국가·해산).
// (V2GuildHome 에서 추출, 거동 불변)
export function GuildManagePanel({
  info,
  guildId,
  stateGuildName,
  acting,
  setActing,
  notice,
  setNotice,
  onRefresh,
  isMaster,
  canManage,
  pendingRequests,
  loading,
  policyTargets,
  viewerUserId,
  onGuildChanged,
  onOccupationsChanged,
}: {
  info: GuildInfoResponse | null;
  guildId: number | null;
  stateGuildName?: string;
  acting: boolean;
  setActing: (v: boolean) => void;
  notice: Notice | null;
  setNotice: (n: Notice | null) => void;
  onRefresh: () => Promise<void>;
  isMaster: boolean;
  canManage: boolean;
  pendingRequests: PendingRequest[];
  loading: boolean;
  policyTargets: PolicyTarget[];
  viewerUserId: string | null;
  onGuildChanged?: () => void;
  onOccupationsChanged?: () => void;
}) {
  // 관리 탭 내부 하위 탭 선택.
  const [manageTab, setManageTab] = useState<GuildManageTab>("members");
  const [inviteName, setInviteName] = useState("");
  // 관리탭 — 거점 정책 에디터 펼침 (한 번에 하나).
  const [policyOpenId, setPolicyOpenId] = useState<string | null>(null);
  // 국가 선포 — 국가명 입력.
  const [nationInput, setNationInput] = useState("");
  // 길드 해산 확인 — 길드 이름 입력(파괴적 작업 안전장치).
  const [disbandConfirm, setDisbandConfirm] = useState("");

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
        await onRefresh();
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
    [onRefresh, setActing, setNotice],
  );

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
  }, [inviteName, guildId, acting, setActing, setNotice]);

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
        await onRefresh();
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
  }, [nationInput, acting, onRefresh, setActing, setNotice]);

  // 마스터가 길드 엠블럼 설정 — 지도 마커에 그 길드 점령 거점 아이콘으로 표시.
  const handleSetEmblem = useCallback(
    async (key: string) => {
      if (acting) return;
      setActing(true);
      setNotice(null);
      try {
        const res = await fetch("/api/v2/guild/emblem", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ emblem: key }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (j?.ok) {
          setNotice({
            kind: "ok",
            text: "길드 엠블럼을 바꿨어요. 지도에 반영됩니다.",
          });
          await onRefresh();
        } else {
          setNotice({
            kind: "err",
            text:
              j?.error === "not_master"
                ? "마스터만 엠블럼을 바꿀 수 있어요."
                : `변경에 실패했어요 (${j?.error ?? `http ${res.status}`}).`,
          });
        }
      } catch {
        setNotice({
          kind: "err",
          text: "변경에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
      } finally {
        setActing(false);
      }
    },
    [acting, onRefresh, setActing, setNotice],
  );

  // 마스터가 길드 고유색 설정 — 선착순 유니크. 이미 쓰인 색은 거부(color_taken).
  const handleSetColor = useCallback(
    async (key: string) => {
      if (acting) return;
      setActing(true);
      setNotice(null);
      try {
        const res = await fetch("/api/v2/guild/color", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ color: key }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (j?.ok) {
          setNotice({ kind: "ok", text: "길드 색을 바꿨어요. 지도에 반영됩니다." });
          await onRefresh();
        } else {
          setNotice({
            kind: "err",
            text:
              j?.error === "color_taken"
                ? "다른 길드가 방금 그 색을 가져갔어요. 다른 색을 골라주세요."
                : j?.error === "not_master"
                  ? "마스터만 색을 바꿀 수 있어요."
                  : `변경에 실패했어요 (${j?.error ?? `http ${res.status}`}).`,
          });
          if (j?.error === "color_taken") await onRefresh();
        }
      } catch {
        setNotice({
          kind: "err",
          text: "변경에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
      } finally {
        setActing(false);
      }
    },
    [acting, onRefresh, setActing, setNotice],
  );

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
          await onRefresh();
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
    [onRefresh, setActing, setNotice],
  );

  // 마스터가 길드원 추방.
  const handleKick = useCallback(
    async (targetUserId: string, name: string) => {
      if (acting) return;
      if (!window.confirm(`${name} 님을 길드에서 추방할까요?`)) return;
      setActing(true);
      setNotice(null);
      try {
        const res = await fetch("/api/v2/guild/kick", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetUserId }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (j?.ok) {
          setNotice({ kind: "ok", text: `${name} 님을 추방했어요.` });
          await onRefresh();
        } else {
          setNotice({
            kind: "err",
            text: `추방에 실패했어요 (${j?.error ?? `http ${res.status}`}).`,
          });
        }
      } catch {
        setNotice({ kind: "err", text: "추방에 실패했어요. 잠시 후 다시 시도해 주세요." });
      } finally {
        setActing(false);
      }
    },
    [acting, onRefresh, setActing, setNotice],
  );

  // 마스터가 마스터직 양도.
  const handleTransfer = useCallback(
    async (targetUserId: string, name: string) => {
      if (acting) return;
      if (
        !window.confirm(
          `${name} 님에게 길드 마스터를 양도할까요? 되돌릴 수 없어요.`,
        )
      ) {
        return;
      }
      setActing(true);
      setNotice(null);
      try {
        const res = await fetch("/api/v2/guild/transfer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetUserId }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (j?.ok) {
          setNotice({ kind: "ok", text: `${name} 님에게 마스터를 양도했어요.` });
          await onRefresh();
          onGuildChanged?.();
        } else {
          setNotice({
            kind: "err",
            text: `양도에 실패했어요 (${j?.error ?? `http ${res.status}`}).`,
          });
        }
      } catch {
        setNotice({ kind: "err", text: "양도에 실패했어요. 잠시 후 다시 시도해 주세요." });
      } finally {
        setActing(false);
      }
    },
    [acting, onRefresh, onGuildChanged, setActing, setNotice],
  );

  // 마스터가 길드 해산 — 길드 이름 입력으로 확인. 금고 골드 소멸·점령 거점 해방.
  const handleDisband = useCallback(async () => {
    const name = stateGuildName ?? info?.guild?.name ?? "";
    if (acting || disbandConfirm.trim() !== name || name.length === 0) return;
    setActing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v2/guild/disband", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: disbandConfirm.trim() }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (j?.ok) {
        setNotice({ kind: "ok", text: "길드를 해산했어요." });
        setDisbandConfirm("");
        await onRefresh();
        onGuildChanged?.();
      } else {
        setNotice({
          kind: "err",
          text: `해산에 실패했어요 (${j?.error ?? `http ${res.status}`}).`,
        });
      }
    } catch {
      setNotice({ kind: "err", text: "해산에 실패했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setActing(false);
    }
  }, [acting, disbandConfirm, stateGuildName, info?.guild?.name, onRefresh, onGuildChanged, setActing, setNotice]);

  // 관리 탭 내부 하위 탭 — 멤버/거점 정책은 관리자+, 길드 설정(엠블럼·색·국가·해산)은 마스터 전용.
  //   관리자(비마스터)는 설정 탭 미노출. 멤버 탭에 가입 신청 대기 뱃지.
  const manageTabs: { key: GuildManageTab; label: string }[] = [
    {
      key: "members",
      label:
        pendingRequests.length > 0 ? `멤버 (${pendingRequests.length})` : "멤버",
    },
    { key: "research", label: "길드 연구" },
    { key: "territory", label: "거점 정책" },
  ];
  if (isMaster) manageTabs.push({ key: "settings", label: "길드 설정" });
  const activeManageTab: GuildManageTab = manageTabs.some(
    (t) => t.key === manageTab,
  )
    ? manageTab
    : "members";

  return (
    <div className="space-y-4">
      {notice && <NoticeBanner notice={notice} />}

      {/* 관리 탭이 비대해져 내부 하위 탭으로 분리 — 멤버 / 거점 정책 / 길드 설정.
          지역 배경 위라 surface(HeaderPanel)로 감싸야 보임 — 상위 탭과 동일 패턴([[ui-design-system-surfaces]] #888/#890). */}
      <HeaderPanel className="py-2">
        <TabBar
          tabs={manageTabs}
          active={activeManageTab}
          onChange={setManageTab}
          ariaLabel="길드 관리 하위 탭"
          size="sm"
          variant="highlight"
        />
      </HeaderPanel>

      {activeManageTab === "research" && <GuildCombatSupplyPanel />}

      {/* ── 멤버: 멤버 초대 · 가입 신청 · 직책 관리 ── */}
      {/* 멤버 초대 — 길드원 탭에서 이동 */}
      {activeManageTab === "members" && guildId != null && (
        <div className="ui-workshop-card rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
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

      {/* ── 길드 설정: 엠블럼 · 색 · 국가 선포 · 위험 구역(해산) ── */}
      {/* 길드 엠블럼 — 마스터 전용. 지도에서 이 길드 점령 거점에 표시되는 아이콘. */}
      {activeManageTab === "settings" && isMaster && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            길드 엠블럼
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            지도에서 우리 길드가 점령한 거점에 이 아이콘이 표시돼요.
          </p>
          <div className="mt-2 grid grid-cols-6 gap-1.5">
            {GUILD_EMBLEMS.map((em) => {
              const selected = info?.guild?.emblem === em.key;
              const Icon = em.Icon;
              return (
                <button
                  key={em.key}
                  type="button"
                  onClick={() => handleSetEmblem(em.key)}
                  disabled={acting}
                  title={em.label}
                  aria-label={em.label}
                  aria-pressed={selected}
                  className={`ui-guild-swatch flex aspect-square items-center justify-center rounded-md border transition disabled:opacity-50 ${
                    selected
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                  }`}
                >
                  <Icon size={18} weight="fill" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 길드 색 — 마스터 전용. 선착순 유니크(이미 쓰인 색 비활성). 지도 마커 채움색. */}
      {activeManageTab === "settings" && isMaster && (
        <div className="ui-workshop-card rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            길드 색
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            지도에서 우리 길드 거점 채움색이에요. 다른 길드가 쓰는 색은 고를 수 없어요(선착순).
          </p>
          <div className="mt-2 grid grid-cols-8 gap-1.5">
            {GUILD_COLORS.map((c) => {
              const selected = info?.guild?.color === c.key;
              const taken =
                !selected && (info?.takenColors ?? []).includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => handleSetColor(c.key)}
                  disabled={acting || taken}
                  title={taken ? `${c.label} (사용 중)` : c.label}
                  aria-label={c.label}
                  aria-pressed={selected}
                  className={`ui-guild-swatch aspect-square rounded-md border-2 transition disabled:cursor-not-allowed ${
                    selected
                      ? "border-zinc-900 ring-2 ring-zinc-900 dark:border-white dark:ring-white"
                      : "border-transparent hover:border-zinc-400"
                  } ${taken ? "opacity-25" : ""}`}
                  style={{ background: c.hex }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* 가입 신청 (멤버 탭) */}
      {activeManageTab === "members" && (
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
                  className="ui-guild-row flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
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
      )}

      {/* ── 거점 정책: 영주 + 정책·세율 (타일 정착지 + 카탈로그 거점) ── */}
      {/* 정책/영주 지정 = 마스터/관리자. 세금 수확 = 영주 본인(LordPanel 내부 게이트). */}
      {activeManageTab === "territory" && (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            거점 정책 · 영주 · 세율
          </div>
          {policyTargets.length === 0 ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              점령한 거점이 아직 없어요.
            </div>
          ) : (
            <div className="space-y-2.5">
              {policyTargets.map((t) => (
                <div
                  key={t.outpostId}
                  className="ui-workshop-card overflow-hidden rounded-md border border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <OutpostPolicyEditor
                    outpostId={t.outpostId}
                    title={t.title}
                    currentPolicy={t.occ?.policy ?? "open"}
                    currentTaxRate={Number(t.occ?.taxRate ?? "0")}
                    open={policyOpenId === t.outpostId}
                    onToggle={() =>
                      setPolicyOpenId((cur) =>
                        cur === t.outpostId ? null : t.outpostId,
                      )
                    }
                    onSaved={() => onOccupationsChanged?.()}
                  />
                  {/* 영주·세금 — 정책 편집기와 같은 펼침(policyOpenId) 안에. 펼쳤을 때만 표시. */}
                  {policyOpenId === t.outpostId && (
                    <LordPanel
                      outpostId={t.outpostId}
                      canManage={canManage}
                      viewerUserId={viewerUserId}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 직책 관리 — 마스터 전용. 관리자 임명/해임. (멤버 탭) */}
      {activeManageTab === "members" && isMaster && (
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
                  className="ui-guild-row flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
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
                  <div className="flex shrink-0 items-center gap-1.5">
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
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                    >
                      <option value="member">일반</option>
                      <option value="manager">관리자</option>
                      <option value="vice_master">부마스터</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleTransfer(m.userId, m.name)}
                      disabled={acting}
                      className="rounded-md border border-amber-600 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                    >
                      양도
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleKick(m.userId, m.name)}
                      disabled={acting}
                      className="rounded-md border border-rose-600 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                    >
                      추방
                    </button>
                  </div>
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

      {/* 국가 선포 — 마스터 전용. 대도시 마을 보유 시 선포 → 길드 정원 증가. (설정 탭) */}
      {activeManageTab === "settings" && isMaster && (
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

      {/* 위험 구역 — 길드 해산(마스터 전용). 금고 소멸·거점 해방·되돌릴 수 없음. (설정 탭) */}
      {activeManageTab === "settings" && isMaster && (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-rose-500">
            위험 구역
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/60 dark:bg-rose-950/30">
            <p className="text-xs text-rose-700 dark:text-rose-300">
              길드를 해산하면 모든 길드원이 방출되고, 금고 골드(
              {(info?.guildGold ?? 0).toLocaleString()} G)가 소멸하며, 점령한
              거점이 모두 해방됩니다. 되돌릴 수 없어요.
            </p>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
              확인을 위해 길드 이름{" "}
              <span className="font-semibold">
                {stateGuildName ?? info?.guild?.name}
              </span>{" "}
              을 입력하세요.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={disbandConfirm}
                onChange={(e) => setDisbandConfirm(e.target.value)}
                placeholder="길드 이름"
                disabled={acting}
                maxLength={GUILD_NAME_MAX}
                className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-rose-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="button"
                onClick={() => void handleDisband()}
                disabled={
                  acting ||
                  disbandConfirm.trim() !==
                    (stateGuildName ?? info?.guild?.name ?? "")
                }
                className="shrink-0 rounded-md border border-rose-700 bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                해산
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
