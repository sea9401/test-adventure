// 별빛 무구 마법부여 — 5막 별빛 사냥터 보스에서 떨어지는 부여서로 자루에 옵션 부여.
//
// 부여 슬롯은 강화 단계에 비례 해금:
//   +2 → 1슬, +4 → 2슬, +7 → 3슬.
// 한 슬롯에 한 장 부여. 100% 부여 성공, 옵션 수치만 range 안에서 정수 롤.
// 재부여(덮어쓰기) 불가 — 새 자루 제작 유도. 슬롯이 비어 있어야 새 부여 가능.
//
// 부여서 풀 20종 — 4 별빛 보스에 5종씩 셔플 분배 (drops.ts 참조).
// 전투 효과 발동(가드/회피/치명타 등)은 별도 PR 에서 전투 엔진 통합.

export type EnchantAffixId =
  | "guard"
  | "dodge"
  | "barrier"
  | "regen"
  | "reflect"
  | "critical"
  | "pierce"
  | "execute"
  | "berserk"
  | "breaker"
  | "lifesteal"
  | "fortune"
  | "bounty"
  | "harvest"
  | "swift"
  | "might"
  | "insight"
  | "awaken"
  | "endure"
  | "venom";

/** 옵션 수치 단위 — UI 표기 + 전투 엔진 해석 힌트. */
export type EnchantUnit = "percent" | "flat";

export type EnchantAffix = {
  id: EnchantAffixId;
  /** materials.ts 의 부여서 materialId — `enchant_<id>` 컨벤션. */
  materialId: string;
  name: string;
  description: string;
  /** 정수 값 range — 부여 시 [min, max] 안에서 정수 랜덤 롤. */
  range: readonly [min: number, max: number];
  unit: EnchantUnit;
};

// 부여서 풀 — 표시 순서 = 도감·UI 카드 순서.
// description: 자연스러운 한국어 한 줄. range·unit 은 전투 엔진 통합 시 동일 해석.
export const ENCHANT_AFFIXES: Record<EnchantAffixId, EnchantAffix> = {
  guard: {
    id: "guard",
    materialId: "enchant_guard",
    name: "가드",
    description: "적 공격을 한 번 흩어 낸다.",
    range: [5, 20],
    unit: "percent",
  },
  dodge: {
    id: "dodge",
    materialId: "enchant_dodge",
    name: "회피",
    description: "공격에서 한 박자 비켜선다.",
    range: [3, 12],
    unit: "percent",
  },
  barrier: {
    id: "barrier",
    materialId: "enchant_barrier",
    name: "보호막",
    description: "전투 시작 시 최대 HP 의 일부를 보호막으로 두른다.",
    range: [5, 20],
    unit: "percent",
  },
  regen: {
    id: "regen",
    materialId: "enchant_regen",
    name: "재생",
    description: "매 턴 최대 HP 의 일부를 회복한다.",
    range: [1, 5],
    unit: "percent",
  },
  reflect: {
    id: "reflect",
    materialId: "enchant_reflect",
    name: "반사",
    description: "받은 대미지의 일부를 그대로 되돌려 보낸다.",
    range: [3, 10],
    unit: "percent",
  },
  critical: {
    id: "critical",
    materialId: "enchant_critical",
    name: "치명타",
    description: "치명타 확률을 더한다.",
    range: [2, 8],
    unit: "percent",
  },
  pierce: {
    id: "pierce",
    materialId: "enchant_pierce",
    name: "관통",
    description: "적의 방어를 그만큼 무시한다.",
    range: [1, 5],
    unit: "flat",
  },
  execute: {
    id: "execute",
    materialId: "enchant_execute",
    name: "처형",
    description: "HP 25% 이하 적에게 추가 대미지를 입힌다.",
    range: [10, 40],
    unit: "percent",
  },
  berserk: {
    id: "berserk",
    materialId: "enchant_berserk",
    name: "폭주",
    description: "자신 HP 30% 이하일 때 공격력을 끌어올린다.",
    range: [20, 30],
    unit: "percent",
  },
  breaker: {
    id: "breaker",
    materialId: "enchant_breaker",
    name: "파괴",
    description: "보스 적에게 추가 대미지를 입힌다.",
    range: [5, 15],
    unit: "percent",
  },
  lifesteal: {
    id: "lifesteal",
    materialId: "enchant_lifesteal",
    name: "흡혈",
    description: "가한 대미지의 일부를 자신의 HP 로 돌린다.",
    range: [3, 10],
    unit: "percent",
  },
  fortune: {
    id: "fortune",
    materialId: "enchant_fortune",
    name: "행운",
    description: "전투 종료 시 골드 획득을 늘린다.",
    range: [10, 30],
    unit: "percent",
  },
  bounty: {
    id: "bounty",
    materialId: "enchant_bounty",
    name: "풍요",
    description: "전투 종료 시 경험치 획득을 늘린다.",
    range: [5, 20],
    unit: "percent",
  },
  harvest: {
    id: "harvest",
    materialId: "enchant_harvest",
    name: "채집",
    description: "전투 종료 시 재료 드랍률을 끌어올린다.",
    range: [10, 30],
    unit: "percent",
  },
  swift: {
    id: "swift",
    materialId: "enchant_swift",
    name: "신속",
    description: "속도 스탯을 더한다.",
    range: [2, 8],
    unit: "flat",
  },
  might: {
    id: "might",
    materialId: "enchant_might",
    name: "강타",
    description: "공격력을 더한다.",
    range: [3, 10],
    unit: "flat",
  },
  insight: {
    id: "insight",
    materialId: "enchant_insight",
    name: "통찰",
    description: "모든 스탯을 그만큼 더한다.",
    range: [1, 3],
    unit: "flat",
  },
  awaken: {
    id: "awaken",
    materialId: "enchant_awaken",
    name: "각성",
    description: "매 턴 일정 확률로 AP 를 한 점 회복한다.",
    range: [3, 10],
    unit: "percent",
  },
  endure: {
    id: "endure",
    materialId: "enchant_endure",
    name: "인내",
    description: "받는 대미지를 그만큼 줄인다.",
    range: [3, 10],
    unit: "percent",
  },
  venom: {
    id: "venom",
    materialId: "enchant_venom",
    name: "독공",
    description:
      "공격 시 일정 확률로 적에게 체력 비례 도트를 부여한다. 적 최대 체력에 비례하므로 고체력 보스에 강하다.",
    range: [5, 15],
    unit: "percent",
  },
};

