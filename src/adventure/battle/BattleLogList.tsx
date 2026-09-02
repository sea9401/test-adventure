import type { ReactNode } from "react";
import type { BattleLogEntry } from "../v2/combat/engine";
import { ATB_LOG_WINDOW_TICKS } from "../v2/combat/combatTimeline";
import { v2StatusPillColor } from "@/adventure/data/v2/statusEffects";
import { GameIcon } from "@/adventure/v2/GameIcon";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

export function battleLogPillColor(label: string): string {
  const status = v2StatusPillColor(label);
  if (status) return status;
  if (label.startsWith("회피 경감")) {
    return "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200";
  }
  if (label === "완전 회피" || label.includes("확정 회피")) {
    return "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200";
  }
  if (label.startsWith("마나 실드")) {
    return "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200";
  }
  if (label === "철벽" || label === "가드" || label === "인내") {
    return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200";
  }
  if (/중력|반중력|부유성채|보호막/.test(label)) {
    return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200";
  }
  if (/혈맥|상흔|출혈/.test(label)) {
    return "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200";
  }
  if (/추적|질풍|칼바람/.test(label)) {
    return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200";
  }
  if (/그림자|잔상|삼상/.test(label)) {
    return "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200";
  }
  if (/만독|중독|부식|양면침/.test(label)) {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }
  if (/과부하|뇌명|낙뢰|역류/.test(label)) {
    return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
  }
  if (/성역|새벽|합일/.test(label)) {
    return "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200";
  }
  if (/폭풍 합류|폭풍심장|지배/.test(label)) {
    return "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200";
  }
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
}

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
  actionBubble: string;
  actionInfo: string;
  actionLabel: string;
  banner: string;
  turnMarker: string;
  hpBar: string;
  spacing: string;
};

const SIZES: Record<"normal" | "compact", Sizes> = {
  normal: {
    bubble: "text-[15px]",
    info: "text-[13px]",
    label: "text-xs sm:text-[11px]",
    actionBubble: "text-[13px] sm:text-[15px]",
    actionInfo: "text-xs sm:text-[13px]",
    actionLabel: "text-xs sm:text-[11px]",
    banner: "text-base",
    turnMarker: "text-[12px]",
    hpBar: "text-xs sm:text-[10px]",
    spacing: "space-y-1.5",
  },
  compact: {
    bubble: "text-[13px]",
    info: "text-xs sm:text-[11px]",
    label: "text-xs sm:text-[10px]",
    actionBubble: "text-[12px] sm:text-[13px]",
    actionInfo: "text-xs sm:text-[11px]",
    actionLabel: "text-xs sm:text-[10px]",
    banner: "text-[13px]",
    turnMarker: "text-xs sm:text-[10px]",
    hpBar: "text-xs sm:text-[9px]",
    spacing: "space-y-1",
  },
};

export type BattleLogDisplayItem =
  | {
      kind: "action";
      main: BattleLogEntry;
      hits: BattleLogEntry[];
      calculations: BattleLogEntry[];
      effects: BattleLogEntry[];
    }
  | { kind: "entry"; entry: BattleLogEntry };

const DAMAGE_CALCULATION_LABELS = [
  "회피 경감",
  "받피감",
  "결의",
  "인내",
  "가드",
  "굳건한 의지",
] as const;

const ACTION_RECOVERY_LABELS = ["봉인", "그림자", "해연"] as const;
const ACTION_OPENING_DEFENSE_LABELS = ["철벽", "마나 실드"] as const;

// 2026-08-10 이전 PvP 리플레이는 치명타 등 수식어가 붙은 기본 공격에서 `공격!`을
// 빠뜨렸다. 반사·추가타까지 행동으로 오인하지 않도록 기본 공격 자체를 만들 수 있는
// 수식어가 있으면서 본문이 순수 피해 결과인 경우만 옛 기본 공격으로 복원한다.
const LEGACY_BASIC_ATTACK_LABELS = [
  "강공격",
  "분쇄",
  "처형",
  "치명타",
  "행운의 별",
  "암살",
  "천명",
  "충돌파",
  "불굴의 일격",
  "약점 적중",
  "연쇄 운명",
] as const;

function battleLogDisplayLabel(label: string): string {
  return label === "해연" ? "해연추적" : label;
}

function isLegacyBasicAttackEntry(entry: BattleLogEntry): boolean {
  if (entry.kind !== "player_attack" && entry.kind !== "enemy_attack") {
    return false;
  }
  const { labels, body } = parseBattleLogText(entry.text);
  return (
    labels.some((label) =>
      LEGACY_BASIC_ATTACK_LABELS.some((attackLabel) => label === attackLabel),
    ) && /^\d[\d,]*\s*피해를 입혔다\.?$/.test(body)
  );
}

