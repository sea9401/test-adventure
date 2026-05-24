// v2 단일 던전 — 5층 구조 placeholder.
//
// 1~2층: 1~100렙 캐릭 성장. 라이브 몬스터 재활용 예정, 스탯은 던전 곡선에 맞춰 재조정.
// 3~5층: 만렙 후 엔드 파밍. 일단 난이도만 잡고 보상은 나중.
//
// 이번 commit 은 골격만 — 실제 enemies 배치·스탯 튜닝·보상은 후속 PR.

import type { Dungeon } from "./types";

export const MAIN_DUNGEON: Dungeon = {
  id: "main",
  name: "심층의 미궁",
  floors: [
    {
      id: 1,
      name: "1층 — 변경",
      requirement: { kind: "level", min: 1, max: 70 },
      enemies: [], // TODO: 라이브의 저~중반 몬스터 매핑
    },
    {
      id: 2,
      name: "2층 — 심층",
      requirement: { kind: "level", min: 70, max: 100 },
      enemies: [], // TODO: 라이브의 후반 몬스터 매핑
    },
    {
      id: 3,
      name: "3층 — 균열",
      requirement: { kind: "endgame", tier: "entry" },
      enemies: [], // TODO: 엔드 파밍 입문
    },
    {
      id: 4,
      name: "4층 — 어둠",
      requirement: { kind: "endgame", tier: "mid" },
      enemies: [], // TODO: 엔드 파밍 중반
    },
    {
      id: 5,
      name: "5층 — 심연",
      requirement: { kind: "endgame", tier: "max" },
      enemies: [], // TODO: 엔드 파밍 최종
    },
  ],
};
