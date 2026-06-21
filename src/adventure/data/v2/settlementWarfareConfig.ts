// v2 정착지 전쟁(방어/PvP) — 플래그 + 다이얼. 설계 SSOT = docs/v2-settlement-warfare-plan.md.
//
// 약탈/정복 분리 + 참여형 수비 등록 큐 + 건강도(전쟁 전용 HP/MP 이월) + 영주(세금 수확) + 명예.
// 옛 거점 점령 전투(3:3 길드 토너먼트)를 전면 대체한다.
//
// ⚠️ PR-1 = 플래그 + 다이얼 "정의만"(inert). 아직 어디서도 동작에 영향 주지 않는다. 후속 PR 이
//   게이트(V2_SETTLEMENT_WARFARE) 뒤에서 단계 배선한다:
//     PR-2 수비 등록 큐 · PR-3 약탈/정복 흐름 · PR-4 영주+세금수확 · PR-5 명예+명예상점 ·
//     PR-6 flip + 3:3 토너먼트 제거.
//   미설정(기본)=false → 현행(토너먼트) byte-identical. 스테이징서 env 로 켜 검증 후 flip.

// 마스터 플래그 — 정착지 전쟁 전체를 한 번에 켜고 끈다.
//   빌드 시 NEXT_PUBLIC_V2_SETTLEMENT_WARFARE="true" 면 on, 아니면 off(기본).
//   NEXT_PUBLIC_ 이라 빌드타임에 클라/서버 번들 양쪽에 구워진다.
export const V2_SETTLEMENT_WARFARE =
  process.env.NEXT_PUBLIC_V2_SETTLEMENT_WARFARE === "true";

// 다이얼 (라이브 실측 후 캘리브) ───────────────────────────────────────────

// ── 건강도 (war vigor) — 순수 헬퍼는 warVigor.ts ──────────────────────────
// 0(소진)→1(만충)까지 걸리는 시간. 치료소 방문 시 경과만큼 선형 회복(lazy·크론 불요).
export const WAR_VIGOR_FULL_RECOVERY_MS = 12 * 3_600_000; // 12h 만충(보수적 시작)

// ── 약탈 / 정복 (PR-3) ────────────────────────────────────────────────────
// 약탈 = 수비 큐 1번 격파 시 거점 금고의 이 비율을 탈취(마을 유지).
export const RAID_TREASURY_STEAL_FRAC = 0.5;
// 정복 = 수비 큐 전원 격파 + 성벽(fortHp) 누적 공성 완파. 성벽 메커닉은 outpostSiege.ts(FORT_*)
//   재활용. 함락 시 마을 tier 1단계 강등(대도시→도시→마을, 최하=강등 없이 이관), 금고는 그대로.

// ── 영주 + 세금 수확 (PR-4) ───────────────────────────────────────────────
export const LORD_HARVEST_COOLDOWN_MS = 6 * 3_600_000; // 영주 세금 수확 6h 쿨다운
export const LORD_PERSONAL_CUT_FRAC = 0.1; // 수확분 10% 영주 개인 / 90% 길드 금고

// ── 명예 (PR-5) ───────────────────────────────────────────────────────────
export const GOLD_PER_HONOR_ON_DEPOSIT = 100_000; // 길드 골드 입금 10만당 명예 1(보조 획득처)
export const HONOR_SHOP_STAMINA_POTION_COST = 100; // 명예상점 스태미나 회복약 가격
export const HONOR_PER_DEFENSE_WIN = 10; // 수비 전투 승리(공격 막아냄)당 명예(주 획득처)
