// PR-S1 5배 해상도 v2 스탯 상수 — 클라/서버 공용.
//
// derivePlayerCombatV2.ts 는 db 의존이라 클라에서 import 불가. 따라서 상수만 분리해
// 여기에 둠. derive 함수는 서버 모듈이 그대로 보유.

import type { V2StatKey } from "./v2StatKeys";

// v2 베이스 스탯 — 6 1차 스탯 (PR-2 전투 재설계: 속도 1차→파생, 정신 신설).
// 라이브 stats.ts 와 분리된 v2 전용 키 공간(v2StatKeys.ts) 사용 → 라이브 무관.
// INT 0 유지(마법 빌드 전용). 속도(spd)는 1차 아님 — 민첩에서 파생(derive).
export const V2_BASE_STATS: Record<V2StatKey, number> = {
  str: 15,
  dex: 15,
  vit: 15,
  int: 15, // 옛 0(물리 캐릭 마법 차단용) → 15 로 대칭. 전원 maxMp 50→80, 약간의 마법 베이스라인.
  spi: 15,
  luk: 15,
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
// 레벨 성장은 V2_HP_PER_LEVEL(=10) — Lv100 = 135 + 99×10 + vit = 1125 + vit.
export const V2_BASE_HP = 135;

// 레벨업 시 추가되는 maxHp(레벨당 고정 성장분). 여기에 VIT 성장분(HP_PER_VIT)이 더해진다.
// v2 전용(라이브는 별도 defaults.ts:HP_PER_LEVEL). 튜닝 다이얼.
export const V2_HP_PER_LEVEL = 10;

// 레벨업 시 추가되는 maxMp(레벨당 고정 성장분). 여기에 INT 성장분(MP_PER_INT)이 더해진다.
// HP 와 대칭 — INT 안 키우는 직업도 레벨마다 MP 가 자라 스킬 자원이 늘게. 튜닝 다이얼.
export const V2_MP_PER_LEVEL = 3;
