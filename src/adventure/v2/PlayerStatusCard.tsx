"use client";

import { Card } from "@/components/ui/Card";
import {
  PlayerAvatar,
  HpBar as StatBar,
  RecoveryReadout,
  type BattlePlayerStatus,
} from "@/adventure/battle/BattleScene";
import type { Gender } from "@/adventure/profile/avatars";

// 일괄(5/10회) 사냥 합산 결과 아래에 띄우는 캐릭터 정보 카드.
// 단판 사냥의 전투 화면(BattleScene split)에 나오는 플레이어 칸과 같은 톤 —
// 아바타·이름·부제(레벨/직업/속성)·EXP 바·회복약 충전량. 연속 사냥 중에도
// 경험치 진행도를 확인할 수 있게 한다. (HP 는 아래 라이브 HpBar 가 따로 보여줌.)
export function PlayerStatusCard({
  gender,
  name,
  subtitle,
  exp,
  maxExp,
  hpCharges,
  mpCharges,
  hasMp = false,
}: {
  gender: Gender;
  name: string;
  subtitle?: string;
  exp: number;
  maxExp: number;
  hpCharges?: number;
  mpCharges?: number;
  hasMp?: boolean;
}) {
  const playerStatus: BattlePlayerStatus = {
    gender,
    exp,
    maxExp: maxExp > 0 ? maxExp : exp + 1, // div-by-zero 회피 (만렙)
    hpPotionCount: 0,
    recoveryCharges: { hp: hpCharges ?? 0, mp: mpCharges ?? 0 },
  };

  return (
    <Card padding="md">
      <div className="flex items-center gap-3">
        {/* 정적 카드라 데미지 플래시 트리거는 필요 없음 — hp 는 고정값 전달. */}
        <PlayerAvatar gender={gender} name={name} hp={1} size="sm" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="truncate text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
            {name}
          </div>
          {subtitle && (
            <div className="-mt-1 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
              {subtitle}
            </div>
          )}
          <StatBar
            compact
            label="EXP"
            value={playerStatus.exp}
            max={playerStatus.maxExp}
            color="bg-amber-400"
          />
          <RecoveryReadout playerStatus={playerStatus} hasMp={hasMp} />
        </div>
      </div>
    </Card>
  );
}
