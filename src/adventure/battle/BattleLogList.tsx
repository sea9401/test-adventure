import type { ReactNode } from "react";
import type { BattleLogEntry } from "../v2/combat/engine";
import { ATB_LOG_WINDOW_TICKS } from "../v2/combat/combatTimeline";
import { v2StatusPillColor } from "@/adventure/data/v2/statusEffects";

// 전투 로그 공용 렌더러 — BattleScene / RecentLogView / CoopBossCard 가 같은 UI 로 통일.
// 라벨 pill + 데미지 강조 + 양쪽 레인 버블 + 턴 구분선 + 페이즈 트리거 배너.
//
// compact prop:
//   - false (기본) — 메인 전투 화면용. 큰 글자, 넓은 padding.
//   - true — 인라인 펼침용 (알림 펼침, 협동 참가자 펼침). 작은 글자, 좁은 padding.

type Sizes = {
  bubble: string;
  info: string;
  label: string;
  banner: string;
  turnMarker: string;
  hpBar: string;
  spacing: string;
};

const SIZES: Record<"normal" | "compact", Sizes> = {
  normal: {
    bubble: "text-[15px]",
    info: "text-[13px]",
    label: "text-[11px]",
    banner: "text-base",
    turnMarker: "text-[12px]",
    hpBar: "text-[10px]",
    spacing: "space-y-1.5",
  },
  compact: {
    bubble: "text-[13px]",
    info: "text-[11px]",
    label: "text-[10px]",
    banner: "text-[13px]",
    turnMarker: "text-[10px]",
    hpBar: "text-[9px]",
    spacing: "space-y-1",
  },
};

