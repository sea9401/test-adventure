"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// 새 배포 감지 → 보고 있으면 "새 버전 — 새로고침" 토스트, 안 보고 있으면(탭 숨김) 조용히 자동 reload.
//
// 로드한 빌드(NEXT_PUBLIC_BUILD_ID, 빌드 시점에 인라인)와 /api/version 의 현재 배포 buildId 를
// 비교 — 다르면 그 사이 새 배포가 떴다는 뜻. 마운트 직후 + 탭이 다시 보일 때(visibilitychange/
// focus) + 주기적으로(5분) 검사. 로컬/CLI 빌드(둘 다 "dev")는 비교 무의미 → 건너뜀.
//
// 자동 reload 정책: 탭이 visible 일 땐 토스트만(전투/입력 중 갑자기 reload 하면 곤란) — 사용자가
// 누르거나 탭을 벗어나면 처리. 탭이 hidden 이면 즉시 reload (안 보는 동안 새 빌드로 갈아끼움).
// 이 게임은 자동사냥 등으로 탭을 오래 켜둬서, 구버전 탭으로 동작하다 깨지는(ChunkLoadError /
// 서버액션 불일치) 게 "서버 멈춤"으로 보이는 핵심 원인. 돌아오기 전에 미리 갈아끼워 그걸 막는다.
// 캐릭터 진행은 서버 자동저장이라 reload 자체는 안전. (반응형 백스톱은 staleBuild.ts 참고.)

const LOADED_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const POLL_INTERVAL_MS = 5 * 60 * 1000;

export function VersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  // onHide 핸들러는 deps [check] 인 effect 안에 있어 최신 state 를 못 본다 — ref 로 미러링.
  const updateAvailableRef = useRef(false);
  useEffect(() => {
    updateAvailableRef.current = updateAvailable;
  }, [updateAvailable]);

  const check = useCallback(async () => {
    if (LOADED_BUILD_ID === "dev") return;
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { buildId?: string };
      if (
        data.buildId &&
        data.buildId !== "dev" &&
        data.buildId !== LOADED_BUILD_ID
      ) {
        // 탭이 숨겨져 있으면(유저가 안 보는 동안) 토스트 띄울 것 없이 바로 갈아끼운다.
        if (document.visibilityState === "hidden") {
          window.location.reload();
          return;
        }
        setUpdateAvailable(true);
      }
    } catch {
      // 일시적 실패 — 다음 검사에서 재시도.
    }
  }, []);

  useEffect(() => {
    if (LOADED_BUILD_ID === "dev") return;
    // check() 는 비동기 fetch 후 외부(배포된 버전)에 따라 setState — 동기 cascade 아님.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check();
    const id = setInterval(() => void check(), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    // 새 버전을 이미 감지한(updateAvailable) 채로 탭을 벗어나면 그 순간 조용히 reload.
    // visible 동안엔 토스트로 두다가, 자리를 비우는 즉시 새 빌드로 갈아끼우는 것.
    const onHide = () => {
      if (document.visibilityState === "hidden" && updateAvailableRef.current) {
        window.location.reload();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("focus", onVisible);
    };
  }, [check]);

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full border border-emerald-700/40 bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
      <span>새 버전이 나왔습니다.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-full border border-white/40 bg-white/15 px-3 py-0.5 text-xs font-semibold transition-colors hover:bg-white/25"
      >
        새로고침
      </button>
    </div>
  );
}
