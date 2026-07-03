"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "../../AdminContext";
import { adminGet, adminPost } from "../../api";
import { Button, NumberInput, TextInput } from "../../ui/Field";
import { DangerAction } from "../../ui/DangerAction";

type SanctionRow = {
  id: number;
  type: string;
  reason: string;
  expiresAt: string | null;
  createdByEmail: string;
  createdAt: string;
  liftedAt: string | null;
  liftedByEmail: string | null;
};

type StatusResponse = {
  ok: boolean;
  banned: boolean;
  bannedUntil: string | null;
  banReason: string | null;
  permanent: boolean;
  sanctions: SanctionRow[];
};

const TYPE_LABELS: Record<string, string> = {
  ban: "영구 밴",
  suspend: "기간 정지",
  warn: "경고",
};

const SANCTION_PRESETS = [
  {
    label: "매크로 의심 경고",
    action: "warn" as const,
    days: 0,
    reason: "비정상 반복 플레이 패턴이 확인되어 경고 처리되었습니다.",
    adminMemo: "제한 이벤트·반복 요청 패턴 확인",
  },
  {
    label: "1일 정지",
    action: "suspend" as const,
    days: 1,
    reason: "반복 요청 제한 초과로 1일 이용 제한이 적용되었습니다.",
    adminMemo: "rate_limited 누적, 단기 정지",
  },
  {
    label: "3일 정지",
    action: "suspend" as const,
    days: 3,
    reason: "자동화 의심 행위가 반복되어 3일 이용 제한이 적용되었습니다.",
    adminMemo: "자동화 의심 반복, 중기 정지",
  },
  {
    label: "동일 IP 다계정",
    action: "suspend" as const,
    days: 3,
    reason: "동일 접속 환경에서 비정상 다계정 이용 정황이 확인되었습니다.",
    adminMemo: "IP 연결 계정/행동 패턴 교차 확인 필요",
  },
  {
    label: "보상 악용",
    action: "suspend" as const,
    days: 7,
    reason: "보상 시스템 악용 정황이 확인되어 이용 제한이 적용되었습니다.",
    adminMemo: "경제 로그와 보상 수령 이력 확인",
  },
  {
    label: "영구 정지",
    action: "ban" as const,
    days: 0,
    reason: "명백한 자동화 또는 악용 행위로 영구 이용 제한이 적용되었습니다.",
    adminMemo: "영구 차단 근거 확인 완료",
  },
];

