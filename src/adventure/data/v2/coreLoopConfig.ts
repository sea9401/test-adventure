// v2 코어 루프 재설계 — 다이얼/플래그/스탯게이트 데이터. (docs/v2-core-loop-redesign.md PR-1)
//
// ⚠️ 이 모듈은 PR-1 단계에서 "정의만" 한다 — 런타임 로직 불변. 마스터 플래그
//    V2_CORE_LOOP_V2 가 off 인 동안 이 상수/데이터를 참조하는 코드는 없다(inert).
//    후속 PR(스태미나 폐지·직업 스탯게이트 트리·재전직·사냥 쿨다운·오프라인·ATB·AP
//    로드아웃)이 플래그 게이트 뒤에서 단계적으로 배선하고, 전 시스템 완성 후 flip 한다.
//
// 전 시스템 = V1식 한판한판 사냥(스태미나 폐지·전투당 딜레이·오프라인 자동전투) + 평탄
// 스탯게이트 직업 트리(차수 폐지·12계파 재활용) + 재전직 루프 + ATB 전투 + AP 스킬 로드아웃.

import type { StatKey } from "@/adventure/data/stats";

// 마스터 플래그 — 전 코어 루프 재설계를 한 번에 켜고 끈다. 완성 전까지 false.
export const V2_CORE_LOOP_V2 = false;

// === 사냥 페이싱 (V1식·스태미나 폐지·전투당 서버 쿨다운) =====================
// throttle = 전투당 실시간 쿨다운(클릭 스팸/무한 그라인딩 차단·온오프 동일 속도).
export const HUNT_COOLDOWN_MS = 5000; // 전투 1판 간격(유저 확정 — 판당 성장 체감 cadence)
export const BOSS_HUNT_COOLDOWN_MS = 15000; // 보스는 별도 상향
// 오프라인 자동전투 — AFK/캐주얼 진행(옛 스태미나 재생 대체). 누적 캡으로 무한 차단.
export const OFFLINE_MAX_BATTLES = 600; // ≈ 50분치 @ 5s
export const OFFLINE_SETTLE_BATCH_SIZE = 50; // 복귀 정산 chunk(서버 CPU/DB write 캡)
export const OFFLINE_GOLD_CAP = 250_000; // 오프라인 골드 누적 캡(경제 압도 방지)

// === 진행 (차수 폐지·단일 레벨캡·재전직 루프) ===============================
export const V2_LEVEL_CAP = 50; // 옛 차수별 50/65/80/100 → 단일 50. 루프 Lv1→50→재전직→Lv1.
export const LOOP_BATTLES_TARGET = 1200; // Lv1→50 목표 판수(5s×1200 ≈ 100분 루프)

// === statFloor 재조정 (tierMult 폐지·cumLevel 자연 해금 곡선) =================
export const STAT_FLOOR_GLOBAL_PER_CUMLEVEL = 0.012;
export const STAT_FLOOR_PROFILE_PER_CUMLEVEL = 0.045;
export const STAT_FLOOR_DECAY_BAND = 2500;
export const STAT_FLOOR_DECAY_PER_BAND = 0.1;
export const STAT_FLOOR_DECAY_MIN = 0.45;

// === AP 스킬 로드아웃 (cumLevel 파생) ======================================
export const AP_BASE = 12;
export const AP_CUMLEVEL_PER_POINT = 45; // 누적 레벨 45당 AP +1
export const AP_MASTERED_JOB_BONUS = 3; // 직군 정점 도달당 AP +3
export const AP_MAX_SOFT_CAP = 60;

// === 거점 행동 비용 (스태미나 → 골드/전투 쿨다운으로 대체) ====================
export const OUTPOST_MOVE_GOLD_COST = 25; // 인접 이동 1홉(재진입 무료)
export const OUTPOST_WARP_GOLD_COST = 75; // 워프(발견 거점 순간이동) — 이동의 3배(옛 스태미나 비율 미러)
export const CLAIM_GOLD_COST_BY_TIER: Record<number, number> = {
  1: 500,
  2: 1500,
  3: 4000,
  4: 9000,
}; // 점령 골드 sink(선택 — 전투 쿨다운과 병행)

// === 직업 스탯게이트 트리 ==================================================
// 모험가(base) → 4직군(주스탯 임계) → 12계파(복합 스탯 조건). 12계파 정체성·스킬·패시브는
// 기존 v2JobSpecs 그대로 재활용하고, 해금 방식만 "차수 선택"에서 "스탯 조건"으로 바꾼다.
//   스탯 키 = 내부명(str/vit/int/dex). UI 표기는 STR/DEF(vit)/INT/AGI(dex).
export type StatGate = Partial<Record<StatKey, number>>;

// 모험가 — 간단 base. HP 증가 패시브 + AP 0 기본공격(별도 데이터). 파생 직업(방랑자·상급
// 모험가) 확장 훅은 후속.
export const ADVENTURER_MAXHP_BONUS_PCT = 10;

