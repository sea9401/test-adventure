// 캐릭터 아바타 id — 외형 6종 (남자 1~3 / 여자 1~3) 또는 NPC/몬스터 이미지 차용.
// "use client" 모듈에서 분리된 순수 데이터/타입 — 서버 라우트도 안전하게 import 가능.
// 이전 버전의 "male"/"female" 도 마이그레이션 시점에 male1/female1 로 흡수.
//
// 형식:
//   - 캐릭터 외형:  "male1" | "male2" | "male3" | "female1" | "female2" | "female3"
//   - NPC 이미지:   "npc:<NpcId>"      예) "npc:village_blacksmith_bold"
//   - 몬스터 이미지: "monster:<key>"   예) "monster:슬라임"  (MONSTERS Record 키)
// 신규 형식은 검증·렌더 시 avatars.ts 의 리졸버를 거친다. 알 수 없는 id 는 invalid.

import { NPCS } from "@/adventure/data/npcs";
import { MONSTERS } from "@/adventure/data/monsters";

export const CHARACTER_AVATARS = [
  "male1",
  "male2",
  "male3",
  "female1",
  "female2",
  "female3",
] as const;

// 하위 호환 — 기존 AVATARS export 자리. (캐릭터 외형 한정 — 신규 NPC/몬스터는 별도 카탈로그.)
export const AVATARS = CHARACTER_AVATARS;
export type Avatar = string;
// 하위 호환용 — 기존 코드의 Gender 타입 자리. 새 코드에서는 Avatar 사용.
export type Gender = Avatar;

export const NPC_AVATAR_PREFIX = "npc:";
export const MONSTER_AVATAR_PREFIX = "monster:";
export const PROFILE_IMAGE_STORAGE_PREFIX = "profile-images";

const PROFILE_IMAGE_OBJECT_KEY =
  /^profile-images\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.webp$/i;

// portrait 가 있는 NPC 만 선택지로. 가용 카탈로그.
export const NPC_AVATAR_IDS = NPCS.filter((n) => !!n.portrait).map(
  (n) => `${NPC_AVATAR_PREFIX}${n.id}`,
);

// image 가 있는 몬스터 키만 선택지로.
export const MONSTER_AVATAR_IDS = Object.entries(MONSTERS)
  .filter(([, m]) => !!m.image)
  .map(([k]) => `${MONSTER_AVATAR_PREFIX}${k}`);

const NPC_PORTRAIT_BY_ID = new Map<string, string>(
  NPCS.filter((n) => !!n.portrait).map((n) => [n.id, n.portrait as string]),
);

const MONSTER_IMAGE_BY_KEY = new Map<string, string>(
  Object.entries(MONSTERS)
    .filter(([, m]) => !!m.image)
    .map(([k, m]) => [k, m.image as string]),
);

// 알려진 id 인지 검증. 캐릭터 6종 + 가용 NPC + 가용 몬스터 중 하나여야 한다.
export function isValidAvatarId(raw: unknown): raw is Avatar {
  if (typeof raw !== "string") return false;
  if ((CHARACTER_AVATARS as readonly string[]).includes(raw)) return true;
  if (raw.startsWith(NPC_AVATAR_PREFIX)) {
    return NPC_PORTRAIT_BY_ID.has(raw.slice(NPC_AVATAR_PREFIX.length));
  }
  if (raw.startsWith(MONSTER_AVATAR_PREFIX)) {
    return MONSTER_IMAGE_BY_KEY.has(raw.slice(MONSTER_AVATAR_PREFIX.length));
  }
  return false;
}

export function normalizeProfileImageObjectKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return PROFILE_IMAGE_OBJECT_KEY.test(trimmed) ? trimmed : null;
}

export function isProfileImageObjectKey(value: unknown): value is string {
  return normalizeProfileImageObjectKey(value) !== null;
}

// 저장된 프로필에는 게임 이미지 외에 서버가 발급한 커스텀 이미지 키도 허용한다.
// 신규 가입/일반 선택 UI는 isValidAvatarId 만 사용해 임의 키 주입을 막는다.
export function isStoredAvatarId(raw: unknown): raw is Avatar {
  return isValidAvatarId(raw) || isProfileImageObjectKey(raw);
}

// 아바타 id → 표시용 이미지 src. 알 수 없는 id 는 기본 캐릭터 외형으로 폴백.
export function avatarImageSrc(id: Avatar): string {
  const customKey = normalizeProfileImageObjectKey(id);
  if (customKey) {
    const match = PROFILE_IMAGE_OBJECT_KEY.exec(customKey);
    if (match) return `/api/profile/image/${match[1]}/${match[2]}.webp`;
  }
  if (typeof id === "string" && id.startsWith(NPC_AVATAR_PREFIX)) {
    const npcId = id.slice(NPC_AVATAR_PREFIX.length);
    const src = NPC_PORTRAIT_BY_ID.get(npcId);
    if (src) return src;
  } else if (typeof id === "string" && id.startsWith(MONSTER_AVATAR_PREFIX)) {
    const key = id.slice(MONSTER_AVATAR_PREFIX.length);
    const src = MONSTER_IMAGE_BY_KEY.get(key);
    if (src) return src;
  } else if ((CHARACTER_AVATARS as readonly string[]).includes(id)) {
    return `/images/character/${id}.webp`;
  }
  return `/images/character/male1.webp`;
}
