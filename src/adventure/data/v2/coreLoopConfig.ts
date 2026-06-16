// v2 코어 루프 재설계 — 다이얼/플래그/스탯게이트 데이터. (docs/v2-core-loop-redesign.md PR-1)
//
// ⚠️ 이 모듈은 PR-1 단계에서 "정의만" 한다 — 런타임 로직 불변. 마스터 플래그
//    V2_CORE_LOOP_V2 가 off 인 동안 이 상수/데이터를 참조하는 코드는 없다(inert).
//    후속 PR(스태미나 폐지·직업 스탯게이트 트리·재전직·사냥 쿨다운·오프라인·ATB·SP
//    스킬 로드아웃)이 플래그 게이트 뒤에서 단계적으로 배선하고, 전 시스템 완성 후 flip 한다.
//
// 전 시스템 = V1식 한판한판 사냥(스태미나 폐지·전투당 딜레이·오프라인 자동전투) + 평탄
// 스탯게이트 직업 트리(차수 폐지·12계파 재활용) + 재전직 루프 + ATB 전투 + SP 스킬 로드아웃.

import type { StatKey } from "@/adventure/data/stats";

// 마스터 플래그 — 전 코어 루프 재설계를 한 번에 켜고 끈다.
//   환경별 제어: 빌드 시 NEXT_PUBLIC_V2_CORE_LOOP_V2="true" 면 on, 아니면 off(기본).
//   NEXT_PUBLIC_ 이라 빌드타임에 클라/서버 번들 양쪽에 구워진다(서버 const 이자 클라 const).
//   변수 미설정 환경(프로덕션 현행)은 false → byte-identical. 스테이징(.env.production.local 에
//   변수 지정)만 on 으로 띄워 검증 → 검증 후 프로덕션 env 에 변수 추가로 flip(코드 변경 없이).
export const V2_CORE_LOOP_V2 =
  process.env.NEXT_PUBLIC_V2_CORE_LOOP_V2 === "true";

// === 사냥 페이싱 (V1식·스태미나 폐지·전투당 서버 쿨다운) =====================
// throttle = 전투당 실시간 쿨다운(클릭 스팸/무한 그라인딩 차단·온오프 동일 속도).
export const HUNT_COOLDOWN_MS = 5000; // 전투 1판 간격(유저 확정 — 판당 성장 체감 cadence)
export const BOSS_HUNT_COOLDOWN_MS = 15000; // 보스는 별도 상향
// 오프라인 자동전투 — AFK/캐주얼 진행(옛 스태미나 재생 대체). 시간 캡으로 무한 차단.
// 판수/골드 캡 폐지 → 단일 2시간 시간 캡(유저 확정). 온오프 동일 5초 cadence + 이 캡 +
// lastBattleAt 중복방지로 "오프라인 ≤ 액티브" 보장(2h 정산 = 액티브 2h 압축).
export const OFFLINE_MAX_MS = 2 * 60 * 60 * 1000; // 2시간
export const OFFLINE_MAX_BATTLES = OFFLINE_MAX_MS / HUNT_COOLDOWN_MS; // 파생 천장(2h/5s = 1440)
export const OFFLINE_SETTLE_BATCH_SIZE = 50; // 복귀 정산 chunk(서버 CPU/DB write 캡)

// 전투 쿨다운 잔여 ms (순수). 마지막 전투(lastBattleAt) 이후 cooldownMs 경과 전이면 남은 ms,
// 경과/미전투(0)면 0 = 즉시 가능. 🔑미래 lastBattleAt(손상 세이브·서버 클락 스큐)은 remaining 이
// cooldownMs 를 초과 → 0 으로 처리(영구 락아웃 방지·다음 전투가 lastBattleAt=now 로 자가치유).
// 사냥·토벌 공통 게이트(같은 lastBattleAt 필드). >0 이면 쿨다운 중.
export function combatCooldownRemainingMs(
  lastBattleAt: number,
  now: number,
  cooldownMs: number = HUNT_COOLDOWN_MS,
): number {
  const remaining = lastBattleAt + cooldownMs - now;
  return remaining > 0 && remaining <= cooldownMs ? remaining : 0;
}

// 오프라인 누적 판수 (순수). 마지막 전투(lastBattleAt) 이후 경과 ÷ 쿨다운, maxMs(2시간) 캡.
// 미전투(0/미설정)·미래 lastBattleAt(손상)·음수 경과는 0. 정산 루프의 N. 온라인 사냥마다
// lastBattleAt=now 라, 액티브 시간은 누적 안 되고 "안 논 공백"만 쌓인다(중복 정산 차단).
export function offlineBattlesAccrued(
  lastBattleAt: number,
  now: number,
  cooldownMs: number = HUNT_COOLDOWN_MS,
  maxMs: number = OFFLINE_MAX_MS,
): number {
  if (!Number.isFinite(lastBattleAt) || lastBattleAt <= 0) return 0;
  const elapsed = now - lastBattleAt;
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  return Math.floor(Math.min(elapsed, maxMs) / cooldownMs);
}

