import { isValidAvatarId, type Avatar } from "@/adventure/profile/avatars";

// character-profile.v2 저장값의 순수 파서/검증 — 클라(useProfile)와 서버(/sign-in·/create
// 게이트)가 "온보딩 완료" 기준을 정확히 공유하기 위한 단일 출처. 두 곳의 기준이 어긋나면
// / ↔ /sign-in / ↔ /create 사이에 무한 리다이렉트가 생기므로 반드시 같은 함수를 쓴다.
// avatars.ts 만 의존 — "use client" 없이 서버 라우트에서도 안전하게 import 가능.

export type Profile = { name: string; gender: Avatar };

// 저장된 gender 값을 정규화. 구버전("male"/"female")은 male1/female1 으로 마이그레이션.
// npc:/monster: 접두 id 도 isValidAvatarId 가 동시에 받아낸다.
function normalizeAvatar(raw: unknown): Avatar | null {
  if (typeof raw !== "string") return null;
  if (isValidAvatarId(raw)) return raw;
  if (raw === "male") return "male1";
  if (raw === "female") return "female1";
  return null;
}

export function readProfileValue(raw: unknown): Profile | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { name?: unknown; gender?: unknown };
  const normalized = normalizeAvatar(obj.gender);
  if (typeof obj.name === "string" && obj.name.length > 0 && normalized) {
    return { name: obj.name, gender: normalized };
  }
  return null;
}

// 온보딩 완료 = 유효한 프로필(이름 + 외형)이 있음. useProfile().needsSetup 의 반대.
export function isProfileComplete(raw: unknown): boolean {
  return readProfileValue(raw) !== null;
}
