"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { V2_ELEMENT_LABEL } from "@/adventure/data/v2/elements";
import {
  attackMissPct,
  dodgeChance,
} from "@/adventure/data/v2/v2CombatConstants";

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

export type BattleOutcomeAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busyLabel?: string;
  busy?: boolean;
  hint?: ReactNode;
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

export function HpBar({
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
export function ChargeReadout({
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
export function RecoveryReadout({
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

// 전투 스탯 표시용 — 공/방/속 기본 + 상세(명중/회피/치명/마공). 적·플레이어 공용 shape.
export type BattleStats = {
  atk: number;
  def: number;
  spd: number;
  actionSpd?: number; // 몬스터 ATB 행동속도 — raw spd 를 플레이어 속도 스케일로 환산한 값
  accuracy?: number; // 명중(rating) — 적=Monster.accuracy, 플레이어=accRating
  evasionPct?: number; // 회피 %
  evaRating?: number; // 플레이어 회피 레이팅(raw). 없으면 evasionPct 폴백.
  critChancePct?: number; // 치명 % (플레이어)
  magicAtk?: number; // 마법 공격력(>0 일 때만 상세에)
  bonusAttackChancePct?: number; // 몬스터 행동 1회당 추가타 성향
  primaryAttack?: "physical" | "magic";
};

// 상세 스탯 칩 — 항목별 은은한 색 강조(명중/회피/치명/마공).
const DETAIL_COLOR: Record<string, string> = {
  명중: "text-sky-600 dark:text-sky-400",
  회피: "text-cyan-600 dark:text-cyan-400",
  치명: "text-amber-600 dark:text-amber-400",
  마공: "text-violet-600 dark:text-violet-400",
  "내 명중": "text-sky-600 dark:text-sky-400",
  "적 명중": "text-rose-600 dark:text-rose-400",
  "연타 보정": "text-orange-600 dark:text-orange-400",
};

function pct(n: number): string {
  return `${Math.max(0, Math.min(100, Math.round(n)))}%`;
}

// 전투 스탯 한 줄 — 공/방/속 기본, 누르면 상세(명중/회피/치명/마공) 칩 펼침. 플레이어 카드·적 칸 공용.
export function BattleStatStrip({
  stats,
  center = false,
  variant = "player",
  opponentStats,
}: {
  stats: BattleStats;
  center?: boolean;
  variant?: "player" | "enemy";
  opponentStats?: BattleStats;
}) {
  const [open, setOpen] = useState(false);
  const usesMagicAttack = stats.primaryAttack === "magic";
  const primaryAttackLabel = usesMagicAttack ? "마공" : "공";
  const primaryAttackValue = usesMagicAttack
    ? (stats.magicAtk ?? stats.atk ?? 0)
    : (stats.atk ?? 0);
  const details: { label: string; value: string }[] =
    variant === "enemy" && opponentStats
      ? [
          {
            label: "내 명중",
            value: pct(
              100 -
                attackMissPct(
                  stats.evasionPct ?? 0,
                  opponentStats.accuracy ?? 0,
                ),
            ),
          },
          {
            label: "적 명중",
            value: pct(
              100 -
                dodgeChance(
                  opponentStats.evaRating ?? opponentStats.evasionPct ?? 0,
                  stats.accuracy ?? 0,
                ),
            ),
          },
          ...(stats.critChancePct && stats.critChancePct > 0
            ? [{ label: "치명", value: pct(stats.critChancePct) }]
            : []),
          ...(stats.magicAtk && stats.magicAtk > 0
            ? [{ label: "마공", value: String(Math.round(stats.magicAtk)) }]
            : []),
          ...(stats.bonusAttackChancePct && stats.bonusAttackChancePct > 0
            ? [
                {
                  label: "연타 보정",
                  value: `+${Math.round(stats.bonusAttackChancePct)}%`,
                },
              ]
            : []),
        ]
      : [
          { label: "명중", value: String(Math.round(stats.accuracy ?? 0)) },
          { label: "회피", value: pct(stats.evasionPct ?? 0) },
          ...(stats.critChancePct && stats.critChancePct > 0
            ? [{ label: "치명", value: pct(stats.critChancePct) }]
            : []),
          ...(usesMagicAttack
            ? [{ label: "공", value: String(Math.round(stats.atk ?? 0)) }]
            : stats.magicAtk && stats.magicAtk > 0
            ? [{ label: "마공", value: String(Math.round(stats.magicAtk)) }]
            : []),
        ];
  const hasDetails = details.length > 0;
  const align = center ? " justify-center" : "";
  const dim = "text-zinc-400 dark:text-zinc-500";
  const speedLabel = variant === "enemy" ? "행동" : "속";
  const speedValue =
    variant === "enemy" ? (stats.actionSpd ?? stats.spd) : stats.spd;
  return (
    <div className={center ? "text-center" : ""}>
      <button
        type="button"
        onClick={() => hasDetails && setOpen((o) => !o)}
        aria-expanded={hasDetails ? open : undefined}
        disabled={!hasDetails}
        className={`flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300${align} ${
          hasDetails
            ? "cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100"
            : "cursor-default"
        }`}
      >
        <span>
          <span className={dim}>{primaryAttackLabel}</span>{" "}
          {Math.round(primaryAttackValue).toLocaleString()}
        </span>
        <span>
          <span className={dim}>방</span> {(stats.def ?? 0).toLocaleString()}
        </span>
        <span>
          <span className={dim}>{speedLabel}</span>{" "}
          {Math.round(speedValue ?? 0).toLocaleString()}
        </span>
        {hasDetails && <span className={dim}>{open ? "▴" : "▾"}</span>}
      </button>
      {hasDetails && open && (
        <div
          className={`mt-1 flex flex-wrap gap-1 text-[10px] tabular-nums${align}`}
        >
          {details.map((d) => (
            <span
              key={d.label}
              className="inline-flex items-baseline gap-1 whitespace-nowrap rounded-md bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800/70"
            >
              <span className={dim}>{d.label}</span>
              <span
                className={`font-medium ${
                  DETAIL_COLOR[d.label] ?? "text-zinc-700 dark:text-zinc-200"
                }`}
              >
                {d.value}
              </span>
            </span>
          ))}
        </div>
      )}
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

export function PlayerAvatar({
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
  logAnchor = "bottom",
  elementMatchup,
  playerCombat,
  outcome,
  outcomeAction,
}: {
  state: BattleState;
  playerName: string;
  playerStatus: BattlePlayerStatus;
  recentNotifications?: AppNotification[];
  // 플레이어 유효 전투 스탯(공/방/속+상세) — split 플레이어 칸에 적과 대칭 표기. 미전달 시 미표시.
  //   BattleState/리플레이엔 플레이어 스탯이 없어 별도 prop 으로 받는다(리플레이 부분객체 안전).
  playerCombat?: BattleStats;
  // "stacked" = 라이브(v1) 적 위 / 플레이어 아래. "split" = v2 좌(플레이어)/우(적) 반폭.
  layout?: "stacked" | "split";
  // 플레이어 이름 아래 부제(예: "Lv.42 · 견습 검사 · 무속성"). split 레이아웃(v2)에서만 표시.
  // 미전달 시 미표시 — 라이브(stacked)는 그대로.
  playerSubtitle?: string;
  // 로그 스크롤 기준 — "bottom"=최신 추적(라이브 턴별), "top"=1턴부터(전투 후 전체 로그 리플레이).
  logAnchor?: "top" | "bottom";
  // 약점찌르기(+25%) 표시 — "advantage" 면 적 속성 뱃지를 "약점!" 으로 강조 (v2 PvE).
  elementMatchup?: "advantage" | "disadvantage" | "neutral";
  // 전투 종료 결과 — 전달되면 전투 패널 위에 큰 승/패 배너를 띄운다. 미전달(라이브 진행 중·
  //   PvP·코업 등)이면 배너 미표시 → 기존 호출부 렌더 byte-identical.
  outcome?: "win" | "lose";
  // 결과 배너 안에 붙일 후속 액션. 아레나처럼 결과 직후 다음 전투로 이어지는 화면에서만 사용.
  outcomeAction?: BattleOutcomeAction;
}) {
  const hasMp = state.playerMaxMp > 0;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = logAnchor === "top" ? 0 : el.scrollHeight;
  }, [state.log, logAnchor]);

  const recents = (recentNotifications ?? []).slice(
    0,
    RECENT_NOTIFICATIONS_VISIBLE,
  );

  return (
    <div className="space-y-4">
      {outcome && (
        <div
          className={`rounded-lg border-2 px-4 py-3 text-center ${
            outcome === "lose"
              ? "border-rose-500 bg-rose-50 dark:border-rose-600 dark:bg-rose-950"
              : "border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950"
          }`}
        >
          <span
            className={`text-xl font-bold tracking-wide ${
              outcome === "lose"
                ? "text-rose-700 dark:text-rose-300"
                : "text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {outcome === "lose" ? "💀 패배" : "🏆 승리"}
          </span>
          {outcome === "lose" && (
            <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
              이번 전투에서 졌습니다 — 보상이 없습니다.
            </p>
          )}
          {outcomeAction && (
            <div className="mt-3 flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={outcomeAction.onClick}
                disabled={outcomeAction.disabled || outcomeAction.busy}
                className={`inline-flex h-10 min-w-40 items-center justify-center rounded-md px-4 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  outcome === "lose"
                    ? "bg-rose-600 hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400"
                    : "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                }`}
              >
                {outcomeAction.busy
                  ? (outcomeAction.busyLabel ?? "진행 중...")
                  : outcomeAction.label}
              </button>
              {outcomeAction.hint ? (
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  {outcomeAction.hint}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
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
                {/* 공/방/속 — 적 칸과 대칭. 누르면 명중/회피/치명 펼침. EXP 바는 이 패널에서 제거
                    (전투 결과/캐릭터 카드에 노출). */}
                {playerCombat && <BattleStatStrip center stats={playerCombat} />}
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
                {/* 이름 — 플레이어와 동일하게 가운데 한 줄. */}
                <div className="truncate text-center text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
                  {state.enemy.name}
                </div>
                {/* 속성 — 이름 아래 부제(플레이어 부제 위치와 맞춤). 약점이면 강조. */}
                <div
                  className={`-mt-1 truncate text-center text-[11px] ${
                    elementMatchup === "advantage"
                      ? "font-medium text-emerald-600 dark:text-emerald-400"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {V2_ELEMENT_LABEL[state.enemy.element ?? "neutral"]}
                  {elementMatchup === "advantage" && " · 약점!"}
                </div>
                <HpBar
                  compact
                  label="HP"
                  value={state.enemyHp}
                  max={state.enemy.hp}
                  color="bg-rose-500"
                />
                {/* MP — 플레이어와 좌우 위치 맞춤(플레이어가 MP 보유 시 또는 적이 MP 풀 보유 시). */}
                {(hasMp || state.enemyMaxMp > 0) && (
                  <HpBar
                    compact
                    label="MP"
                    value={state.enemyMp}
                    max={state.enemyMaxMp}
                    color="bg-blue-500"
                  />
                )}
                {/* 공/방/속 — 누르면 명중/회피 펼침. 리플레이/PvP enemy 는 스탯이 없을 수
                    있어(payload 부분 객체) atk 숫자일 때만 렌더 — 없으면 표시 생략(크래시 방지). */}
                {typeof state.enemy.atk === "number" &&
                  (() => {
                    const enemyDisplay = state.enemy as typeof state.enemy & {
                      actionSpd?: number;
                    };
                    return (
                      <BattleStatStrip
                        center
                        variant="enemy"
                        opponentStats={playerCombat}
                        stats={{
                          atk: state.enemy.atk,
                          def: state.enemy.def,
                          spd: state.enemy.spd,
                          actionSpd: enemyDisplay.actionSpd,
                          accuracy: state.enemy.accuracy,
                          evasionPct: state.enemy.evasionPct,
                          // 치명형 몹 critPct·마법형 몹 atk(=마공).
                          critChancePct: state.enemy.critPct,
                          magicAtk:
                            state.enemy.atkType === "magic"
                              ? state.enemy.atk
                              : undefined,
                          bonusAttackChancePct:
                            state.enemy.bonusAttackChancePct,
                        }}
                      />
                    );
                  })()}
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