export const ENCHANT_AFFIX_IDS: readonly EnchantAffixId[] = Object.keys(
  ENCHANT_AFFIXES,
) as EnchantAffixId[];

export const ENCHANT_AFFIX_ID_SET: ReadonlySet<EnchantAffixId> = new Set(
  ENCHANT_AFFIX_IDS,
);

// 자루에 부여된 한 슬롯의 결과 — affix + 부여 시점 굴림 값.
export type EnchantSlot = {
  affixId: EnchantAffixId;
  /** range 안에서 정수 롤된 결과. */
  value: number;
};

export function isEnchantAffixId(v: unknown): v is EnchantAffixId {
  return typeof v === "string" && ENCHANT_AFFIX_ID_SET.has(v as EnchantAffixId);
}

/** materialId(enchant_<id>) → affix. 부여서 사용 시 affix 도출. */
export function affixFromMaterialId(
  materialId: string,
): EnchantAffix | null {
  if (!materialId.startsWith("enchant_")) return null;
  const id = materialId.slice("enchant_".length) as EnchantAffixId;
  if (!ENCHANT_AFFIX_ID_SET.has(id)) return null;
  return ENCHANT_AFFIXES[id];
}

// 강화 단계별 풀리는 슬롯 수 — +2 → 1슬, +4 → 2슬, +7 → 3슬.
// 그 사이 단계는 직전 슬롯 수 유지.
export function enchantSlotCapacity(enhancementLevel: number): number {
  if (!Number.isInteger(enhancementLevel) || enhancementLevel < 0) return 0;
  if (enhancementLevel >= 7) return 3;
  if (enhancementLevel >= 4) return 2;
  if (enhancementLevel >= 2) return 1;
  return 0;
}

/** range 안에서 정수 롤. rng() 는 0 이상 1 미만. */
export function rollEnchantValue(
  affix: EnchantAffix,
  rng: () => number,
): number {
  const [min, max] = affix.range;
  if (max <= min) return min;
  const span = max - min + 1;
  return min + Math.floor(rng() * span);
}

// 슬롯들이 자루 stats 에 정적으로 더하는 보너스 — 항상 장착 효과로 합산되는 종류만.
//   might  → atk + value (flat)
//   swift  → spd + value (flat)
//   insight → 모든 스탯 + value (flat — str/dex/vit/spd/luk)
// 나머지 affix (가드/회피/치명타 등) 는 전투 엔진에서 발동 — bonus 합산 X.
//
// resolveEnhancedItem 가 호출 시 더해 인스턴스 → EquippedItem 변환에 반영한다.
export function enchantStaticBonus(
  slots: readonly EnchantSlot[] | undefined,
): {
  atk?: number;
  str?: number;
  dex?: number;
  vit?: number;
  spd?: number;
  luk?: number;
} {
  if (!slots || slots.length === 0) return {};
  const out: Record<string, number> = {};
  for (const slot of slots) {
    if (slot.affixId === "might") {
      out.atk = (out.atk ?? 0) + slot.value;
    } else if (slot.affixId === "swift") {
      out.spd = (out.spd ?? 0) + slot.value;
    } else if (slot.affixId === "insight") {
      out.str = (out.str ?? 0) + slot.value;
      out.dex = (out.dex ?? 0) + slot.value;
      out.vit = (out.vit ?? 0) + slot.value;
      out.spd = (out.spd ?? 0) + slot.value;
      out.luk = (out.luk ?? 0) + slot.value;
    }
    // 그 외 affix 는 전투 엔진에서 발동 — bonus 합산 X.
  }
  return out;
}

