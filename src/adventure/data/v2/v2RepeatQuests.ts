// v2 반복 퀘스트(일일/주간) — 순수 엔진. 설계: docs/v2-repeat-quests-plan.md
//
// 가이드 퀘스트(1회성 절대값 자동감지)와 달리 "이번 주기 동안 N회" 차분 판정:
//   주기 시작 시점 누적치 스냅샷(baseline)을 저장하고 `현재 − baseline ≥ 목표`.
// 주기 리셋은 크론 없이 lazy — 조회/수령 시 주기 키가 바뀌었으면 그 자리에서
// 재스냅샷 + claimed 비움 (성벽 재생·시즌 키와 같은 패턴).
//
// 주기: 일일 = KST 자정, 주간 = 월요일 00:00 KST (시즌 크론들과 동일 규칙).

import { kstDayKey, kstWeekMondayKey } from "@/lib/kst";

// KST 날짜/주간 키 — 구현은 lib/kst 로 단일화(키 문자열은 kst.test.ts 가 고정).
// 기존 호출자(낚시 도전·코옵 상점·랭킹 등) 호환을 위해 이름을 유지한 별칭.
export const kstDailyKey = kstDayKey;
export const kstWeeklyKey = kstWeekMondayKey;

// 주기 시작 epoch ms — 아레나 "주기 내 기록" 판정용.
export function periodStartMs(key: string): number {
  return new Date(`${key}T00:00:00.000+09:00`).getTime();
}

// 다음 리셋 epoch ms — UI 카운트다운용.
export function nextDailyResetAt(now: Date): number {
  return periodStartMs(kstDailyKey(now)) + 24 * 3600_000;
}
export function nextWeeklyResetAt(now: Date): number {
  return periodStartMs(kstWeeklyKey(now)) + 7 * 24 * 3600_000;
}

// ── 신호 — 전부 기존 누적치(세이브/DB). arenaTimes 만 타임스탬프 목록 ──────────
export type RepeatSnapshot = {
  battleCount: number;
  siegeAttempts: number;
  siegeWins: number;
  warTreasuryGold: number;
  fishCaught: number;
  enhanceAttempts: number;
};

export type RepeatSignals = RepeatSnapshot & {
  /** 아레나 기록 시각(epoch ms) 목록 — 최근 10판 트림이라 횟수 차분 불가, 존재 판정만. */
  arenaTimes: number[];
};

export function snapshotOf(s: RepeatSignals): RepeatSnapshot {
  return {
    battleCount: s.battleCount,
    siegeAttempts: s.siegeAttempts,
    siegeWins: s.siegeWins,
    warTreasuryGold: s.warTreasuryGold,
    fishCaught: s.fishCaught,
    enhanceAttempts: s.enhanceAttempts,
  };
}

// ── 퀘스트 정의 ─────────────────────────────────────────────────────────────
export type RepeatScope = "daily" | "weekly";

export type RepeatQuestDef = {
  id: string;
  scope: RepeatScope;
  title: string;
  desc: string;
  goal: number;
  reward: { gold: number };
  /** 주기 내 진행량 — 차분(또는 주기 내 존재 판정). */
  progress: (
    cur: RepeatSignals,
    base: RepeatSnapshot,
    periodStart: number,
  ) => number;
};

const diff =
  (key: keyof RepeatSnapshot) =>
  (cur: RepeatSignals, base: RepeatSnapshot): number =>
    Math.max(0, cur[key] - base[key]);

