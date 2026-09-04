"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { signOut } from "next-auth/react";
import { Warning } from "@phosphor-icons/react";
import {
  PLAYER_SANCTION_POLL_MS,
  type PlayerSanctionStatus,
  type PlayerTradeSuspension,
  type PlayerSanctionWarning,
  type PlayerSuspension,
} from "@/lib/playerSanctions";
import { useModalA11y } from "@/lib/useModalA11y";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

type GateState =
  | { kind: "loading" }
  | { kind: "ready"; status: PlayerSanctionStatus }
  | { kind: "unauthorized" }
  | { kind: "error" };

const SANCTION_RETRY_DELAYS_MS = [2_000, 5_000, 10_000] as const;

function sanctionRetryDelay(failureCount: number): number {
  const index = Math.min(
    Math.max(0, failureCount - 1),
    SANCTION_RETRY_DELAYS_MS.length - 1,
  );
  return SANCTION_RETRY_DELAYS_MS[index];
}

export function PlayerSanctionGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: "loading" });
  const refreshRequestIdRef = useRef(0);
  const initialFailureCountRef = useRef(0);
  const hasReadyStatusRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);

  const clearScheduledRetry = useCallback(() => {
    if (retryTimerRef.current === null) return;
    window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  const refresh = useCallback(async () => {
    clearScheduledRetry();
    const requestId = ++refreshRequestIdRef.current;
    try {
      const res = await fetch("/api/v2/me/sanctions", { cache: "no-store" });
      if (requestId !== refreshRequestIdRef.current) return;
      if (res.status === 401 || res.status === 404) {
        initialFailureCountRef.current = 0;
        hasReadyStatusRef.current = false;
        setState({ kind: "unauthorized" });
        return;
      }
      if (!res.ok) throw new Error(`sanctions -> ${res.status}`);
      const json = (await res.json()) as PlayerSanctionStatus & { ok?: boolean };
      if (requestId !== refreshRequestIdRef.current) return;
      if (!json.ok) throw new Error("invalid sanction status");
      initialFailureCountRef.current = 0;
      hasReadyStatusRef.current = true;
      setState({
        kind: "ready",
        status: {
          suspension: json.suspension,
          tradeSuspension: json.tradeSuspension,
          warning: json.warning,
        },
      });
    } catch {
      // 최초 확인 실패는 제재 여부를 모른 채 저장 API를 호출하지 않도록 재시도 화면을
      // 보여준다. 플레이 중 폴링 한 번이 실패한 경우에는 마지막 정상 상태를 유지한다.
      if (requestId !== refreshRequestIdRef.current) return;
      if (!hasReadyStatusRef.current) initialFailureCountRef.current += 1;
      setState((current) => (current.kind === "ready" ? current : { kind: "error" }));
    }
  }, [clearScheduledRetry]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 서버의 최신 제재 상태를 1회 로드
    void refresh();
    const timer = window.setInterval(() => void refresh(), PLAYER_SANCTION_POLL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  useEffect(() => {
    if (state.kind !== "error") return;
    retryTimerRef.current = window.setTimeout(
      () => void refresh(),
      sanctionRetryDelay(initialFailureCountRef.current),
    );
    return clearScheduledRetry;
  }, [clearScheduledRetry, refresh, state]);

  if (state.kind === "loading") return <SanctionStatusLoading />;
  if (state.kind === "unauthorized") return <SanctionStatusUnauthorized />;
  if (state.kind === "error") return <SanctionStatusError onRetry={refresh} />;
  if (state.status.suspension) {
    return <SuspensionScreen suspension={state.status.suspension} onRefresh={refresh} />;
  }

  return (
    <>
      {children}
      {state.status.tradeSuspension && !state.status.tradeSuspension.acknowledged ? (
        <TradeSuspensionAcknowledgementModal
          tradeSuspension={state.status.tradeSuspension}
          onAcknowledged={refresh}
        />
      ) : null}
      {state.status.warning ? (
        <WarningAcknowledgementModal
          warning={state.status.warning}
          onAcknowledged={refresh}
        />
      ) : null}
    </>
  );
}

function TradeSuspensionAcknowledgementModal({
  tradeSuspension,
  onAcknowledged,
}: {
  tradeSuspension: PlayerTradeSuspension;
  onAcknowledged: () => Promise<void>;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useModalA11y(contentRef);

  const acknowledge = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/me/sanctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sanctionId: tradeSuspension.id, kind: "trade" }),
      });
      if (!res.ok) throw new Error(`acknowledge trade suspension -> ${res.status}`);
      await onAcknowledged();
    } catch {
      setError("거래 이용 제한 확인을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-suspension-title"
      aria-describedby="trade-suspension-description"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 p-4 backdrop-blur-sm sm:items-center"
    >
      <div
        ref={contentRef}
        className={`${SURFACE_CARD} w-full max-w-md overflow-hidden shadow-2xl`}
      >
        <div className="border-b border-rose-200 px-5 py-4 dark:border-rose-900">
          <div className="flex items-start gap-3">
            <Warning
              size={26}
              weight="duotone"
              className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400"
            />
            <div>
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                거래 기능 안내
              </p>
              <h2
                id="trade-suspension-title"
                className="mt-0.5 text-lg font-bold text-zinc-900 dark:text-zinc-100"
              >
                거래 이용 제한
              </h2>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              제한 기간
            </div>
            <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {tradeSuspension.permanent
                ? "영구 거래 이용 제한"
                : `${formatSanctionDate(tradeSuspension.expiresAt)}까지`}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              제한 사유
            </div>
            <p
              id="trade-suspension-description"
              className={`${SURFACE_INSET} mt-1 px-3 py-2.5 text-sm leading-6 text-zinc-700 dark:text-zinc-300`}
            >
              {tradeSuspension.reason}
            </p>
          </div>
          <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            제한 중에도 일반 게임과 거래 정보 조회는 이용할 수 있습니다. 제한 해제는 이
            확인과 별도로 운영 정책에 따라 처리됩니다.
          </p>

          {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}

          <button
            type="button"
            onClick={() => void acknowledge()}
            disabled={submitting}
            className="w-full rounded-md bg-rose-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "확인 저장 중..." : "내용을 확인했습니다"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SanctionStatusLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">계정 상태 확인 중...</p>
    </div>
  );
}

