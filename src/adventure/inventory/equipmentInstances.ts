// 인스턴스 기반 장비 풀 — 한 자루 한 자루 고유 ID 와 강화 단계 + 모드 history + 가능 횟수.
// 현재는 별빛 무구 30종(ENHANCEABLE_ITEM_IDS) 만 인스턴스화. 그 외 장비는 기존
// 스택 (equipment[] / craftedEquipment[]) 그대로.
//
// craftTier 는 제작 variance 결과 (RECIPE.variance) — 정교한/빼어난 등급이 인스턴스
// 단위로 보존된다. 강화·등급 둘 다 한 자루 안에서 합쳐진다.
//
// enhanceHistory: 단계별 어떤 모드(safe/boost/high/risky/extreme) 로 강화했는지 history.
//   길이 = enhancementLevel (성공한 단계만 push). 옛 인스턴스(history 없는 자루) 는
//   normalizeInstance 가 safe 모드 N 회로 마이그레이션.
// remainingAttempts: 자루별 남은 강화 시도 횟수. 시작 ENHANCE_INITIAL_ATTEMPTS(7),
//   성공/실패 무관 매 시도 -1. 0 이면 더 시도 불가 — 자루의 천장이 깎인 상태.
//   옛 인스턴스는 7 로 마이그레이션.

import type { CraftTier } from "@/adventure/data/craftQuality";
import type { ItemId } from "@/adventure/data/items";
import {
  ENHANCEABLE_ITEM_IDS,
  ENHANCE_INITIAL_ATTEMPTS,
  ENHANCE_MAX_LEVEL,
  ENHANCE_MODE_SPEC,
  type EnhanceMode,
} from "@/adventure/character/enhancement";
import {
  ENCHANT_AFFIXES,
  enchantSlotCapacity,
  isEnchantAffixId,
  type EnchantSlot,
} from "@/adventure/character/enchant";

export type EquipmentInstance = {
  /** 고유 ID. crypto.randomUUID 권장 (서버에서 생성). 절대 재사용 X. */
  instanceId: string;
  /** base 아이템. ENHANCEABLE_ITEM_IDS 안의 itemId 만 허용 (검증은 서버에서). */
  itemId: ItemId;
  /** 제작 등급. 미지정/0 = 일반. */
  craftTier?: CraftTier;
  /** 강화 단계 (0~ENHANCE_MAX_LEVEL). 0 = 미강화. = enhanceHistory.length. */
  enhancementLevel: number;
  /** 단계별 강화 모드 history. 길이 === enhancementLevel. 빈 자루는 빈 배열 또는 생략. */
  enhanceHistory?: EnhanceMode[];
  /** 남은 강화 시도 횟수. 시작 7, 성공/실패 무관 매 시도 -1. 0 = 천장 깎임. */
  remainingAttempts: number;
  /** 부여된 마법부여 슬롯. 강화 단계별 capacity (+2/+4/+7→1/2/3) 이하. 재부여 불가. */
  enchantSlots?: EnchantSlot[];
};

