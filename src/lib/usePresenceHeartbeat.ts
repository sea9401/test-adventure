"use client";

import { useEffect } from "react";
import { useRemoteSave } from "./storage/SaveProvider";
import { APP_BUILD_VERSION } from "./clientVersion";

const HEARTBEAT_INTERVAL_MS = 30_000;
// buildVersion 불일치 감지 후 reload 까지 대기 시간. PATCH 디바운스(500ms) +
// 네트워크 RTT + 안전 마진. 그 사이 status idle 이 관찰되면 즉시 reload.
const RELOAD_GRACE_MS = 2_000;

// 한 세션 안에서 단 한 번만 reload — 신호 받자마자 location.reload 가 일어나니
// race 로 여러 번 발화될 일은 없지만 방어용.
let reloadFired = false;

// 게임 접속 중 주기적으로 /api/presence 에 ping → presence.last_seen_at 갱신.
// 이름/직업/칭호가 바뀌면 다음 ping 에 새 값으로 upsert. 빈 이름/직업이면 ping 생략.
// 응답에 동봉된 buildVersion 이 baked-in 과 다르면 옛 JS → 강제 reload (=새 deploy
// 적용. 단일 세션 enforce 같은 클라이언트/서버 contract 변경 즉시 전파용).
//
// reload 안전 장치: pending PATCH (특히 sim 적용 직후 디바운스 중) 가 손실되지 않도록
// 1) RELOAD_GRACE_MS 만큼 기다리거나 status==idle 이 먼저 관찰되면 즉시 진행
// 2) reload 직전 flushSync 호출 — 큐 잔여물을 keepalive 로 발사
export function usePresenceHeartbeat({
  name,
  className,
  title,
}: {
  name: string;
  className: string;
  title?: string | null;
}) {
  const remote = useRemoteSave();

  useEffect(() => {
    if (!name || !className) return;
    let cancelled = false;

    const triggerReload = () => {
      if (reloadFired || typeof window === "undefined") return;
      reloadFired = true;

      const doReload = () => {
        try {
          localStorage.setItem(
            "pending-reload-toast.v1",
            "최신 버전으로 새로 불러왔습니다.",
          );
        } catch {}
        try {
          remote.flushSync();
        } catch {}
        window.location.reload();
      };

      // 큐가 즉시 idle 이면 PATCH 가 진행 중이거나 대기 중이지 않음 — 바로 reload.
      // 아니면 grace 만큼 기다려 PATCH 완료 기회 부여 + status idle 전환을 우선 캐치.
      if (remote.status().kind === "idle") {
        doReload();
        return;
      }
      let fired = false;
      const fire = () => {
        if (fired) return;
        fired = true;
        unsub();
        clearTimeout(timer);
        doReload();
      };
      const unsub = remote.subscribe((s) => {
        if (s.kind === "idle") fire();
      });
      const timer = setTimeout(fire, RELOAD_GRACE_MS);
    };

    const ping = async () => {
      try {
        const res = await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, className, title: title ?? null }),
          keepalive: true,
        });
        if (res.status === 410) {
          remote.invalidateSession();
          return;
        }
        if (cancelled || !res.ok) return;
        try {
          const body = (await res.json()) as {
            buildVersion?: string;
            sessionInvalidated?: boolean;
          };
          if (body.sessionInvalidated) {
            remote.invalidateSession();
            return;
          }
          if (
            typeof body.buildVersion === "string" &&
            body.buildVersion !== APP_BUILD_VERSION
          ) {
            triggerReload();
          }
        } catch {
          // 응답 본문이 옛 형식 (204) 일 수 있음 — ignore.
        }
      } catch {
        // 네트워크 오류는 다음 주기에 자동 재시도.
      }
    };
    ping();
    const id = setInterval(() => {
      if (!cancelled) ping();
    }, HEARTBEAT_INTERVAL_MS);
    // 백그라운드 모바일은 타이머가 멈출 수 있다. 다시 화면을 보는 순간 바로 검증한다.
    const onVisibilityChange = () => {
      if (!cancelled && document.visibilityState === "visible") void ping();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // remote 는 SaveProvider context — render 마다 새 reference 일 수 있어 의도적으로 deps 제외.
    // 같은 세션 안에서 remote instance 는 사실상 안정적.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, className, title]);
}
