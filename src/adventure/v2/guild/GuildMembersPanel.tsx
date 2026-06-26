import { useCallback } from "react";
import { V2_SETTLEMENT_WARFARE } from "@/adventure/data/v2/settlementWarfareConfig";
import { GuildOrgChart } from "../GuildOrgChart";
import { NoticeBanner } from "./NoticeBanner";
import type { GuildInfoResponse, Notice } from "./guildShared";

// 길드원 탭 — 조직도 + 본인 탈퇴(마스터 아님). (V2GuildHome 에서 추출, 거동 불변)
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
  // 길드 탈퇴(본인). 마스터는 서버가 transfer_required/disband_required 로 막는다.
  const handleLeave = useCallback(async () => {
    if (acting) return;
    if (!window.confirm("정말 길드를 탈퇴할까요? 재가입은 하루 뒤부터 가능해요.")) {
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
    <div className="space-y-3">
      {notice && <NoticeBanner notice={notice} />}
      {/* 멤버 초대는 관리 탭으로 이동 (마스터/관리자 전용). */}
      {!info?.members || info.members.length === 0 ? (
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          {loading ? "불러오는 중…" : "—"}
        </div>
      ) : (
        // 길드원 조직도 — 마스터→부마스터→관리자→일반 위계 트리(회사 조직도 느낌).
        <GuildOrgChart
          members={info.members}
          showHonor={V2_SETTLEMENT_WARFARE}
        />
      )}

      {/* 길드 탈퇴 — 마스터가 아닌 본인만. 마스터는 관리 탭에서 양도/해산. */}
      {!isMaster && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/60 dark:bg-rose-950/30">
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
