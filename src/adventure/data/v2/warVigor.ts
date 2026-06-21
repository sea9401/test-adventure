// 전쟁 건강도(war vigor) — 상수 + 순수 헬퍼. 설계: docs/v2-settlement-warfare-plan.md §2.1
//
// 정착지 전쟁(약탈/정복)의 공격·수비 전투는 일반 PvE 와 달리 HP/MP 를 매 전투 풀피로 리셋하지
// 않고 "건강도"로 이월한다. 전투 종료 시 남은 HP/MP 비율(0~1)을 저장하고, 다음 전쟁 전투는 그
// 비율에서 시작한다. 회복은 치료소 시간누적 방문만(일반 HP/MP 회복과 별개) — 무한 공격/수비
// 스팸을 막아 인원 우위를 throttle 한다. 패배(건강도 ~0)는 수비 큐에서 탈락한다.
//
// ⚠️ PR-1 = 상수 + 순수 헬퍼만(미배선·inert). 아직 어디서도 import 안 함 → 런타임 무영향.
//   후속 PR 이 플래그(V2_SETTLEMENT_WARFARE) 게이트 뒤에서 전쟁 전투·치료소·세이브에 배선한다.

import { WAR_VIGOR_FULL_RECOVERY_MS } from "./settlementWarfareConfig";

// 세이브 영속 — character.v2 save blob 의 warVigor 키. HP/MP 각각의 건강도 비율(0~1) + 갱신시각.
//   별도 DB 컬럼 없음(savesKv JSON). hp/mp 를 따로 두는 이유 = 전투 종료 시 둘 다 이월(유저 설계).
export type WarVigor = {
  hp: number; // 0~1
  mp: number; // 0~1
  at: number; // 마지막 갱신 epoch ms (회복 경과 계산 기준). 0 = 미설정(만충 취급)
};

export const FULL_WAR_VIGOR: WarVigor = { hp: 1, mp: 1, at: 0 };

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

// 전투 종료 시 남은 자원(HP 또는 MP)을 건강도 비율(0~1)로. max<=0 가드(0 반환).
export function vigorFracAfterBattle(remaining: number, max: number): number {
  if (max <= 0) return 0;
  return clamp01(remaining / max);
}

// 치료소 방문 회복 — 경과(ms)만큼 선형 회복(상한 1). 음수 경과/손상값 가드(자가치유).
export function recoveredVigorFrac(
  currentFrac: number,
  elapsedMs: number,
  fullRecoveryMs: number = WAR_VIGOR_FULL_RECOVERY_MS,
): number {
  const base = clamp01(currentFrac);
  if (elapsedMs <= 0 || fullRecoveryMs <= 0) return base;
  return clamp01(base + elapsedMs / fullRecoveryMs);
}

// 비파괴 파싱 — 미설정/손상 세이브는 만충(1,1)으로(옛 캐릭의 전쟁 첫 진입 = 만충 시작).
export function parseWarVigor(raw: unknown): WarVigor {
  if (!raw || typeof raw !== "object") return { ...FULL_WAR_VIGOR };
  const o = raw as Record<string, unknown>;
  return {
    hp: clamp01(typeof o.hp === "number" ? o.hp : 1),
    mp: clamp01(typeof o.mp === "number" ? o.mp : 1),
    at: typeof o.at === "number" && o.at > 0 ? o.at : 0,
  };
}

// 치료소 회복 적용 — at 이후 경과시간만큼 hp/mp 회복하고 갱신시각을 now 로(멱등 기준점 갱신).
//   at=0(미설정)이면 경과 0 = 만충 유지. now 가 과거(클락 스큐)면 음수 경과 → 회복 0(가드).
export function applyVigorRecovery(v: WarVigor, now: number): WarVigor {
  const elapsed = v.at > 0 ? now - v.at : 0;
  return {
    hp: recoveredVigorFrac(v.hp, elapsed),
    mp: recoveredVigorFrac(v.mp, elapsed),
    at: now,
  };
}

// 전투 종료 후 건강도 갱신 — 남은 HP/MP 를 비율로 저장하고 갱신시각 now(회복 기준점 리셋).
export function vigorAfterBattle(
  remainingHp: number,
  maxHp: number,
  remainingMp: number,
  maxMp: number,
  now: number,
): WarVigor {
  return {
    hp: vigorFracAfterBattle(remainingHp, maxHp),
    mp: vigorFracAfterBattle(remainingMp, maxMp),
    at: now,
  };
}
