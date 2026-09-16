"use client";

import { useEffect, useRef, useState } from "react";
import { confirmGameAction } from "@/components/ui/gameDialog";
import { applyCoopBulkSettings, type CoopBulkSettings } from "./coopBulkSettings";
import type { CoopSessionSummary } from "./useCoopBossState";

export function useCoopManagement({ sessions, refresh, busy: externalBusy }: {
  sessions: CoopSessionSummary[];
  refresh: () => Promise<unknown>;
  busy: boolean;
}) {
  const [autoFreeSupport, setAutoFreeSupport] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const operation = useRef(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/v2/coop/preferences");
        const body = await response.json();
        if (!response.ok || !body.ok || typeof body.autoFreeSupport !== "boolean") {
          throw new Error("preferences");
        }
        if (cancelled) return;
        setAutoFreeSupport(body.autoFreeSupport);
        setReady(true);
      } catch {
        if (cancelled) return;
        setNotice("자동 무료 지원 설정을 불러오지 못했습니다. 다시 시도하세요.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [loadAttempt]);

  const reload = () => {
    setLoading(true);
    setNotice(null);
    setLoadAttempt((attempt) => attempt + 1);
  };

  const saveAutoFreeSupport = async (allowed: boolean) => {
    if (operation.current || externalBusy || !ready) return;
    operation.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/v2/coop/preferences", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ autoFreeSupport: allowed }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok || typeof body.autoFreeSupport !== "boolean") {
        throw new Error("preferences");
      }
      setAutoFreeSupport(body.autoFreeSupport);
      setNotice("자동 무료 지원 설정을 저장했습니다. 다음 소환부터 적용됩니다.");
    } catch {
      setNotice("자동 무료 지원 설정을 저장하지 못했습니다. 다시 시도하세요.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };

  const applyBulk = async (settings: CoopBulkSettings) => {
    if (operation.current || externalBusy) return;
    operation.current = true;
    setBusy(true);
    setNotice(null);
    try {
      if (settings.visibility === "public" && !await confirmGameAction(
        "내 보스들을 전체 공개할까요? 전체 공개한 보스는 나만 또는 길드원만으로 되돌릴 수 없습니다.",
      )) return;
      const result = await applyCoopBulkSettings(sessions, settings);
      setNotice(
        `설정 ${result.applied}건 적용 · ${result.skipped}건 건너뜀 · ${result.failed}건 실패.` +
        (result.skipped ? " 종료된 보스 또는 전체 공개 범위 축소는 건너뛰었습니다." : "") +
        (result.failed ? " 목록을 확인한 뒤 실패한 설정을 다시 적용하세요." : "") +
        (result.guildFallback ? " 소속 길드가 없어 길드원만 설정은 나만으로 적용했습니다." : ""),
      );
      await refresh();
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };

  return { autoFreeSupport, ready, loading, busy, notice, reload, saveAutoFreeSupport, applyBulk };
}
