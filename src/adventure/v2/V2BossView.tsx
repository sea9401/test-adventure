"use client";

import { useEffect, useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import { Card } from "@/components/ui/Card";
import { HuntResultCard } from "@/adventure/v2/HuntResultCard";
import { applyHpRegen, canHuntWithHp } from "@/adventure/v2/hpRegen";
import { type HpBarState } from "@/adventure/v2/HpBar";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import { useDungeonHunt } from "@/adventure/v2/useDungeonHunt";
import { type StaminaState } from "@/adventure/v2/stamina";
import {
  getFieldBoss,
  V2_BOSS_STAMINA_COST,
} from "@/adventure/data/v2/dungeonBosses";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import type { DungeonFloorId } from "@/adventure/data/v2/types";
import type { Gender } from "@/adventure/profile/avatars";

// 필드 보스 전용 페이지 — 사냥터(floor) 사냥 화면과 분리(사용자 결정). 사냥터 목록의 보스
// 입장 버튼으로 진입. 도전 1회 = V2_BOSS_STAMINA_COST 스태미너, 쿨다운 없음(스태미너가 throttle).
// 보상은 보스 재료 → 대장간 제작(드랍 RNG 아님). 전투 결과/리플레이는 사냥과 동일 컴포넌트 재사용.

export function V2BossView({
  floorId,
  outpostId,
  outpostName,
  playerName,
  playerGender,
  stamina,
  setStamina,
  hp,
  setHp,
  onSeekHealing,
  onBack,
  playerSubtitle,
}: {
  floorId: DungeonFloorId;
  outpostId: string;
  outpostName: string;
  playerName: string;
  playerGender: Gender;
  stamina: StaminaState;
  setStamina: (s: StaminaState) => void;
  hp?: HpBarState | null;
  setHp?: (s: HpBarState) => void;
  onSeekHealing?: () => void;
  onBack: () => void;
  playerSubtitle?: string;
}) {
  const boss = getFieldBoss(floorId);
  const { busy, lastResult, challengeBoss } = useDungeonHunt({
    outpostId,
    setStamina,
  });

  // HP 게이트용 1초 틱 — 시간 재생으로 회복되면 도전 버튼이 자동 재활성. (사냥 화면과 같은 패턴)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const recordHp = (r: { hpAfter: number; maxHp: number }) => {
    setHp?.({ hp: r.hpAfter, maxHp: r.maxHp, anchorMs: Date.now() });
  };

  if (!boss) {
    return (
      <main className="mx-auto max-w-[720px] space-y-4 p-6">
        <BackButton onClick={onBack} />
        <div className="text-sm text-rose-600 dark:text-rose-400">
          이 사냥터에는 보스가 없습니다.
        </div>
      </main>
    );
  }

  const bossLowStamina = stamina.current < V2_BOSS_STAMINA_COST;
  const liveHp = hp
    ? applyHpRegen(hp.hp, Math.max(1, hp.maxHp), hp.anchorMs, now).hp
    : null;
  const needsRecovery =
    hp != null && liveHp != null && !canHuntWithHp(liveHp, hp.maxHp);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <BackButton onClick={onBack} />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-lg font-bold text-amber-700 dark:text-amber-400">
            필드 보스 · {boss.name}
          </h1>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {outpostName}
          </span>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          권장 파워 {boss.recommendedPower}
        </p>
      </header>

      <Card padding="md">
        <div className="space-y-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            이 보스를 쓰러뜨리면 다음 사냥터로 넘어갈 준비가 된 셈입니다.
            쓰러뜨릴 때마다{" "}
            {Object.entries(boss.reward.materials)
              .map(([id, n]) => `${V2_MATERIALS[id]?.name ?? id} ${n}개`)
              .join(", ")}
            을 얻고, 모아서 대장간에서 보스 전용 장비를 제작할 수 있습니다. 처음
            잡으면 칭호를 받습니다. (도전마다 스태미너 {V2_BOSS_STAMINA_COST})
          </p>
          {lastResult?.isBoss && (
            <p
              className={`text-xs font-medium ${
                lastResult.won
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {lastResult.won
                ? lastResult.firstClear
                  ? "첫 처치 성공! 칭호를 얻었습니다."
                  : "승리! 보상을 받았습니다."
                : "패배했습니다. 더 강해진 뒤 다시 도전하세요."}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              void challengeBoss(boss.floorId).then((r) => {
                if (r) recordHp(r);
              });
            }}
            disabled={busy || bossLowStamina || needsRecovery}
            className="w-full rounded-md border border-amber-600 bg-amber-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy
              ? "도전 중…"
              : needsRecovery
                ? "회복 필요"
                : bossLowStamina
                  ? `스태미너 부족 (${V2_BOSS_STAMINA_COST} 필요)`
                  : `보스 도전 (스태미너 ${V2_BOSS_STAMINA_COST})`}
          </button>
        </div>
      </Card>

      {needsRecovery && (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 dark:border-rose-800 dark:bg-rose-950">
          <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
            체력이 부족해 전투할 수 없습니다.
          </p>
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
            마을 치료소에서 회복하거나, 잠시 기다리면 체력이 서서히 회복됩니다.
          </p>
          {onSeekHealing && (
            <button
              type="button"
              onClick={onSeekHealing}
              className="mt-2.5 w-full rounded-md border border-rose-600 bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
            >
              치료소로 가기
            </button>
          )}
        </div>
      )}

      {lastResult && <HuntResultCard result={lastResult} />}

      {lastResult?.replay && (
        <ReplayBattleScene
          payload={lastResult.replay}
          startPlayerHp={lastResult.startPlayerHp}
          playerName={playerName}
          gender={playerGender}
          exp={lastResult.expForBar ?? 0}
          maxExp={lastResult.maxExpForBar ?? 1}
          hpCharges={lastResult.hpCharges}
          mpCharges={lastResult.mpCharges}
          playerSubtitle={playerSubtitle}
        />
      )}
    </main>
  );
}
