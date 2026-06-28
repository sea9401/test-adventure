// v2 전투 패턴 (갬빗) — 플레이어가 "조건 → 행동" 블록을 우선순위로 배열하면, 매 턴 위에서부터
// 조건이 맞고 실행 가능한(쿨다운·MP) 첫 블록의 스킬을 발동한다. 옛 pickAutoCastV2Skill(슬롯순서
// +procChance)을 대체 — 조건 충족 시 확정 발동(procChance 은퇴), throttle 은 MP·쿨다운·패턴 자체
// (낮은 우선순위 "항상→평타" 폴백)로 넘어간다. UI: "전투 패턴" 에디터(C2).
//
// 이 모듈은 순수 — V2_SKILLS/MP비용 등 스킬 카탈로그는 import 하지 않는다(순환 회피). 스킬
// 사용 가능 판정(쿨다운/MP/효과유무)은 호출부(combatShared)가 isUsable 콜백으로 주입한다.
// 조건 평가에 필요한 전투 상태는 PatternCtx 로 받는다(엔진이 매 턴 합성).

import type { StatKey } from "@/adventure/data/stats";

// 🚩 기능 플래그 — C1~C3(데이터/엔진·UI·재밸런스) 완성 전까지 off. on 이면 엔진이 패턴 평가기로
//    스킬을 고르고 procChance 를 건너뛴다(확정 발동). off 면 옛 슬롯순서+proc 경로 유지(무변).
export const V2_COMBAT_PATTERN_ENABLED = true;

// 적 상태 태그 — 적에게 쌓인 DoT/취약 스택(combatShared V2Dot tag + magicVuln).
export type V2PatternEnemyStatus = "bleed" | "poison" | "vuln";

// 조건 — "언제 이 블록을 발동하나". 아군/위치는 1:1 자동전투엔 없어 미포함(파티 도입 시 확장).
export type V2CombatCondition =
  | { kind: "always" }
  // 내 HP/MP 비율(0~100). below = 이하, above = 이상(둘 다 경계 포함).
  | { kind: "self_hp"; op: "below" | "above"; pct: number }
  | { kind: "self_mp"; op: "below" | "above"; pct: number }
  // 내 상태 — 특정 스탯 버프 활성/미활성(재버프 낭비 방지 등). v2SelfBuffs 키 = StatKey.
  | { kind: "self_buff"; stat: StatKey; active: boolean }
  // 내 파생 버프(회피/치명/받피감 = selfBuffPct) 활성/미활성 — 만료 시 재시전(선풍각·철포).
  | {
      kind: "self_buff_pct";
      target: "evasion" | "crit" | "damageReduction";
      active: boolean;
    }
  // 적 HP 비율.
  | { kind: "enemy_hp"; op: "below" | "above"; pct: number }
  // 적 상태 — DoT/취약 스택. atLeast = stacks 이상, none = 0(스택 없을 때).
  | { kind: "enemy_status"; tag: V2PatternEnemyStatus; op: "atLeast" | "none"; stacks: number }
  // 내 공격 차례(턴, 1-based). atMost/atLeast = 이하/이상, every = N 배수(주기).
  | { kind: "turn"; op: "atMost" | "atLeast" | "every"; value: number };

// 행동 — 특정 스킬 사용 또는 현재 로드아웃에서 역할에 맞는 스킬 사용.
// role 은 패턴 블록을 장착 스킬 id 에서 분리하는 QoL 경로다. 실제 발동은 호출부가 현재 equipped
// 안에서만 resolve 하므로 SP/장착 게이트는 그대로 유지된다.
export type V2CombatRole = "main_attack" | "heal" | "buff" | "debuff";
export type V2CombatAction =
  | { kind: "skill"; skillId: string }
  | { kind: "role"; role: V2CombatRole };

export type V2CombatBlock = {
  condition: V2CombatCondition;
  action: V2CombatAction;
};

export type V2CombatPattern = { blocks: V2CombatBlock[] };

