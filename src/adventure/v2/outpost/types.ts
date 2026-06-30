// OutpostView 패널 분리용 공유 타입 — 코디네이터(OutpostView)와 탭별 패널이 함께 쓴다.
// (거동 불변 리팩터: 기존 OutpostView 내부 인라인 타입을 그대로 옮긴 것.)

export type OccupationLite = {
  outpostId: string;
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  // 점령 길드 이름 — occupations API 가 동봉(배지 "○○ 점령" 표시용).
  occupiedByGuildName?: string | null;
  occupiedByGuildColor?: string | null;
  occupiedByGuildEmblem?: string | null;
  policy?: string;
  taxRate?: string;
  nextAttackAt?: string;
  // 거점 공성(성벽 HP) — 재생 반영 현재값 + 보호막 만료.
  fortHp?: number;
  fortMaxHp?: number;
  protectedUntil?: string;
  // 마을 건설 시 길드가 지은 이름 — 있으면 거점 표시 이름을 덮는다.
  villageName?: string | null;
} | null;

// 정착지 전쟁 약탈(raid) 결과 — 성공/실패 + 탈취 골드(또는 에러 문자열). 플래그 on 일 때만 사용.
export type RaidResult =
  | { won: boolean; stolenGold: number; defenderName: string | null }
  | string;

// 정착지 전쟁 정복(conquest) 결과 — 함락/공성 진행/실패(또는 에러 문자열). 플래그 on 전용.
export type ConquestResult =
  | {
      clearedQueue: boolean;
      captured: boolean;
      razed: boolean;
      fortHp: number;
      fortMaxHp: number;
      downgradedTo: string | null;
      defendersDefeated: number;
    }
  | string;
