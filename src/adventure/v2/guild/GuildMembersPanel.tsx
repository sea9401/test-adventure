import { useCallback } from "react";
import { GuildOrgChart } from "../GuildOrgChart";
import { NoticeBanner } from "./NoticeBanner";
import { confirmGameAction } from "@/components/ui/gameDialog";
import { SURFACE_ACCENT, SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { GUILD_LEADERSHIP_INACTIVE_DAYS } from "@/adventure/data/guildLeadership";
import type { GuildInfoResponse, Notice } from "./guildShared";

// 길드원 탭 — 조직도 + 미접속 길드장 승계 + 본인 탈퇴.
export function GuildMembersPanel({
  info,
  loading,
  isMaster,
  acting,
  setActing,
  notice,
  setNotice,
  onRefresh,
  onGuildChanged,
}: {
  info: GuildInfoResponse | null;
  loading: boolean;
  isMaster: boolean;
  acting: boolean;
  setActing: (v: boolean) => void;
  notice: Notice | null;
  setNotice: (n: Notice | null) => void;
  onRefresh: () => Promise<void>;
  onGuildChanged?: () => void;
}) {
  const expectedMasterId = info?.guild?.masterId;
  const handleClaimLeadership = useCallback(async () => {
    if (acting || !expectedMasterId || !info?.canClaimLeadership) return;
    if (!(await confirmGameAction(
      "길드장 자리를 승계할까요? 기존 길드장은 일반 길드원으로 남으며, 복귀해도 자동으로 길드장이 되지 않아요.",
    ))) return;
    setActing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v2/guild/claim-leadership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedMasterId }),
      });
      const result = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (res.ok && result?.ok) {
        setNotice({ kind: "ok", text: "길드장 자리를 승계했어요." });
        await onRefresh();
        onGuildChanged?.();
      } else {
        const errors: Record<string, string> = {
          master_active: `길드장이 ${GUILD_LEADERSHIP_INACTIVE_DAYS}일 이상 미접속한 경우에만 승계할 수 있어요.`,
          master_changed: "길드장이 이미 바뀌었어요. 새 정보를 확인해 주세요.",
          already_master: "이미 길드장이에요.",
          no_guild: "현재 이 길드에 소속되어 있지 않아요.",
          guild_not_found: "길드가 해산되었거나 찾을 수 없어요.",
          unauthorized: "접속 상태를 확인한 뒤 다시 시도해 주세요.",
        };
        setNotice({ kind: "err", text: errors[result?.error ?? ""] ?? "승계에 실패했어요. 잠시 후 다시 시도해 주세요." });
        await onRefresh();
      }
    } catch {
      setNotice({ kind: "err", text: "승계에 실패했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setActing(false);
    }
  }, [acting, expectedMasterId, info?.canClaimLeadership, onRefresh, onGuildChanged, setActing, setNotice]);

  // 길드 탈퇴(본인). 마스터는 서버가 transfer_required/disband_required 로 막는다.
  const handleLeave = useCallback(async () => {
    if (acting) return;
    if (!(await confirmGameAction("정말 길드를 탈퇴할까요? 재가입은 하루 뒤부터 가능해요."))) {
      return;
    }
    setActing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v2/guild/leave", { method: "POST" });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (j?.ok) {
        setNotice({ kind: "ok", text: "길드를 탈퇴했어요." });
        await onRefresh();
        onGuildChanged?.();
      } else {
        const msg =
          j?.error === "transfer_required"
            ? "마스터는 먼저 다른 길드원에게 마스터를 양도해야 탈퇴할 수 있어요."
            : j?.error === "disband_required"
              ? "마지막 마스터예요. 탈퇴 대신 관리 탭에서 길드를 해산하세요."
              : `탈퇴에 실패했어요 (${j?.error ?? `http ${res.status}`}).`;
        setNotice({ kind: "err", text: msg });
      }
    } catch {
      setNotice({ kind: "err", text: "탈퇴에 실패했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setActing(false);
    }
  }, [acting, onRefresh, onGuildChanged, setActing, setNotice]);

  return (
    <div className={`${SURFACE_CARD} space-y-3 p-3`}>
      {notice && <NoticeBanner notice={notice} />}
      {/* 멤버 초대는 관리 탭으로 이동 (마스터/관리자 전용). */}
      {!info?.members || info.members.length === 0 ? (
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          {loading ? "불러오는 중…" : "—"}
        </div>
      ) : (
        // 길드원 조직도 — 마스터→관리자→일반 위계 트리.
        <GuildOrgChart members={info.members} />
      )}

      {!isMaster && info?.canClaimLeadership && expectedMasterId && (
        <div className={`${SURFACE_ACCENT} space-y-2 p-3`}>
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">길드장 장기 미접속</p>
          <p className="text-xs text-amber-800 dark:text-amber-200">
            길드장이 {GUILD_LEADERSHIP_INACTIVE_DAYS}일(72시간) 이상 접속하지 않아 길드원 누구나 길드장 자리를 승계할 수 있어요.
            먼저 승계한 사람이 새 길드장이 되고, 기존 길드장은 일반 길드원으로 남아요.
          </p>
          <button
            type="button"
            onClick={() => void handleClaimLeadership()}
            disabled={acting || loading}
            className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-50"
          >
            길드장 승계
          </button>
        </div>
      )}

      {/* 길드 탈퇴 — 마스터가 아닌 본인만. 마스터는 관리 탭에서 양도/해산. */}
      {!isMaster && (
        <div className={`${SURFACE_INSET} p-3`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-rose-700 dark:text-rose-300">
              길드를 떠납니다. 재가입은 하루 뒤부터 가능해요.
            </p>
            <button
              type="button"
              onClick={() => void handleLeave()}
              disabled={acting}
              className="shrink-0 rounded-md border border-rose-600 bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
            >
              길드 탈퇴
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