// 조건 평가용 전투 상태 — 엔진이 매 턴(공격자 시점) 합성.
export type V2PatternCtx = {
  selfHpPct: number; // 0~100
  selfMpPct: number; // 0~100
  selfBuffStats: ReadonlySet<StatKey>; // 활성 자버프의 스탯들
  selfBuffPctTargets: ReadonlySet<"evasion" | "crit" | "damageReduction">; // 활성 파생버프(회피/치명/받피감)
  enemyHpPct: number; // 0~100
  enemyBleed: number; // 스택
  enemyPoison: number;
  enemyVuln: number;
  turn: number; // 1-based 공격 차례
};

function enemyStatusStacks(ctx: V2PatternCtx, tag: V2PatternEnemyStatus): number {
  return tag === "bleed"
    ? ctx.enemyBleed
    : tag === "poison"
      ? ctx.enemyPoison
      : ctx.enemyVuln;
}

// 단일 조건 충족 여부. 알 수 없는 kind 는 false(보수적).
export function conditionPasses(
  cond: V2CombatCondition,
  ctx: V2PatternCtx,
): boolean {
  switch (cond.kind) {
    case "always":
      return true;
    case "self_hp":
      return cond.op === "below"
        ? ctx.selfHpPct <= cond.pct
        : ctx.selfHpPct >= cond.pct;
    case "self_mp":
      return cond.op === "below"
        ? ctx.selfMpPct <= cond.pct
        : ctx.selfMpPct >= cond.pct;
    case "self_buff":
      return ctx.selfBuffStats.has(cond.stat) === cond.active;
    case "self_buff_pct":
      return ctx.selfBuffPctTargets.has(cond.target) === cond.active;
    case "enemy_hp":
      return cond.op === "below"
        ? ctx.enemyHpPct <= cond.pct
        : ctx.enemyHpPct >= cond.pct;
    case "enemy_status": {
      const stacks = enemyStatusStacks(ctx, cond.tag);
      return cond.op === "none" ? stacks === 0 : stacks >= cond.stacks;
    }
    case "turn":
      if (cond.value <= 0) return false;
      return cond.op === "atMost"
        ? ctx.turn <= cond.value
        : cond.op === "atLeast"
          ? ctx.turn >= cond.value
          : ctx.turn % cond.value === 0; // every
  }
  // 모든 kind 처리됨 — 새 kind 추가 시 컴파일 에러로 누락 방지.
  const _exhaustive: never = cond;
  return _exhaustive;
}

// 패턴 평가 — 우선순위(배열 순서)대로, 조건 충족 + 실행 가능(isUsable: 쿨다운/MP/효과)한
// 첫 스킬 id 반환. 없으면 null(엔진이 평타로 폴백). 조건만 맞고 실행 불가(쿨다운/MP)면 다음 블록으로.
export function evaluateCombatPattern(
  pattern: V2CombatPattern,
  ctx: V2PatternCtx,
  isUsable: (skillId: string) => boolean,
  resolveRole?: (role: V2CombatRole) => string | null,
): string | null {
  for (const block of pattern.blocks) {
    if (!conditionPasses(block.condition, ctx)) continue;
    const id =
      block.action.kind === "skill"
        ? block.action.skillId
        : (resolveRole?.(block.action.role) ?? null);
    if (!id || !isUsable(id)) continue;
    return id;
  }
  return null;
}

// 패턴 경로 스킬 "평타 기준 보너스" 배율 (C3 — proc 은퇴 재밸런스, "위력 중립"). 패턴은 proc 없이
// 확정 발동이라 스킬 빈도가 ~5배. 단순 ×배율로 깎으면 강스킬은 중립이어도 약스킬·DoT 빌드는 평타
// 이하로 너프된다(빌드별 중립 불가) → combatShared 에서 평타 바닥은 보존하고 그 위 초과분만 이 배율로
// 깎는다(패턴피해 = 평타바닥 + max(0, 스킬피해 − 평타바닥) × 이값). sim 캘리브 다이얼 — 작을수록 약함.
//   캘리브(2026-06-07 sim, 4빌드): 0.14 → 전사~중립·도적~중립·마법 +23%(강아키타입 잔여 outlier),
//   전 빌드 너프 0. 옛 flat 0.28(전사+38%·마법+56%) 대비 인플레 절반.
export const V2_PATTERN_SKILL_POWER_MULT = 0.14;

