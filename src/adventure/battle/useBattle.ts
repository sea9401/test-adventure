"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Monster } from "../data/monsters";
import type { PotionId } from "../data/potions";
import { applyStance, type StanceId } from "../character/stance";
import {
  resolveBattle,
  type BattleResolution,
  type BattleState,
  type PlayerAction,
  type PlayerCombat,
} from "./engine";

// 한 전투의 lifecycle. start(enemy)를 호출하면 즉시 끝까지 시뮬되어 final state로 들어간다.
// 화면 표현은 BattleScene이 final state(전체 로그 + final HP)을 한 번에 그린다.
// cooldown/다음 적 체이닝은 BattleView가 처리.
export function useBattle({
  player,
  playerName,
  pickAction,
  potions,
  stance,
}: {
  player: PlayerCombat;
  playerName: string;
  pickAction: (state: BattleState) => PlayerAction;
  potions: Partial<Record<PotionId, number>>;
  /** 선택한 전술 — 보스 전투(isBoss)에만 적용. 일반 사냥엔 무영향. */
  stance?: StanceId | null;
}) {
  const [state, setState] = useState<BattleState | null>(null);
  const [potionsConsumed, setPotionsConsumed] = useState<
    Partial<Record<PotionId, number>>
  >({});

  // 매 렌더 latest 값을 ref로 캡처 — start 콜백이 stale closure에 갇히지 않도록.
  // ref mutate 는 effect 안에서. start 는 사용자 인터랙션으로 호출되므로 그때는
  // 이미 effect 가 실행돼 ref 가 최신.
  const playerRef = useRef(player);
  const playerNameRef = useRef(playerName);
  const pickActionRef = useRef(pickAction);
  const potionsRef = useRef(potions);
  const stanceRef = useRef(stance);
  useEffect(() => {
    playerRef.current = player;
    playerNameRef.current = playerName;
    pickActionRef.current = pickAction;
    potionsRef.current = potions;
    stanceRef.current = stance;
  });

  // hpOverride — 직전 전투의 finalHp를 그대로 이어받을 때 사용 (setCharacterState 비동기 우회).
  // isBoss — 보스 도전 진입 시 true. BOSS_TURN_CAP(50턴) 도달 시 타임아웃 패배 처리.
  const start = useCallback(
    (enemy: Monster, hpOverride?: number, isBoss?: boolean) => {
      const base = playerRef.current;
      const withHp =
        hpOverride !== undefined ? { ...base, hp: hpOverride } : base;
      // 전술은 보스 전투에만 적용 — 일반 사냥(isBoss 아님)엔 보정 0.
      const p = isBoss ? applyStance(withHp, stanceRef.current) : withHp;
      const r: BattleResolution = resolveBattle(
        p,
        enemy,
        playerNameRef.current,
        {
          pickAction: pickActionRef.current,
          potions: potionsRef.current,
          isBoss,
        },
      );
      setState(r.finalState);
      setPotionsConsumed(r.potionsConsumed);
    },
    [],
  );

  const stop = useCallback(() => {
    setState(null);
    setPotionsConsumed({});
  }, []);

  return { state, potionsConsumed, start, stop };
}

// 한 턴(플레이어 행동 1회)당 누적되는 cooldown. 짧은 전투는 빠른 회전, 긴 전투는 사용자가 읽을 시간 확보.
// 로그 줄 수가 아니라 턴 수 기준 — 출혈/철벽/연타 같은 스킬 메시지가 늘어나도 페이싱은 안 흔들린다.
export const COOLDOWN_PER_TURN_MS = 500;
export const MIN_BATTLE_COOLDOWN_MS = 1500;
export const MAX_BATTLE_COOLDOWN_MS = 3000;

// 자동 사냥/오프라인 sim 에서 쿨다운 계산에 쓰는 턴 수 상한.
// 6턴 × 500ms = 3000ms → MAX 3000ms 와 동일 지점. 긴 전투는 다음 전투까지 최대 3초 대기.
export const BATTLE_TURN_CLAMP = 6;

export function computeBattleCooldown(turns: number): number {
  const raw = turns * COOLDOWN_PER_TURN_MS;
  return Math.max(MIN_BATTLE_COOLDOWN_MS, Math.min(MAX_BATTLE_COOLDOWN_MS, raw));
}
