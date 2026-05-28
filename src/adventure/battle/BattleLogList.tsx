import type { ReactNode } from "react";
import type { BattleLogEntry } from "./engine";

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
  bubblePadding: string;
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
    bubblePadding: "px-3 py-2",
    spacing: "space-y-1.5",
  },
  compact: {
    bubble: "text-[13px]",
    info: "text-[11px]",
    label: "text-[10px]",
    banner: "text-[13px]",
    turnMarker: "text-[10px]",
    hpBar: "text-[9px]",
    bubblePadding: "px-2 py-1",
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
  return (
    <div className={s.spacing}>
      {entries.map((entry, i) => {
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
              ap={entry.ap}
              apMax={entry.apMax}
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
        // info — entry.turn 이 있으면 좌/우, 없으면 가운데. 미래에 추가될 미지 kind 도
        // 같은 경로로 폴백해 빨강 버블로 오해석되지 않게.
        const side =
          entry.turn === "enemy" ? "right" : entry.turn === "player" ? "left" : null;
        return <InfoLine key={i} text={entry.text} side={side} sizes={s} />;
      })}
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────

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
  const bubbleColor = isPlayer
    ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:text-emerald-200"
    : "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-700/50 dark:bg-rose-950/40 dark:text-rose-200";
  const labelColor = isPlayer
    ? "bg-emerald-200/70 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200"
    : "bg-rose-200/70 text-rose-900 dark:bg-rose-900/60 dark:text-rose-200";
  return (
    <div className={`flex ${isPlayer ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-lg border ${sizes.bubblePadding} ${sizes.bubble} leading-snug shadow-sm ${bubbleColor} ${
          isCrit ? "ring-1 ring-amber-400/70" : ""
        }`}
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
                className={`rounded px-1.5 py-0.5 ${sizes.label} font-semibold uppercase tracking-wider ${labelColor}`}
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
          className={`rounded bg-zinc-100 px-1.5 py-0.5 ${sizes.label} font-semibold uppercase tracking-wider text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200`}
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
  // 턴 사이 호흡 — my-4 (위·아래 16px) 로 명확한 구분. space-y 보다 강하게.
  return (
    <div className="my-4 flex items-center gap-2 text-zinc-400 dark:text-zinc-600">
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
  ap,
  apMax,
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
  ap: number;
  apMax: number;
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
      {apMax > 0 && (
        // AP 핍 — 플레이어 HP 막대 바로 위. 미장착(apMax=0) 은 그리지 않아 라인 공간 절약.
        <div className="mb-1 flex items-center gap-1">
          {Array.from({ length: apMax }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className={
                i < ap
                  ? "h-2 w-2 rounded-full border border-violet-600 bg-violet-500 dark:border-violet-400 dark:bg-violet-400"
                  : "h-2 w-2 rounded-full border border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
              }
            />
          ))}
          <span className="ml-1 text-zinc-500 dark:text-zinc-400">
            AP {ap}/{apMax}
          </span>
        </div>
      )}
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
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  // [라벨][바][숫자]. 바는 컬럼 채움(flex-1) + 살짝 더 짧게(max-w-[88px]) + 두꺼움(h-2).
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-4 shrink-0 text-[9px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <div className="h-2 min-w-0 max-w-[88px] flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
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
