"use client";

import { useEffect, useState } from "react";

type Status = {
  enabled: boolean;
  active: {
    targetUserId: string;
    gameName: string | null;
  } | null;
};

const ERROR_LABEL: Record<string, string> = {
  impersonation_disabled: "현재 환경에서 계정 가장이 비활성화되어 있습니다.",
  already_active: "먼저 현재 계정 가장을 종료해주세요.",
  invalid_target: "가장할 수 없는 계정입니다.",
  user_not_found: "대상 유저를 찾을 수 없습니다.",
};

export function UserImpersonationSection({
  userId,
  gameName,
}: {
  userId: string;
  gameName: string;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/impersonation", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 403) return null;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as Status;
      })
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // 최고 관리자가 아니면 GET 403 → 섹션 자체를 노출하지 않는다.
  if (!status) return null;

  async function start() {
    if (busy || !status?.enabled || status.active) return;
    if (
      !window.confirm(
        `${gameName} 계정으로 접속할까요?\n\n이후 게임 행동은 대상 유저의 실제 데이터에 저장됩니다.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/impersonation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          ERROR_LABEL[body?.error ?? ""] ?? `HTTP ${response.status}`,
        );
      }
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "계정 가장 시작 실패");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-rose-300 bg-rose-50/60 p-3 dark:border-rose-900 dark:bg-rose-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-rose-800 dark:text-rose-200">
            유저 계정으로 접속
          </h2>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            게임 API가 이 유저로 동작합니다. 사냥·제작·거래·길드 행동 등은
            실제 진행에 저장됩니다.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || !status.enabled || status.active != null}
          onClick={() => void start()}
          className="rounded border border-rose-700 bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500 dark:bg-rose-600"
        >
          {busy ? "접속 중…" : "이 유저로 접속"}
        </button>
      </div>
      {!status.enabled ? (
        <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
          현재 환경에서 비활성화됨 · 스테이징은 자동 활성, 운영은 환경변수 2개 필요
        </div>
      ) : status.active ? (
        <div className="mt-2 text-[11px] text-rose-700 dark:text-rose-300">
          현재 {status.active.gameName?.trim() || status.active.targetUserId} 계정을 조작 중입니다.
        </div>
      ) : null}
      {error ? (
        <div className="mt-2 text-xs text-rose-700 dark:text-rose-300">{error}</div>
      ) : null}
    </section>
  );
}
