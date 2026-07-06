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

// 타일 전쟁 플래그 — 정착지 전쟁을 자유 타일(tile:col,row) 위로 이전(브릿지=tileWarfare.ts).
//   off(기본)=현행(옛 거점 기반) byte-identical. Phase 1+ 가 이 게이트 뒤에서 단계 배선:
//     P1 타일 길드소유(점령행) · P2 사냥세 금고 · P3 약탈/정복/수비/영주/명성 · P4 컷오버+옛 거점 은퇴.
export const V2_TILE_WARFARE =
  process.env.NEXT_PUBLIC_V2_TILE_WARFARE === "true";

// 타일 생산 관리 플래그 — 타일 정착지 승격을 지도 버튼이 아니라 기존 마을 생산 시스템
//   (outpost_villages·슬롯/생산/자원 승격)으로 이전. off(기본)=현행(지도 promote) byte-identical.
//   T1 생산 백엔드(솔로/길드 자원 라우팅) · T2 관리 UI · T3 지도 promote 제거+flip 단계 배선.
export const V2_TILE_PRODUCTION =
  process.env.NEXT_PUBLIC_V2_TILE_PRODUCTION === "true";

// 다이얼 (라이브 실측 후 캘리브) ───────────────────────────────────────────

// ── 건강도 (war vigor) — 순수 헬퍼는 warVigor.ts ──────────────────────────
// 0(소진)→1(만충)까지 걸리는 시간. 치료소 방문 시 경과만큼 선형 회복(lazy·크론 불요).
export const WAR_VIGOR_FULL_RECOVERY_MS = 10 * 60_000; // 10분 만충(빠른 회복)
// 전쟁 공격(약탈/정복) 자체 쿨타임 — 유효 공격 행동마다 저장(save.lastWarAttackAt).
export const WAR_ATTACK_COOLDOWN_MS = 2 * 60_000; // 2분
// 공격 가능 최소 건강도. HP/MP 중 하나라도 이 값 미만이면 공격 불가.
export const WAR_ATTACK_MIN_VIGOR_FRAC = 0.5;
// 온천(hotspring) 지형 — 인접 정착지를 보유한 길드의 길드원은 회복 분모를 이 값으로 나눠 가속.
//   2 = ×2(10분→5분). 과하면 1.5. 후킹 = war-vigor/recover · heal 라우트(tileHotspring.ts).
export const HOTSPRING_VIGOR_RECOVERY_DIVISOR = 2;

// ── 약탈 / 정복 (PR-3) ────────────────────────────────────────────────────
// 약탈 = 거점 금고 일부 탈취(마을 유지). 수비 인원을 격파하면 피해를 낮추고,
// 무방비 거점은 더 크게 털린다.
export const RAID_TREASURY_STEAL_FRAC_DEFENDED = 0.1;
export const RAID_TREASURY_STEAL_FRAC_UNDEFENDED = 0.25;
// 약탈 준비 — 대상 타일에 이 시간 이상 머문 뒤에만 약탈 가능. 토벌 측이 대응할 시간을 갖게 한다.
export const RAID_MIN_TILE_STAY_MS = 60 * 60_000;
// 토벌 성공 — 침입자 보유 골드 전액 + 은행 잔액 일부를 점령 길드 금고로 압류.
export const EJECT_BANKED_GOLD_STEAL_FRAC = 0.05;
// 정복 = 수비 큐 전원 격파 + 성벽(fortHp) 누적 공성 완파. 성벽 메커닉은 outpostSiege.ts(FORT_*)
//   재활용. 함락 시 마을 tier 1단계 강등(대도시→도시→마을, 최하=강등 없이 이관), 금고는 그대로.

// ── 전략 지형 보정 (P3) — docs/v2-map-terrain-plan.md §2.4/2.5/2.6 ─────────
// 타일 정착지가 특수 지형 칸 위(요새터/교역로) 또는 인접(호수)일 때만 적용. 카탈로그 거점 무관.
// 요새터(stronghold) — 그 칸 정착지 fortMaxHp 배수(outpostSiege.tileFortMaxHp).
export const STRONGHOLD_FORT_HP_MULT = 1.15;
// 교역로(trade_route) — 영주 세금 "발생"(hunt goldTaxed) 배수. 수확(harvest) 곱 금지(골드 인플레).
export const TRADE_ROUTE_TAX_MULT = 1.15;
// 교역로 — 약탈당할 때 금고 탈취 배수(양날: 잘 벌지만 잘 털림).
export const TRADE_ROUTE_RAID_LOSS_MULT = 1.1;
// 호수(lake) — 인접 정착지가 공격(공성/약탈)당할 때 공격자 효율 배수(천연 해자·방어 명당).
export const LAKE_ATTACKER_PENALTY_MULT = 0.9;

// ── 영주 + 세금 수확 (PR-4) ───────────────────────────────────────────────
export const LORD_HARVEST_COOLDOWN_MS = 6 * 3_600_000; // 영주 세금 수확 6h 쿨다운
export const LORD_PERSONAL_CUT_FRAC = 0.1; // 수확분 10% 영주 개인 / 90% 길드 금고

// ── 명예 (PR-5) ───────────────────────────────────────────────────────────
export const GOLD_PER_HONOR_ON_DEPOSIT = 100_000; // 길드 골드 입금 10만당 명예 1(보조 획득처)
export const HONOR_SHOP_STAMINA_POTION_COST = 100; // 명예상점 스태미나 회복약 가격
export const HONOR_PER_DEFENSE_WIN = 10; // 수비 전투 승리(공격 막아냄)당 명예(주 획득처)
