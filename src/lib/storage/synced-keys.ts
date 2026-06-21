// 서버 동기화 대상 키 화이트리스트.
// 디바이스별 설정(theme, auto-potion-rules, battle-settings, notifications)은
// 일부러 제외 — 디바이스마다 다를 수 있는 항목.
//
// 노트 — 옛 localStorage→서버 마이그레이션 로직은 2026-05-16 RDS 컷오버 때 제거됨.
// 이제 키 추가 시 별도 마이그레이션 버전 관리 불필요. 서버가 단일 진실 출처.
// (SaveProvider 가 부트스트랩에서 잔존 localStorage 값을 정리한다.)
export const SYNCED_KEYS = [
  "character-profile.v2",
  "character.v2",
  "training.v2",
  "inventory.v2",
  "crafting.v2",
  "quest-progress.v2",
  "adventure-log.v2",
  "map.v2",
  "trial-unlocks.v1",
  "storyFlags.v2",
  "shop.unlocks.v1",
  "trial.v1",
  "tower.v1",
  "tower-challenge.v1",
  "paragon.v1",
] as const;

export type SyncedKey = (typeof SYNCED_KEYS)[number];

export function isSyncedKey(key: string): key is SyncedKey {
  return (SYNCED_KEYS as readonly string[]).includes(key);
}