// 인스턴스 ID 생성 — 서버/클라 모두 randomUUID 가 있으면 그걸, 없으면 fallback.
// 통상은 서버에서 발급되어 클라로 내려온다. 클라가 발급할 일은 없지만 헬퍼는 둔다.
export function generateInstanceId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback — 충돌 가능성 무시할 수준 (서버 권위로 검증되니까 문제 없음).
  return `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isValidMode(v: unknown): v is EnhanceMode {
  return typeof v === "string" && v in ENHANCE_MODE_SPEC;
}

// 저장된 raw 값을 EquipmentInstance 로 정규화. 잘못된 entry 는 drop.
// readInitial / 서버 readKv 에서 공유.
export function normalizeInstance(raw: unknown): EquipmentInstance | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<EquipmentInstance>;
  if (typeof r.instanceId !== "string" || !r.instanceId) return null;
  if (typeof r.itemId !== "string") return null;
  // itemId 화이트리스트 — 인스턴스 풀에는 강화 대상 아이템만. 다른 itemId 가 박힌
  // 위조 인스턴스는 drop (장착·강화 endpoint 가 itemId 자체를 신뢰하지 않게 한다).
  if (!ENHANCEABLE_ITEM_IDS.has(r.itemId as ItemId)) return null;
  const lv = r.enhancementLevel;
  if (
    typeof lv !== "number" ||
    !Number.isInteger(lv) ||
    lv < 0 ||
    lv > ENHANCE_MAX_LEVEL
  ) {
    return null;
  }
  const tier = r.craftTier;
  if (
    tier !== undefined &&
    tier !== 0 &&
    !(Number.isInteger(tier) && tier >= -2 && tier <= 2)
  ) {
    return null;
  }
  // enhanceHistory — 길이가 enhancementLevel 과 일치하고 mode 가 유효해야 한다.
  // 옛 인스턴스(history 없는 자루) 는 safe 모드 lv 회로 마이그레이션 — 옛 시스템이
  // 100% 보장이었으니 의미적으로도 같다.
  let history: EnhanceMode[] | undefined;
  if (r.enhanceHistory !== undefined) {
    if (!Array.isArray(r.enhanceHistory)) return null;
    if (r.enhanceHistory.length !== lv) return null;
    for (const m of r.enhanceHistory) {
      if (!isValidMode(m)) return null;
    }
    history = r.enhanceHistory.slice();
  } else if (lv > 0) {
    history = new Array<EnhanceMode>(lv).fill("safe");
  }
  // remainingAttempts — 옛 인스턴스(undefined) 는 ENHANCE_INITIAL_ATTEMPTS(7) 로 마이그레이션.
  // 위조 가드: 정수 + 0 이상 + INITIAL 이하.
  let remaining = r.remainingAttempts;
  if (remaining === undefined) {
    remaining = ENHANCE_INITIAL_ATTEMPTS;
  } else if (
    typeof remaining !== "number" ||
    !Number.isInteger(remaining) ||
    remaining < 0 ||
    remaining > ENHANCE_INITIAL_ATTEMPTS
  ) {
    return null;
  }
  // enchantSlots — 자루별 마법부여 슬롯. 강화 단계별 capacity (+2/+4/+7→1/2/3) 이하.
  // 위조 가드: 각 slot 의 affixId 가 카탈로그 안 + value 가 range 안 정수.
  // capacity 초과 시 자루 통째 drop — 부분 trim 은 클라/서버 정책 비대칭 위험.
  let slots: EnchantSlot[] | undefined;
  if (r.enchantSlots !== undefined) {
    if (!Array.isArray(r.enchantSlots)) return null;
    const cap = enchantSlotCapacity(lv);
    if (r.enchantSlots.length > cap) return null;
    const parsed: EnchantSlot[] = [];
    for (const s of r.enchantSlots) {
      if (!s || typeof s !== "object") return null;
      const aid = (s as { affixId?: unknown }).affixId;
      const val = (s as { value?: unknown }).value;
      if (!isEnchantAffixId(aid)) return null;
      if (typeof val !== "number" || !Number.isInteger(val)) return null;
      const [min, max] = ENCHANT_AFFIXES[aid].range;
      if (val < min || val > max) return null;
      parsed.push({ affixId: aid, value: val });
    }
    if (parsed.length > 0) slots = parsed;
  }
  return {
    instanceId: r.instanceId,
    itemId: r.itemId as ItemId,
    craftTier: tier === 0 || tier === undefined ? undefined : (tier as CraftTier),
    enhancementLevel: lv,
    ...(history && history.length > 0 ? { enhanceHistory: history } : {}),
    remainingAttempts: remaining,
    ...(slots ? { enchantSlots: slots } : {}),
  };
}

export function normalizeInstances(raw: unknown): EquipmentInstance[] {
  if (!Array.isArray(raw)) return [];
  const out: EquipmentInstance[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const n = normalizeInstance(r);
    if (n && !seen.has(n.instanceId)) {
      out.push(n);
      seen.add(n.instanceId);
    }
  }
  return out;
}
