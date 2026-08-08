"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BattleScene,
  type BattleOutcomeAction,
  type BattlePlayerStatus,
  type BattleStats,
} from "@/adventure/battle/BattleScene";
import type { BattleState } from "@/adventure/v2/combat/engine";
import {
  buildBattleStateFromReplay,
  type ReplayPayload,
} from "@/adventure/data/v2/replayPayload";
import type { Gender } from "@/adventure/profile/avatars";
import type { ProfileBorderId } from "@/adventure/data/v2/museunCosmetics";
import { Card } from "@/components/ui/Card";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";

// v2 던전 사냥 결과 — 라이브 BattleScene 으로 한 컷 표시.
// 옛 step-through(한 줄씩 노출) 폐기. 모든 log 즉시 (사용자 요청).

type ReplayBattleSceneProps = {
  payload: ReplayPayload;
  startPlayerHp?: number;
  playerName: string;
  gender: Gender;
  exp: number;
  maxExp: number;
  hpCharges?: number;
  mpCharges?: number;
  playerSubtitle?: string;
  playerCombat?: BattleStats;
  outcome?: "win" | "lose";
  outcomeAction?: BattleOutcomeAction;
  profileBorder?: ProfileBorderId | null;
};

export function ReplayBattleScene(props: ReplayBattleSceneProps) {
  const { payload } = props;
  const replayId = payload.log.length === 0 ? payload.replayId : undefined;
  const [loaded, setLoaded] = useState<ReplayPayload | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!replayId) return;
    const controller = new AbortController();
    void fetch(`/api/v2/battle-replays/${encodeURIComponent(replayId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          ok?: boolean;
          replay?: ReplayPayload;
        } | null;
        if (!response.ok || !body?.ok || !body.replay) {
          throw new Error("battle_replay_load_failed");
        }
        setLoaded({ ...body.replay, replayId });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFailedId(replayId);
      });
    return () => controller.abort();
  }, [replayId, retry]);

  const resolved = replayId
    ? loaded?.replayId === replayId
      ? loaded
      : null
    : payload;
  if (!resolved) {
    if (failedId === replayId) {
      return (
        <LoadErrorBanner
          message="전체 전투 로그를 불러오지 못했습니다."
          onRetry={() => {
            setFailedId(null);
            setRetry((value) => value + 1);
          }}
        />
      );
    }
    return (
      <Card padding="md" aria-live="polite">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          전체 전투 로그를 불러오는 중…
        </p>
      </Card>
    );
  }

  return <ResolvedReplayBattleScene {...props} payload={resolved} />;
}

function ResolvedReplayBattleScene({
  payload,
  startPlayerHp,
  playerName,
  gender,
  exp,
  maxExp,
  hpCharges,
  mpCharges,
  playerSubtitle,
  playerCombat,
  outcome,
  outcomeAction,
  profileBorder,
}: ReplayBattleSceneProps) {
  // 사냥 시작 시점 playerHp — 사전 hp 회복 적용 후. 없으면 playerMaxHp.
  // 충전식 회복약 잔량 (사냥 후 자동 소모 반영). 캐릭터 정보에 충전량으로 표기.
  // 플레이어 이름 아래 부제(레벨·직업). BattleScene 으로 전달.
  // 플레이어 공/방/속(+상세) — 전투 패널 플레이어 칸에 적과 대칭 표기. BattleScene 으로 전달.
  // 전투 결과(승/패) — BattleScene 상단 승패 배너용. 미전달 시 배너 미표시.
  // 나머지 prop 설명은 ReplayBattleSceneProps에 모아 둔다.
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
      playerCombat={playerCombat}
      outcome={outcome}
      outcomeAction={outcomeAction}
      profileBorder={profileBorder}
    />
  );
}