// PR2/3 — 차수별 스킬 위력 통과율. 스킬일수록 평타 초과분을 더 많이 반영해 "쓸 가치"(SP·MP 비용)를
//   보답. 전투 시점 곱이라 skillPowerScore(=SP 비용)는 불변 — 스킬 = 데미지↑·SP 불변(값어치↑).
//   PR3: 기본선 전반 상향(t1 0.14→0.18 등) — 기본 스킬도 평타보다 우위. 옛 0.14 "위력 중립"(스킬≈평타)
//   은 "SP 써도 평타와 비슷=값어치 없음"이라, 빌드 다양성 적은 현 단계에서 폐기. 라이브 watch 다이얼.
export const V2_PATTERN_SKILL_POWER_MULT_BY_TIER: Record<1 | 2 | 3, number> = {
  1: 0.18,
  2: 0.24,
  3: 0.32,
};

// 패턴 경로 DoT(출혈·중독·연소) 틱 위력 배율. DoT 도 확정 발동으로 ~5배 자주 적용돼(특히 saturate
// 하는 독·연소) 빈도 이득이 큼. 평타 등가가 없어 보너스 모델 대신 단순 배율로 throttle — 직타가 이미
// 평타 바닥으로 보호되므로 이 값으로 DoT 만 깎아도 DoT 빌드가 평타 이하로 안 떨어진다. sim 캘리브:
//   0.35 → 도적(독)~중립·마법 burn outlier 완화. (off 경로/몹 cast 는 미적용 — viaPattern 게이트.)
export const V2_PATTERN_DOT_POWER_MULT = 0.35;

// 기본 패턴 — 장착 스킬을 슬롯 순서대로 "항상 → 스킬" 블록으로. 커스텀 패턴(C2 UI) 없을 때의
// 폴백 + 기존 캐릭 마이그(옛 슬롯순서 발동을 재현, 단 procChance 없이 확정 발동).
export function defaultPatternFromEquipped(
  equipped: readonly string[],
): V2CombatPattern {
  return {
    blocks: equipped.map((skillId) => ({
      condition: { kind: "always" as const },
      action: { kind: "skill" as const, skillId },
    })),
  };
}

// === 저장/파싱 (C2 — 커스텀 패턴 영속) ================================
// 손상/구버전 raw 도 안전하게 정규화: 블록 단위 검증, 알 수 없는 조건·행동 kind 나 잘못된
// 파라미터는 그 블록을 drop(통째 폐기 아님). skillId 는 문자열만 확인(실재 여부는 런타임 게이트).
export const V2_COMBAT_PATTERN_MAX_BLOCKS = 16; // 폭주 방지 상한.

function isFinitePct(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function parseCondition(raw: unknown): V2CombatCondition | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  switch (c.kind) {
    case "always":
      return { kind: "always" };
    case "self_hp":
    case "self_mp":
    case "enemy_hp": {
      const op = c.op === "below" || c.op === "above" ? c.op : null;
      if (!op || !isFinitePct(c.pct)) return null;
      return { kind: c.kind, op, pct: Math.max(0, Math.min(100, c.pct)) };
    }
    case "self_buff": {
      if (typeof c.stat !== "string" || typeof c.active !== "boolean") return null;
      return { kind: "self_buff", stat: c.stat as StatKey, active: c.active };
    }
    case "self_buff_pct": {
      const target =
        c.target === "evasion" || c.target === "crit" || c.target === "damageReduction"
          ? c.target
          : null;
      if (!target || typeof c.active !== "boolean") return null;
      return { kind: "self_buff_pct", target, active: c.active };
    }
    case "enemy_status": {
      const tag =
        c.tag === "bleed" || c.tag === "poison" || c.tag === "vuln" ? c.tag : null;
      const op = c.op === "atLeast" || c.op === "none" ? c.op : null;
      if (!tag || !op || !isFinitePct(c.stacks)) return null;
      return { kind: "enemy_status", tag, op, stacks: Math.max(0, Math.floor(c.stacks)) };
    }
    case "turn": {
      const op =
        c.op === "atMost" || c.op === "atLeast" || c.op === "every" ? c.op : null;
      if (!op || !isFinitePct(c.value)) return null;
      return { kind: "turn", op, value: Math.max(1, Math.floor(c.value)) };
    }
    default:
      return null;
  }
}

