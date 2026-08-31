import type { APSkillCondition } from "./apSkills";
import type { StanceId } from "./stance";
import type { EquippedSlots } from "./types";
import type { StaminaState } from "@/adventure/v2/stamina";
import { INITIAL_CHARACTER_SAVE } from "@/adventure/starterSaveValues";

// 관리자 저장 데이터 편집과 과거 character.v2 세이브 해석에 필요한 상태 모양.
// 현재 게임 상태는 서버 권위 GameStateProvider가 관리하며, 이 타입은 옛 필드를
// 삭제하거나 정규화하지 않고 그대로 전달하기 위한 호환 경계다.
export type CharacterDynamicState = {
  hp: number;
  level: number;
  exp: number;
  /** 레거시 저장 필드. 현재 성장/랭킹 구조에서는 새로 쓰지 않는다. */
  totalLevels?: number;
  gold: number;
  fame: number;
  affiliation?: string;
  equipped?: EquippedSlots;
  equippedTitleId?: string | null;
  /** 레거시 일반 스킬 장착 목록. */
  equippedSkills?: string[];
  /** 레거시 특기 장착 목록. */
  equippedFeats?: (string | null)[];
  /** 레거시 룬 장착 목록. 알 수 없는 미래 ID도 보존할 수 있게 문자열로 둔다. */
  equippedRunes?: ({ id: string; grade: number } | null)[];
  bossAttempts?: Partial<
    Record<string, { date: string; count: number; lastAttemptAtMs?: number }>
  >;
  /** 레거시 AP 스킬 학습 목록. */
  learnedAPSkills?: string[];
  /** 레거시 AP 스킬 발동 조건. */
  apSkillConditions?: Partial<Record<string, APSkillCondition>>;
  selectedStance?: StanceId | null;
  migrations?: Partial<Record<string, boolean>>;
  stamina?: StaminaState;
};

export const initialCharacterState: CharacterDynamicState =
  INITIAL_CHARACTER_SAVE;
