import type { CharacterDynamicState } from "@/adventure/character/useCharacterState";
import type { Profile } from "@/adventure/profile/useProfile";

// 훈련(training.v2) 타입 제거(2026-06-12) — v2 는 훈련 시스템 없음(숙련도 재설계로 폐기).

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
  [key: string]: unknown;
};

// POST /api/admin/v2-grant 본문(userId 제외). 골드·EXP·레벨은 캐릭터 패널에서 편집하고
// 여기는 synced-keys 밖이라 일반 saves PATCH 로 안 되는 v2 자원(재료/충전약/숙련도/장비).
export type V2GrantPayload = {
  materials?: Record<string, number>;
  hpCharges?: number;
  mpCharges?: number;
  proficiency?: number;
  equipmentId?: string;
  refillStamina?: boolean;
  // 레어맵 지급 — 종류 + 발견 깊이(입장 가능 깊이). 캡(5) 무관 append(관리자 지급).
  rareMap?: { kind: string; depth: number };
  // 사이드 화폐 — fishing/treasure-wallet.v1 적립.
  fishingCoins?: number;
  treasureCoins?: number;
};
