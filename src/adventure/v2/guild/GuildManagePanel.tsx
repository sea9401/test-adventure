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
import { NoticeBanner } from "./NoticeBanner";
import { GuildFacilitiesManagePanel } from "./GuildOutpostsPanel";
import {
  fmtDate,
  type GuildInfoResponse,
  type GuildManageTab,
  type Notice,
  type PendingRequest,
} from "./guildShared";

// 길드 관리 탭 — 마스터/관리자 전용. 멤버(초대·신청·직책)·길드 설정(엠블럼·색·해산).
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
  pendingRequests,
  loading,
  onGuildChanged,
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
  pendingRequests: PendingRequest[];
  loading: boolean;
  onGuildChanged?: () => void;
}) {
  const [manageTab, setManageTab] = useState<GuildManageTab>("members");
  const [inviteName, setInviteName] = useState("");
  const [disbandConfirm, setDisbandConfirm] = useState("");

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
            text: "길드 엠블럼을 바꿨어요. 길드 정보에 반영됩니다.",
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
          setNotice({ kind: "ok", text: "길드 색을 바꿨어요. 길드 정보에 반영됩니다." });
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

  const manageTabs: { key: GuildManageTab; label: string }[] = [
    {
      key: "members",
      label:
        pendingRequests.length > 0 ? `멤버 (${pendingRequests.length})` : "멤버",
    },
  ];
  if (info?.canUpgradeFacilities) {
    manageTabs.push({ key: "facilities", label: "시설" });
  }
  if (isMaster) manageTabs.push({ key: "settings", label: "길드 설정" });
  const activeManageTab: GuildManageTab = manageTabs.some(
    (t) => t.key === manageTab,
  )
    ? manageTab
    : "members";

  return (
    <div className="space-y-4">
      {notice && <NoticeBanner notice={notice} />}

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

      {activeManageTab === "members" && guildId != null && (
        <div className="ui-workshop-card rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
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
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
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

      {activeManageTab === "settings" && isMaster && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            길드 엠블럼
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            길드 프로필과 길드원 화면에 이 아이콘이 표시돼요.
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
                      : "border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  }`}
                >
                  <Icon size={18} weight="fill" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeManageTab === "settings" && isMaster && (
        <div className="ui-workshop-card rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            길드 색
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            길드 프로필 색상이에요. 다른 길드가 쓰는 색은 고를 수 없어요(선착순).
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

      {activeManageTab === "facilities" && info?.canUpgradeFacilities && (
        <GuildFacilitiesManagePanel info={info} onChanged={onRefresh} />
      )}

      {activeManageTab === "members" && (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            가입 신청
          </div>
          {pendingRequests.length === 0 ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
              {loading ? "불러오는 중…" : "대기 중인 가입 신청이 없어요."}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {pendingRequests.map((r) => (
                <li
                  key={r.requestId}
                  className="ui-guild-row flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
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

      {activeManageTab === "members" && isMaster && (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            직책 관리
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            부마스터·관리자는 초대와 가입 신청 관리를 쓸 수 있어요.
          </p>
          <ul className="space-y-1.5">
            {(info?.members ?? [])
              .filter((m) => m.role !== "master")
              .map((m) => (
                <li
                  key={m.userId}
                  className="ui-guild-row flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
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
              <li className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                임명할 길드원이 없어요.
              </li>
            )}
          </ul>
        </div>
      )}

      {activeManageTab === "settings" && isMaster && (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-rose-500">
            위험 구역
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/60 dark:bg-rose-950/30">
            <p className="text-xs text-rose-700 dark:text-rose-300">
              길드를 해산하면 모든 길드원이 방출되고, 금고 골드(
              {(info?.guildGold ?? 0).toLocaleString()} G)가 소멸합니다. 되돌릴 수 없어요.
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
                className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-rose-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
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
