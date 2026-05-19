// 별빛 무구 강화 — 5막 별빛 사냥터 (Ch 26 이후) 풀리는 영구 sink.
//
// 별빛 무구 30종 (무기 25 + 갑옷 5) 한정. empyrean 이하 일반 장비는 강화 불가.
// 인스턴스 기반 — 한 자루가 enhancementLevel(0~7) + enhanceHistory + remainingAttempts
// 를 들고 있다.
//
// 비용: 별빛 조각 누진 — 자루당 +7 풀강 1690개. 비용은 시도 시 항상 차감 (성공/실패 무관).
//
// 확률 모드 (사용자 선택, 시도 시 결정):
//   safe    100% — atk/def +1, 메인 +1
//   boost    70% — atk/def +2, 메인 +2, 부 +1
//   high     50% — atk/def +3, 메인 +3, 부 +2
//   risky    30% — atk/def +5, 메인 +5, 부 +3
//   extreme  10% — atk/def +10, 메인 +10, 부 +7
//
// 부스탯이 메인과 일치하는 변형(예: 힘의 별빛 대검) 은 같은 스탯에 자연 합산.
//
// 실패 시: enhancementLevel 그대로, remainingAttempts -= 1.
// 성공 시: enhancementLevel += 1, enhanceHistory 에 mode push, remainingAttempts -= 1.
// remainingAttempts 시작 값 = ENHANCE_INITIAL_ATTEMPTS (7) — 자루당 총 시도 한도.
// 0 이 되면 더 시도 불가. 7회 모두 safe 로 가면 +7 도달, 그 외 모드는 EV 가 그만큼 깎인다.

import { BONUS_KEYS, ITEMS, type EquipBonus, type ItemId } from "@/adventure/data/items";
import {
  rebuildStats,
  type CraftTier,
} from "@/adventure/data/craftQuality";
import { resolveCraftedItem } from "@/adventure/data/recipes";
import { enchantStaticBonus, type EnchantSlot } from "./enchant";
import type { EquippedItem } from "./types";

export const ENHANCE_MAX_LEVEL = 7;

// 별빛 조각 누진 비용 — index = 도달 단계. 0 단계는 비용 없음(초기 상태).
// 비용은 *시도* 비용 — 실패해도 차감 (모드 무관).
// 후반(5/6/7) 단계는 10% 깎여 — 풀강까지 도달 부담을 1690 → 1555 로 완화.
export const ENHANCE_SHARD_COST: readonly number[] = [0, 30, 60, 100, 150, 225, 360, 630];

// 자루당 풀강 누적 비용 (전부 100% 안전 모드로만 도달했을 때) — 30+60+100+150+225+360+630 = 1555.
export const ENHANCE_FULL_COST = ENHANCE_SHARD_COST.reduce((a, b) => a + b, 0);

// 자루당 총 강화 시도 한도 — 성공/실패 무관 매 시도 -1. 0 이 되면 더 시도 불가 (천장 깎임).
export const ENHANCE_INITIAL_ATTEMPTS = 7;

// 확률 모드 ─────────────────────────────────────────────────────────────────
export type EnhanceMode = "safe" | "boost" | "high" | "risky" | "extreme";

export const ENHANCE_MODES: readonly EnhanceMode[] = [
  "safe",
  "boost",
  "high",
  "risky",
  "extreme",
];

// 모드별 (성공률, atk/def 증가, 메인스탯 증가, 부스탯 증가).
// 부스탯이 메인과 같은 변형(힘의 대검 등) 은 ENHANCE_PER_LEVEL 계산 시 같은 키에 자연 합산.
type ModeSpec = {
  /** 성공 확률 % (0~100). */
  successPct: number;
  /** atk(무기) / def(갑옷) 증가량. */
  atkDef: number;
  /** 메인스탯 증가량. */
  main: number;
  /** 부스탯 증가량 — 0 이면 부스탯 줄 추가 X (safe 모드). */
  sub: number;
};

export const ENHANCE_MODE_SPEC: Record<EnhanceMode, ModeSpec> = {
  safe: { successPct: 100, atkDef: 1, main: 1, sub: 0 },
  boost: { successPct: 70, atkDef: 2, main: 2, sub: 1 },
  high: { successPct: 50, atkDef: 3, main: 3, sub: 2 },
  risky: { successPct: 30, atkDef: 5, main: 5, sub: 3 },
  extreme: { successPct: 10, atkDef: 10, main: 10, sub: 7 },
};

// 무기 → 메인스탯 매핑. itemId 파싱에 사용.
const WEAPON_MAIN_STAT: Record<string, keyof EquipBonus> = {
  greatsword: "str",
  lance: "dex",
  shield: "vit",
  twinblades: "spd",
  dagger: "luk",
};

const STAT_TOKEN_TO_KEY: Record<string, keyof EquipBonus> = {
  str: "str",
  dex: "dex",
  vit: "vit",
  spd: "spd",
  luk: "luk",
};

