"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import { useSparring } from "@/adventure/v2/useSparring";
import type { Gender } from "@/adventure/profile/avatars";

// 훈련장 허수아비치기 — 라이브 SparringView 의 v2 화면. 보상도 손실도 없는 모의전이고,
// 전투 결과는 사냥과 동일하게 ReplayBattleScene(리플레이 로그)으로 표시한다.
export function V2SparringView({
  playerName,
  gender,
  onBack,
  playerSubtitle,
}: {
  playerName: string;
  gender: Gender;
  onBack: () => void;
  // 전투 장면 플레이어 부제(레벨·직업·속성).
  playerSubtitle?: string;
}) {
  const { busy, lastResult, error, spar } = useSparring();
  const [round, setRound] = useState(0);

  const handleSpar = async () => {
    const r = await spar();
    if (r) setRound((n) => n + 1);
  };

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="허수아비치기" onBack={onBack} />
      <Card padding="md">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          보상도 손실도 없는 연습용 대결이다. 지금 능력치로 허수아비를 얼마나
          빠르게 쓰러뜨리는지 전투 기록으로 살펴볼 수 있다.
        </p>
        <button
          type="button"
          onClick={handleSpar}
          disabled={busy}
          className="mt-3 w-full rounded-md border border-emerald-600 bg-emerald-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy
            ? "대련 중…"
            : lastResult
              ? "다시 대련하기"
              : "허수아비치기 시작"}
        </button>
        {error && (
          <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
            ✗ {error}
          </p>
        )}
        {lastResult && !busy && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
            {lastResult.won
              ? `허수아비를 ${lastResult.turns}턴 만에 쓰러뜨렸다.`
              : "허수아비를 쓰러뜨리지 못했다."}
          </p>
        )}
      </Card>

      {lastResult?.replay && (
        <ReplayBattleScene
          key={round}
          payload={lastResult.replay}
          startPlayerHp={lastResult.startPlayerHp}
          playerName={playerName}
          gender={gender}
          exp={0}
          maxExp={1}
          playerSubtitle={playerSubtitle}
        />
      )}
    </main>
  );
}