// 오프라인(자동) 사냥 farm 깊이 — lastHuntDepth, 없으면 frontierDepth−1, [1, frontierDepth] 클램프
//   (잠긴 깊이 방지). offline-settle 정산 깊이와 "자동 사냥 중 사냥터 바로 입장" 목적지를 일치시킨다.
export function offlineFarmDepth(
  lastHuntDepth: number | null | undefined,
  frontierDepth: number,
): number {
  const frontier = Math.max(2, Math.floor(Number(frontierDepth) || 2));
  const raw = Number(lastHuntDepth);
  return Math.max(
    1,
    Math.min(
      frontier,
      Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : frontier - 1,
    ),
  );
}

// === 골드 차감 (은행 우선) ==================================================
// 코어루프 은행 모델: 출금 폐지·입금만 가능. 은행이 black hole 이 되지 않게 모든 골드 소비가
//   은행(bankedGold)을 먼저 쓰고 모자라면 보유(gold)에서 뺀다. flag off(prod)면 보유만 사용 →
//   현행과 바이트 동일(은행 불변). 충분치 않으면 ok:false (호출부가 insufficient_gold 반환).
// 사용처: 상점/치료/강화/제작/이동/창단/점령/계파변경/거래소/비밀상점 등 모든 골드 sink.
//
// 순수 코어(bankFirst 명시) + flag 래퍼 분리 — 코어는 mocking 없이 양쪽 분기 테스트 가능.
export function spendGoldWith(
  gold: number,
  bankedGold: number,
  cost: number,
  bankFirst: boolean,
): { ok: boolean; gold: number; bankedGold: number } {
  const g = Math.max(0, Math.floor(Number(gold) || 0));
  const b = Math.max(0, Math.floor(Number(bankedGold) || 0));
  const c = Math.max(0, Math.floor(Number(cost) || 0));
  if (!bankFirst) {
    // 현행(prod) — 보유 골드만. 은행 불변.
    if (g < c) return { ok: false, gold: g, bankedGold: b };
    return { ok: true, gold: g - c, bankedGold: b };
  }
  // 코어루프 — 은행 우선 차감.
  if (g + b < c) return { ok: false, gold: g, bankedGold: b };
  const fromBank = Math.min(b, c);
  return { ok: true, gold: g - (c - fromBank), bankedGold: b - fromBank };
}

// flag 래퍼 — 서버 호출부 편의(V2_CORE_LOOP_V2 자동 적용).
export function spendGold(
  gold: number,
  bankedGold: number,
  cost: number,
): { ok: boolean; gold: number; bankedGold: number } {
  return spendGoldWith(gold, bankedGold, cost, V2_CORE_LOOP_V2);
}

// "지불 가능한 총 골드" — 클라 affordability 게이트용. bankFirst 면 보유+은행, 아니면 보유만.
export function spendableGoldWith(
  gold: number,
  bankedGold: number,
  bankFirst: boolean,
): number {
  const g = Math.max(0, Math.floor(Number(gold) || 0));
  const b = Math.max(0, Math.floor(Number(bankedGold) || 0));
  return bankFirst ? g + b : g;
}

export function spendableGold(gold: number, bankedGold: number): number {
  return spendableGoldWith(gold, bankedGold, V2_CORE_LOOP_V2);
}

// === 패배 세금 (무리한 사냥 페널티 + 거점 세수) ==============================
// 사냥 패배 시 "마지막 패배 이후 번 골드(atRiskGold)"의 일부를 그 땅 세금으로 압류한다.
// 원금(이전 stash)이 아니라 최근 승리분만 대상이라 기하급수 전멸이 없다. 은행 입금분은 면제.
export const LOSS_TAX_RATE = 0.5; // 패배 시 atRiskGold 의 절반.

// 패배 세금 계산 (순수). atRiskGold 의 rate 만큼을 세금으로 — 단 보유 골드(heldGold) 한도로
// 클램프한다(승리 후 소비/토벌 압류로 보유 < atRiskGold 면 보유까지만 → 마이너스 골드 방지).
// 이 클램프 하나가 은행·eject·모든 골드 sink 를 자동으로 안전하게 만든다(별도 배선 불요).
export function lossTaxOf(
  atRiskGold: number,
  heldGold: number,
  rate: number = LOSS_TAX_RATE,
): { tax: number; nextHeld: number } {
  // NaN/비유한 입력(손상 세이브) 방어 → 0.
  const a = Number.isFinite(atRiskGold) ? Math.max(0, atRiskGold) : 0;
  const h = Number.isFinite(heldGold) ? Math.max(0, heldGold) : 0;
  const tax = Math.floor(Math.min(a, h) * rate);
  return { tax, nextHeld: Math.max(0, h - tax) };
}