export const REPEAT_QUESTS: readonly RepeatQuestDef[] = [
  // 일일 — 10~20분 분량, 콘텐츠 한 바퀴(사냥/전쟁/낚시/강화/아레나).
  {
    id: "d_battles",
    scope: "daily",
    title: "오늘의 사냥",
    desc: "전투 30회를 치르세요.",
    goal: 30,
    reward: { gold: 800 },
    progress: diff("battleCount"),
  },
  {
    id: "d_claim",
    scope: "daily",
    title: "오늘의 출정",
    desc: "거점 점령전을 1회 시도하세요.",
    goal: 1,
    reward: { gold: 1000 },
    progress: diff("siegeAttempts"),
  },
  {
    id: "d_fish",
    scope: "daily",
    title: "오늘의 손맛",
    desc: "물고기 3마리를 낚으세요.",
    goal: 3,
    reward: { gold: 600 },
    progress: diff("fishCaught"),
  },
  {
    id: "d_enhance",
    scope: "daily",
    title: "오늘의 단조",
    desc: "대장간에서 강화를 1회 시도하세요.",
    goal: 1,
    reward: { gold: 600 },
    progress: diff("enhanceAttempts"),
  },
  {
    id: "d_arena",
    scope: "daily",
    title: "오늘의 결투",
    desc: "아레나에서 1판 싸우세요.",
    goal: 1,
    reward: { gold: 1000 },
    progress: (cur, _base, periodStart) =>
      cur.arenaTimes.some((t) => t >= periodStart) ? 1 : 0,
  },
  // 주간 — 한 주 누적.
  {
    id: "w_battles",
    scope: "weekly",
    title: "주간 토벌",
    desc: "이번 주 전투 500회를 달성하세요.",
    goal: 500,
    reward: { gold: 8000 },
    progress: diff("battleCount"),
  },
  {
    id: "w_enhance",
    scope: "weekly",
    title: "주간 단조",
    desc: "이번 주 대장간에서 강화를 5회 시도하세요.",
    goal: 5,
    reward: { gold: 8000 },
    progress: diff("enhanceAttempts"),
  },
  {
    id: "w_arena",
    scope: "weekly",
    title: "주간 결투",
    desc: "이번 주 아레나에서 5판 싸우세요.",
    goal: 5,
    reward: { gold: 8000 },
    progress: (cur, _base, periodStart) =>
      cur.arenaTimes.filter((t) => t >= periodStart).length,
  },
  {
    id: "w_fish",
    scope: "weekly",
    title: "주간 어획",
    desc: "이번 주 물고기 30마리를 낚으세요.",
    goal: 30,
    reward: { gold: 6000 },
    progress: diff("fishCaught"),
  },
];

const REPEAT_BY_ID = new Map(REPEAT_QUESTS.map((q) => [q.id, q]));
export function repeatQuestById(id: string): RepeatQuestDef | undefined {
  return REPEAT_BY_ID.get(id);
}

// ── 세이브(repeat-quests.v2, 서버 전용) ─────────────────────────────────────
export type RepeatPeriodState = {
  key: string;
  baseline: RepeatSnapshot;
  claimed: string[];
  /** 이번 주기 마일스톤 번들 보상을 수령했는지(주기 롤오버 시 false 리셋). */
  bundleClaimed?: boolean;
};
export type RepeatSave = {
  daily?: RepeatPeriodState;
  weekly?: RepeatPeriodState;
};

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

function parsePeriod(raw: unknown): RepeatPeriodState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as { key?: unknown; baseline?: unknown; claimed?: unknown };
  if (typeof r.key !== "string" || !r.key) return undefined;
  const b = (r.baseline ?? {}) as Record<string, unknown>;
  return {
    key: r.key,
    baseline: {
      battleCount: num(b.battleCount),
      siegeAttempts: num(b.siegeAttempts),
      siegeWins: num(b.siegeWins),
      warTreasuryGold: num(b.warTreasuryGold),
      fishCaught: num(b.fishCaught),
      enhanceAttempts: num(b.enhanceAttempts),
    },
    claimed: Array.isArray(r.claimed)
      ? r.claimed.filter((x): x is string => typeof x === "string")
      : [],
    bundleClaimed:
      (r as { bundleClaimed?: unknown }).bundleClaimed === true,
  };
}

export function parseRepeatSave(raw: unknown): RepeatSave {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as { daily?: unknown; weekly?: unknown };
  return { daily: parsePeriod(r.daily), weekly: parsePeriod(r.weekly) };
}

