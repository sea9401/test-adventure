"use client";

import { Card } from "@/components/ui/Card";
import {
  PlayerAvatar,
  HpBar as StatBar,
  RecoveryReadout,
  type BattlePlayerStatus,
} from "@/adventure/battle/BattleScene";
import { HpBar, type HpBarState } from "@/adventure/v2/HpBar";
import { MpBar } from "@/adventure/v2/MpBar";
import type { Gender } from "@/adventure/profile/avatars";

// 사냥 화면 캐릭터 정보 카드 — 아바타·이름·부제(레벨/직업/속성)·HP/MP 바·EXP 바·회복약.
// HP 는 라이브 재생 바(HpBar), MP 는 고정값 바(MpBar — 안 쓰는 빌드면 자동 숨김)를
// 카드 안에 포함한다. 전투 버튼 위에 상시 노출돼 현재 상태를 한눈에 보여준다.
export function PlayerStatusCard({
  gender,
  name,
  subtitle,
  exp,
  maxExp,
  hp,
  mp,
  hpCharges,
  mpCharges,
  hasMp = false,
}: {
  gender: Gender;
  name: string;
  subtitle?: string;
  // EXP 바 — 사냥 전엔 미전달(바 생략). 사냥 후 진행도 표기.
  exp?: number;
  maxExp?: number;
  // 라이브 HP 바 상태(전역). 미전달이면 HP 바 숨김(dev 하니스 등).
  hp?: HpBarState | null;
  // MP 바 상태(전역). maxMp 0 이면 MpBar 가 스스로 숨김.
  mp?: { mp: number; maxMp: number } | null;
  hpCharges?: number;
  mpCharges?: number;
  hasMp?: boolean;
}) {
  const hasExp = typeof exp === "number" && typeof maxExp === "number";
  const playerStatus: BattlePlayerStatus = {
    gender,
    exp: exp ?? 0,
    maxExp: maxExp && maxExp > 0 ? maxExp : (exp ?? 0) + 1, // div-by-zero 회피
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
          {hp && <HpBar state={hp} compact />}
          {mp && <MpBar state={mp} compact />}
          {hasExp && (
            <StatBar
              compact
              label="EXP"
              value={playerStatus.exp}
              max={playerStatus.maxExp}
              color="bg-amber-400"
            />
          )}
          <RecoveryReadout playerStatus={playerStatus} hasMp={hasMp} />
        </div>
      </div>
    </Card>
  );
}
