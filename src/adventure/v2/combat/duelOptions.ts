import type { PvPResolveContext } from "./engine-pvp";

// 서버 자동 일기토(무개입)의 표준 resolve 옵션 — 항상 평타 선택·물약 없음.
// outpost attack(약탈/정복)·claim·eject·arena 가 같은 리터럴을 각자 복붙하던 것(2026-07 통합).
// 호출마다 새 객체를 돌려준다(엔진에 넘긴 ctx 를 사이트별로 spread 확장해도 서로 안 섞이게).
export function autoDuelContext(): PvPResolveContext {
  return {
    pickAction: () => ({ kind: "attack" }),
    potions: { p1: {}, p2: {} },
  };
}
