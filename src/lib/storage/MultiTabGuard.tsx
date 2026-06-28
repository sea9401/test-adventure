"use client";

import { useEffect, useRef, useState } from "react";

// 같은 브라우저 안에서 게임이 여러 탭에 열린 경우 — 기본은 가장 오래된 탭만 활성.
// 단, 새 탭에서 "이 탭에서 계속하기"를 누르면 기존 활성 탭을 차단하고 새 탭이 활성권을 가져온다.
// BroadcastChannel API 로 탭 간 통신. 다른 디바이스/브라우저는 이걸로 못 잡음 (그쪽은
// DB 사이드 stale 가드 + presence heartbeat 으로 별도 처리).
//
// 프로토콜:
//   1. 마운트 시 sessionId (timestamp prefix + random suffix) 생성, "claim" 브로드캐스트.
//   2. 다른 탭의 "claim" 수신 시:
//      - 그쪽 id 가 우리보다 작으면 (= 더 오래됨) → 우리가 newer → 모달.
//      - 그쪽 id 가 우리보다 크면 (= 더 새로움) → 우리 claim 재방송 (그쪽이 우리를 알도록).
//   3. "takeover" 수신 시 기존 탭은 replaced 모달로 차단되고, 요청 탭은 claim 을 재방송.
//   4. pagehide / unmount 시 "bye" 브로드캐스트.
//   5. blocked 상태에서 "bye" 수신 → re-claim 사이클 (다른 활성 탭이 또 있을 수 있음).

const CHANNEL_NAME = "adventure-game-session";

type ClaimMsg = { type: "claim"; id: string };
type ByeMsg = { type: "bye"; id: string };
type TakeoverMsg = { type: "takeover"; id: string };
type Msg = ClaimMsg | ByeMsg | TakeoverMsg;
type GuardState = "active" | "duplicate" | "replaced";

function makeSessionId(): string {
  // timestamp 13 자리 zero-pad → 사전식 비교가 곧 시간순 비교.
  const ts = Date.now().toString().padStart(13, "0");
  const rand = Math.random().toString(36).slice(2, 10);
  return `${ts}-${rand}`;
}

export function useMultiTabGuard() {
  const [state, setState] = useState<GuardState>("active");
  const takeoverRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const sessionId = makeSessionId();
    const channel = new BroadcastChannel(CHANNEL_NAME);
    let blocked = false;
    let replaced = false;

    const broadcast = (msg: Msg) => {
      try {
        channel.postMessage(msg);
      } catch {
        // 채널이 닫혔거나 오류 — 무시.
      }
    };

    takeoverRef.current = () => {
      blocked = false;
      replaced = false;
      setState("active");
      broadcast({ type: "takeover", id: sessionId });
      // takeover 를 처리한 기존 탭들이 더 이상 claim 에 응답하지 않도록 한 tick 뒤 재선언.
      window.setTimeout(() => broadcast({ type: "claim", id: sessionId }), 0);
    };

    const handler = (event: MessageEvent) => {
      const data = event.data as Msg | undefined;
      if (!data || typeof data !== "object") return;
      if (data.type === "claim") {
        if (data.id === sessionId) return;
        if (replaced) return;
        if (data.id < sessionId) {
          // 그쪽이 더 오래됨 → 우리가 duplicate.
          if (!blocked) {
            blocked = true;
            setState("duplicate");
          }
        } else if (!blocked) {
          // 우리가 더 오래됨 → 우리 존재를 그쪽에게 알림.
          broadcast({ type: "claim", id: sessionId });
        }
      } else if (data.type === "takeover") {
        if (data.id === sessionId || replaced) return;
        // 다른 탭이 활성권을 가져감. 이 탭은 더 이상 claim 에 응답하지 않고 화면만 차단한다.
        replaced = true;
        blocked = true;
        setState("replaced");
      } else if (data.type === "bye") {
        if (blocked && !replaced) {
          // 누군가 떠남 — 이 탭의 메모리 state 가 차단된 동안 다른 탭에 의해 stale 해졌을 수
          // 있다. 재협상 대신 reload 해 서버 최신 데이터로 새로 시작. reload 후 마운트에서
          // 새 claim 을 브로드캐스트하므로 다른 활성 탭이 있으면 자동으로 다시 blocked 됨.
          window.location.reload();
        }
      }
    };

    channel.addEventListener("message", handler);
    broadcast({ type: "claim", id: sessionId });

    const onPageHide = () => broadcast({ type: "bye", id: sessionId });
    window.addEventListener("pagehide", onPageHide);

    return () => {
      channel.removeEventListener("message", handler);
      window.removeEventListener("pagehide", onPageHide);
      takeoverRef.current = () => {};
      broadcast({ type: "bye", id: sessionId });
      channel.close();
    };
  }, []);

  return { state, takeover: () => takeoverRef.current() };
}

export function MultiTabOverlay() {
  const { state, takeover } = useMultiTabGuard();
  if (state === "active") return null;
  const isReplaced = state === "replaced";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-6">
      <div className="max-w-sm rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {isReplaced
            ? "다른 탭에서 이어서 진행 중입니다"
            : "다른 탭에서 게임이 열려 있습니다"}
        </div>
        <div className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {isReplaced ? (
            <>
              이 탭은 데이터 충돌을 막기 위해 중지됐습니다.
              <br />현재 열려 있는 다른 탭에서 계속 플레이하세요.
            </>
          ) : (
            <>
              데이터 충돌을 막기 위해 한 번에 한 탭에서만 진행할 수 있습니다.
              <br />기존 탭을 찾기 어렵다면 이 탭으로 진행을 가져올 수 있습니다.
            </>
          )}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {!isReplaced && (
            <button
              type="button"
              onClick={takeover}
              className="rounded-md border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              이 탭에서 계속하기
            </button>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            다시 확인
          </button>
        </div>
      </div>
    </div>
  );
}
