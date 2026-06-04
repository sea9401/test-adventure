"use client";

import { useEffect, useRef, useState } from "react";
import type { BattleState } from "../v2/combat/engine";
import { BattleLogList } from "./BattleLogList";
import { MONSTERS } from "../data/monsters";
import {
  formatRelative,
  type AppNotification,
  type NotificationKind,
} from "@/lib/notifications";
import { Card } from "@/components/ui/Card";
import { avatarImageSrc, type Gender } from "@/adventure/profile/avatars";

export type BattlePlayerStatus = {
  gender: Gender;
  exp: number;
  maxExp: number;
  // v1: HP 회복약 보유 총합 (모든 등급 합). 전투 도중 자동 사용 규칙으로 소진되면
  // 다음 전투 시작 시 갱신된 값이 반영된다. 0 이면 회색으로 노출해 "곧 마름" 시그널.
  hpPotionCount: number;
  // v2: 충전식 회복약 잔량. 있으면 개수(hpPotionCount) 대신 충전량으로 표기.
  // mp 충전은 MP 풀이 있는 캐릭(playerMaxMp>0)에만 노출.
  recoveryCharges?: { hp: number; mp: number };
};

const RECENT_KIND_COLOR: Record<NotificationKind, string> = {
  battle_win: "text-emerald-700 dark:text-emerald-400",
  battle_lose: "text-rose-700 dark:text-rose-400",
  training_done: "text-amber-700 dark:text-amber-400",
  quest_ready: "text-yellow-700 dark:text-yellow-400",
  quest_complete: "text-violet-700 dark:text-violet-400",
  milestone: "text-fuchsia-700 dark:text-fuchsia-400",
  expedition: "text-teal-700 dark:text-teal-400",
  loot: "text-lime-700 dark:text-lime-400",
  equip_drop: "text-orange-700 dark:text-orange-400",
  item: "text-blue-700 dark:text-blue-400",
  info: "text-zinc-600 dark:text-zinc-400",
};

const RECENT_NOTIFICATIONS_VISIBLE = 3;

