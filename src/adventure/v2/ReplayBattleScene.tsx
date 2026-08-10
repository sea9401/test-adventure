"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FilmStrip } from "@phosphor-icons/react";
import {
  BattleScene,
  type BattleOutcomeAction,
  type BattlePlayerStatus,
} from "@/adventure/battle/BattleScene";
import type { BattleState } from "@/adventure/v2/combat/engine";
import {
  buildBattleStateFromReplay,
  type ReplayPayload,
} from "@/adventure/data/v2/replayPayload";
import { Card } from "@/components/ui/Card";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { BattleOutcomeBadge } from "@/adventure/v2/BattleOutcomeBadge";
import { BattleLogScrollTopButton } from "@/adventure/v2/BattleLogScrollTopButton";
import {
  battleLogHandoffHref,
  writeBattleLogHandoff,
  type BattleLogReplayProps,
} from "@/adventure/v2/battleLogHandoff";

// 플레이어 결과 화면에서는 전용 로그 페이지 링크를, 이미 고유 URL인 기록 화면에서는
// 전체 BattleScene을 렌더한다. 관리자·개발 하니스만 embedded 모드를 명시한다.

export type ReplayBattleSceneProps = BattleLogReplayProps & {
  outcomeAction?: BattleOutcomeAction;
  presentation?: "link" | "page" | "embedded";
  logTitle?: string;
  scrollTargetId?: string;
};

export function ReplayBattleScene(props: ReplayBattleSceneProps) {
  if ((props.presentation ?? "link") === "link") {
    return <ReplayBattleLogLink {...props} />;
  }
  return <ReplayBattleLogContent {...props} />;
}

function ReplayBattleLogLink({
  outcomeAction,
  presentation: _presentation,
  logTitle,
  ...replay
}: ReplayBattleSceneProps) {
  const router = useRouter();
  const title = logTitle ?? `${replay.payload.enemy.name} 전투 로그`;
  const logCount = replay.payload.log.length;

  const openLog = () => {
    const id = writeBattleLogHandoff({ kind: "replay", title, replay });
    router.push(battleLogHandoffHref(id));
  };

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FilmStrip
              size={18}
              weight="duotone"
              className="shrink-0 text-emerald-500"
            />
            <h2 className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
              {title}
            </h2>
            {replay.outcome && <BattleOutcomeBadge outcome={replay.outcome} />}
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {replay.payload.replayId
              ? "저장된 전투 기록 · 첫 행동부터 표시"
              : `${logCount.toLocaleString()}개 기록 · 첫 행동부터 표시`}
          </p>
        </div>
        <button
          type="button"
          onClick={openLog}
          className="shrink-0 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:ring-offset-zinc-900"
        >
          전체 전투 로그 보기
        </button>
      </div>

      {outcomeAction && (
        <div className="border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={outcomeAction.onClick}
            disabled={outcomeAction.disabled || outcomeAction.busy}
            className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
          >
            {outcomeAction.busy
              ? (outcomeAction.busyLabel ?? "진행 중...")
              : outcomeAction.label}
          </button>
          {outcomeAction.hint ? (
            <div className="mt-1 text-center text-xs text-zinc-600 dark:text-zinc-300">
              {outcomeAction.hint}
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function ReplayBattleLogContent(props: ReplayBattleSceneProps) {
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
  presentation,
  scrollTargetId,
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
    <>
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
        logViewport={presentation === "page" ? "page" : "contained"}
      />
      {presentation === "page" && (
        <BattleLogScrollTopButton scrollTargetId={scrollTargetId} />
      )}
    </>
  );
}
