"use client";

import { Card } from "@/components/ui/Card";
import {
  PlayerAvatar,
  HpBar as StatBar,
  RecoveryReadout,
  BattleStatStrip,
  type BattlePlayerStatus,
  type BattleStats,
} from "@/adventure/battle/BattleScene";

// 플레이어 유효 전투 스탯 — me/state 의 combat. 사냥 카드 공/방/속 표기용(상세=명중/회피/치명).
export type PlayerCombatStats = {
  atk: number;
  def: number;
  spd: number;
  magicAtk?: number;
  accuracyPct?: number;
  accRating?: number;
  evasionPct?: number;
  critChancePct?: number;
  // 콘텐츠 파워(전투력) — me/state 가 derivePowerScore 로 계산해 보낸다(던전 권장 파워와 동일 단위).
  //   서버는 이미 채워 보내나 타입에만 빠져 있었음. 사냥터에서 "내 전투력 vs 권장" 비교에 사용.
  power?: number;
};

// me/state combat → BattleStatStrip 입력. 명중=accRating(캡 없는 raw) 우선, 폴백 accuracyPct.
//   플레이어 카드·전투 패널 양쪽에서 동일 매핑을 쓰도록 추출.
export function playerCombatToBattleStats(c: PlayerCombatStats): BattleStats {
  return {
    atk: c.atk,
    def: c.def,
    spd: c.spd,
    accuracy: c.accRating ?? c.accuracyPct,
    evasionPct: c.evasionPct,
    critChancePct: c.critChancePct,
    magicAtk: c.magicAtk,
  };
}
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
  combat,
}: {
  gender: Gender;
  name: string;
  subtitle?: string;
  // EXP 바 — 첫 사냥 전에도 자리를 유지해 카드 높이가 흔들리지 않게 한다.
  exp?: number;
  maxExp?: number;
  // 라이브 HP 바 상태(전역). 미전달이면 HP 바 숨김(dev 하니스 등).
  hp?: HpBarState | null;
  // MP 바 상태(전역). maxMp 0 이면 MpBar 가 스스로 숨김.
  mp?: { mp: number; maxMp: number } | null;
  hpCharges?: number;
  mpCharges?: number;
  hasMp?: boolean;
  // 유효 전투 스탯 — 공/방/속(+상세). 미전달이면 미표시.
  combat?: PlayerCombatStats | null;
}) {
  const expValue = Math.max(0, exp ?? 0);
  const expMax = maxExp && maxExp > 0 ? maxExp : expValue + 1;
  const playerStatus: BattlePlayerStatus = {
    gender,
    exp: expValue,
    maxExp: expMax,
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
          <StatBar
            compact
            label="EXP"
            value={playerStatus.exp}
            max={playerStatus.maxExp}
            color="bg-amber-400"
          />
          {combat && (
            <BattleStatStrip stats={playerCombatToBattleStats(combat)} />
          )}
          <RecoveryReadout playerStatus={playerStatus} hasMp={hasMp} />
        </div>
      </div>
    </Card>
  );
}
