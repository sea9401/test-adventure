"use client";

import { useMemo } from "react";
import {
  BattleScene,
  type BattlePlayerStatus,
} from "@/adventure/battle/BattleScene";
import type { BattleState } from "@/adventure/battle/engine";
import {
  buildBattleStateFromReplay,
  type ReplayPayload,
} from "@/adventure/data/v2/replayPayload";
import type { Gender } from "@/adventure/profile/avatars";

// v2 던전 사냥 결과 — 라이브 BattleScene 으로 한 컷 표시.
// 옛 step-through(한 줄씩 노출) 폐기. 모든 log 즉시 (사용자 요청).

export function ReplayBattleScene({
  payload,
  startPlayerHp,
  playerName,
  gender,
  exp,
  maxExp,
}: {
  payload: ReplayPayload;
  // 사냥 시작 시점 playerHp — 사전 hp 회복 적용 후. 없으면 playerMaxHp.
  startPlayerHp?: number;
  playerName: string;
  gender: Gender;
  exp: number;
  maxExp: number;
}) {
  const derivedState = useMemo<BattleState>(() => {
    // finalState — 마지막 hp_bar entry 의 HP 가 최종.
    let playerHp = startPlayerHp ?? payload.playerMaxHp;
    let enemyHp = payload.enemy.hp;
    for (const e of payload.log) {
      if (e.kind === "hp_bar") {
        playerHp = e.playerHp;
        enemyHp = e.enemyHp;
      }
    }
    return buildBattleStateFromReplay(payload, playerHp, enemyHp);
  }, [payload, startPlayerHp]);

  const playerStatus: BattlePlayerStatus = {
    gender,
    exp,
    maxExp: maxExp > 0 ? maxExp : exp + 1, // div-by-zero 회피 (만렙)
    hpPotionCount: 0,
  };

  return (
    <BattleScene
      state={derivedState}
      playerName={playerName}
      playerStatus={playerStatus}
    />
  );
}