export type StarlitItemSpec = {
  /** 메인스탯 키 (무기·갑옷 공통). */
  main: keyof EquipBonus;
  /** 부스탯 키 — 갑옷은 undefined. 무기는 itemId 의 suffix. */
  sub: keyof EquipBonus | undefined;
  /** atk(무기) vs def(갑옷). */
  damageKind: "atk" | "def";
};

/** "starlit_<weapon>_<stat>" / "starlit_armor_<stat>" 형태 itemId 를 메인/부 스탯으로 분해. */
export function parseStarlitItem(itemId: string): StarlitItemSpec | null {
  const m = /^starlit_([a-z]+)_(str|dex|vit|spd|luk)$/.exec(itemId);
  if (!m) return null;
  const [, weapon, stat] = m;
  const subKey = STAT_TOKEN_TO_KEY[stat];
  if (!subKey) return null;
  if (weapon === "armor") {
    return { main: subKey, sub: undefined, damageKind: "def" };
  }
  const main = WEAPON_MAIN_STAT[weapon];
  if (!main) return null;
  return { main, sub: subKey, damageKind: "atk" };
}

// 강화 가능한 itemId 집합 — items.ts 의 모든 starlit_* 이 자동으로 강화 가능.
// 새 별빛 라인 추가 시 itemId 만 컨벤션에 맞추면 별도 등록 불필요.
export const ENHANCEABLE_ITEM_IDS: ReadonlySet<ItemId> = new Set(
  (Object.keys(ITEMS) as ItemId[]).filter((id) => parseStarlitItem(id) !== null),
);

export function isEnhanceable(itemId: ItemId): boolean {
  return ENHANCEABLE_ITEM_IDS.has(itemId);
}

// 한 번의 강화 (mode) 가 자루에 더하는 보너스. parseStarlitItem 으로 메인/부 도출 후 모드별 delta 적용.
// 부스탯이 메인과 일치 (예: 힘의 대검 + str sub) 면 같은 키에 자연 합산.
export function modeBonus(itemId: ItemId, mode: EnhanceMode): EquipBonus {
  const spec = parseStarlitItem(itemId);
  if (!spec) return {};
  const m = ENHANCE_MODE_SPEC[mode];
  const bonus: EquipBonus = {};
  if (m.atkDef > 0) bonus[spec.damageKind] = m.atkDef;
  if (m.main > 0) bonus[spec.main] = (bonus[spec.main] ?? 0) + m.main;
  if (m.sub > 0 && spec.sub !== undefined) {
    bonus[spec.sub] = (bonus[spec.sub] ?? 0) + m.sub;
  }
  return bonus;
}

// 강화 history 누적 보너스 — 빈 history 면 빈 보너스.
// 옛 인스턴스(history 없이 enhancementLevel 만 박힌 자루) 호환을 위해 두 번째 시그니처도 둔다.
export function enhancementBonus(
  itemId: ItemId,
  historyOrLevel: readonly EnhanceMode[] | number,
): EquipBonus {
  const history: readonly EnhanceMode[] =
    typeof historyOrLevel === "number"
      ? // number 받으면 safe 모드 N 회로 간주 (마이그레이션 호환).
        new Array<EnhanceMode>(Math.max(0, Math.floor(historyOrLevel))).fill("safe")
      : historyOrLevel;
  if (history.length === 0) return {};
  const out: EquipBonus = {};
  for (const mode of history) {
    const inc = modeBonus(itemId, mode);
    for (const k of BONUS_KEYS) {
      const v = inc[k];
      if (typeof v === "number" && v !== 0) {
        out[k] = (out[k] ?? 0) + v;
      }
    }
  }
  return out;
}

// 다음 강화 시도의 별빛 조각 비용. 최대 단계면 null (더 시도 불가).
export function nextEnhanceCost(
  fromLevel: number,
): { toLevel: number; shards: number } | null {
  if (!Number.isInteger(fromLevel) || fromLevel < 0) return null;
  const to = fromLevel + 1;
  if (to > ENHANCE_MAX_LEVEL) return null;
  return { toLevel: to, shards: ENHANCE_SHARD_COST[to] ?? 0 };
}

export type EnhanceErrorCode =
  | "not_enhanceable" // itemId 가 강화 대상 아님
  | "max_level" // 이미 최대 단계
  | "no_attempts" // remainingAttempts 가 0
  | "insufficient_shards" // 별빛 조각 부족
  | "invalid_level" // fromLevel 이 음수/비정수
  | "invalid_mode"; // 알 수 없는 mode

export type EnhancePlan =
  | {
      ok: true;
      toLevel: number;
      shards: number;
      mode: EnhanceMode;
      successPct: number;
    }
  | { ok: false; reason: EnhanceErrorCode };