function parseAction(raw: unknown): V2CombatAction | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (a.kind === "skill" && typeof a.skillId === "string" && a.skillId.length > 0) {
    return { kind: "skill", skillId: a.skillId };
  }
  if (
    a.kind === "role" &&
    (a.role === "main_attack" ||
      a.role === "heal" ||
      a.role === "buff" ||
      a.role === "debuff")
  ) {
    return { kind: "role", role: a.role };
  }
  return null;
}

export function parseCombatPattern(raw: unknown): V2CombatPattern {
  if (!raw || typeof raw !== "object") return { blocks: [] };
  const rawBlocks = (raw as { blocks?: unknown }).blocks;
  if (!Array.isArray(rawBlocks)) return { blocks: [] };
  // 비정상 거대 입력은 통째 거부(상한 16의 8배 초과 = 손상/공격). 전부 순회 전에 컷.
  if (rawBlocks.length > V2_COMBAT_PATTERN_MAX_BLOCKS * 8) return { blocks: [] };
  const blocks: V2CombatBlock[] = [];
  for (const rb of rawBlocks) {
    if (blocks.length >= V2_COMBAT_PATTERN_MAX_BLOCKS) break;
    if (!rb || typeof rb !== "object") continue;
    const condition = parseCondition((rb as { condition?: unknown }).condition);
    const action = parseAction((rb as { action?: unknown }).action);
    if (!condition || !action) continue;
    blocks.push({ condition, action });
  }
  return { blocks };
}

// === 프리셋 (C4 — 명명 패턴 라이브러리) =================================
// 플레이어가 패턴을 이름 붙여 여러 개 저장해두고 빠르게 바꿔 끼우는 라이브러리. 엔진이 쓰는 "활성
// 패턴"(V2SkillsState.pattern)과는 별개 — 프리셋 불러오기 = 그 블록을 활성 패턴으로 적용(combat-
// pattern 라우트). 엔진은 프리셋을 모름(C4 는 순수 저장+UI). 보스용/사냥용 등 빌드 스왑 용도.
export const V2_COMBAT_PATTERN_MAX_PRESETS = 8; // 폭주 방지 상한.
export const V2_COMBAT_PRESET_NAME_MAXLEN = 24;

export type V2CombatPreset = { name: string; pattern: V2CombatPattern };

// 손상/구버전 raw 도 안전하게 정규화: 항목 단위 검증, 이름 없는 항목 drop, 이름 trim+길이 클램프,
// pattern 은 parseCombatPattern 재사용(블록 단위 drop). 상한 초과분은 잘라낸다.
export function parseCombatPresets(raw: unknown): V2CombatPreset[] {
  if (!Array.isArray(raw)) return [];
  // 비정상 거대 입력은 통째 거부(상한의 8배 초과 = 손상/공격). 전부 순회 전에 컷.
  if (raw.length > V2_COMBAT_PATTERN_MAX_PRESETS * 8) return [];
  const out: V2CombatPreset[] = [];
  const seen = new Set<string>(); // 이름 = 키(UI React key·덮어쓰기 의미) — 중복 이름 drop(first-wins).
  for (const rp of raw) {
    if (out.length >= V2_COMBAT_PATTERN_MAX_PRESETS) break;
    if (!rp || typeof rp !== "object") continue;
    const nameRaw = (rp as { name?: unknown }).name;
    const name =
      typeof nameRaw === "string"
        ? nameRaw.trim().slice(0, V2_COMBAT_PRESET_NAME_MAXLEN)
        : "";
    if (!name || seen.has(name)) continue; // 이름 없음/중복 → drop.
    seen.add(name);
    const pattern = parseCombatPattern((rp as { pattern?: unknown }).pattern);
    out.push({ name, pattern });
  }
  return out;
}
