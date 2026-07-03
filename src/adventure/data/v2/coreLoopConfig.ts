// v2 코어 루프 재설계 — 다이얼/플래그/직업 해금 데이터. (docs/v2-core-loop-redesign.md PR-1)
//
// ⚠️ 이 모듈은 PR-1 단계에서 "정의만" 한다 — 런타임 로직 불변. 마스터 플래그
//    V2_CORE_LOOP_V2 가 off 인 동안 이 상수/데이터를 참조하는 코드는 없다(inert).
//    후속 PR(스태미나 폐지·직업 해금 트리·재전직·사냥 쿨다운·오프라인·ATB·SP
//    스킬 로드아웃)이 플래그 게이트 뒤에서 단계적으로 배선하고, 전 시스템 완성 후 flip 한다.
//
// 전 시스템 = V1식 한판한판 사냥(스태미나 폐지·전투당 딜레이·오프라인 자동전투) + 평탄
// 직업 트리(차수 폐지·계보 게이팅) + 재전직 루프 + ATB 전투 + SP 스킬 로드아웃.

import { MAX_FRONTIER_DEPTH } from "@/adventure/data/v2/dungeon";

// 마스터 플래그 — 전 코어 루프 재설계를 한 번에 켜고 끈다.
//   환경별 제어: 빌드 시 NEXT_PUBLIC_V2_CORE_LOOP_V2="true" 면 on, 아니면 off(기본).
//   NEXT_PUBLIC_ 이라 빌드타임에 클라/서버 번들 양쪽에 구워진다(서버 const 이자 클라 const).
//   변수 미설정 환경(프로덕션 현행)은 false → byte-identical. 스테이징(.env.production.local 에
//   변수 지정)만 on 으로 띄워 검증 → 검증 후 프로덕션 env 에 변수 추가로 flip(코드 변경 없이).
export const V2_CORE_LOOP_V2 =
  process.env.NEXT_PUBLIC_V2_CORE_LOOP_V2 === "true";

// 사냥 throttle 선택 — 코어 루프(V2_CORE_LOOP_V2)는 켜두되 사냥 페이싱만 스태미나로 되돌린다.
//   true = 사냥은 옛 스태미나 차감/재생, 전투당 쿨다운·오프라인 자동전투 폐지(직업/SP/ATB/
//   재전직/은행/골드 비용은 코어 루프 그대로 유지). 2026-06-19 사용자 결정: 오프라인 자동전투
//   체감 불만(지는 사냥터도 방치 시 보상)으로 사냥만 스태미나 복귀.
//   기본(미설정)=false → 현행 쿨다운 유지(배포 무변경·inert). 스테이징서 env 로 켜 검증 후 flip.
export const V2_HUNT_USE_STAMINA =
  process.env.NEXT_PUBLIC_V2_HUNT_USE_STAMINA === "true";

// 파생 — 사냥이 "쿨다운 모드"인가. 코어 루프 on 이고 스태미나 다이얼이 꺼졌을 때만 쿨다운/오프라인.
//   미설정(기본) = V2_CORE_LOOP_V2 와 동일(현행 byte-identical). 스태미나 켜면 false → 스태미나 경로.
export const HUNT_COOLDOWN_MODE = V2_CORE_LOOP_V2 && !V2_HUNT_USE_STAMINA;

// ATB 전투에서 플레이어 v2 액티브 스킬 시전 활성화.
// 코어루프가 켜지면 resolveBattle 이 ATB 엔진으로 들어가므로, 액티브 스킬도 같이 켜져야 한다.
// 명시적으로 되돌릴 필요가 있는 환경만 NEXT_PUBLIC_V2_ATB_SKILLS="false" 로 끈다.
export const V2_ATB_SKILLS =
  V2_CORE_LOOP_V2 && process.env.NEXT_PUBLIC_V2_ATB_SKILLS !== "false";

// 전투 패턴(갬빗) 경로에서도 스킬 발동확률(procChance) 굴림 — 갬빗 재설계가 "조건 충족 = 확정
//   발동"으로 procChance 를 은퇴시키면서, 카탈로그의 정교한 발동확률(강타 10%·방패막기 60% 등)이
//   라이브에서 죽은 데이터가 된 문제의 게이트. on 이면 패턴이 고른 스킬도 procChance 게이트를 통과해야
//   발동(확정 발동 → 확률 발동, 평타 폴백·MP/쿨다운 미소모). 옛 슬롯순서 경로는 원래부터 procChance 롤.
//   기본(미설정)=false → 패턴 경로 byte-identical(procChance 은퇴 유지). 스테이징서 env 로 켜 검증.
export const V2_SKILL_PROC_IN_PATTERN =
  process.env.NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN === "true";

