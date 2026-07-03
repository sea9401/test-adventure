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
  { label: "매크로 의심 경고", action: "warn" as const, days: 0, reason: "매크로 의심 패턴 확인" },
  { label: "1일 정지", action: "suspend" as const, days: 1, reason: "반복 요청 제한 초과" },
  { label: "3일 정지", action: "suspend" as const, days: 3, reason: "반복 자동화 의심 행위" },
  { label: "영구 정지", action: "ban" as const, days: 0, reason: "명백한 자동화/악용 행위" },
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
  const { showToast } = useAdmin();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
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

  const act = async (action: "ban" | "suspend" | "warn" | "lift") => {
    setBusy(true);
    try {
      await adminPost("/api/admin/sanctions", { userId, action, reason, days });
      const label =
        action === "lift" ? "제재 해제" : (TYPE_LABELS[action] ?? action);
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
    if (preset.days > 0) setDays(preset.days);
  };

  const banned = status?.banned ?? false;
  const disabled = readOnly || loading || busy;

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
          placeholder="사유 (감사 로그·이력에 기록)"
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
            <Button
              variant="primary"
              disabled={disabled}
              onClick={() => void act("lift")}
            >
              제재 해제
            </Button>
          )}
        </div>
      </div>

      {status && status.sanctions.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            이력 (최근 {status.sanctions.length})
          </div>
          <ul className="space-y-1">
            {status.sanctions.map((s) => (
              <li
                key={s.id}
                className="rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <span className="font-semibold">
                  {TYPE_LABELS[s.type] ?? s.type}
                </span>
                {s.reason ? <> — {s.reason}</> : null}
                {s.liftedAt ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {" "}
                    (해제됨)
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
    </section>
  );
}
