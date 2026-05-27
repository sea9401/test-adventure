import type { CharacterDynamicState } from "@/adventure/character/useCharacterState";
import type { Profile } from "@/adventure/profile/useProfile";
import { ZERO_ALLOCATED } from "@/adventure/character/statMeta";
import type { StatKey } from "@/adventure/data/stats";
import type { InventoryState } from "@/adventure/inventory/useInventory";
import type { TowerState } from "@/adventure/tower/types";

export type TrainingPersisted = {
  endsAt: number | null;
  points: number;
  allocated: Record<StatKey, number>;
  revertPoints: number;
  // 누적 훈련 완료 횟수 — 칭호 마일스톤 트리거 + 단련 포인트 정합성 진단용.
  // 기댓값: (level-1) × V2_STAT_POINTS_PER_LEVEL + completedCount = points + sum(allocated).
  // 안 맞으면 어딘가 손실 (v2 dungeon hunt grant 기준 — autoHunt/page 의 ×1 grant 캐릭은
  // 양의 diff 가 정상).
  completedCount?: number;
};

export const emptyTraining = (): TrainingPersisted => ({
  endsAt: null,
  points: 0,
  allocated: { ...ZERO_ALLOCATED },
  revertPoints: 0,
  completedCount: 0,
});

export type AdminUserRow = {
  id: string;
  email: string | null;
  gameName: string | null;
  className: string | null;
  lastSeenAt: string | null;
  createdAt: string;
};

export type SavesMap = {
  "character-profile.v2"?: Profile;
  "character.v2"?: CharacterDynamicState;
  "training.v2"?: TrainingPersisted;
  "inventory.v2"?: InventoryState;
  "tower.v1"?: TowerState;
  [key: string]: unknown;
};