function SanctionStatusError({ onRetry }: { onRetry: () => Promise<void> }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-6 dark:bg-zinc-950">
      <div className="max-w-sm text-center">
        <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          계정 상태를 확인하지 못했습니다
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          잠시 후 다시 시도해 주세요.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void onRetry()}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        다시 확인
      </button>
    </div>
  );
}

function SanctionStatusUnauthorized() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-6 dark:bg-zinc-950">
      <div className="max-w-sm text-center">
        <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          로그인 정보를 확인할 수 없습니다
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          다시 로그인하면 계정 상태를 확인하고 이어서 플레이할 수 있습니다.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void signOut({ redirectTo: "/sign-in" })}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        다시 로그인
      </button>
    </div>
  );
}

function SuspensionScreen({
  suspension,
  onRefresh,
}: {
  suspension: PlayerSuspension;
  onRefresh: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-5 dark:bg-zinc-950">
      <section className="w-full max-w-lg overflow-hidden rounded-xl border border-rose-200 bg-white shadow-xl dark:border-rose-950 dark:bg-zinc-900">
        <div className="border-b border-rose-100 bg-rose-50 px-6 py-5 dark:border-rose-950 dark:bg-zinc-800">
          <div className="flex items-start gap-3">
            <Warning
              size={28}
              weight="duotone"
              className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400"
            />
            <div>
              <p className="text-xs font-semibold tracking-wide text-rose-600 dark:text-rose-400">
                계정 이용 제한
              </p>
              <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                게임 이용이 제한되었습니다
              </h1>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">제한 기간</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {suspension.permanent
                ? "영구 이용 제한"
                : `${formatSanctionDate(suspension.expiresAt)}까지`}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">제한 사유</div>
            <p className="mt-1 rounded-lg bg-zinc-50 px-3 py-2.5 text-sm leading-6 text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
              {suspension.reason}
            </p>
          </div>
          <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            제한 기간에는 게임 데이터 조회와 모든 게임 행동을 이용할 수 없습니다. 기간
            정지는 만료 시각 이후 자동으로 해제됩니다.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {refreshing ? "확인 중..." : "상태 다시 확인"}
            </button>
            <button
              type="button"
              onClick={() => void signOut({ redirectTo: "/sign-in" })}
              className="flex-1 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              로그아웃
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function WarningAcknowledgementModal({
  warning,
  onAcknowledged,
}: {
  warning: PlayerSanctionWarning;
  onAcknowledged: () => Promise<void>;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useModalA11y(contentRef);

  const acknowledge = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/me/sanctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warningId: warning.id }),
      });
      if (!res.ok) throw new Error(`acknowledge -> ${res.status}`);
      await onAcknowledged();
    } catch {
      setError("경고 확인을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sanction-warning-title"
      aria-describedby="sanction-warning-description"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 p-4 backdrop-blur-sm sm:items-center"
    >
      <div
        ref={contentRef}
        className="w-full max-w-md overflow-hidden rounded-xl border border-amber-200 bg-white shadow-2xl dark:border-amber-900 dark:bg-zinc-900"
      >
        <div className="border-b border-amber-100 bg-amber-50 px-5 py-4 dark:border-amber-950 dark:bg-zinc-800">
          <div className="flex items-start gap-3">
            <Warning
              size={26}
              weight="duotone"
              className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
            />
            <div>
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">운영 경고</p>
              <h2
                id="sanction-warning-title"
                className="mt-0.5 text-lg font-bold text-zinc-900 dark:text-zinc-100"
              >
                계정 이용 경고가 부과되었습니다
              </h2>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">경고 사유</div>
            <p
              id="sanction-warning-description"
              className="mt-1 rounded-lg bg-zinc-50 px-3 py-2.5 text-sm leading-6 text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
            >
              {warning.reason}
            </p>
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            부과 시각: {formatSanctionDate(warning.createdAt)}
          </div>
          <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            같은 유형의 비정상 활동이 반복되면 기간 정지 또는 영구 이용 제한이 적용될 수
            있습니다. 내용을 확인해야 게임을 계속 이용할 수 있습니다.
          </p>

          {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}

          <button
            type="button"
            onClick={() => void acknowledge()}
            disabled={submitting}
            className="w-full rounded-md bg-amber-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "확인 저장 중..." : "내용을 확인했습니다"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function formatSanctionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
