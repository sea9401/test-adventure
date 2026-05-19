"use client";

// 자동 사냥(타이머형 6시간 원정) 클라이언트 hook.
//
// dispatch → 서버가 huntBaselineAt=now 박음 (region/hp 는 서버가 map.v2/character.v2 에서 읽음).
// 6시간 카운트다운 후 collect → 서버가 simMs=min(경과,6시간) 만큼 sim·적용·종료 → 결과를
// sessionStorage 에 박고 reload (SaveProvider fresh hydrate + page.tsx 마운트 핸들러가 모달).
// 새로고침해도 mount 시 GET /api/hunt/status 로 카운트다운 복원.
//
// 알림: dispatch 응답/status 응답에 huntPredictedDeathAt 동봉 — 사망 예측 시각과 완료 시각에
// setTimeout 으로 notifyHunt 발화. 토글 OFF / 권한 없음이면 발화 안 함 (notifyHunt 가 자체 가드).
//
// 라이브 "사냥 시작"(BattleView 화면 안 자동 전투)과 별개 — 그쪽은 page.tsx 의 useState.

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  AUTO_HUNT_DURATION_MS,
  AUTO_HUNT_RESULT_KEY,
} from "@/adventure/battle/autoHunt";
import type { OfflineSimResult } from "@/adventure/battle/offlineSim";
import type { AutoPotionConfig } from "@/adventure/inventory/useAutoPotionConfig";
import { readDeviceSessionId } from "@/lib/storage/deviceSession";
import { clearHuntNotif, notifyHunt } from "@/lib/huntNotify";

// 자동 사냥 fetch 공통 헤더 — 단일 세션 enforce 토큰을 동봉해 다른 디바이스의 collect 가
// 이 디바이스 화면에 stale 결과를 떠넘기지 않게 한다. checkSession 이 헤더 미동봉이면
// 통과시켜서, 헤더를 안 보내던 기존엔 멀티 디바이스 collect 가 무방비였다.
function huntHeaders(): Record<string, string> {
  const sid = readDeviceSessionId();
  return sid
    ? { "content-type": "application/json", "X-Session-Id": sid }
    : { "content-type": "application/json" };
}

type StatusResponse =
  | {
      active: true;
      startedAt: string;
      regionId: string;
      durationMs: number;
      predictedDeathAt: string | null;
    }
  | { active: false };

type DispatchResponse =
  | {
      ok: true;
      startedAt: string;
      regionId: string;
      durationMs: number;
      predictedDeathAt: string | null;
    }
  | { ok: false; reason: string };

type CollectResponse =
  | { ok: true; noop: true; reason: string }
  | {
      ok: true;
      replayed?: true;
      hadReward: boolean;
      result: OfflineSimResult;
      died: boolean;
      simMs: number;
      /** 서버가 수령 시 active→ready 로 전환한 의뢰 ID. replay 응답엔 없음. */
      readyQuestIds?: string[];
      /** 서버가 수령 시 신규 grant 한 칭호 ID. replay 응답엔 없음. */
      grantedTitleIds?: string[];
    };

export type AutoHuntState = "idle" | "active" | "complete";

export type AutoHuntHook = {
  /** "idle" = 안 보냄, "active" = 진행 중(6시간 안 지남), "complete" = 6시간 경과(수령 대기). */
  state: AutoHuntState;
  /** 위탁 진행 중 여부 (다른 곳에서 라이브 전투·보스 등 잠금 판정용). */
  isDispatched: boolean;
  /** 시작 시각 ms — 위탁 중이면 숫자, 아니면 null. */
  startedAtMs: number | null;
  /** 한 사이클 길이 ms. */
  durationMs: number;
  /** 남은 ms — active 면 양수, complete/idle 이면 0. */
  remainingMs: number;
  /** 위탁 사냥 지역 id — 위탁 중이면 문자열, 아니면 null. */
  regionId: string | null;
  /** 진행 중인 요청 있음 — 버튼 비활성화용. */
  busy: boolean;
  /** 보내기 — region 은 서버가 map.v2 에서 읽음. 실패 시 reason. */
  dispatch: () => Promise<{ ok: boolean; reason?: string }>;
  /** 수령 (조기 수령 겸용). 결과 있으면 reload. noop 이면 상태만 갱신. */
  collect: (playerName?: string) => Promise<void>;
};