// 유저 제재 — 밴/정지/경고 부과 + 해제 + 이력. /api/admin/sanctions 직접 조작.
// 차단 enforcement 는 ensureUser(모든 게임 API 경유)가 users.bannedUntil 로 검사.
export function SanctionsSection({
  userId,
  readOnly,
}: {
  userId: string;
  readOnly: boolean;
}) {
  const { showToast, adminMe } = useAdmin();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [adminMemo, setAdminMemo] = useState("");
  const [days, setDays] = useState(7);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(
        await adminGet<StatusResponse>(
          `/api/admin/sanctions?userId=${encodeURIComponent(userId)}`,
        ),
      );
    } catch (e) {
      showToast(`제재 조회 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setLoading(false);
    }
  }, [userId, showToast]);

  useEffect(() => {
    // 유저 선택이 바뀌면 다시 로드.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const act = async (
    action: "ban" | "suspend" | "extend" | "warn" | "lift",
    overrideDays = days,
  ) => {
    setBusy(true);
    try {
      await adminPost("/api/admin/sanctions", {
        userId,
        action,
        reason,
        adminMemo,
        days: overrideDays,
      });
      const label =
        action === "lift"
          ? "제재 해제"
          : action === "extend"
            ? "제재 연장"
            : (TYPE_LABELS[action] ?? action);
      showToast(`${label} 적용 완료`);
      if (action !== "warn") setReason("");
      await load();
    } catch (e) {
      showToast(`처리 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setBusy(false);
    }
  };

  const applyPreset = (preset: (typeof SANCTION_PRESETS)[number]) => {
    setReason(preset.reason);
    setAdminMemo(preset.adminMemo);
    if (preset.days > 0) setDays(preset.days);
  };

  const banned = status?.banned ?? false;
  const canSanction = Boolean(adminMe?.capabilities.sanction);
  const disabled = readOnly || loading || busy || !canSanction;

  return (
    <section className="rounded-md border border-amber-300 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          제재 (밴 / 정지 / 경고)
        </h2>
        <Button onClick={() => void load()} disabled={loading || busy}>
          {loading ? "조회 중…" : "새로고침"}
        </Button>
      </div>

      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
        {loading
          ? "조회 중…"
          : banned
            ? status?.permanent
              ? `🚫 영구 밴 중${status?.banReason ? ` — ${status.banReason}` : ""}`
              : `⏳ ${new Date(status!.bannedUntil!).toLocaleString("ko-KR")} 까지 정지 중${status?.banReason ? ` — ${status.banReason}` : ""}`
            : "✅ 정상 — 차단 없음"}
      </p>

      <div className="mt-3 space-y-2">
        <TextInput
          value={reason}
          onChange={setReason}
          placeholder="유저 노출 사유"
          disabled={disabled}
        />
        <TextInput
          value={adminMemo}
          onChange={setAdminMemo}
          placeholder="관리자 메모 (감사 로그에만 기록)"
          disabled={disabled}
        />
        <div className="flex flex-wrap gap-1">
          {SANCTION_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={disabled}
              onClick={() => applyPreset(preset)}
              className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={disabled} onClick={() => void act("warn")}>
            경고 기록
          </Button>
          <div className="flex items-center gap-1">
            <div className="w-16">
              <NumberInput
                value={days}
                min={1}
                disabled={disabled}
                onChange={setDays}
              />
            </div>
            <span className="text-xs text-zinc-500">일</span>
            <DangerAction
              trigger="기간 정지"
              title="기간 정지"
              description={`${days}일간 이 유저의 모든 게임 행동을 차단합니다(로그인은 가능하나 API 401). 사유: ${reason || "(없음)"}`}
              confirmText="SUSPEND"
              disabled={disabled}
              onConfirm={() => void act("suspend")}
            />
          </div>
          <DangerAction
            trigger="영구 밴"
            title="영구 밴"
            description={`이 유저를 영구 차단합니다(해제 전까지 모든 게임 행동 불가). 사유: ${reason || "(없음)"}`}
            confirmText="BAN"
            disabled={disabled}
            onConfirm={() => void act("ban")}
          />
          {banned && (
            <>
              <Button disabled={disabled} onClick={() => void act("extend", 1)}>
                1일 연장
              </Button>
              <Button disabled={disabled} onClick={() => void act("extend", 3)}>
                3일 연장
              </Button>
              <Button
                variant="primary"
                disabled={disabled}
                onClick={() => void act("lift")}
              >
                제재 해제
              </Button>
            </>
          )}
        </div>
      </div>

      {status && status.sanctions.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            이력 (최근 {status.sanctions.length})
          </div>
          <ul className="space-y-2 border-l border-zinc-200 pl-3 dark:border-zinc-800">
            {status.sanctions.map((s) => (
              <li
                key={s.id}
                className="relative rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <span className="absolute -left-[17px] top-2 h-2 w-2 rounded-full bg-amber-500" />
                <span className="font-semibold">
                  {TYPE_LABELS[s.type] ?? s.type}
                </span>
                {s.reason ? <> — {s.reason}</> : null}
                {s.expiresAt ? (
                  <span className="ml-1 text-zinc-400">
                    · 만료 {new Date(s.expiresAt).toLocaleString("ko-KR")}
                  </span>
                ) : null}
                {s.liftedAt ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {" "}
                    · 해제 {new Date(s.liftedAt).toLocaleString("ko-KR")}
                  </span>
                ) : null}
                <span className="ml-1 text-zinc-400">
                  · {new Date(s.createdAt).toLocaleString("ko-KR")} ·{" "}
                  {s.createdByEmail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {readOnly && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          보기 전용 모드 — 상단에서 편집 가능으로 전환해야 동작합니다.
        </p>
      )}
      {!canSanction && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          현재 계정에는 제재 권한이 없습니다.
        </p>
      )}
    </section>
  );
}