function isDirectActionEntry(entry: BattleLogEntry): boolean {
  if (entry.kind !== "player_attack" && entry.kind !== "enemy_attack") {
    return false;
  }
  return (
    /^[^!]+!/.test(parseBattleLogText(entry.text).body) ||
    isLegacyBasicAttackEntry(entry)
  );
}

function legacyStandaloneActionMain(
  entry: BattleLogEntry,
): BattleLogEntry | null {
  if (entry.kind !== "info") return null;
  const { labels, body } = parseBattleLogText(entry.text);
  if (
    !labels.includes("그림자 도약") ||
    !/다음 공격 \d+회를 반드시 회피한다\.?$/.test(body)
  ) {
    return null;
  }
  return {
    ...entry,
    kind: entry.turn === "enemy" ? "enemy_attack" : "player_attack",
    text: "그림자 도약! 확정 회피를 준비했다.",
  };
}

function guaranteedDodgeActionMain(
  entry: BattleLogEntry,
): BattleLogEntry | null {
  if (entry.kind !== "info" || entry.turn == null) return null;
  const { labels, body } = parseBattleLogText(entry.text);
  if (!labels.includes("회피 강화") || !/회피했다[.!]?$/.test(body)) {
    return null;
  }
  return {
    ...entry,
    kind: entry.turn === "player" ? "player_attack" : "enemy_attack",
  };
}

function isDamageCalculationEntry(entry: BattleLogEntry): boolean {
  if (entry.kind === "hp_bar") return false;
  const { labels } = parseBattleLogText(entry.text);
  return labels.some((label) =>
    DAMAGE_CALCULATION_LABELS.some(
      (calculation) =>
        label === calculation || label.startsWith(`${calculation} `),
    ),
  );
}

function isActionOpeningEffect(entry: BattleLogEntry): boolean {
  if (entry.kind === "hp_bar") return false;
  const { labels, body } = parseBattleLogText(entry.text);
  return (
    labels.some((label) =>
      ACTION_OPENING_DEFENSE_LABELS.some((defense) => label === defense),
    ) ||
    (labels.some((label) =>
      ACTION_RECOVERY_LABELS.some((recovery) => label === recovery),
    ) &&
      /HP\s*\+\d/.test(body)) ||
    (entry.kind === "info" &&
      /^[^!]+!\s+(?:.+?\s+)?생명력\s+\d+\s+소모$/.test(body))
  );
}

function isActionStartStatusDamage(entry: BattleLogEntry): boolean {
  return "effect" in entry && entry.effect === "status_damage";
}

function isActionBoundaryEntry(entry: BattleLogEntry): boolean {
  return (
    entry.kind === "hp_bar" ||
    entry.kind === "turn_marker" ||
    entry.kind === "phase_trigger"
  );
}

function damageActionHeadline(entry: BattleLogEntry): {
  title: string;
  damage: number;
} | null {
  const { title, result } = actionHeadline(entry.text);
  const match = result.match(/^([\d,]+)\s*피해$/);
  if (!match) return null;
  return {
    title,
    damage: Number(match[1].replaceAll(",", "")),
  };
}

function canMergeActionHit(
  current: Extract<BattleLogDisplayItem, { kind: "action" }>,
  entry: BattleLogEntry,
): boolean {
  if (
    current.effects.some(
      (effect) =>
        !isActionOpeningEffect(effect) && !isActionStartStatusDamage(effect),
    )
  ) {
    return false;
  }
  const previous = current.hits.at(-1) ?? current.main;
  const previousHeadline = damageActionHeadline(previous);
  const nextHeadline = damageActionHeadline(entry);
  if (!previousHeadline || !nextHeadline) return false;
  if (
    previousHeadline.title === "기본 공격" ||
    previousHeadline.title !== nextHeadline.title ||
    entryTurnSide(previous) !== entryTurnSide(entry)
  ) {
    return false;
  }
  return previous.t == null || entry.t == null || previous.t === entry.t;
}