export function useAutoHunt(opts?: {
  /** 디바이스별 자동 포션 룰 — collect 시 서버 sim 에 전달 (서버에 동기화 안 됨). */
  getAutoPotionRules?: () => AutoPotionConfig["rules"];
  /** collect 가 네트워크/HTTP 실패로 빈손 리턴할 때 호출 — 토스트 노출용. */
  onCollectError?: (message: string) => void;
}): AutoHuntHook {
  const { data: session, status } = useSession();
  const authLoaded = status !== "loading";
  const userId = session?.user?.id;
  const getRulesRef = useRef(opts?.getAutoPotionRules);
  const onCollectErrorRef = useRef(opts?.onCollectError);
  useEffect(() => {
    getRulesRef.current = opts?.getAutoPotionRules;
    onCollectErrorRef.current = opts?.onCollectError;
  });
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [predictedDeathAtMs, setPredictedDeathAtMs] = useState<number | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // 마운트 시 서버 상태 동기화 — 새로고침해도 카운트다운 복원.
  useEffect(() => {
    if (!authLoaded || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hunt/status", {
          headers: huntHeaders(),
        });
        // 410 = 단일 세션 invalidated. 화면 상태 박지 않고 조용히 패스 — SaveProvider 가
        // 다른 PATCH 경로에서 invalidated 를 감지해 사인아웃 화면을 띄워주는 흐름에 위탁.
        if (!res.ok) return;
        const data = (await res.json()) as StatusResponse;
        if (cancelled) return;
        if (data.active) {
          setStartedAtMs(new Date(data.startedAt).getTime());
          setRegionId(data.regionId || null);
          setPredictedDeathAtMs(
            data.predictedDeathAt
              ? new Date(data.predictedDeathAt).getTime()
              : null,
          );
          setNow(Date.now());
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoaded, userId]);

  // 위탁 중 1초마다 now 갱신 → 카운트다운 표시.
  useEffect(() => {
    if (startedAtMs === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAtMs]);

  // 사망 예측 시각 / 완료 시각에 알림 발화. 이미 지난 시각은 등록 안 함 (새로고침 시 폭격 방지).
  // notifyHunt 가 토글/권한 자체 가드 — hook 은 항상 등록만 해두고 발화 시점에 결정.
  useEffect(() => {
    if (startedAtMs === null) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const nowMs = Date.now();
    if (predictedDeathAtMs !== null && predictedDeathAtMs > nowMs) {
      timers.push(
        setTimeout(() => {
          notifyHunt("death", "위탁 도중 캐릭터가 쓰러졌습니다 — 결과를 확인하세요.");
        }, predictedDeathAtMs - nowMs),
      );
    }
    const completeAtMs = startedAtMs + AUTO_HUNT_DURATION_MS;
    if (completeAtMs > nowMs) {
      timers.push(
        setTimeout(() => {
          notifyHunt("complete", "6시간 원정이 끝났습니다 — 보상을 수령하세요.");
        }, completeAtMs - nowMs),
      );
    }
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [startedAtMs, predictedDeathAtMs]);

  const dispatch = useCallback(async (): Promise<{
    ok: boolean;
    reason?: string;
  }> => {
    if (busyRef.current) return { ok: false, reason: "busy" };
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/hunt/dispatch", {
        method: "POST",
        headers: huntHeaders(),
        body: JSON.stringify({
          // pre-sim 정확도 위해 디바이스 자동 포션 룰을 함께 보냄.
          autoPotionRules: getRulesRef.current?.() ?? [],
        }),
      });
      if (!res.ok) return { ok: false, reason: "http" };
      const data = (await res.json()) as DispatchResponse;
      if (data.ok) {
        setStartedAtMs(new Date(data.startedAt).getTime());
        setRegionId(data.regionId || null);
        setPredictedDeathAtMs(
          data.predictedDeathAt
            ? new Date(data.predictedDeathAt).getTime()
            : null,
        );
        setNow(Date.now());
        return { ok: true };
      }
      return { ok: false, reason: data.reason };
    } catch {
      return { ok: false, reason: "network" };
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const collect = useCallback(async (playerName?: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/hunt/collect", {
        method: "POST",
        headers: huntHeaders(),
        body: JSON.stringify({
          playerName,
          autoPotionRules: getRulesRef.current?.() ?? [],
        }),
      });
      if (res.status === 401 || res.status === 410) {
        // 410 = 다른 디바이스가 세션 claim 함. 사용자가 받기를 눌렀는데 침묵하면 또 누른다 —
        // 토스트로 사유 안내. 데이터는 SaveProvider 의 다음 PATCH 경로에서 invalidated 가
        // 감지돼 사인아웃 화면으로 가는 흐름에 위탁. 여기선 UI 만 정리.
        if (res.status === 410) {
          onCollectErrorRef.current?.(
            "다른 기기에서 접속이 감지됐어요 — 새로고침 후 다시 시도해 주세요.",
          );
        }
        return;
      }
      if (!res.ok) {
        // 서버 5xx 등 — 그대로 끝내면 버튼이 다시 활성화되는데 사용자엔 아무 신호가
        // 없다. 토스트로 안내 (서버는 lastClaimResult 로 다음 시도에서 replay 가능).
        onCollectErrorRef.current?.(
          `위탁 결과 수령 실패 (HTTP ${res.status}) — 잠시 후 다시 시도해 주세요.`,
        );
        return;
      }
      const data = (await res.json()) as CollectResponse;
      if ("noop" in data) {
        // too_soon 외에는 위탁이 이미 해제된 상태 — 카운트다운 클리어.
        if (data.reason !== "too_soon") {
          setStartedAtMs(null);
          setRegionId(null);
          setPredictedDeathAtMs(null);
          clearHuntNotif();
        }
        return;
      }
      // 결과 있음 — sessionStorage 박고 reload. replayed 플래그도 같이 박아 reload 후
      // useAutoHuntResultHandler 가 토스트 처리만 하고 KV mutation 은 건너뛰게 한다.
      // 서버가 이미 adventure-log.v2 / quest-progress.v2 / first_blood 칭호를 누적해 둠 —
      // 클라가 추가로 mutate 하면 중복 가산이라 fresh/replay 둘 다 서버 권위.
      try {
        sessionStorage.setItem(
          AUTO_HUNT_RESULT_KEY,
          JSON.stringify({
            result: data.result,
            replayed: data.replayed === true,
            readyQuestIds: data.readyQuestIds ?? [],
            grantedTitleIds: data.grantedTitleIds ?? [],
          }),
        );
      } catch {}
      clearHuntNotif();
      window.location.reload();
    } catch {
      // 네트워크 실패 — 토스트로 안내.
      onCollectErrorRef.current?.(
        "위탁 결과 수령 실패 — 통신 오류. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const elapsed = startedAtMs !== null ? Math.max(0, now - startedAtMs) : 0;
  const remainingMs =
    startedAtMs !== null ? Math.max(0, AUTO_HUNT_DURATION_MS - elapsed) : 0;
  const state: AutoHuntState =
    startedAtMs === null ? "idle" : remainingMs > 0 ? "active" : "complete";

  return {
    state,
    isDispatched: startedAtMs !== null,
    startedAtMs,
    durationMs: AUTO_HUNT_DURATION_MS,
    remainingMs,
    regionId,
    busy,
    dispatch,
    collect,
  };
}
