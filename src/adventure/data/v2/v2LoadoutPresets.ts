// 로드아웃 프리셋(A 메타 PR-2b — 소비형 수집 포인트 = 환생 QoL). 순수 모듈(부수효과·DB 없음).
//
// 프리셋 = 이름 붙인 로드아웃(장착 스킬 묶음). 한 번에 적용해 빌드를 빠르게 전환한다.
//   🔑 비파워: 로드아웃은 지금도 전투 전 자유 재장착(무료)이라 빌드 전환은 이미 가능 — 프리셋은
//   그 번거로움을 줄이는 순수 편의(전투 중 스왑 아님·SP 캡 불변). 슬롯 수만 수집 포인트로 확장.
//
// 슬롯 경제: 기본 PRESET_SLOTS_FREE 무료 + 추가 슬롯을 수집 포인트로 구매(PRESET_SLOT_COSTS 점증).
//   사용 가능 포인트 = 누적 수집(등급 기준·불변) − 사용분(presetSlotSpend). 등급은 안 떨어진다.

import type { V2SkillId } from "./v2Skills";

/** 이름 붙인 로드아웃 프리셋(장착 스킬 묶음). skills 는 적용 시 sanitize/clamp 를 거친다. */
export type V2LoadoutPreset = {
  name: string;
  skills: V2SkillId[];
};

/** 기본 무료 프리셋 슬롯 수(모두에게). */
export const PRESET_SLOTS_FREE = 1;

/**
 * 추가 슬롯 구매 비용(수집 포인트) — n번째 추가 슬롯 = PRESET_SLOT_COSTS[n].
 * 길이 = 살 수 있는 추가 슬롯의 최대 개수. 점증(2→4→6→8)으로 후반 수집에 당근.
 */
export const PRESET_SLOT_COSTS: readonly number[] = [2, 4, 6, 8];

/** 프리셋 이름 최대 길이(저장/표시). */
export const PRESET_NAME_MAX = 24;

/** 살 수 있는 추가 슬롯의 최대 개수(= 비용표 길이). */
export const PRESET_SLOTS_BUYABLE_MAX = PRESET_SLOT_COSTS.length;

/** 구매한 추가 슬롯 수(bought)를 [0, MAX] 로 정규화. */
export function clampSlotsBought(bought: number): number {
  const b = Number.isFinite(bought) ? Math.floor(bought) : 0;
  return Math.max(0, Math.min(PRESET_SLOTS_BUYABLE_MAX, b));
}

/** 총 프리셋 슬롯 = 무료 + 구매분. */
export function totalPresetSlots(bought: number): number {
  return PRESET_SLOTS_FREE + clampSlotsBought(bought);
}

/** 이미 구매한 슬롯들에 들어간 누적 수집 포인트(사용분). */
export function presetSlotSpend(bought: number): number {
  const b = clampSlotsBought(bought);
  let sum = 0;
  for (let i = 0; i < b; i += 1) sum += PRESET_SLOT_COSTS[i] ?? 0;
  return sum;
}

/** 다음 추가 슬롯 1개의 가격. 더 살 수 없으면(최대 도달) null. */
export function nextPresetSlotCost(bought: number): number | null {
  const b = clampSlotsBought(bought);
  if (b >= PRESET_SLOTS_BUYABLE_MAX) return null;
  return PRESET_SLOT_COSTS[b] ?? null;
}
