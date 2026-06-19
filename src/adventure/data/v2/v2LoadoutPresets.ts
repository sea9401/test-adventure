// 로드아웃 프리셋 — 이름 붙인 로드아웃(장착 스킬 묶음). 한 번에 적용해 빌드를 빠르게 전환한다.
//   🔑 비파워·순수 편의(전투 전 자유 재장착이라 빌드 전환은 이미 가능 — 프리셋은 그 번거로움을
//   줄이는 QoL·전투 중 스왑 아님·SP 캡 불변).
//
// 슬롯은 모두에게 무료 고정(2026-06: 수집 포인트 경제 폐지 — 옛 구매형 슬롯을 무료 고정으로 단순화·
//   옛 최대치 5 를 그대로 무료화해 기존 프리셋 손실 0).

import type { V2SkillId } from "./v2Skills";

/** 이름 붙인 로드아웃 프리셋(장착 스킬 묶음). skills 는 적용 시 sanitize/clamp 를 거친다. */
export type V2LoadoutPreset = {
  name: string;
  skills: V2SkillId[];
};

/** 프리셋 슬롯 수 — 모두에게 무료 고정. (옛 수집 포인트 구매 폐지·옛 최대치 5 그대로 무료화.) */
export const PRESET_SLOTS = 5;

/** 프리셋 이름 최대 길이(저장/표시). */
export const PRESET_NAME_MAX = 24;

/** 총 프리셋 슬롯(고정). */
export function totalPresetSlots(): number {
  return PRESET_SLOTS;
}
