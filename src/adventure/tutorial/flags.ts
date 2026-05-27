// 튜토리얼 플래그는 storyFlags 시스템 위에 prefix 컨벤션으로 얹는다.
// 별도 스토리지를 두지 않는 이유: 신규/기존 캐릭터 분리(starterSaves 시드)와
// "다시 보기" 시 일괄 reset 만 prefix 필터로 처리하면 충분하기 때문.

export const TUTORIAL_FLAG_PREFIX = "tutorial.";

// 신규 캐릭터는 starterSaves 가 시드. 기존 캐릭터는 미설정이라 자동 트리거되지 않는다.
export const TUTORIAL_ENABLED_FLAG = "tutorial.enabled";

// v2 진입 후크 — 1회성 축하/안내. 신규 캐릭만 (TUTORIAL_ENABLED_FLAG 시드된 경우)
// 자동 표시되고, 첫 발생 시 set 되어 그 후엔 안 보인다. 사용자 피드백 (2026-05-28)
// "접속해서 stamina 만 쓰고 끄면 흥미 없음" 대응.
export const TUTORIAL_V2_FIRST_HUNT = "tutorial.v2-first-hunt";
export const TUTORIAL_V2_FIRST_DROP = "tutorial.v2-first-drop";
export const TUTORIAL_V2_FIRST_LEVELUP = "tutorial.v2-first-levelup";

export type TutorialStepId = `tutorial.${string}`;