// 자유 타일 지도(지도 재설계 후속) — 옛 23거점 노드 지도/그래프를 9×9 타일 보드 + 9거점으로
//   교체하고, 빈 땅 자유 이동·어디든 개척마을 정착을 여는 마스터 플래그. 단계적 도입:
//   Phase 1 = /map 에 새 보드 렌더(노드 9개·옛 데이터 재사용)뿐(이동/정착 로직 불변).
//   Phase 2+ = 타일 이동·개척마을 정착(신규 테이블). 옛 outposts.ts/outpostGraph/옛 테이블은
//   컷오버 전까지 무접촉. 기본(미설정)=false → 라이브 byte-identical(옛 ContinentMap 유지).
//   dev(개발모드)·스테이징서 env 로 켜 검증 후 단계별 flip.
export const V2_FREEFORM_TILES =
  process.env.NEXT_PUBLIC_V2_FREEFORM_TILES === "true";

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
// 사냥 쿨다운 게이트(lastBattleAt 필드). >0 이면 쿨다운 중.
// 토벌은 자기 영지 방어라 이 게이트를 쓰지 않는다.
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
//   frontier 는 MAX_FRONTIER_DEPTH 로 캡 — 레거시 >42 저장값이 frontier_end 게이트에 막혀 정산이
//   실패(오프라인 수입 손실)하는 것 방지.
export function offlineFarmDepth(
  lastHuntDepth: number | null | undefined,
  frontierDepth: number,
): number {
  const frontier = Math.min(
    MAX_FRONTIER_DEPTH,
    Math.max(2, Math.floor(Number(frontierDepth) || 2)),
  );
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

// === 패배 페널티 (무리한 사냥 페널티) =====================================
// 사냥 패배 시 "마지막 패배 이후 번 골드(atRiskGold)"의 일부가 소실된다.
// 원금(이전 stash)이 아니라 최근 승리분만 대상이라 기하급수 전멸이 없다. 은행 입금분은 면제.
export const LOSS_TAX_RATE = 0.5; // 패배 시 atRiskGold 의 절반.

// 패배 페널티 계산 (순수). atRiskGold 의 rate 만큼을 소실 — 단 보유 골드(heldGold) 한도로
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
export const V2_LEVEL_CAP = 100; // 단일 레벨캡(2026-06-20 50→100). 루프 Lv1→100→재전직→Lv1.
//   🔑 1차 가속(EARLY_LEVEL_EXP_FACTOR, leveling.ts)이 1→캡 전 구간을 할인하므로, 캡 변경 시
//   leveling.ts 의 EARLY_RAMP_START/END 도 캡에 맞춰 옮겨야 50 지점에 할인 절벽이 안 생긴다.
// 50레벨(≈한 반각)당 ≈100분(5s×1200). 전체 1→100 루프 ≈ 2배(≈2400판·재-sim 대상).
export const LOOP_BATTLES_TARGET = 1200;

// === statFloor 재조정 (tierMult 폐지·cumLevel 자연 해금 곡선) =================
export const STAT_FLOOR_GLOBAL_PER_CUMLEVEL = 0.012;
export const STAT_FLOOR_PROFILE_PER_CUMLEVEL = 0.045;
export const STAT_FLOOR_DECAY_BAND = 2500;
export const STAT_FLOOR_DECAY_PER_BAND = 0.1;
export const STAT_FLOOR_DECAY_MIN = 0.45;

// === 스킬포인트(SP) 로드아웃 예산 (직업 해금 수집 파생) ========================
// 레벨 슬롯(스킬 1개씩) 폐지 → "배운 스킬 중 합(spCost) ≤ SP예산"으로 자유 장착. SP 는
// 기본 예산 + 해금한 실제 직업 수 + 별도 수집/소모품 보너스로 쌓인다. 숙련도 자체는 더 이상
// SP 를 직접 주지 않고, 직업 해금 조건을 채우는 간접 동기로만 남긴다.
//
export const SP_BASE = 25; // 시작 SP.
export const SP_MILESTONE_BASE = 45; // deprecated: 숙련도 SP 마일스톤은 더 이상 사용하지 않는다.
export const SP_MILESTONE_WIDEN = 25; // deprecated.
export const SP_MASTERED_JOB_BONUS = 0; // deprecated: 직업군 정복 SP 보너스 제거.
export const SP_MASTERED_REQUIRED_CUMLEVEL = 10_000;
export const SP_MAX_SOFT_CAP = Number.POSITIVE_INFINITY; // deprecated: 수집형 SP 는 소프트캡 없음.

export function spMasteryProgressForCumLevel(cumLevel: number): {
  cumLevel: number;
  requiredCumLevel: number;
  mastered: boolean;
  remainingCumLevel: number;
  milestoneSp: number;
  masteryBonusSp: number;
} {
  const current = Number.isFinite(cumLevel)
    ? Math.max(0, Math.floor(cumLevel))
    : 0;
  const mastered = current >= SP_MASTERED_REQUIRED_CUMLEVEL;
  return {
    cumLevel: current,
    requiredCumLevel: SP_MASTERED_REQUIRED_CUMLEVEL,
    mastered,
    remainingCumLevel: mastered
      ? 0
      : Math.max(0, SP_MASTERED_REQUIRED_CUMLEVEL - current),
    milestoneSp: 0,
    masteryBonusSp: 0,
  };
}

// deprecated: 숙련도는 더 이상 SP 를 직접 지급하지 않는다.
export function spMilestonesForCumLevel(cumLevel: number): number {
  void cumLevel;
  return 0;
}

export function nextSpMilestoneProgressForCumLevel(cumLevel: number): {
  currentMilestoneSp: number;
  nextMilestoneSp: number;
  requiredCumLevel: number;
  remainingCumLevel: number;
} {
  void cumLevel;
  return {
    currentMilestoneSp: 0,
    nextMilestoneSp: 0,
    requiredCumLevel: 0,
    remainingCumLevel: 0,
  };
}

// SP 예산 계산 — 기본 + 해금 직업 수 + SP 열매 + 도감 보너스. 소프트캡 없음.
//   groups 인자는 옛 숙련도 기반 호출 호환용으로 남기며 계산에는 사용하지 않는다.
export function calcSpBudget(
  groups: Record<string, { cumLevel?: number; tier?: number }> | null | undefined,
  spCapBonus = 0,
  collectionBonus = 0,
  jobUnlockBonus = 0,
): number {
  return calcSpBudgetBreakdown(
    groups,
    spCapBonus,
    collectionBonus,
    jobUnlockBonus,
  ).budget;
}

export function calcSpBudgetBreakdown(
  groups: Record<string, { cumLevel?: number; tier?: number }> | null | undefined,
  spCapBonus = 0,
  collectionBonus = 0,
  jobUnlockBonus = 0,
): {
  budget: number;
  base: number;
  milestoneSp: number;
  masteryBonusSp: number;
  jobUnlockSp: number;
  rawCoreSp: number;
  cappedCoreSp: number;
  softCapReduction: number;
  spFruitBonus: number;
  collectionBonusSp: number;
} {
  void groups;
  const bonus = Math.max(0, Math.floor(Number(spCapBonus) || 0));
  const collection = Math.max(0, Math.floor(Number(collectionBonus) || 0));
  const jobUnlockSp = Math.max(0, Math.floor(Number(jobUnlockBonus) || 0));
  const rawCoreSp = SP_BASE + jobUnlockSp;
  const cappedCoreSp = rawCoreSp;
  return {
    budget: cappedCoreSp + bonus + collection,
    base: SP_BASE,
    milestoneSp: 0,
    masteryBonusSp: 0,
    jobUnlockSp,
    rawCoreSp,
    cappedCoreSp,
    softCapReduction: 0,
    spFruitBonus: bonus,
    collectionBonusSp: collection,
  };
}

// deprecated: 숙련도 마일스톤 SP 지급 제거.
export function spMilestonesCrossed(
  oldCumLevel: number,
  newCumLevel: number,
): number {
  void oldCumLevel;
  void newCumLevel;
  return 0;
}

// === 거점 행동 비용 (스태미나 → 골드/전투 쿨다운으로 대체) ====================
export const OUTPOST_MOVE_GOLD_COST = 25; // 거점 이동 1회(자유이동·재진입 무료)
export const CLAIM_GOLD_COST_BY_TIER: Record<number, number> = {
  1: 500,
  2: 1500,
  3: 4000,
  4: 9000,
}; // 점령 골드 sink(선택 — 전투 쿨다운과 병행)

// === 모험가(none) HP 패시브 =================================================
// 코어루프 on + none(=모험가)일 때만 적용(coreLoopMaxHpMult). 그 외/flag off = 1.0.
export const ADVENTURER_MAXHP_BONUS_PCT = 10;

// 모험가 maxHp 배수 (순수). 코어루프 on + none(=모험가)일 때만 HP 패시브(+ADVENTURER_MAXHP_BONUS_PCT%).
// 그 외(다른 직업·flag off)는 1.0 — flag off 면 전투/골든 byte-identical.
export function coreLoopMaxHpMult(
  playerClass: string,
  coreLoopOn: boolean,
): number {
  return coreLoopOn && playerClass === "none"
    ? 1 + ADVENTURER_MAXHP_BONUS_PCT / 100
    : 1;
}