export function groupBattleLogActions(
  entries: BattleLogEntry[],
): BattleLogDisplayItem[] {
  const items: BattleLogDisplayItem[] = [];
  let current: Extract<BattleLogDisplayItem, { kind: "action" }> | null = null;
  let pendingCalculations: BattleLogEntry[] = [];
  let pendingEffects: BattleLogEntry[] = [];

  const flushCurrent = () => {
    if (!current) return;
    items.push(current);
    current = null;
  };
  const flushPendingCalculations = () => {
    for (const entry of pendingCalculations) {
      items.push({ kind: "entry", entry });
    }
    pendingCalculations = [];
  };
  const flushPendingEffects = () => {
    for (const entry of pendingEffects) {
      items.push({ kind: "entry", entry });
    }
    pendingEffects = [];
  };

  for (const entry of entries) {
    if (isActionBoundaryEntry(entry)) {
      flushCurrent();
      flushPendingCalculations();
      flushPendingEffects();
      items.push({ kind: "entry", entry });
      continue;
    }
    const legacyStandaloneMain = legacyStandaloneActionMain(entry);
    if (legacyStandaloneMain) {
      if (
        current != null &&
        parseBattleLogText(current.main.text).body.startsWith("그림자 도약!") &&
        entryTurnSide(current.main) === entryTurnSide(entry)
      ) {
        current.effects.push(entry);
        continue;
      }
      flushCurrent();
      current = {
        kind: "action",
        main: legacyStandaloneMain,
        hits: [legacyStandaloneMain],
        calculations: pendingCalculations,
        effects: [...pendingEffects, entry],
      };
      pendingCalculations = [];
      pendingEffects = [];
      continue;
    }
    const dodgeActionMain = guaranteedDodgeActionMain(entry);
    if (dodgeActionMain) {
      flushCurrent();
      current = {
        kind: "action",
        main: dodgeActionMain,
        hits: [dodgeActionMain],
        calculations: pendingCalculations,
        effects: pendingEffects,
      };
      pendingCalculations = [];
      pendingEffects = [];
      continue;
    }
    if (isDamageCalculationEntry(entry)) {
      flushCurrent();
      pendingCalculations.push(entry);
      continue;
    }
    if (isActionOpeningEffect(entry)) {
      flushCurrent();
      pendingEffects.push(entry);
      continue;
    }
    if (isActionStartStatusDamage(entry)) {
      flushCurrent();
      pendingEffects.push(entry);
      continue;
    }
    if (isDirectActionEntry(entry)) {
      if (current && canMergeActionHit(current, entry)) {
        current.hits.push(entry);
        continue;
      }
      flushCurrent();
      const actionSide = entryTurnSide(entry);
      const actionEffects: BattleLogEntry[] = [];
      for (const pending of pendingEffects) {
        const pendingSide = entryTurnSide(pending);
        if (
          isActionStartStatusDamage(pending) &&
          pendingSide != null &&
          pendingSide !== actionSide
        ) {
          items.push({ kind: "entry", entry: pending });
        } else {
          actionEffects.push(pending);
        }
      }
      current = {
        kind: "action",
        main: entry,
        hits: [entry],
        calculations: pendingCalculations,
        effects: actionEffects,
      };
      pendingCalculations = [];
      pendingEffects = [];
      continue;
    }
    if (current) {
      current.effects.push(entry);
      continue;
    }
    if (pendingCalculations.length > 0 || pendingEffects.length > 0) {
      pendingEffects.push(entry);
      continue;
    }
    flushPendingCalculations();
    flushPendingEffects();
    items.push({ kind: "entry", entry });
  }

  flushCurrent();
  flushPendingCalculations();
  flushPendingEffects();
  return items;
}

