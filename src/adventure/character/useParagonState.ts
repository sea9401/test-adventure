import { useCallback, useState } from "react";
import { useSavedValue } from "@/lib/storage/SaveProvider";
import { useRemotePatch } from "@/lib/storage/useRemotePatch";
import {
  addParagonExp as addParagonExpPure,
  initialParagonState,
  pointsFromExp,
  PARAGON_TRACK_CAP,
  PARAGON_TRACKS,
  readInitialParagon,
  type ParagonState,
  type ParagonTrackKey,
} from "@/lib/paragon";

/**
 * 파라곤 상태 영속화 hook — 100레벨 도달 후 캡된 EXP 를 적립 + 트랙 할당.
 *
 * page.tsx 가 useCharacterState 의 `onParagonOverflow` 와 짝지어 주입:
 *   const paragon = useParagonState();
 *   const characterStateHook = useCharacterState({
 *     onParagonOverflow: paragon.addParagonExp,
 *   });
 */
export function useParagonState() {
  const initial = useSavedValue("paragon.v1");
  const [state, setState] = useState<ParagonState>(() =>
    readInitialParagon(initial),
  );
  useRemotePatch("paragon.v1", state);

  const addParagonExp = useCallback((gain: number) => {
    if (!Number.isFinite(gain) || gain <= 0) return;
    setState((prev) => addParagonExpPure(prev, gain));
  }, []);

  /**
   * 할당 맵 전체 교체. UI 의 draft 모드가 "확정" 시 호출.
   * 입력 정규화: 트랙당 ≤ PARAGON_TRACK_CAP, 합계 ≤ pointsFromExp(paragonExp). 음수는 무시.
   * 보유 포인트보다 큰 할당이면 commit 자체를 거절 (false 반환).
   */
  const setAllocations = useCallback(
    (next: Partial<Record<ParagonTrackKey, number>>): boolean => {
      const cleaned: Partial<Record<ParagonTrackKey, number>> = {};
      let total = 0;
      for (const k of PARAGON_TRACKS) {
        const raw = next[k];
        if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) continue;
        const v = Math.min(PARAGON_TRACK_CAP, Math.floor(raw));
        if (v <= 0) continue;
        cleaned[k] = v;
        total += v;
      }
      let ok = true;
      setState((prev) => {
        const available = pointsFromExp(prev.paragonExp);
        if (total > available) {
          ok = false;
          return prev;
        }
        return { ...prev, allocations: cleaned };
      });
      return ok;
    },
    [],
  );

  /** 전체 리스펙 — 할당만 비우고 EXP 는 유지. 호출 측이 별빛 조각 소비 책임. */
  const respec = useCallback(() => {
    setState((prev) => ({ ...prev, allocations: {} }));
  }, []);

  const reset = useCallback(() => {
    setState(initialParagonState);
  }, []);

  // 서버 권위 액션(/api/quests/claim) 응답으로 받은 paragon.v1 통째 교체.
  const replaceFromSaved = useCallback((raw: unknown) => {
    setState(readInitialParagon(raw));
  }, []);

  return {
    state,
    addParagonExp,
    setAllocations,
    respec,
    reset,
    replaceFromSaved,
  };
}