// 롤오버 — 주기 키가 바뀌었으면 현재 누적치로 재스냅샷 + claimed 비움.
// changed=true 면 호출부가 upsert (GET 은 무락 lazy write — 동시 호출도 같은 값이라 무해).
export function rolloverRepeatSave(
  save: RepeatSave,
  now: Date,
  signals: RepeatSignals,
): { save: RepeatSave; changed: boolean } {
  const dKey = kstDailyKey(now);
  const wKey = kstWeeklyKey(now);
  let changed = false;
  let daily = save.daily;
  let weekly = save.weekly;
  if (!daily || daily.key !== dKey) {
    daily = {
      key: dKey,
      baseline: snapshotOf(signals),
      claimed: [],
      bundleClaimed: false,
    };
    changed = true;
  }
  if (!weekly || weekly.key !== wKey) {
    weekly = {
      key: wKey,
      baseline: snapshotOf(signals),
      claimed: [],
      bundleClaimed: false,
    };
    changed = true;
  }
  return { save: { daily, weekly }, changed };
}

// ── 뷰 파생 — 패널/배지용 ───────────────────────────────────────────────────
export type RepeatQuestView = {
  id: string;
  scope: RepeatScope;
  title: string;
  desc: string;
  goal: number;
  progress: number; // goal 로 클램프
  reward: { gold: number };
  /** 진행도 ≥ 목표 — 마일스톤 번들의 "완료" 판정 기준(개별 수령 개념은 폐지). */
  complete: boolean;
  // 아래 두 필드는 개별 보상 폐지로 사실상 미사용(번들로 일원화) — 호환 위해 유지.
  claimed: boolean;
  claimable: boolean;
};

export function deriveRepeatViews(
  save: RepeatSave,
  signals: RepeatSignals,
): RepeatQuestView[] {
  return REPEAT_QUESTS.map((q) => {
    const period = q.scope === "daily" ? save.daily : save.weekly;
    const baseline = period?.baseline ?? snapshotOf(signals);
    const start = period ? periodStartMs(period.key) : Date.now();
    const raw = q.progress(signals, baseline, start);
    const progress = Math.min(q.goal, Math.max(0, Math.floor(raw)));
    const complete = progress >= q.goal;
    const claimed = period?.claimed.includes(q.id) ?? false;
    return {
      id: q.id,
      scope: q.scope,
      title: q.title,
      desc: q.desc,
      goal: q.goal,
      progress,
      reward: q.reward,
      complete,
      claimed,
      claimable: !claimed && complete,
    };
  });
}

// ── 마일스톤 번들(일일/주간 완료 보너스) ────────────────────────────────────
// 개별 퀘 보상은 폐지(2026-06-20) — 일일 4개 / 주간 3개 "완료"(진행도≥목표) 시 번들 보상 수령.
//   보상 = 스태미나 포션(보관형 소비템, staminaPotions.ts). 주기당 1회(bundleClaimed).
export const BUNDLE_GOAL: Record<RepeatScope, number> = { daily: 4, weekly: 3 };
export const BUNDLE_POTIONS: Record<RepeatScope, number> = { daily: 2, weekly: 5 };

export type RepeatBundleView = {
  scope: RepeatScope;
  completed: number; // 이번 주기 완료한 퀘 수(진행도≥목표)
  total: number; // 그 주기 전체 퀘 수(분모)
  goal: number; // 번들 해금에 필요한 완료 수
  potions: number; // 보상 스태미나 포션 수
  claimed: boolean; // 이번 주기 번들 수령했는지
  claimable: boolean; // completed≥goal && !claimed
};

export function deriveRepeatBundle(
  save: RepeatSave,
  signals: RepeatSignals,
  scope: RepeatScope,
): RepeatBundleView {
  const views = deriveRepeatViews(save, signals).filter((v) => v.scope === scope);
  const completed = views.filter((v) => v.complete).length;
  const period = scope === "daily" ? save.daily : save.weekly;
  const claimed = period?.bundleClaimed === true;
  const goal = BUNDLE_GOAL[scope];
  return {
    scope,
    completed,
    total: views.length,
    goal,
    potions: BUNDLE_POTIONS[scope],
    claimed,
    claimable: completed >= goal && !claimed,
  };
}
