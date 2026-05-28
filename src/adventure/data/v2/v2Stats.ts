// PR-S1 5배 해상도 v2 스탯 상수 — 클라/서버 공용.
//
// derivePlayerCombatV2.ts 는 db 의존이라 클라에서 import 불가. 따라서 상수만 분리해
// 여기에 둠. derive 함수는 서버 모듈이 그대로 보유.

import type { StatKey } from "@/adventure/data/stats";

// v2 베이스 스탯 — 5배 스케일 (옛 라이브 {3,...} × 5). baseCharacter.stats 는
// 라이브 derive/arenaBots/autoHunt 가 공유 사용해 ×5 하면 라이브 측이 5× 강화돼 깨짐.
// 따라서 v2 전용 baseline 으로 분리. INT 만 0 유지 (마법 시스템 신규 스탯).
export const V2_BASE_STATS: Record<StatKey, number> = {
  str: 15,
  dex: 15,
  vit: 15,
  spd: 15,
  luk: 15,
  int: 0,
};

// 레벨업 grant — training.v2.points 에 (levelsGained × 5).
// 현재 사용처: v2 hunt route + arenaBots (봇 포인트 산정). autoHunt/useLevelUpDetection
// 은 라이브 derive 와 결합돼 ×5 로 올리면 5× 인플레 — v2 derive 마이그까지 ×1 유지.
export const V2_STAT_POINTS_PER_LEVEL = 5;

// v2 베이스 MP — 신캐도 INT 0 으로 v2 스킬 일부 cast 가능하게 (강타 15 / 회복 20 / 명상 18
// 정도 1-3 회). INT 투자 시 추가 (int × 2). 라이브 spell 시스템 (INT 임계값 필요) 와 다른
// 접근 — onboarding 부드럽게.
export const V2_BASE_MP = 50;

// v2 베이스 HP — Lv1 vit 15 신캐 maxHp = 135 + 15 = 150 (어정쩡한 112 → 깔끔 150).
// 라이브 baseCharacter.maxHp(97) 와 분리 — V2_BASE_MP 와 대칭. v2 만 영향.
// 레벨 성장은 HP_PER_LEVEL(=5) 그대로 — Lv100 = 135 + 99×5 + vit = 630 + vit.
export const V2_BASE_HP = 135;

// 레벨업 시 추가되는 maxHp. v2 / 라이브 공유 상수였으나 명확성 위해 v2 도 여기서 참조.
// 옛 defaults.ts:HP_PER_LEVEL 와 동일 값 (5). 변경 시 양쪽 일관 유지.
export const V2_HP_PER_LEVEL = 5;
