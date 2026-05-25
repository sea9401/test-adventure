"use client";

import { useEffect, useMemo, useState } from "react";
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

// v2 던전 사냥 결과를 라이브 BattleScene 으로 재생.
// 서버가 trim 한 ReplayPayload 의 log 를 시간차로 step-through 노출.
// hp_bar entry 가 나오면 그 시점 HP 로 derived state 갱신.

const STEP_MS = 500;

export function ReplayBattleScene({
  payload,
  startPlayerHp,
  playerName,
  gender,
  exp,
  maxExp,
  onDone,
}: {
  payload: ReplayPayload;
  // 사냥 시작 시점 playerHp — 사전 hp 회복 적용 후. 없으면 playerMaxHp.
  startPlayerHp?: number;
  playerName: string;
  gender: Gender;
  exp: number;
  maxExp: number;
  onDone?: () => void;
}) {
  const totalEntries = payload.log.length;
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (idx >= totalEntries) {
      onDone?.();
      return;
    }
    const id = setTimeout(() => setIdx((i) => i + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [idx, totalEntries, onDone]);

  const derivedState = useMemo<BattleState>(() => {
    const sliced = payload.log.slice(0, idx);
    let playerHp = startPlayerHp ?? payload.playerMaxHp;
    let enemyHp = payload.enemy.hp;
    for (const e of sliced) {
      if (e.kind === "hp_bar") {
        playerHp = e.playerHp;
        enemyHp = e.enemyHp;
      }
    }
    return buildBattleStateFromReplay(
      { ...payload, log: sliced },
      playerHp,
      enemyHp,
    );
  }, [payload, startPlayerHp, idx]);

  const playerStatus: BattlePlayerStatus = {
    gender,
    exp,
    maxExp: maxExp > 0 ? maxExp : exp + 1, // div-by-zero 회피 (만렙 케이스)
    hpPotionCount: 0,
  };

  const done = idx >= totalEntries;

  return (
    <div className="space-y-2">
      <BattleScene
        state={derivedState}
        playerName={playerName}
        playerStatus={playerStatus}
      />
      {!done && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIdx(totalEntries)}
            className="rounded border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            건너뛰기
          </button>
        </div>
      )}
    </div>
  );
}