// 4직군 해금 — 주스탯 임계.
export const JOB_GROUP_STAT_GATE: Record<string, StatGate> = {
  warrior: { str: 30 },
  martial: { vit: 30 },
  mage: { int: 30 },
  rogue: { dex: 30 },
};

// 12계파 해금 — 복합 스탯 조건(직군 정체성 방향으로). key = v2JobSpecs spec id.
export const SPEC_STAT_GATE: Record<string, StatGate> = {
  // 전사
  gwang: { str: 55, dex: 25 }, // 광검 — 극딜
  knight: { str: 40, vit: 50 }, // 기사 — 탱
  gladiator: { str: 45, dex: 45 }, // 검투사 — 출혈 듀얼리스트
  // 무도가
  cheolsan: { vit: 60, str: 25 }, // 금강 — 회피탱
  gigong: { vit: 45, str: 45 }, // 혈권 — 흡혈 브루저
  yeonhwan: { dex: 55, str: 35 }, // 연환 — 콤보
  // 마법사
  arcane: { int: 60, dex: 25 }, // 마도사 — 버스트
  battlemage: { int: 50, vit: 35 }, // 워메이지 — 누적 난사
  cleric: { int: 45, vit: 45 }, // 사제 — 자힐 탱
  // 도적
  archery: { dex: 60, str: 25 }, // 궁사 — 물량 다단
  assassin: { dex: 55, str: 35 }, // 자객 — 크리 폭발
  venom: { dex: 50, int: 35 }, // 독사 — 독 부식
};

// 스탯 조건 충족 판정 (순수). 모든 임계를 만족하면 true. 빈 게이트는 true.
export function isStatGateMet(
  gate: StatGate,
  stats: Partial<Record<StatKey, number>>,
): boolean {
  for (const [k, min] of Object.entries(gate)) {
    if ((stats[k as StatKey] ?? 0) < (min ?? 0)) return false;
  }
  return true;
}

// 현재 스탯으로 해금된 직군 id 목록 (순수).
export function unlockedJobGroups(
  stats: Partial<Record<StatKey, number>>,
): string[] {
  return Object.entries(JOB_GROUP_STAT_GATE)
    .filter(([, gate]) => isStatGateMet(gate, stats))
    .map(([id]) => id);
}

// 현재 스탯으로 해금된 계파 id 목록 (순수).
export function unlockedSpecs(
  stats: Partial<Record<StatKey, number>>,
): string[] {
  return Object.entries(SPEC_STAT_GATE)
    .filter(([, gate]) => isStatGateMet(gate, stats))
    .map(([id]) => id);
}

// 계파 → 소속 직군. v2JobSpecs 구조의 미러(테스트로 동기화 강제). 라우트가 v2JobSpecs 를
// import 하지 않고도 소속 검증하도록 — coreLoopConfig 를 leaf 모듈로 유지(순환 방지).
export const SPEC_TO_GROUP: Record<string, string> = {
  gwang: "warrior",
  knight: "warrior",
  gladiator: "warrior",
  cheolsan: "martial",
  gigong: "martial",
  yeonhwan: "martial",
  arcane: "mage",
  battlemage: "mage",
  cleric: "mage",
  archery: "rogue",
  assassin: "rogue",
  venom: "rogue",
};

export type ReincarnTargetError = "bad_target" | "job_locked" | "spec_locked";

// 재전직 타겟 검증 (순수). null = 통과. 라우트(advance-class flag-on)가 이걸로 게이트한다.
// 🔑계파 게이트가 부모 직군 게이트를 포함하지 않는 경우(예 yeonhwan 은 vit 무조건)가 있어
//   직군 게이트(unlockedJobGroups)를 계파와 별개로 항상 확인 — 직군이 계파의 바닥 게이트.
export function reincarnTargetError(
  stats: Partial<Record<StatKey, number>>,
  targetClass: string,
  targetSpec: string | null,
): ReincarnTargetError | null {
  if (!(targetClass in JOB_GROUP_STAT_GATE)) return "bad_target";
  if (!unlockedJobGroups(stats).includes(targetClass)) return "job_locked";
  if (targetSpec) {
    if (SPEC_TO_GROUP[targetSpec] !== targetClass) return "spec_locked";
    if (!unlockedSpecs(stats).includes(targetSpec)) return "spec_locked";
  }
  return null;
}

// 모험가 maxHp 배수 (순수). 코어루프 on + 무직(=모험가)일 때만 HP 패시브(+ADVENTURER_MAXHP_BONUS_PCT%).
// 그 외(다른 직업·flag off)는 1.0 — flag off 면 전투/골든 byte-identical.
export function coreLoopMaxHpMult(
  playerClass: string,
  coreLoopOn: boolean,
): number {
  return coreLoopOn && playerClass === "none"
    ? 1 + ADVENTURER_MAXHP_BONUS_PCT / 100
    : 1;
}