export function BattleLogList({
  entries,
  compact = false,
  playerName = "나",
  enemyName = "상대",
}: {
  entries: BattleLogEntry[];
  compact?: boolean;
  playerName?: string;
  enemyName?: string;
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
          playerMagicBarrier={entry.playerMagicBarrier}
          playerMagicBarrierMax={entry.playerMagicBarrierMax}
          enemyMagicBarrier={entry.enemyMagicBarrier}
          enemyMagicBarrierMax={entry.enemyMagicBarrierMax}
          playerSignatureResources={entry.playerSignatureResources}
          enemySignatureResources={entry.enemySignatureResources}
          sizes={s}
        />
      );
    }
    if (entry.kind === "player_attack" || entry.kind === "enemy_attack") {
      if (isEffectBattleLogEntry(entry)) {
        return (
          <EffectLine
            key={i}
            text={entry.text}
            side={effectBattleLogSide(entry)}
            sizes={s}
          />
        );
      }
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
    if (isEffectBattleLogEntry(entry)) {
      return (
        <EffectLine
          key={i}
          text={entry.text}
          side={effectBattleLogSide(entry)}
          sizes={s}
        />
      );
    }
    return <InfoLine key={i} text={entry.text} side={side} sizes={s} />;
  };

  return (
    <div className="space-y-3">
      {groups.map((group, gi) => {
        // 한 박스 안 HP/MP 바는 마지막 1개만 렌더 — 매 행동 뒤 바가 붙어 너무 많아 보이던 것을,
        //   그 윈도우의 "최종 상태" 한 줄로 축약(중간 스냅샷 생략). 표시 단 처리(로그 데이터 불변).
        const lastHpIdx = lastHpBarIndex(group);
        const visibleGroup = group.filter(
          (entry, index) => entry.kind !== "hp_bar" || index === lastHpIdx,
        );
        const displayItems = groupBattleLogActions(visibleGroup);
        const groupTick = battleLogGroupFirstTick(group);
        return (
          <div
            key={gi}
            data-battle-log-group-tick={groupTick ?? undefined}
            className={`${SURFACE_INSET} ${s.spacing} p-2`}
          >
            {displayItems.map((item, index) =>
              item.kind === "action" ? (
                <ActionCard
                  key={`action-${index}`}
                  item={item}
                  side={
                    item.main.kind === "player_attack" ? "left" : "right"
                  }
                  playerName={playerName}
                  enemyName={enemyName}
                  sizes={s}
                />
              ) : (
                renderEntry(item.entry, index)
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────

export function battleLogGroupFirstTick(
  group: BattleLogEntry[],
): number | null {
  for (const entry of group) {
    if (entry.t != null && Number.isFinite(entry.t)) return entry.t;
  }
  return null;
}

function isReceivedDamageEffect(entry: BattleLogEntry): boolean {
  return (
    ("effect" in entry && entry.effect === "status_damage") ||
    /피해를\s*입(?:었다|는다|고|어)/.test(entry.text)
  );
}

// 로그 항목이 실제로 붙을 쪽(player/enemy). 일반 공격·효과는 사용 주체를 따르되,
// 행동 시작 지속 피해는 피해를 받은 주체를 따른다. hp_bar 등 주체 없는 항목은 null.
function entryTurnSide(e: BattleLogEntry): "player" | "enemy" | null {
  if (isReceivedDamageEffect(e)) {
    if (e.turn) return e.turn;
    if (e.kind === "player_attack") return "enemy";
    if (e.kind === "enemy_attack") return "player";
    return null;
  }
  if (e.kind === "player_attack") return "player";
  if (e.kind === "enemy_attack") return "enemy";
  if (e.kind === "hp_bar") return null;
  return e.turn ?? null; // info / phase_trigger / turn_marker
}

// 효과 로그가 붙을 전투 레인. 버프·스택·추가 피해는 사용한 측에, 행동 시작에
// 발생하는 지속 피해는 피해를 받은(=현재 행동하는) 측에 붙인다. 최신 로그의 turn
// 메타데이터를 우선하고, 예전 저장 리플레이는 attack kind를 반대로 읽어 보정한다.
export function effectBattleLogSide(
  entry: BattleLogEntry,
): "left" | "right" | null {
  const source = entryTurnSide(entry);
  return source === "player" ? "left" : source === "enemy" ? "right" : null;
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
    /(\d[\d,]*)\s*피해|HP\s*[+-]\s*\d[\d,]*|ATK\s*[+-]\s*\d[\d,]*|DEF\s*[+-]\s*\d[\d,]*|SPD\s*[+-]\s*\d[\d,]*|[+-]\s*\d+(?:\.\d+)?%?/g;
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

// 예전 "[라벨] 본문"과 현재 "공격! [치명타] 본문" 형식을 모두 해석한다.
// 연속된 라벨("공격! [강타] [마법] …")도 한 번에 분리해 본문을 읽기 쉽게 만든다.
export function parseBattleLogText(text: string): {
  labels: string[];
  body: string;
} {
  const labels: string[] = [];
  let body = text.trim();

  const leading = body.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (leading) {
    labels.push(...leading[1].split(/\s*\+\s*/).filter(Boolean));
    body = leading[2];
  }

  const action = body.match(/^([^!]+!)\s*(.*)$/);
  if (!action) return { labels, body };

  let rest = action[2];
  let foundInlineLabel = false;
  while (true) {
    const inline = rest.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (!inline) break;
    labels.push(...inline[1].split(/\s*\+\s*/).filter(Boolean));
    rest = inline[2];
    foundInlineLabel = true;
  }

  return {
    labels,
    body: foundInlineLabel ? `${action[1]} ${rest}`.trim() : body,
  };
}

// 새 로그는 effect 메타데이터로, 저장된 예전 리플레이는 선두 [라벨] 형식으로 효과 행을
// 구분한다. 일반 공격과 독·화상·반격 등이 같은 말풍선으로 섞이지 않게 한다.
export function isEffectBattleLogEntry(entry: BattleLogEntry): boolean {
  if (entry.kind === "hp_bar" || entry.kind === "phase_trigger" || entry.kind === "turn_marker") {
    return false;
  }
  if (entry.effect != null) return true;
  return /^\s*\[[^\]]+\]/.test(entry.text);
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

type BattleLogActionItem = Extract<
  BattleLogDisplayItem,
  { kind: "action" }
>;

function actionHeadline(text: string): {
  labels: string[];
  title: string;
  result: string;
} {
  const { labels, body } = parseBattleLogText(text);
  const match = body.match(/^([^!]+)!\s*(.*)$/);
  const legacyBasicAttack =
    !match &&
    labels.some((label) =>
      LEGACY_BASIC_ATTACK_LABELS.some((attackLabel) => label === attackLabel),
    ) &&
    /^\d[\d,]*\s*피해를 입혔다\.?$/.test(body);
  const rawTitle = match?.[1]?.trim() || (legacyBasicAttack ? "공격" : "행동");
  const rawResult = match?.[2]?.trim() || body;
  const damage = rawResult.match(/^(\d+)\s*피해를 입혔다\.?$/);
  return {
    labels,
    title: rawTitle === "공격" ? "기본 공격" : rawTitle,
    result: damage
      ? `${Number(damage[1]).toLocaleString("ko-KR")} 피해`
      : rawResult,
  };
}

function actionEffectContent(
  entry: BattleLogEntry,
  actionTitle: string,
  sizes: Sizes,
  ownerName?: string,
): ReactNode {
  const { labels, body } = parseBattleLogText(entry.text);
  const visibleLabels = labels.filter((label) => label !== actionTitle);
  const actionPrefix = `${actionTitle}!`;
  const visibleBody = body.startsWith(actionPrefix)
    ? body.slice(actionPrefix.length).trim()
    : body;
  if (visibleLabels.length === 0 && visibleBody.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${sizes.actionInfo}`}>
      {visibleLabels.map((label, index) => (
        <span
          key={`${label}-${index}`}
          className={`rounded px-1 py-0.5 sm:px-1.5 ${sizes.actionLabel} font-semibold tracking-wide ${battleLogPillColor(label)}`}
        >
          {ownerName && index === 0
            ? `${ownerName}의 ${battleLogDisplayLabel(label)}`
            : battleLogDisplayLabel(label)}
        </span>
      ))}
      {visibleBody ? (
        <span className="text-zinc-600 dark:text-zinc-300">
          {emphasizeNumbers(visibleBody)}
        </span>
      ) : null}
    </div>
  );
}

function ActionCard({
  item,
  side,
  playerName,
  enemyName,
  sizes,
}: {
  item: BattleLogActionItem;
  side: "left" | "right";
  playerName: string;
  enemyName: string;
  sizes: Sizes;
}) {
  const { labels, title: rawTitle, result } = actionHeadline(item.main.text);
  const forcedBySkill =
    item.main.kind === "hp_bar" ? undefined : item.main.forcedBySkill;
  const title = forcedBySkill
    ? `${forcedBySkill} 강제 공격`
    : rawTitle;
  const hitDamages = item.hits
    .map((entry) => damageActionHeadline(entry)?.damage ?? null)
    .filter((damage): damage is number => damage != null);
  const isMultiHit =
    hitDamages.length > 1 && hitDamages.length === item.hits.length;
  const totalHitDamage = hitDamages.reduce((sum, damage) => sum + damage, 0);
  const displayedResult = isMultiHit
    ? `${hitDamages.length}타 · 총 ${totalHitDamage.toLocaleString("ko-KR")} 피해`
    : result;
  const actorName = side === "left" ? playerName : enemyName;
  const actorLabel = side === "left" ? "내 행동" : "상대 행동";
  const damageTargetLabel = side === "left" ? "상대가 받음" : "내가 받음";
  const hasDamageResult = /\d[\d,]*\s*피해/.test(displayedResult);
  const effects = item.effects
    .map((entry, index) => {
      const effectSide = effectBattleLogSide(entry);
      const { labels: effectLabels } = parseBattleLogText(entry.text);
      const isReaction =
        effectSide != null &&
        effectSide !== side &&
        effectLabels.some(
          (label) => label.includes("반사") || label.includes("반격"),
        );
      const ownerName = isReaction
        ? effectSide === "left"
          ? playerName
          : enemyName
        : undefined;
      return {
        content: actionEffectContent(entry, rawTitle, sizes, ownerName),
        key: index,
      };
    })
    .filter((effect) => effect.content != null);
  const align = side === "left" ? "justify-start" : "justify-end";
  const accent =
    side === "left"
      ? "border-l-4 border-l-blue-500"
      : "border-r-4 border-r-violet-500";
  const headerGrid =
    side === "left"
      ? "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto]"
      : "grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)]";
  const identityAlign = side === "left" ? "" : "justify-end text-right";
  const resultAlign =
    side === "left"
      ? "text-left sm:text-right"
      : "text-right sm:text-left";
  const labelAlign =
    side === "left"
      ? "justify-start sm:justify-end"
      : "justify-end sm:justify-start";
  const identityContent = (
    <div className={`order-1 min-w-0 sm:order-none ${identityAlign}`}>
      <div className={`mb-0.5 flex min-w-0 items-center gap-1 ${side === "right" ? "justify-end" : ""}`}>
        <span
          className={`${sizes.actionLabel} shrink-0 rounded border px-1 py-0.5 font-bold ${
            side === "left"
              ? "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300"
              : "border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-300"
          }`}
        >
          {actorLabel}
        </span>
        <span className={`${sizes.actionLabel} min-w-0 truncate font-semibold text-zinc-500 dark:text-zinc-400`}>
          {actorName}
        </span>
      </div>
      <div className={`${sizes.actionBubble} min-w-0 whitespace-normal break-words sm:truncate font-semibold text-zinc-900 dark:text-zinc-100`}>
        {title}
      </div>
    </div>
  );
  const resultContent = (
    <div className={`order-2 min-w-0 sm:order-none ${resultAlign}`}>
      {hasDamageResult ? (
        <div className={`${sizes.actionLabel} mb-0.5 font-semibold text-zinc-500 dark:text-zinc-400`}>
          {damageTargetLabel}
        </div>
      ) : null}
      {labels.length > 0 ? (
        <div className={`mb-0.5 flex flex-wrap gap-1 sm:mb-1 ${labelAlign}`}>
          {labels.map((label, index) => (
            <span
              key={`${label}-${index}`}
              className={`rounded px-1 py-0.5 sm:px-1.5 ${sizes.actionLabel} font-semibold tracking-wide ${battleLogPillColor(label)}`}
            >
              {battleLogDisplayLabel(label)}
            </span>
          ))}
        </div>
      ) : null}
      <div
        className={`${sizes.actionBubble} whitespace-normal break-words sm:whitespace-nowrap text-zinc-700 dark:text-zinc-200`}
        aria-label={isMultiHit ? displayedResult : undefined}
      >
        {emphasizeNumbers(displayedResult)}
      </div>
    </div>
  );
  return (
    <div className={`flex ${align}`} data-battle-action={side}>
      <section className={`${SURFACE_CARD} ${accent} w-full sm:w-[70%] overflow-hidden`}>
        <div className={`grid ${headerGrid} items-center gap-2 px-2 py-1.5 sm:gap-3 sm:px-3 sm:py-2.5`}>
          {side === "left" ? (
            <>
              {identityContent}
              {resultContent}
            </>
          ) : (
            <>
              {resultContent}
              {identityContent}
            </>
          )}
        </div>

        {isMultiHit || effects.length > 0 ? (
          <div className={`${SURFACE_INSET} mx-1.5 mb-1.5 space-y-1 px-2 py-1.5 sm:mx-2 sm:mb-2 sm:space-y-1.5 sm:px-2.5 sm:py-2`}>
            {isMultiHit ? (
              <div
                className={`flex flex-wrap items-center gap-1 ${sizes.actionInfo}`}
                aria-label="타격별 피해"
              >
                {hitDamages.map((damage, index) => (
                  <span
                    key={`${index}-${damage}`}
                    className="rounded bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                  >
                    {index + 1}타 {damage.toLocaleString("ko-KR")} 피해
                  </span>
                ))}
              </div>
            ) : null}
            {effects.map(({ content, key }) => (
              <div key={key}>{content}</div>
            ))}
          </div>
        ) : null}

        {item.calculations.length > 0 ? (
          <details
            name="battle-log-action-details"
            className="border-t border-zinc-200 dark:border-zinc-700"
          >
            <summary className={`${sizes.actionLabel} cursor-pointer list-none px-2 py-1.5 text-right font-semibold text-zinc-500 marker:hidden hover:text-zinc-800 sm:px-3 sm:py-2 dark:text-zinc-400 dark:hover:text-zinc-100`}>
              계산 상세
            </summary>
            <div className={`${SURFACE_INSET} mx-1.5 mb-1.5 space-y-1 px-2 py-1.5 sm:mx-2 sm:mb-2 sm:space-y-1.5 sm:px-2.5 sm:py-2`}>
              <div className={`${sizes.actionLabel} font-semibold text-zinc-700 dark:text-zinc-200`}>
                방어 계산
              </div>
              {item.calculations.map((entry, index) => (
                <div key={index}>
                  {actionEffectContent(entry, title, sizes)}
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </section>
    </div>
  );
}

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
  const { labels, body } = parseBattleLogText(text);
  // 저장된 전투 리플레이의 예전 표기도 계속 강조하되, 새 로그는 "치명타"만 생성한다.
  const isCrit = labels.some(
    (l) => l === "치명타" || l === "크리" || l === "크리티컬",
  );
  const isBasicCrit = isCrit && body.startsWith("공격!");
  const visibleLabels = isBasicCrit
    ? labels.filter(
        (label) => !["치명타", "크리", "크리티컬"].includes(label),
      )
    : labels;
  const displayBody = isBasicCrit
    ? body.replace(/^공격!/, "치명타!")
    : body || labels.join(" + ");
  // 색 박스(초록=아군/빨강=적) 폐지 — 좌우 정렬로만 아군(좌)·적(우) 구분, 글씨는 흰/기본(유저 요청).
  // 피해량 숫자만 빨강 강조 유지(emphasizeNumbers). 상태 라벨 pill 은 v2StatusPillColor, 그 외 중립.
  return (
    <div className={`flex ${isPlayer ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] ${sizes.bubble} leading-snug text-zinc-800 dark:text-zinc-100`}
      >
        {visibleLabels.length > 0 && (
          <div className="mb-0.5 flex flex-wrap gap-1">
            {visibleLabels.map((l, idx) => (
              <span
                key={idx}
                className={`rounded px-1.5 py-0.5 ${sizes.label} font-semibold uppercase tracking-wider ${
                  battleLogPillColor(l)
                }`}
              >
                {battleLogDisplayLabel(l)}
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
  const { labels, body } = parseBattleLogText(text);
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
            battleLogPillColor(l)
          }`}
        >
          {battleLogDisplayLabel(l)}
        </span>
      ))}
      <span className={climax ? "" : "italic"}>
        {body ? emphasizeNumbers(body) : body}
      </span>
    </div>
  );
}

function EffectLine({
  text,
  side,
  sizes,
}: {
  text: string;
  side: "left" | "right" | null;
  sizes: Sizes;
}) {
  const { labels, body } = parseBattleLogText(text);
  const outerAlign =
    side === "left"
      ? "justify-start"
      : side === "right"
        ? "justify-end"
        : "justify-center";
  const innerAlign =
    side === "left"
      ? "justify-start text-left"
      : side === "right"
        ? "flex-row-reverse justify-end text-right"
        : "justify-center text-center";
  const contentAlign =
    side === "left"
      ? "justify-start"
      : side === "right"
        ? "justify-end"
        : "justify-center";
  return (
    <div
      className={`flex px-1 py-0.5 ${outerAlign} ${sizes.info} text-zinc-600 dark:text-zinc-300`}
    >
      <div className={`flex max-w-[85%] items-start gap-1.5 ${innerAlign}`}>
        <span
          aria-hidden="true"
          className="mt-px shrink-0 font-medium leading-none text-zinc-400 dark:text-zinc-500"
        >
          {side === "right" ? "┘" : "└"}
        </span>
        <div className={`flex flex-wrap items-center gap-1 ${contentAlign}`}>
          {labels.map((label, index) => (
            <span
              key={`${label}-${index}`}
              className={`rounded px-1.5 py-0.5 ${sizes.label} font-semibold tracking-wide ${
                battleLogPillColor(label)
              }`}
            >
              {battleLogDisplayLabel(label)}
            </span>
          ))}
          <span>
            {emphasizeNumbers(body)}
          </span>
        </div>
      </div>
    </div>
  );
}

function TurnMarker({ text, sizes }: { text: string; sizes: Sizes }) {
  // 턴 그룹화 후 그룹 박스가 호흡 담당 — TurnMarker 는 박스 안 헤더 한 줄.
  return (
    <div className="flex items-center gap-2 text-zinc-400 dark:text-zinc-600">
      <div className="h-px flex-1 bg-zinc-300 dark:bg-zinc-700" />
      <span
        data-battle-log-metadata="turn-marker"
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
  playerMagicBarrier,
  playerMagicBarrierMax,
  enemyMagicBarrier,
  enemyMagicBarrierMax,
  playerSignatureResources,
  enemySignatureResources,
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
  playerMagicBarrier?: number;
  playerMagicBarrierMax?: number;
  enemyMagicBarrier?: number;
  enemyMagicBarrierMax?: number;
  playerSignatureResources?: Record<string, number | string>;
  enemySignatureResources?: Record<string, number | string>;
  sizes: Sizes;
}) {
  const showPlayerMp =
    playerMaxMp != null && playerMaxMp > 0 && playerMp != null;
  const showEnemyMp =
    enemyMaxMp != null && enemyMaxMp > 0 && enemyMp != null;
  const showPlayerMagicBarrier =
    playerMagicBarrierMax != null && playerMagicBarrierMax > 0 && playerMagicBarrier != null;
  const showEnemyMagicBarrier =
    enemyMagicBarrierMax != null && enemyMagicBarrierMax > 0 && enemyMagicBarrier != null;
  return (
    <div
      data-battle-log-metadata="hp-bar"
      className={`${SURFACE_INSET} px-2 py-1.5 ${sizes.hpBar} text-zinc-700 dark:text-zinc-300`}
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
      {(showPlayerMagicBarrier || showEnemyMagicBarrier) && (
        <div className="mt-1 grid grid-cols-2 gap-3">
          {showPlayerMagicBarrier ? (
            <InlineBar
              label="장벽"
              value={playerMagicBarrier!}
              max={playerMagicBarrierMax!}
              color="bg-violet-500"
            />
          ) : (
            <span />
          )}
          {showEnemyMagicBarrier ? (
            <InlineBar
              label="장벽"
              value={enemyMagicBarrier!}
              max={enemyMagicBarrierMax!}
              color="bg-violet-500"
              align="right"
            />
          ) : (
            <span />
          )}
        </div>
      )}
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
      {(Object.keys(playerSignatureResources ?? {}).length > 0 ||
        Object.keys(enemySignatureResources ?? {}).length > 0) && (
        <div className="mt-1 grid grid-cols-2 gap-3">
          <SignatureResourceChips resources={playerSignatureResources} />
          <SignatureResourceChips
            resources={enemySignatureResources}
            align="right"
          />
        </div>
      )}
    </div>
  );
}

const SIGNATURE_RESOURCE_LABELS: Record<string, string> = {
  gravityReprisal: "중력",
  pursuitMarks: "추적",
  shadowEchoes: "잔상",
  arcaneOverload: "과부하",
  sanctuaryReserve: "성역",
  unity: "합일",
  gale: "질풍",
  dominant: "지배",
  nextDamagePct: "다음 피해",
  nextHealPct: "다음 회복",
  nextShieldPct: "다음 보호막",
  physicalWard: "금강결계",
  magicWard: "봉마결계",
  purificationWard: "정화결계",
  domainStability: "영역 안정",
  lawInscriptions: "각인",
  frostChill: "한기",
  trackingThreat: "추적 위협",
  toxicBlood: "독혈",
  toxicRecoveryLock: "회복 억제",
  glacialChill: "한기",
  glacialFreeze: "빙결",
  fortressTrial: "방벽 시험",
  fortressDamage: "방벽 피해",
  fortressEnrage: "성채 광폭",
  immortalLife: "불멸 생명",
  immortalLifeHp: "현재 생명",
  immortalRegeneration: "재생",
  immortalEnrage: "광폭",
  crystalEyeAim: "천공 포격까지",
  crystalEyeArtillery: "현재 예상 위력",
  crystalEyeDisruption: "조준 붕괴",
  crystalEyeCore: "수정 핵",
  crystalEyeLastArtillery: "직전 포격",
};

const TRIPLE_WARD_RESOURCE_KEYS = new Set([
  "physicalWard",
  "magicWard",
  "purificationWard",
]);

const DOMINANT_LABELS: Record<string, string> = {
  gravity: "중력",
  bleed: "출혈",
  pursuit: "추적",
  shadow: "잔상",
  venom: "중독",
  overload: "과부하",
  sanctuary: "성역",
};

function SignatureResourceChips({
  resources,
  align = "left",
}: {
  resources?: Record<string, number | string>;
  align?: "left" | "right";
}) {
  const entries = Object.entries(resources ?? {});
  if (entries.length === 0) return <span />;
  return (
    <div
      className={`flex flex-wrap gap-1 ${align === "right" ? "justify-end" : "justify-start"}`}
    >
      {entries.map(([key, value]) => {
        const isTripleWard = TRIPLE_WARD_RESOURCE_KEYS.has(key);
        const active = !isTripleWard || Number(value) > 0;
        const displayedValue =
          key === "dominant"
            ? DOMINANT_LABELS[String(value)] ?? value
            : value;
        const displayedText =
          key === "frostChill"
            ? String(value)
            : `${SIGNATURE_RESOURCE_LABELS[key] ?? key} ${displayedValue}`;
        return (
          <span
            key={key}
            aria-label={displayedText}
            data-active={isTripleWard ? active : undefined}
            className={`rounded-full px-1.5 py-0.5 text-xs font-semibold sm:text-[10px] ${
              active
                ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200"
                : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {displayedText}
          </span>
        );
      })}
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
      <span className="w-4 shrink-0 text-xs font-semibold uppercase tracking-wider text-zinc-500 sm:text-[9px] dark:text-zinc-400">
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
      className={`my-1 flex items-center gap-1 rounded border border-amber-400 bg-amber-100 px-2 py-1 ${sizes.banner} text-amber-900 shadow-sm dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200`}
    >
      <GameIcon name="Warning" size={16} weight="fill" className="shrink-0" />
      <span className="font-semibold">{text}</span>
    </div>
  );
}
