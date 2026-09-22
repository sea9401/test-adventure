"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChuseokAttackResult, ChuseokState } from "@/adventure/data/v2/chuseokEvent";
import { startAdaptiveVisiblePolling } from "@/lib/adaptiveVisiblePolling";
import { guildRaidPollDelayMs, sharedStateSnapshotKey } from "./sharedStatePolling";
import { useRefreshGameState } from "./GameStateRefreshContext";
import { setChuseokReminder } from "./useChuseokReminder";

const API = "/api/v2/events/chuseok";
const ERRORS: Record<string, string> = {
  event_pending: "이벤트 시작 전입니다.", event_ended: "추석 이벤트가 종료되었습니다.",
  no_character: "캐릭터를 만든 뒤 참여할 수 있습니다.", unauthorized: "로그인이 필요합니다.",
  already_claimed: "오늘 출석 보상은 이미 받았습니다.", attendance_complete: "7일 출석 보상을 모두 받았습니다.",
  daily_limit: "오늘 공격을 모두 마쳤습니다. 내일 다시 참여해 주세요.",
};

export function useChuseokEvent() {
  const refresh = useRefreshGameState();
  const [state, setState] = useState<ChuseokState | null>(null);
  const [busy, setBusy] = useState<"attendance" | "attack" | null>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [lastAttack, setLastAttack] = useState<ChuseokAttackResult | null>(null);
  const inFlight = useRef(false);
  const attackId = useRef<string | null>(null);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const response = await fetch(API, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error("load_failed");
      if (sequence === loadSequence.current) {
        setState(body as ChuseokState);
        setChuseokReminder(body as ChuseokState);
      }
      return sharedStateSnapshotKey(body);
    } catch {
      if (sequence === loadSequence.current) setNotice({ tone: "error", text: "이벤트 정보를 불러오지 못했습니다. 다시 시도해 주세요." });
    }
  }, []);

  useEffect(() => {
    let previous: string | undefined;
    return startAdaptiveVisiblePolling({
      task: async () => {
        if (inFlight.current) return "unchanged";
        const snapshot = await load();
        if (snapshot === undefined) return "failed";
        const changed = snapshot !== previous;
        previous = snapshot;
        return changed ? "changed" : "unchanged";
      }, delayMs: guildRaidPollDelayMs, runImmediately: true, refreshOnFocus: true,
    });
  }, [load]);

  const perform = useCallback(async (action: "attendance" | "attack") => {
    if (inFlight.current) return;
    inFlight.current = true;
    ++loadSequence.current;
    setBusy(action); setNotice(null);
    if (action === "attack") attackId.current ??= globalThis.crypto.randomUUID();
    const post = () => fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, requestId: action === "attack" ? attackId.current : undefined }) });
    try {
      let response: Response;
      try { response = await post(); } catch { response = await post(); }
      const body = await response.json();
      if (!response.ok || !body?.ok) {
        if (action === "attack" && response.status < 500) attackId.current = null;
        throw new Error(body?.error ?? "action_failed");
      }
      if (action === "attack") {
        attackId.current = null;
        setLastAttack(body as ChuseokAttackResult);
      } else {
        setNotice({ tone: "success", text: `스태미나 회복약 ${body.reward}개를 받았습니다.` });
      }
      // A HUD refresh failure must not turn a committed reward into a failed action.
      await refresh().catch(() => {});
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : "action_failed";
      setNotice({ tone: "error", text: ERRORS[error] ?? "요청 결과를 확인하지 못했습니다. 다시 눌러 확인해 주세요." });
    } finally {
      await load();
      inFlight.current = false; setBusy(null);
    }
  }, [load, refresh]);
  return { state, busy, notice, lastAttack, load, attend: () => perform("attendance"), attack: () => perform("attack") };
}