// 전투/보상 발동형 affix 의 합산 결과. 한 자루 안에서도, 자루끼리도 같은 affix 가
// 나오면 단순 누적. 발동형 분류는 enchant 카탈로그 description 과 일치.
//
// 단위 정책:
//   - "percent" affix 는 그대로 percent 값 누적 (ex. critical 5~8 → critPct 합산).
//   - "flat" affix 도 그대로 누적 (ex. pierce 1~5 → pierceFlat 합산).
//
// 발동/적용 위치:
//   - 전투 시작 시:        barrierPct (보호막)
//   - 자기 턴 시작 시:     regenPctPerTurn (재생), awakenApChancePct (각성)
//   - 공격 굴림 시:        critPct (+ critChancePct), pierceFlat (def 차감),
//                          executeBonusPct(+ execution), berserkBonusPct(자체 HP),
//                          breakerBossBonusPct(boss), lifestealPct(+ runeLifestealPct),
//                          venomChancePct + venomDmg (출혈 스택)
//   - 피격 시:             guardBlockPct(블록), dodgePct(+ evasionPct),
//                          endurePct(피해 -%), reflectPct(받은 피해 % 반사)
//   - 전투 종료(보상) 시:  fortunePct(gold), bountyPct(exp), harvestPct(drop)
export type EnchantCombatBonus = {
  // 공격
  critPct: number;
  pierceFlat: number;
  executeBonusPct: number;
  berserkBonusPct: number;
  breakerBossBonusPct: number;
  lifestealPct: number;
  venomChancePct: number;
  venomDmg: number;
  // 방어
  guardBlockPct: number;
  dodgePct: number;
  endurePct: number;
  reflectPct: number;
  // 자기 차원
  barrierPct: number;
  regenPctPerTurn: number;
  awakenApChancePct: number;
  // 보상
  fortunePct: number;
  bountyPct: number;
  harvestPct: number;
};

export const ZERO_ENCHANT_COMBAT_BONUS: Readonly<EnchantCombatBonus> = {
  critPct: 0,
  pierceFlat: 0,
  executeBonusPct: 0,
  berserkBonusPct: 0,
  breakerBossBonusPct: 0,
  lifestealPct: 0,
  venomChancePct: 0,
  venomDmg: 0,
  guardBlockPct: 0,
  dodgePct: 0,
  endurePct: 0,
  reflectPct: 0,
  barrierPct: 0,
  regenPctPerTurn: 0,
  awakenApChancePct: 0,
  fortunePct: 0,
  bountyPct: 0,
  harvestPct: 0,
};

// 한 자루의 슬롯 → bonus 누적 (in-place). 여러 자루를 합산할 때 같은 acc 에 누적.
export function accumulateEnchantCombat(
  acc: EnchantCombatBonus,
  slots: readonly EnchantSlot[] | undefined,
): void {
  if (!slots || slots.length === 0) return;
  for (const s of slots) {
    switch (s.affixId) {
      // 공격
      case "critical":
        acc.critPct += s.value;
        break;
      case "pierce":
        acc.pierceFlat += s.value;
        break;
      case "execute":
        acc.executeBonusPct += s.value;
        break;
      case "berserk":
        acc.berserkBonusPct += s.value;
        break;
      case "breaker":
        acc.breakerBossBonusPct += s.value;
        break;
      case "lifesteal":
        acc.lifestealPct += s.value;
        break;
      case "venom":
        // venom 한 슬롯 = 같은 확률 + 같은 데미지. 두 슬롯이면 확률·데미지 둘 다 가산.
        acc.venomChancePct += s.value;
        acc.venomDmg += s.value;
        break;
      // 방어
      case "guard":
        acc.guardBlockPct += s.value;
        break;
      case "dodge":
        acc.dodgePct += s.value;
        break;
      case "endure":
        acc.endurePct += s.value;
        break;
      case "reflect":
        acc.reflectPct += s.value;
        break;
      // 자기 차원
      case "barrier":
        acc.barrierPct += s.value;
        break;
      case "regen":
        acc.regenPctPerTurn += s.value;
        break;
      case "awaken":
        acc.awakenApChancePct += s.value;
        break;
      // 보상
      case "fortune":
        acc.fortunePct += s.value;
        break;
      case "bounty":
        acc.bountyPct += s.value;
        break;
      case "harvest":
        acc.harvestPct += s.value;
        break;
      // 정적 합산 affix — enchantStaticBonus 가 처리. 여기선 무시.
      case "might":
      case "swift":
      case "insight":
        break;
    }
  }
}

// 무기/방어구/장신구 슬롯 모음 → combat bonus 누적 결과.
export function enchantCombatBonus(
  slotsList: ReadonlyArray<readonly EnchantSlot[] | undefined>,
): EnchantCombatBonus {
  const acc: EnchantCombatBonus = { ...ZERO_ENCHANT_COMBAT_BONUS };
  for (const slots of slotsList) accumulateEnchantCombat(acc, slots);
  return acc;
}
