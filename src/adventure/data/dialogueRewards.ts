// NPC 대화 보상 — 1회성 dialogue 완료 시 지급되는 보상 정의.
//
// 권위: 서버 (/api/npc/dialogue-reward). 클라/서버 공용 데이터로, 클라는 표시·UI 게이트
// 용으로 reward 모양을 참조하고 실제 지급은 서버 mutator 가 트랜잭션 안에서 처리한다.
// dedup 은 storyFlags.v2 의 storyFlag id 로 — 이미 박혀 있으면 idempotent no-op.

import type { ItemId } from "./items";
import type { MaterialId } from "./materials";
import type { PotionId } from "./potions";

export type DialogueRewardId =
  | "suzy_husband_news"
  | "manwol_hero_sword";

export type DialogueReward = {
  /** 지급 후 박을 storyFlag id. 동일 flag 가 이미 있으면 보상 미지급 (dedup). */
  storyFlag: string;
  gold?: number;
  fame?: number;
  exp?: number;
  /** 재료 추가. */
  materials?: Partial<Record<MaterialId, number>>;
  /** 포션 추가 (potions 한도 검사 — 초과분은 잘림). */
  potions?: Partial<Record<PotionId, number>>;
  /** 장비 추가 (스택 카운트). */
  equipment?: ItemId[];
};

export const DIALOGUE_REWARDS: Record<DialogueRewardId, DialogueReward> = {
  // SuzyDialogue Stage C — 남편 소식 전달 완료. 작은 회복약 ×2 + 골드/명성.
  suzy_husband_news: {
    storyFlag: "suzy_husband_news_complete",
    gold: 30,
    fame: 1,
    potions: { potion_heal_s: 2 },
  },
  // ManwolDialogue 5단계 — 영웅검 복원 완수. 영웅검 1자루 + 골드/명성.
  manwol_hero_sword: {
    storyFlag: "hero_sword_restored",
    gold: 400,
    fame: 8,
    equipment: ["hero_sword"],
  },
};

export const DIALOGUE_REWARD_IDS = Object.keys(
  DIALOGUE_REWARDS,
) as DialogueRewardId[];
