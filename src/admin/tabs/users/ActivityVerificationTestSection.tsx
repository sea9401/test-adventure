"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { Button, Field, Select } from "../../ui/Field";
import { confirmGameAction } from "@/components/ui/gameDialog";

type Activity = "fishing" | "woodcutting" | "mining";
type Mode = "standard" | "captcha";

type ManualRequest = {
  mode: Mode;
  requestedAt: number;
  expiresAt: number;
};

export type ActivityVerificationTestStatus = {
  turnstileConfigured: boolean;
  captchaConfigured: boolean;
  requests: Record<Activity, ManualRequest | null>;
};

const ACTIVITY_OPTIONS: Array<{ value: Activity; label: string }> = [
  { value: "fishing", label: "낚시" },
  { value: "woodcutting", label: "벌목" },
  { value: "mining", label: "채광" },
];

const MODE_OPTIONS: Array<{ value: Mode; label: string }> = [
  { value: "standard", label: "일반 확인 (Turnstile)" },
  { value: "captcha", label: "2단계 hCaptcha" },
];

const ACTIVITY_LABEL: Record<Activity, string> = {
  fishing: "낚시",
  woodcutting: "벌목",
  mining: "채광",
};

const MODE_LABEL: Record<Mode, string> = {
  standard: "일반 확인",
  captcha: "2단계 hCaptcha",
};

const ERROR_LABEL: Record<string, string> = {
  verification_unconfigured: "Turnstile이 설정되지 않았습니다.",
  captcha_unconfigured: "hCaptcha가 설정되지 않았습니다.",
  organic_verification_pending:
    "실제 활동 판정으로 사람 확인이 이미 대기 중입니다.",
  user_not_found: "대상 유저를 찾을 수 없습니다.",
  forbidden: "최고 관리자만 사용할 수 있습니다.",
};

function responseError(status: number, body: unknown): string {
  const error =
    body && typeof body === "object"
      ? (body as { error?: unknown }).error
      : null;
  return typeof error === "string" && ERROR_LABEL[error]
    ? ERROR_LABEL[error]
    : `요청 실패 (HTTP ${status})`;
}

async function fetchStatus(userId: string): Promise<ActivityVerificationTestStatus> {
  const response = await fetch(
    `/api/admin/users/activity-verification?userId=${encodeURIComponent(userId)}`,
    { cache: "no-store" },
  );
  const body = (await response.json().catch(() => null)) as
    | ({ ok?: boolean } & ActivityVerificationTestStatus)
    | null;
  if (!response.ok || !body?.ok) {
    throw new Error(responseError(response.status, body));
  }
  return {
    turnstileConfigured: body.turnstileConfigured,
    captchaConfigured: body.captchaConfigured,
    requests: body.requests,
  };
}

export function ActivityVerificationTestSectionView({
  activity,
  mode,
  status,
  readOnly,
  busy,
  error,
  onActivityChange,
  onModeChange,
  onRequire,
  onCancel,
}: {
  activity: Activity;
  mode: Mode;
  status: ActivityVerificationTestStatus | null;
  readOnly: boolean;
  busy: boolean;
  error: string | null;
  onActivityChange: (activity: Activity) => void;
  onModeChange: (mode: Mode) => void;
  onRequire: () => void;
  onCancel: (activity: Activity) => void;
}) {
  const providerUnavailable =
    !status?.turnstileConfigured ||
    (mode === "captcha" && !status?.captchaConfigured);
  const activeRequests = status
    ? ACTIVITY_OPTIONS.flatMap(({ value }) => {
        const request = status.requests[value];
        return request ? [{ activity: value, request }] : [];
      })
    : [];

  return (
    <section className={`${SURFACE_CARD} p-3`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">사람 확인 테스트</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-600 dark:text-zinc-400">
            대상 유저의 다음 생활 행동에 사람 확인을 한 번 표시합니다. 요청은
            10분 뒤 만료되며 실제 매크로 의심 점수와 제재 판단에는 반영되지
            않습니다.
          </p>
        </div>
        <Link
          href="/admin?tab=lifeGathering"
          className="text-xs font-medium text-sky-700 underline underline-offset-2 dark:text-sky-300"
        >
          사람 확인 이력 보기
        </Link>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="대상 활동">
          <Select
            value={activity}
            options={ACTIVITY_OPTIONS}
            onChange={onActivityChange}
            disabled={readOnly || busy}
          />
        </Field>
        <Field label="확인 단계">
          <Select
            value={mode}
            options={MODE_OPTIONS}
            onChange={onModeChange}
            disabled={readOnly || busy}
          />
        </Field>
      </div>

      {!status ? (
        <p className="mt-3 text-xs text-zinc-500">설정 상태를 불러오는 중…</p>
      ) : !status.turnstileConfigured ? (
        <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-300">
          Turnstile이 설정되지 않아 사람 확인을 요청할 수 없습니다.
        </p>
      ) : !status.captchaConfigured ? (
        <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-300">
          hCaptcha가 설정되지 않았습니다. 일반 확인만 사용할 수 있습니다.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <Button
        variant="primary"
        className="mt-3"
        disabled={readOnly || busy || !status || providerUnavailable}
        onClick={onRequire}
      >
        {busy ? "처리 중…" : "다음 행동에 표시"}
      </Button>

      {activeRequests.length > 0 ? (
        <div className={`${SURFACE_INSET} mt-3 space-y-2 p-3`}>
          <h3 className="text-xs font-semibold">활성 요청</h3>
          {activeRequests.map(({ activity: activeActivity, request }) => (
            <div
              key={activeActivity}
              className="flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <span>
                <strong>
                  {ACTIVITY_LABEL[activeActivity]} · {MODE_LABEL[request.mode]}
                </strong>
                <span className="ml-2 text-zinc-500 dark:text-zinc-400">
                  {new Date(request.expiresAt).toLocaleString("ko-KR")} 만료
                </span>
              </span>
              <Button
                variant="danger"
                disabled={readOnly || busy}
                onClick={() => onCancel(activeActivity)}
              >
                요청 취소
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ActivityVerificationTestSection({
  userId,
  readOnly,
}: {
  userId: string;
  readOnly: boolean;
}) {
  const [activity, setActivity] = useState<Activity>("fishing");
  const [mode, setMode] = useState<Mode>("standard");
  const [status, setStatus] = useState<ActivityVerificationTestStatus | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus(await fetchStatus(userId));
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    void fetchStatus(userId)
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "상태 조회 실패");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function requireVerification() {
    if (busy || readOnly) return;
    if (
      !(await confirmGameAction(
        `${ACTIVITY_LABEL[activity]}의 다음 행동에 ${MODE_LABEL[mode]}을 표시할까요?\n\n요청은 10분 뒤 자동 만료됩니다.`,
      ))
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/users/activity-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, activity, mode }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(response.status, body));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "요청 설정 실패");
    } finally {
      setBusy(false);
    }
  }

  async function cancelVerification(activeActivity: Activity) {
    if (busy || readOnly) return;
    if (!(await confirmGameAction(`${ACTIVITY_LABEL[activeActivity]} 사람 확인 요청을 취소할까요?`))) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/users/activity-verification", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, activity: activeActivity }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(response.status, body));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "요청 취소 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ActivityVerificationTestSectionView
      activity={activity}
      mode={mode}
      status={status}
      readOnly={readOnly}
      busy={busy}
      error={error}
      onActivityChange={setActivity}
      onModeChange={setMode}
      onRequire={() => void requireVerification()}
      onCancel={(activeActivity) => void cancelVerification(activeActivity)}
    />
  );
}
