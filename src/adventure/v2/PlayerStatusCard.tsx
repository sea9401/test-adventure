"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import {
  PlayerAvatar,
  type BattlePlayerStatus,
  type BattleStats,
} from "@/adventure/battle/BattleScene";
import { applyHpRegen, canHuntWithHp } from "./hpRegen";

// 플레이어 유효 전투 스탯 — me/state 의 combat. 사냥 카드 공/방/속 표기용(상세=명중/회피/치명).
export type PlayerCombatStats = {
  atk: number;
  def: number;
  spd: number;
  magicAtk?: number;
  accuracyPct?: number;
  accRating?: number;
  evasionPct?: number;
  evaRating?: number;
  critChancePct?: number;
  // 콘텐츠 파워(전투력) — me/state 가 derivePowerScore 로 계산해 보낸다(던전 권장 파워와 동일 단위).
  //   서버는 이미 채워 보내나 타입에만 빠져 있었음. 사냥터에서 "내 전투력 vs 권장" 비교에 사용.
  power?: number;
};

// me/state combat → BattleStatStrip 입력. 명중=accRating(캡 없는 raw) 우선, 폴백 accuracyPct.
//   플레이어 카드·전투 패널 양쪽에서 동일 매핑을 쓰도록 추출.
export function playerCombatToBattleStats(
  c: PlayerCombatStats,
  options: { primaryAttack?: "physical" | "magic" } = {},
): BattleStats {
  return {
    atk: c.atk,
    def: c.def,
    spd: c.spd,
    accuracy: c.accRating ?? c.accuracyPct,
    evasionPct: c.evasionPct,
    evaRating: c.evaRating ?? c.evasionPct,
    critChancePct: c.critChancePct,
    magicAtk: c.magicAtk,
    primaryAttack: options.primaryAttack,
  };
}
import { type HpBarState } from "@/adventure/v2/HpBar";
import { type MpBarState } from "@/adventure/v2/MpBar";
import type { Gender } from "@/adventure/profile/avatars";

function ThinStatBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const safeMax = Math.max(1, max);
  const safeValue = Math.max(0, Math.min(safeMax, value));
  const pct = Math.max(0, Math.min(100, (safeValue / safeMax) * 100));
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-2 text-[12px] leading-none">
        <span className="font-medium text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
        <span className="tabular-nums text-zinc-400 dark:text-zinc-500">
          {safeValue.toLocaleString()}/{safeMax.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`h-full ${color} transition-[width] duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function LiveHpThinBar({ state }: { state: HpBarState }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const maxHp = Math.max(1, state.maxHp);
  const display = applyHpRegen(state.hp, maxHp, state.anchorMs, now).hp;
  const canHunt = canHuntWithHp(display, maxHp);
  return (
    <ThinStatBar
      label="HP"
      value={display}
      max={maxHp}
      color={canHunt ? "bg-rose-500" : "bg-rose-300 dark:bg-rose-900"}
    />
  );
}

function CombatSummary({
  combat,
  primaryAttack = "physical",
}: {
  combat: PlayerCombatStats;
  primaryAttack?: "physical" | "magic";
}) {
  const itemClass =
    "inline-flex items-baseline gap-1 whitespace-nowrap text-[13px] leading-tight tabular-nums text-zinc-600 dark:text-zinc-300";
  const labelClass = "text-zinc-400 dark:text-zinc-500";
  const attackLabel = primaryAttack === "magic" ? "마공" : "힘";
  const attackValue =
    primaryAttack === "magic" ? (combat.magicAtk ?? combat.atk) : combat.atk;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className={itemClass}>
        <span className={labelClass}>{attackLabel}</span>
        <span>{Math.round(attackValue).toLocaleString()}</span>
      </span>
      <span className={itemClass}>
        <span className={labelClass}>방</span>
        <span>{Math.round(combat.def).toLocaleString()}</span>
      </span>
      <span className={itemClass}>
        <span className={labelClass}>속</span>
        <span>{Math.round(combat.spd).toLocaleString()}</span>
      </span>
    </div>
  );
}

function RecoverySummary({
  hpCharges,
  mpCharges,
  hasMp,
}: {
  hpCharges: number;
  mpCharges: number;
  hasMp: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] leading-tight tabular-nums">
      <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
        <span className="h-2 w-2 rounded-full bg-lime-400" />
        HP 충전약 {hpCharges.toLocaleString()}
      </span>
      {hasMp && (
        <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
          <span className="h-2 w-2 rounded-full bg-sky-500" />
          MP 충전약 {mpCharges.toLocaleString()}
        </span>
      )}
    </div>
  );
}

// 사냥 화면 캐릭터 정보 카드 — 아바타·이름·부제(레벨/직업/속성)·HP/MP/EXP 바·회복약.
// 전투 버튼 위에 상시 노출돼 현재 상태를 한눈에 보여준다.
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
  primaryAttack = "physical",
  proficiency = null,
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
  mp?: MpBarState | null;
  hpCharges?: number;
  mpCharges?: number;
  hasMp?: boolean;
  // 유효 전투 스탯 — 공/방/속(+상세). 미전달이면 미표시.
  combat?: PlayerCombatStats | null;
  primaryAttack?: "physical" | "magic";
  // 현재 전직 중인 구체 직업의 숙련도. null/미전달 = 모험가(무직업) → 줄 생략.
  proficiency?: number | null;
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
        <div className="min-w-0 flex-1 space-y-2">
          <div className="truncate text-[15px] font-semibold leading-tight text-zinc-800 dark:text-zinc-100">
            {name}
          </div>
          {subtitle && (
            <div className="-mt-1 truncate text-[12px] leading-tight text-zinc-500 dark:text-zinc-400">
              {subtitle}
            </div>
          )}
          {proficiency != null && (
            <div className="text-[12px] leading-tight text-zinc-500 dark:text-zinc-400">
              직업 숙련도{" "}
              <span className="font-semibold tabular-nums text-sky-500">
                {proficiency.toLocaleString()}
              </span>
            </div>
          )}
          <div className="space-y-1">
            {hp && <LiveHpThinBar state={hp} />}
            {mp && mp.maxMp > 0 && (
              <ThinStatBar
                label="MP"
                value={Math.max(0, Math.min(mp.maxMp, mp.mp))}
                max={Math.max(0, mp.maxMp)}
                color="bg-sky-500"
              />
            )}
            <ThinStatBar
              label="EXP"
              value={playerStatus.exp}
              max={playerStatus.maxExp}
              color="bg-amber-400"
            />
          </div>
          {combat && (
            <CombatSummary combat={combat} primaryAttack={primaryAttack} />
          )}
          <RecoverySummary
            hpCharges={playerStatus.recoveryCharges?.hp ?? 0}
            mpCharges={playerStatus.recoveryCharges?.mp ?? 0}
            hasMp={hasMp}
          />
        </div>
      </div>
    </Card>
  );
}
