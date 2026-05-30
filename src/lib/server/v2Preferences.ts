// v2 플레이어 환경설정 — save key `preferences.v2`. 게임플레이 외 토글 모음.
// PR-4b: autoRepair(전투 전 손상 장비 자동 수리, 옵트인).

export const PREFERENCES_V2_KEY = "preferences.v2";

export type V2Preferences = {
  /** 전투 전 손상 장비 자동 수리(골드 차감). 옵트인 — 기본 false. */
  autoRepair: boolean;
};

export function parseV2Preferences(raw: unknown): V2Preferences {
  const v = (raw ?? {}) as Record<string, unknown>;
  return {
    autoRepair: v.autoRepair === true,
  };
}