function HpBar({
  label,
  value,
  max,
  color,
  compact = false,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  // compact = v2 좌우분할용. 반폭 컬럼에 들어가도록 라벨·수치를 바 위 한 줄로 올리고 바는 더 얇게.
  // 기본(false) 은 라이브(v1) 가로형 — 영향 0.
  compact?: boolean;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  if (compact) {
    return (
      <div className="space-y-0.5">
        <div className="flex items-baseline justify-between gap-1.5 text-[12px]">
          <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
          <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
            {value}/{max}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className={`h-full ${color} transition-all`}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 text-[15px]">
      <span className="w-20 shrink-0 truncate text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
        {value}/{max}
      </span>
    </div>
  );
}

// v2 충전식 회복약 한 줄 표기 (🧪 HP 충전약 123). 잔량 0 이면 회색.
function ChargeReadout({
  emoji,
  label,
  value,
  activeText,
}: {
  emoji: string;
  label: string;
  value: number;
  activeText: string;
}) {
  const dim = "text-zinc-400 dark:text-zinc-600";
  return (
    <span className="inline-flex items-baseline gap-1">
      <span aria-hidden className={value > 0 ? activeText : dim}>
        {emoji}
      </span>
      <span className={value > 0 ? "text-zinc-700 dark:text-zinc-300" : dim}>
        {label} {value.toLocaleString()}
      </span>
    </span>
  );
}

// 회복약 한 줄 — v2 는 충전식 잔량(recoveryCharges), v1 은 개수(hpPotionCount).
// 두 레이아웃(stacked/split) 공용. center 면 가운데 정렬(split 칸용).
function RecoveryReadout({
  playerStatus,
  hasMp,
  center = false,
}: {
  playerStatus: BattlePlayerStatus;
  hasMp: boolean;
  center?: boolean;
}) {
  const justify = center ? " justify-center" : "";
  if (playerStatus.recoveryCharges) {
    return (
      <div
        className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px] tabular-nums${justify}`}
      >
        <ChargeReadout
          emoji="🧪"
          label="HP 충전약"
          value={playerStatus.recoveryCharges.hp}
          activeText="text-rose-500"
        />
        {hasMp && (
          <ChargeReadout
            emoji="🔷"
            label="MP 충전약"
            value={playerStatus.recoveryCharges.mp}
            activeText="text-blue-500"
          />
        )}
      </div>
    );
  }
  const dim = "text-zinc-400 dark:text-zinc-600";
  const on = playerStatus.hpPotionCount > 0;
  return (
    <div className={`flex items-baseline gap-1 text-[11px] tabular-nums${justify}`}>
      <span aria-hidden className={on ? "text-rose-500" : dim}>
        🧪
      </span>
      <span className={on ? "text-zinc-700 dark:text-zinc-300" : dim}>
        회복약 {playerStatus.hpPotionCount}
      </span>
    </div>
  );
}

// 데미지 받은 순간 짧게 빨간 링 + 흔들림. hpDelta 가 변할 때마다 트리거.
function useDamageFlash(hp: number): boolean {
  const [flashing, setFlashing] = useState(false);
  const lastHpRef = useRef(hp);
  useEffect(() => {
    if (hp < lastHpRef.current) {
      setFlashing(true);
      const id = setTimeout(() => setFlashing(false), 350);
      lastHpRef.current = hp;
      return () => clearTimeout(id);
    }
    lastHpRef.current = hp;
  }, [hp]);
  return flashing;
}

const FLASH_CLASS =
  "ring-2 ring-rose-500 ring-offset-1 ring-offset-white animate-pulse dark:ring-offset-zinc-950";

// 전투 로그 렌더링은 BattleLogList 에 분리 — RecentLogView / CoopBossCard 와 공유.

// md = 라이브(v1) 64px, sm = v2 좌우분할 48px.
type AvatarSize = "md" | "sm";
const AVATAR_BOX: Record<AvatarSize, string> = {
  md: "h-16 w-16",
  sm: "h-12 w-12",
};
const AVATAR_FALLBACK_TEXT: Record<AvatarSize, string> = {
  md: "text-2xl",
  sm: "text-xl",
};

function EnemyAvatar({
  name,
  hp,
  image: imageOverride,
  size = "md",
}: {
  name: string;
  hp: number;
  // 명시 초상화(v2 사냥터) 우선, 없으면 라이브 MONSTERS 카탈로그에서 이름으로 조회.
  image?: string;
  size?: AvatarSize;
}) {
  const image = imageOverride ?? MONSTERS[name]?.image;
  const flash = useDamageFlash(hp);
  const ringClass = flash ? ` ${FLASH_CLASS}` : "";
  if (!image) {
    return (
      <div
        aria-hidden
        className={`flex ${AVATAR_BOX[size]} shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 ${AVATAR_FALLBACK_TEXT[size]} text-zinc-400 transition-all dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500${ringClass}`}
      >
        ?
      </div>
    );
  }
  return (
    <div
      className={`${AVATAR_BOX[size]} shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 transition-all dark:border-zinc-700 dark:bg-zinc-800${ringClass}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={name} className="h-full w-full object-cover" />
    </div>
  );
}

function PlayerAvatar({
  gender,
  name,
  hp,
  size = "md",
}: {
  gender: Gender;
  name: string;
  hp: number;
  size?: AvatarSize;
}) {
  const [errored, setErrored] = useState(false);
  const flash = useDamageFlash(hp);
  const ringClass = flash ? ` ${FLASH_CLASS}` : "";
  if (errored) {
    return (
      <div
        aria-hidden
        className={`flex ${AVATAR_BOX[size]} shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 ${AVATAR_FALLBACK_TEXT[size]} text-zinc-400 transition-all dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500${ringClass}`}
      >
        ?
      </div>
    );
  }
  return (
    <div
      className={`${AVATAR_BOX[size]} shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 transition-all dark:border-zinc-700 dark:bg-zinc-800${ringClass}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarImageSrc(gender)}
        alt={name}
        onError={() => setErrored(true)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}

export function BattleScene({
  state,
  playerName,
  playerStatus,
  recentNotifications,
  layout = "stacked",
  playerSubtitle,
}: {
  state: BattleState;
  playerName: string;
  playerStatus: BattlePlayerStatus;
  recentNotifications?: AppNotification[];
  // "stacked" = 라이브(v1) 적 위 / 플레이어 아래. "split" = v2 좌(플레이어)/우(적) 반폭.
  layout?: "stacked" | "split";
  // 플레이어 이름 아래 부제(예: "Lv.42 · 견습 검사 · 무속성"). split 레이아웃(v2)에서만 표시.
  // 미전달 시 미표시 — 라이브(stacked)는 그대로.
  playerSubtitle?: string;
}) {
  const hasMp = state.playerMaxMp > 0;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.log]);

  const recents = (recentNotifications ?? []).slice(
    0,
    RECENT_NOTIFICATIONS_VISIBLE,
  );

  return (
    <div className="space-y-4">
      <Card padding="lg">
        {layout === "split" ? (
          // v2 — 좌(플레이어)/우(적) 각 반폭. 위아래 스택 대신 좌우 분리.
          <div className="grid grid-cols-2 gap-3 sm:gap-6">
            {/* 왼쪽 — 플레이어 */}
            <div className="flex flex-col items-center gap-2">
              <PlayerAvatar
                gender={playerStatus.gender}
                name={playerName}
                hp={state.playerHp}
                size="sm"
              />
              <div className="w-full space-y-1.5">
                <div className="truncate text-center text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
                  {playerName}
                </div>
                {playerSubtitle && (
                  <div className="-mt-1 truncate text-center text-[11px] text-zinc-500 dark:text-zinc-400">
                    {playerSubtitle}
                  </div>
                )}
                <HpBar
                  compact
                  label="HP"
                  value={state.playerHp}
                  max={state.playerMaxHp}
                  color="bg-rose-500"
                />
                {hasMp && (
                  <HpBar
                    compact
                    label="MP"
                    value={state.playerMp}
                    max={state.playerMaxMp}
                    color="bg-blue-500"
                  />
                )}
                <HpBar
                  compact
                  label="EXP"
                  value={playerStatus.exp}
                  max={playerStatus.maxExp}
                  color="bg-amber-400"
                />
                <RecoveryReadout
                  playerStatus={playerStatus}
                  hasMp={hasMp}
                  center
                />
              </div>
            </div>
            {/* 오른쪽 — 적 */}
            <div className="flex flex-col items-center gap-2">
              <EnemyAvatar
                name={state.enemy.name}
                hp={state.enemyHp}
                image={state.enemy.image}
                size="sm"
              />
              <div className="w-full space-y-1.5">
                <div className="truncate text-center text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
                  {state.enemy.name}
                </div>
                <HpBar
                  compact
                  label="HP"
                  value={state.enemyHp}
                  max={state.enemy.hp}
                  color="bg-rose-500"
                />
              </div>
            </div>
          </div>
        ) : (
          // v1 (라이브) — 적 위 / 플레이어 아래 가로형. 기존 그대로.
          <>
            <div className="flex items-center gap-4">
              <EnemyAvatar
                name={state.enemy.name}
                hp={state.enemyHp}
                image={state.enemy.image}
              />
              <div className="flex-1">
                <HpBar
                  label={state.enemy.name}
                  value={state.enemyHp}
                  max={state.enemy.hp}
                  color="bg-rose-500"
                />
              </div>
            </div>
            <div className="mt-4 flex items-start gap-4">
              <PlayerAvatar
                gender={playerStatus.gender}
                name={playerName}
                hp={state.playerHp}
              />
              <div className="flex-1 space-y-2.5">
                <HpBar
                  label={playerName}
                  value={state.playerHp}
                  max={state.playerMaxHp}
                  color="bg-rose-500"
                />
                {hasMp && (
                  <HpBar
                    label="MP"
                    value={state.playerMp}
                    max={state.playerMaxMp}
                    color="bg-blue-500"
                  />
                )}
                <HpBar
                  label="EXP"
                  value={playerStatus.exp}
                  max={playerStatus.maxExp}
                  color="bg-amber-400"
                />
                <RecoveryReadout playerStatus={playerStatus} hasMp={hasMp} />
              </div>
            </div>
          </>
        )}
      </Card>

      <div
        ref={logRef}
        className="no-scrollbar h-[50svh] min-h-[18rem] overflow-y-auto rounded-lg border border-zinc-200 bg-white/90 p-3 dark:border-zinc-800 dark:bg-zinc-950/90 sm:h-[34rem] sm:min-h-0"
      >
        <BattleLogList entries={state.log} />
      </div>

      {recents.length > 0 && (
        <Card padding="md">
          <div className="mb-2 text-[12px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            최근 활동
          </div>
          <ul className="space-y-1.5">
            {recents.map((n) => (
              <li
                key={n.id}
                className="flex items-baseline justify-between gap-2 text-[13px]"
              >
                <span className={`truncate ${RECENT_KIND_COLOR[n.kind]}`}>
                  {n.text}
                </span>
                <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">
                  {formatRelative(n.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