export function BattleLogList({
  entries,
  compact = false,
}: {
  entries: BattleLogEntry[];
  compact?: boolean;
}) {
  const s = compact ? SIZES.compact : SIZES.normal;
  const groups = groupBattleLogEntries(entries);

  const renderEntry = (entry: BattleLogEntry, i: number) => {
    if (entry.kind === "phase_trigger") {
      return <PhaseTriggerBanner key={i} text={entry.text} sizes={s} />;
    }
    if (entry.kind === "turn_marker") {
      return <TurnMarker key={i} text={entry.text} sizes={s} />;
    }
    if (entry.kind === "hp_bar") {
      return (
        <HpBar
          key={i}
          playerHp={entry.playerHp}
          playerMaxHp={entry.playerMaxHp}
          enemyHp={entry.enemyHp}
          enemyMaxHp={entry.enemyMaxHp}
          playerMp={entry.playerMp}
          playerMaxMp={entry.playerMaxMp}
          enemyMp={entry.enemyMp}
          enemyMaxMp={entry.enemyMaxMp}
          sizes={s}
        />
      );
    }
    if (entry.kind === "player_attack" || entry.kind === "enemy_attack") {
      return (
        <AttackBubble
          key={i}
          side={entry.kind === "player_attack" ? "left" : "right"}
          text={entry.text}
          sizes={s}
        />
      );
    }
    const side =
      entry.turn === "enemy" ? "right" : entry.turn === "player" ? "left" : null;
    return <InfoLine key={i} text={entry.text} side={side} sizes={s} />;
  };

  return (
    <div className="space-y-3">
      {groups.map((group, gi) => {
        // 한 박스 안 HP/MP 바는 마지막 1개만 렌더 — 매 행동 뒤 바가 붙어 너무 많아 보이던 것을,
        //   그 윈도우의 "최종 상태" 한 줄로 축약(중간 스냅샷 생략). 표시 단 처리(로그 데이터 불변).
        const lastHpIdx = lastHpBarIndex(group);
        return (
          <div
            key={gi}
            className={`${s.spacing} rounded-md border border-zinc-200 bg-white/50 p-2 dark:border-zinc-800 dark:bg-zinc-900/50`}
          >
            {group.map((entry, i) =>
              entry.kind === "hp_bar" && i !== lastHpIdx
                ? null
                : renderEntry(entry, i),
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────

// 로그 항목이 어느 쪽(player/enemy) 턴인지. 공격은 kind 로, info/페이즈는 turn 필드로.
// hp_bar 등 턴 정보 없는 항목은 null → 현재 박스에 흡수된다.
function entryTurnSide(e: BattleLogEntry): "player" | "enemy" | null {
  if (e.kind === "player_attack") return "player";
  if (e.kind === "enemy_attack") return "enemy";
  if (e.kind === "hp_bar") return null;
  return e.turn ?? null; // info / phase_trigger / turn_marker
}

// 전투 로그를 박스(그룹) 단위로 묶는다.
//   - ATB(엔트리에 틱 t 동봉): 틱 윈도우(ATB_LOG_WINDOW_TICKS) 단위로 묶음 = "한 순간". 행동자가
//     틱마다 번갈아도(빠른 빌드는 더 자주) 한 윈도우의 플레이어·적 행동이 한 박스에 모여, 행동마다
//     박스가 갈려 잘게 쪼개지던 것을 완화. 박스당 HP 바는 렌더 단계에서 마지막 1개만(최종 상태).
//   - PvE 레거시(turn_marker 있음): turn_marker 를 그룹 헤더로. 시작 전 entries 는 별도 그룹.
//   - PvP 레거시(turn_marker 없음): 턴(공격 주체)이 바뀔 때마다 새 박스. 같은 턴 멀티공격·info 묶음.
//   전부 표시 단 처리 — 엔진/저장 리플레이 데이터는 불변.
export function groupBattleLogEntries(
  entries: BattleLogEntry[],
): BattleLogEntry[][] {
  // ATB 틱이 하나라도 있으면 윈도우 그룹화(라이브 경로). 없으면 레거시 폴백(옛 로그·고정교대).
  if (entries.some((e) => e.t != null)) {
    return groupByTickWindow(entries);
  }
  const hasTurnMarker = entries.some((e) => e.kind === "turn_marker");
  const groups: BattleLogEntry[][] = [];
  let cur: BattleLogEntry[] = [];
  if (hasTurnMarker) {
    for (const e of entries) {
      if (e.kind === "turn_marker") {
        if (cur.length > 0) groups.push(cur);
        cur = [e];
      } else {
        cur.push(e);
      }
    }
  } else {
    let curTurn: "player" | "enemy" | null = null;
    for (const e of entries) {
      const t = entryTurnSide(e);
      // 턴 주체가 바뀌면(직전 박스에 내용이 있을 때) 새 박스 시작. 턴 없는 항목(hp_bar 등)은
      //   현재 박스에 그대로 붙는다.
      if (t !== null && curTurn !== null && t !== curTurn && cur.length > 0) {
        groups.push(cur);
        cur = [];
      }
      if (t !== null) curTurn = t;
      cur.push(e);
    }
  }
  if (cur.length > 0) groups.push(cur);
  return groups;
}

// 한 박스(그룹) 안에서 마지막 hp_bar 의 인덱스(없으면 -1). 렌더가 이 1개만 그리고 나머지 hp_bar
//   는 생략 — 윈도우의 "최종 상태" 한 줄만 보여 매 행동 바 클러터를 없앤다.
export function lastHpBarIndex(group: BattleLogEntry[]): number {
  let idx = -1;
  for (let i = 0; i < group.length; i += 1) {
    if (group[i].kind === "hp_bar") idx = i;
  }
  return idx;
}

// ATB 틱 윈도우 그룹화 — e.t 를 ATB_LOG_WINDOW_TICKS 로 나눈 버킷이 바뀔 때 새 박스.
//   틱 없는 항목(오프닝 info 등)은 현재 박스에 흡수(버킷 미변경). 윈도우 폭은 표시 다이얼.
function groupByTickWindow(entries: BattleLogEntry[]): BattleLogEntry[][] {
  const groups: BattleLogEntry[][] = [];
  let cur: BattleLogEntry[] = [];
  let curBucket: number | null = null;
  for (const e of entries) {
    if (e.t != null) {
      const bucket = Math.floor(e.t / ATB_LOG_WINDOW_TICKS);
      if (curBucket !== null && bucket !== curBucket && cur.length > 0) {
        groups.push(cur);
        cur = [];
      }
      curBucket = bucket;
    }
    cur.push(e);
  }
  if (cur.length > 0) groups.push(cur);
  return groups;
}

// 데미지·회복·스탯 수치를 강조. 피해량(N 피해) 은 빨강 + 굵게, 나머지는 굵게.
function emphasizeNumbers(text: string): ReactNode[] {
  const re =
    /(\d+)\s*피해|HP\s*[+-]\s*\d+|ATK\s*[+-]\s*\d+|DEF\s*[+-]\s*\d+|SPD\s*[+-]\s*\d+|[+-]\s*\d+%?/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const isDamage = /피해/.test(m[0]);
    parts.push(
      <strong
        key={m.index}
        className={
          isDamage
            ? "font-semibold text-rose-600 dark:text-rose-400"
            : "font-semibold"
        }
      >
        {m[0]}
      </strong>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : [text];
}

// "[라벨1 + 라벨2] 본문" → { labels: [...], body: "본문" }
function parseLabel(text: string): { labels: string[]; body: string } {
  const m = text.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!m) return { labels: [], body: text };
  const labels = m[1].split(/\s*\+\s*/).filter(Boolean);
  return { labels, body: m[2] };
}

function isClimaxInfo(text: string): boolean {
  return (
    text.includes("쓰러뜨렸다") ||
    text.includes("쓰러졌다") ||
    text.includes("나타났다") ||
    text.includes("선공") ||
    text.includes("능력 [")
  );
}

// ── components ──────────────────────────────────────────────────────────

function AttackBubble({
  side,
  text,
  sizes,
}: {
  side: "left" | "right";
  text: string;
  sizes: Sizes;
}) {
  const isPlayer = side === "left";
  const { labels, body } = parseLabel(text);
  const isCrit = labels.some((l) => l === "크리" || l === "크리티컬");
  const displayBody = body || labels.join(" + ");
  // 색 박스(초록=아군/빨강=적) 폐지 — 좌우 정렬로만 아군(좌)·적(우) 구분, 글씨는 흰/기본(유저 요청).
  // 피해량 숫자만 빨강 강조 유지(emphasizeNumbers). 상태 라벨 pill 은 v2StatusPillColor, 그 외 중립.
  return (
    <div className={`flex ${isPlayer ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] ${sizes.bubble} leading-snug text-zinc-800 dark:text-zinc-100`}
      >
        {(labels.length > 0 || isCrit) && (
          <div className="mb-0.5 flex flex-wrap gap-1">
            {isCrit && (
              <span className="text-xs leading-none text-amber-500 dark:text-amber-400">
                ★
              </span>
            )}
            {labels.map((l, idx) => (
              <span
                key={idx}
                className={`rounded px-1.5 py-0.5 ${sizes.label} font-semibold uppercase tracking-wider ${
                  v2StatusPillColor(l) ??
                  "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                }`}
              >
                {l}
              </span>
            ))}
          </div>
        )}
        <div>{body ? emphasizeNumbers(displayBody) : displayBody}</div>
      </div>
    </div>
  );
}

function InfoLine({
  text,
  side,
  sizes,
}: {
  text: string;
  side: "left" | "right" | null;
  sizes: Sizes;
}) {
  const { labels, body } = parseLabel(text);
  const climax = isClimaxInfo(text);
  const align =
    climax || side === null
      ? "justify-center"
      : side === "left"
        ? "justify-start"
        : "justify-end";
  return (
    <div
      className={`flex items-center gap-1.5 px-1 ${sizes.info} ${align} ${
        climax
          ? "py-1 text-center font-medium text-zinc-700 dark:text-zinc-200"
          : "text-zinc-500 dark:text-zinc-400"
      }`}
    >
      {labels.map((l, idx) => (
        <span
          key={idx}
          className={`rounded px-1.5 py-0.5 ${sizes.label} font-semibold uppercase tracking-wider ${
            v2StatusPillColor(l) ??
            "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          }`}
        >
          {l}
        </span>
      ))}
      <span className={climax ? "" : "italic"}>
        {body ? emphasizeNumbers(body) : body}
      </span>
    </div>
  );
}

function TurnMarker({ text, sizes }: { text: string; sizes: Sizes }) {
  // 턴 그룹화 후 그룹 박스가 호흡 담당 — TurnMarker 는 박스 안 헤더 한 줄.
  return (
    <div className="flex items-center gap-2 text-zinc-400 dark:text-zinc-600">
      <div className="h-px flex-1 bg-zinc-300 dark:bg-zinc-700" />
      <span
        className={`rounded-full bg-zinc-100 px-2 py-0.5 ${sizes.turnMarker} font-semibold uppercase tracking-wider text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`}
      >
        {text}
      </span>
      <div className="h-px flex-1 bg-zinc-300 dark:bg-zinc-700" />
    </div>
  );
}

function HpBar({
  playerHp,
  playerMaxHp,
  enemyHp,
  enemyMaxHp,
  playerMp,
  playerMaxMp,
  enemyMp,
  enemyMaxMp,
  sizes,
}: {
  playerHp: number;
  playerMaxHp: number;
  enemyHp: number;
  enemyMaxHp: number;
  playerMp?: number;
  playerMaxMp?: number;
  enemyMp?: number;
  enemyMaxMp?: number;
  sizes: Sizes;
}) {
  const showPlayerMp =
    playerMaxMp != null && playerMaxMp > 0 && playerMp != null;
  const showEnemyMp =
    enemyMaxMp != null && enemyMaxMp > 0 && enemyMp != null;
  return (
    <div
      className={`rounded border border-zinc-200 bg-zinc-50/70 px-2 py-1.5 ${sizes.hpBar} text-zinc-700 dark:border-zinc-700/60 dark:bg-zinc-900/40 dark:text-zinc-300`}
    >
      <div className="grid grid-cols-2 gap-3">
        <InlineBar
          label="HP"
          value={playerHp}
          max={playerMaxHp}
          color="bg-emerald-500"
        />
        <InlineBar
          label="HP"
          value={enemyHp}
          max={enemyMaxHp}
          color="bg-rose-500"
          align="right"
        />
      </div>
      {(showPlayerMp || showEnemyMp) && (
        <div className="mt-1 grid grid-cols-2 gap-3">
          {showPlayerMp ? (
            <InlineBar
              label="MP"
              value={playerMp!}
              max={playerMaxMp!}
              color="bg-blue-500"
            />
          ) : (
            <span />
          )}
          {showEnemyMp ? (
            <InlineBar
              label="MP"
              value={enemyMp!}
              max={enemyMaxMp!}
              color="bg-blue-500"
              align="right"
            />
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}

function InlineBar({
  label,
  value,
  max,
  color,
  align = "left",
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  align?: "left" | "right";
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  // [라벨][바][숫자] 순서 그대로. align="right" 면 컬럼 우측에 붙임 (적 측).
  return (
    <div
      className={`flex items-center gap-1.5 ${
        align === "right" ? "justify-end" : "justify-start"
      }`}
    >
      <span className="w-4 shrink-0 text-[9px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <div className="h-2 min-w-0 max-w-[104px] flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
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

function PhaseTriggerBanner({ text, sizes }: { text: string; sizes: Sizes }) {
  return (
    <div
      className={`my-1 rounded border border-amber-400/60 bg-amber-100/70 px-2 py-1 ${sizes.banner} text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-900/30 dark:text-amber-200`}
    >
      <span className="mr-1">⚠</span>
      <span className="font-semibold">{text}</span>
    </div>
  );
}