// === 진행 (차수 폐지·단일 레벨캡·재전직 루프) ===============================
export const V2_LEVEL_CAP = 50; // 옛 차수별 50/65/80/100 → 단일 50. 루프 Lv1→50→재전직→Lv1.
export const LOOP_BATTLES_TARGET = 1200; // Lv1→50 목표 판수(5s×1200 ≈ 100분 루프)

// === statFloor 재조정 (tierMult 폐지·cumLevel 자연 해금 곡선) =================
export const STAT_FLOOR_GLOBAL_PER_CUMLEVEL = 0.012;
export const STAT_FLOOR_PROFILE_PER_CUMLEVEL = 0.045;
export const STAT_FLOOR_DECAY_BAND = 2500;
export const STAT_FLOOR_DECAY_PER_BAND = 0.1;
export const STAT_FLOOR_DECAY_MIN = 0.45;

// === 스킬포인트(SP) 로드아웃 예산 (직업군 마일스톤 파생) =======================
// 레벨 슬롯(스킬 1개씩) 폐지 → "배운 스킬 중 합(spCost) ≤ SP예산"으로 자유 장착. SP 는
// 직업군별 누적레벨 마일스톤 보상으로 쌓인다(성장 체감 — "스킬포인트 획득!"). 베테랑일수록
// 큰 로드아웃. 여러 직업군 환생 누적 = 더 큰 예산. (전 V2_CORE_LOOP_V2 뒤·미배선이면 inert.)
//
// 🔑 마일스톤 간격은 cumLevel 이 깊어질수록 "넓어진다"(점감) — flat 간격은 선형 무한증가라
//    베테랑이 결국 전 카탈로그 장착 가능(제약 붕괴). 운영 실측(prod RDS 10인): 1환생 ≈ 291
//    cumLevel, top 베테랑 1062. flat 45 면 top 43 SP(≈12스킬), 점감(a45 d25)이면 top ~32(≈9스킬)
//    로 천장이 굳어 "전부 장착"이 영영 안 됨. n번째 SP 의 간격 = BASE + (n-1)*WIDEN 으로 벌어짐.
//    (n번째 SP 누적 임계 cumLevel: SP1@45 2@115 3@210 4@330 5@475 6@645 7@840 8@1060.)
export const SP_BASE = 12; // 시작 SP.
export const SP_MILESTONE_BASE = 45; // 첫 SP 까지 cumLevel(≈ 새 시스템 한 루프 Lv1→50).
export const SP_MILESTONE_WIDEN = 25; // 다음 SP 마다 간격이 이만큼씩 더 벌어진다(점감 강도).
export const SP_MASTERED_JOB_BONUS = 3; // 직업군 정점(최고 차수) 도달당 +SP.
export const SP_MASTERED_TIER = 4; // "정복" 기준 = 그 직업군 최고 차수(4차) 도달.
export const SP_MAX_SOFT_CAP = 40; // 절대 천장(점감 곡선상 단일직 ~7·broad 베테랑 ~32, 캡은 안전망).

// 한 직업군 cumLevel → 마일스톤 SP 개수(점감). 간격이 SP 마다 +WIDEN 벌어지는 등차 임계의 역.
//   임계 T(n) = BASE·n + WIDEN·n(n-1)/2 ≤ cum 인 최대 n. 근의공식 닫힌형(루프 불필요).
//   cum ≤ 0 → 0. (역수식 floor 경계 부동소수 안정용 +1e-9.)
export function spMilestonesForCumLevel(cumLevel: number): number {
  const raw = Number(cumLevel);
  const cum = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
  if (cum < SP_MILESTONE_BASE) return 0;
  const a = SP_MILESTONE_BASE;
  const d = SP_MILESTONE_WIDEN;
  const n =
    (d / 2 - a + Math.sqrt((a - d / 2) ** 2 + 2 * d * cum)) / d + 1e-9;
  return Math.max(0, Math.floor(n));
}

// SP 예산 계산 — 각 직업군 cumLevel 점감 마일스톤 합 + 정복 직업군 보너스 + 기본. 소프트캡.
//   groups = proficiency.groups (직업군별 { cumLevel, tier }). 구조적 인자(순환 import 회피).
//   직업군은 확장형 — 4개 하드코딩 아님, groups 를 순회(새 직업군 추가 시 자동 반영).
export function calcSpBudget(
  groups: Record<string, { cumLevel?: number; tier?: number }> | null | undefined,
): number {
  let milestoneSp = 0;
  let masteredBonus = 0;
  for (const g of Object.values(groups ?? {})) {
    milestoneSp += spMilestonesForCumLevel(Number(g?.cumLevel) || 0);
    if ((Number(g?.tier) || 0) >= SP_MASTERED_TIER) masteredBonus += SP_MASTERED_JOB_BONUS;
  }
  return Math.min(SP_MAX_SOFT_CAP, SP_BASE + milestoneSp + masteredBonus);
}

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

// 모험가 — 간단 base. HP 증가 패시브 + SP 0 기본공격(별도 데이터). 파생 직업(방랑자·상급
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
