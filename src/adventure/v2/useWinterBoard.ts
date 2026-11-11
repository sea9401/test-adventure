"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WinterBoardView,
  WinterRollResult,
} from "@/adventure/data/v2/winterBoard";
import { useRefreshGameState } from "./GameStateRefreshContext";
import { setWinterBoardReminder } from "./useWinterBoardReminder";

const API = "/api/v2/events/winter-board";

const ERRORS: Record<string, string> = {
  unauthorized: "로그인이 필요합니다.",
  no_character: "캐릭터를 만든 뒤 참여할 수 있습니다.",
  event_ended: "겨울 이벤트가 끝났습니다.",
  rolling_closed: "주사위 굴리기 기간이 끝났습니다.",
  no_dice: "굴릴 주사위가 없습니다.",
  milestone_locked: "아직 바퀴 수가 모자랍니다.",
  already_claimed: "이미 받은 보상입니다.",
  not_enough_coins: "겨울 주화가 모자랍니다.",
  limit_reached: "교환 한도를 모두 채웠습니다.",
};

export type WinterBoardBusy =
  | "roll"
  | "roll_all"
  | `claim:${number}`
  | `buy:${string}`
  | null;

type Notice = { tone: "error" | "success"; text: string };

export function useWinterBoard() {
  const refreshGameState = useRefreshGameState();
  const [view, setView] = useState<WinterBoardView | null>(null);
  const [busy, setBusy] = useState<WinterBoardBusy>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [lastResult, setLastResult] = useState<WinterRollResult | null>(null);
  const inFlight = useRef(false);
  // 응답을 못 받은 굴리기는 같은 식별자로 다시 보내 한 번만 반영되게 한다.
  const rollRequestId = useRef<string | null>(null);

  const apply = useCallback((next: WinterBoardView) => {
    setView(next);
    setWinterBoardReminder(next.pending);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch(API, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? "load_failed");
      apply(body as WinterBoardView);
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : "load_failed";
      setNotice({
        tone: "error",
        text: ERRORS[error] ?? "이벤트 정보를 불러오지 못했습니다. 다시 시도해 주세요.",
      });
    }
  }, [apply]);

  useEffect(() => {
    // 비동기 응답 뒤 상태를 갱신하므로 동기 effect setState가 아니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const perform = useCallback(
    async (
      key: Exclude<WinterBoardBusy, null>,
      payload: Record<string, unknown>,
      onSuccess: (body: Record<string, unknown>) => Notice | null,
    ) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(key);
      setNotice(null);
      const post = () =>
        fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      try {
        let response: Response;
        try {
          response = await post();
        } catch {
          response = await post();
        }
        const body = await response.json();
        if (response.status < 500) rollRequestId.current = null;
        if (!response.ok || !body?.ok) throw new Error(body?.error ?? "action_failed");
        apply(body as WinterBoardView);
        setNotice(onSuccess(body as Record<string, unknown>));
        // 회복약·칭호 표시 갱신이 실패해도 이미 반영된 보상을 실패로 바꾸지 않는다.
        await refreshGameState().catch(() => {});
      } catch (caught) {
        const error = caught instanceof Error ? caught.message : "action_failed";
        setNotice({
          tone: "error",
          text: ERRORS[error] ?? "요청 결과를 확인하지 못했습니다. 다시 눌러 확인해 주세요.",
        });
        await load();
      } finally {
        inFlight.current = false;
        setBusy(null);
      }
    },
    [apply, load, refreshGameState],
  );

  const roll = useCallback(
    (all: boolean) => {
      rollRequestId.current ??= globalThis.crypto.randomUUID();
      return perform(
        all ? "roll_all" : "roll",
        { action: "roll", requestId: rollRequestId.current, all },
        (body) => {
          setLastResult(body.result as WinterRollResult);
          return null;
        },
      );
    },
    [perform],
  );

  const claim = useCallback(
    (laps: number) =>
      perform(`claim:${laps}`, { action: "claim_milestone", laps }, () => ({
        tone: "success",
        text: `${laps}바퀴 보상을 받았습니다.`,
      })),
    [perform],
  );

  const buy = useCallback(
    (itemId: string) =>
      perform(`buy:${itemId}`, { action: "buy", itemId }, (body) => ({
        tone: "success",
        text: `${(body.item as { name: string }).name} 교환을 마쳤습니다.`,
      })),
    [perform],
  );

  return { view, busy, notice, lastResult, load, roll, claim, buy };
}