// 한 자루 +1 강화의 사전 검사. UI 미리보기·검증에 쓴다.
// 실제 적용·확률 굴림은 서버. 비용은 시도 시 차감 (성공/실패 무관).
export function planEnhance(
  itemId: ItemId,
  fromLevel: number,
  mode: EnhanceMode,
  shardCount: number,
  remainingAttempts: number,
): EnhancePlan {
  if (!isEnhanceable(itemId)) return { ok: false, reason: "not_enhanceable" };
  if (!Number.isInteger(fromLevel) || fromLevel < 0) {
    return { ok: false, reason: "invalid_level" };
  }
  if (!(mode in ENHANCE_MODE_SPEC)) {
    return { ok: false, reason: "invalid_mode" };
  }
  if (!Number.isInteger(remainingAttempts) || remainingAttempts <= 0) {
    return { ok: false, reason: "no_attempts" };
  }
  const cost = nextEnhanceCost(fromLevel);
  if (!cost) return { ok: false, reason: "max_level" };
  if (shardCount < cost.shards) {
    return { ok: false, reason: "insufficient_shards" };
  }
  const spec = ENHANCE_MODE_SPEC[mode];
  return {
    ok: true,
    toLevel: cost.toLevel,
    shards: cost.shards,
    mode,
    successPct: spec.successPct,
  };
}

// 인스턴스의 (itemId, craftTier, enhanceHistory, enchantSlots, remainingAttempts) 로부터
// 장착 가능한 EquippedItem 을 만든다. craftTier → 강화 → 마법부여 순으로 보너스 누적, stats 도 재생성.
// instanceId 를 받아 EquippedItem 의 instanceId 필드에 박는다 — 슬롯 회수 시 풀로 돌려놓는 키.
// 강화 history 와 가능 횟수도 EquippedItem 에 그대로 박는다 — 회수 시 풀에 그대로 복원되어
// 다음 표시가 safe×N 으로 깎이지 않는다 (chunk 3 이전엔 history 가 EquippedItem 에 없어서
// equip→unequip 후 history 가 사라지고 normalizeInstance 가 safe×lv 로 덮어쓰던 버그 수정).
// enchantSlots 의 might/swift/insight 만 정적 bonus 합산 — 가드/회피/치명타 등은 전투 엔진.
export function resolveEnhancedItem(
  itemId: ItemId,
  craftTier: CraftTier | undefined,
  historyOrLevel: readonly EnhanceMode[] | number,
  instanceId: string,
  enchantSlots?: readonly EnchantSlot[],
  remainingAttempts?: number,
): EquippedItem {
  const base = ITEMS[itemId];
  // 제작 등급 먼저 적용 (강화 위에). craftTier 0/미지정이면 베이스 그대로.
  const tiered =
    craftTier != null && craftTier !== 0
      ? resolveCraftedItem(itemId, craftTier)
      : { ...base };
  const level =
    typeof historyOrLevel === "number"
      ? Math.max(0, Math.floor(historyOrLevel))
      : historyOrLevel.length;
  const enchStatic = enchantSlots ? enchantStaticBonus(enchantSlots) : {};
  // 인스턴스 메타 — 회수 시 풀 복원에 필요. history 는 array 로 전달된 경우에만 슬롯에 박는다
  // (number 로만 알면 mode 시퀀스를 복원할 수 없어 safe×N 추정 — 옛 데이터 호환). 단 슬롯에서
  // 회수 후 다시 inventory 풀로 돌아갈 때는 enhanceHistory 가 있어야 stats 가 정확히 복원된다.
  const enhanceHistory =
    typeof historyOrLevel === "number" ? undefined : historyOrLevel.slice();
  const metaProps = {
    craftTier,
    instanceId,
    ...(enhanceHistory && enhanceHistory.length > 0
      ? { enhanceHistory }
      : {}),
    ...(typeof remainingAttempts === "number"
      ? { remainingAttempts }
      : {}),
    ...(enchantSlots && enchantSlots.length > 0
      ? { enchantSlots: enchantSlots.slice() }
      : {}),
  };
  // 강화도 부여도 없는 자루는 메타만 박힌 베이스.
  if (level <= 0 && Object.keys(enchStatic).length === 0) {
    return {
      ...tiered,
      ...metaProps,
      enhancementLevel: 0,
    };
  }
  const tierBonus = tiered.bonus ?? {};
  const enhBonus = level > 0 ? enhancementBonus(itemId, historyOrLevel) : {};
  const merged: EquipBonus = { ...tierBonus };
  for (const k of BONUS_KEYS) {
    const e = enhBonus[k];
    if (typeof e === "number" && e !== 0) {
      merged[k] = (merged[k] ?? 0) + e;
    }
    const s = (enchStatic as Record<string, number | undefined>)[k];
    if (typeof s === "number" && s !== 0) {
      merged[k] = (merged[k] ?? 0) + s;
    }
  }
  return {
    ...tiered,
    bonus: merged,
    stats: rebuildStats(base, merged),
    ...metaProps,
    enhancementLevel: level,
  };
}
