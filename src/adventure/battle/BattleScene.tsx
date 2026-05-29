"use client";

import { useEffect, useRef, useState } from "react";
import type { BattleState } from "./engine";
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
  // HP 회복약 보유 총합 (모든 등급 합). 전투 도중 자동 사용 규칙으로 소진되면
  // 다음 전투 시작 시 갱신된 값이 반영된다. 0 이면 회색으로 노출해 "곧 마름" 시그널.
  hpPotionCount: number;
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
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
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

function EnemyAvatar({
  name,
  hp,
  image: imageOverride,
}: {
  name: string;
  hp: number;
  // 명시 초상화(v2 사냥터) 우선, 없으면 라이브 MONSTERS 카탈로그에서 이름으로 조회.
  image?: string;
}) {
  const image = imageOverride ?? MONSTERS[name]?.image;
  const flash = useDamageFlash(hp);
  const ringClass = flash ? ` ${FLASH_CLASS}` : "";
  if (!image) {
    return (
      <div
        aria-hidden
        className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 text-2xl text-zinc-400 transition-all dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500${ringClass}`}
      >
        ?
      </div>
    );
  }
  return (
    <div
      className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 transition-all dark:border-zinc-700 dark:bg-zinc-800${ringClass}`}
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
}: {
  gender: Gender;
  name: string;
  hp: number;
}) {
  const [errored, setErrored] = useState(false);
  const flash = useDamageFlash(hp);
  const ringClass = flash ? ` ${FLASH_CLASS}` : "";
  if (errored) {
    return (
      <div
        aria-hidden
        className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 text-2xl text-zinc-400 transition-all dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500${ringClass}`}
      >
        ?
      </div>
    );
  }
  return (
    <div
      className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 transition-all dark:border-zinc-700 dark:bg-zinc-800${ringClass}`}
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
}: {
  state: BattleState;
  playerName: string;
  playerStatus: BattlePlayerStatus;
  recentNotifications?: AppNotification[];
}) {
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
            {/* v2 MP 바 — INT 0 인 캐릭(라이브) 은 playerMaxMp=0 → 안 보임. */}
            {state.playerMaxMp > 0 && (
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
            <div className="flex items-baseline gap-1 text-[11px] tabular-nums">
              <span
                aria-hidden
                className={
                  playerStatus.hpPotionCount > 0
                    ? "text-rose-500"
                    : "text-zinc-400 dark:text-zinc-600"
                }
              >
                🧪
              </span>
              <span
                className={
                  playerStatus.hpPotionCount > 0
                    ? "text-zinc-700 dark:text-zinc-300"
                    : "text-zinc-400 dark:text-zinc-600"
                }
              >
                회복약 {playerStatus.hpPotionCount}
              </span>
            </div>
          </div>
        </div>
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
