"use client";

import { useMemo } from "react";
import {
  BattleScene,
  type BattlePlayerStatus,
  type BattleStats,
} from "@/adventure/battle/BattleScene";
import type { BattleState } from "@/adventure/v2/combat/engine";
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
  hpCharges,
  mpCharges,
  playerSubtitle,
  elementMatchup,
  playerCombat,
  outcome,
}: {
  payload: ReplayPayload;
  // 사냥 시작 시점 playerHp — 사전 hp 회복 적용 후. 없으면 playerMaxHp.
  startPlayerHp?: number;
  playerName: string;
  gender: Gender;
  exp: number;
  maxExp: number;
  // 충전식 회복약 잔량 (사냥 후 자동 소모 반영). 캐릭터 정보에 충전량으로 표기.
  hpCharges?: number;
  mpCharges?: number;
  // 플레이어 이름 아래 부제(레벨·직업·속성). BattleScene 으로 전달.
  playerSubtitle?: string;
  // 약점찌르기 강조 — 적 속성 뱃지 "약점!" (BattleScene 으로 전달).
  elementMatchup?: "advantage" | "disadvantage" | "neutral";
  // 플레이어 공/방/속(+상세) — 전투 패널 플레이어 칸에 적과 대칭 표기. BattleScene 으로 전달.
  playerCombat?: BattleStats;
  // 전투 결과(승/패) — BattleScene 상단 승패 배너용. 미전달 시 배너 미표시.
  outcome?: "win" | "lose";
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
    // v2 UI: "나타났다!" / "선공." 시작 entry 제거 — 사용자 의도로 노이즈 제거.
    // engine 자체는 그대로 (라이브 영향 0), 표시 단에서만 필터.
    const cleanedLog = payload.log.filter((e) => {
      if (e.kind !== "info") return true;
      const text = typeof e.text === "string" ? e.text : "";
      if (text.includes("나타났다")) return false;
      if (/의 선공\.?$/.test(text)) return false;
      return true;
    });
    return buildBattleStateFromReplay(
      { ...payload, log: cleanedLog },
      playerHp,
      enemyHp,
    );
  }, [payload, startPlayerHp]);

  const playerStatus: BattlePlayerStatus = {
    gender,
    exp,
    maxExp: maxExp > 0 ? maxExp : exp + 1, // div-by-zero 회피 (만렙)
    // v2 는 개수가 아닌 충전식 — recoveryCharges 로 충전량 표기. hpPotionCount 는 미사용.
    hpPotionCount: 0,
    recoveryCharges: { hp: hpCharges ?? 0, mp: mpCharges ?? 0 },
  };

  return (
    <BattleScene
      state={derivedState}
      playerName={playerName}
      playerStatus={playerStatus}
      layout="split"
      playerSubtitle={playerSubtitle}
      logAnchor="top"
      elementMatchup={elementMatchup}
      playerCombat={playerCombat}
      outcome={outcome}
    />
  );
}
