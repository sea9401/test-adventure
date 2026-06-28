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

// ATB 전투에서 플레이어 v2 액티브 스킬 시전 활성화 — ATB 재설계가 advanceTurn 을 phase helper 로
//   쪼개면서 cast 블록(applyPlayerV2SkillCast)을 legacy 루프에만 남겨, 라이브 ATB(PvE·PvP)에서
//   직업 액티브 스킬이 아예 발동하지 않던 문제(docs/v2-atb-skill-cast-plan.md)의 게이트.
//   기본(미설정)=false → 라이브 byte-identical(스킬 미발동·현행 유지). 스테이징서 env 로 켜
//   골든/밸런스 검증 후 flip. 검증 끝나면 무조건화로 플래그 제거(PR-6식).
export const V2_ATB_SKILLS = process.env.NEXT_PUBLIC_V2_ATB_SKILLS === "true";

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

// === 스킬포인트(SP) 로드아웃 예산 (직업군 마일스톤 파생) =======================
// 레벨 슬롯(스킬 1개씩) 폐지 → "배운 스킬 중 합(spCost) ≤ SP예산"으로 자유 장착. SP 는
// 직업군별 숙련도 마일스톤 보상으로 쌓인다(성장 체감 — "스킬포인트 획득!"). 베테랑일수록
// 큰 로드아웃. 여러 직업군 환생 누적 = 더 큰 예산. (전 V2_CORE_LOOP_V2 뒤·미배선이면 inert.)
//
// 🔑 마일스톤 간격은 cumLevel 이 깊어질수록 "넓어진다"(점감) — flat 간격은 선형 무한증가라
//    베테랑이 결국 전 카탈로그 장착 가능(제약 붕괴). SP 계산은 해금용 숙련도를 1/9 정규화한
//    밸런스 입력을 쓴다. 운영 실측(prod RDS 10인)의 예전 1환생≈291 은 마이그 후 2619지만
//    밸런스 입력은 그대로 291 이라 예산 충격이 없다. n번째 SP 간격 = BASE + (n-1)*WIDEN.
//    (밸런스 입력 임계: SP1@45 2@115 3@210 4@330 5@475 6@645 7@840 8@1060.)
export const SP_BASE = 12; // 시작 SP.
export const SP_MILESTONE_BASE = 45; // 첫 SP 까지 밸런스 숙련도(저장 숙련도 405).
export const SP_MILESTONE_WIDEN = 25; // 다음 SP 마다 간격이 이만큼씩 더 벌어진다(점감 강도).
export const SP_MASTERED_JOB_BONUS = 3; // 직업군 "정복" 1회당 +SP.
// "정복" 기준 = 밸런스 숙련도 임계(차수 기반 아님). 🔑 코어루프 환생은 flattenGroupTiers 로 tier→1
//   리셋이라 tier≥4 기준은 거의 휴면(현 직업군이 4차 도달~환생 전에만 +3). cumLevel 은 환생에도
//   보존 → "여러 직업 정복 누적"이 실제로 쌓인다(오픈믹스 수집 보상). 임계 250 은 운영 RDS 검증:
//   10인 전원에서 tier≥4 정복 수를 그대로 재현(flip 시 예산 충격 0) + 이후 영속. (튜닝 다이얼.)
export const SP_MASTERED_CUMLEVEL = 250;
export const SP_MAX_SOFT_CAP = 40; // 절대 천장(점감 곡선상 단일직 ~7·broad 베테랑 ~32, 캡은 안전망).
const SP_MASTERY_BALANCE_SCALE = 9;
function spBalanceCumLevel(cumLevel: number): number {
  if (!Number.isFinite(cumLevel) || cumLevel <= 0) return 0;
  return Math.floor(cumLevel / SP_MASTERY_BALANCE_SCALE);
}

export const SP_MASTERED_REQUIRED_CUMLEVEL =
  SP_MASTERED_CUMLEVEL * SP_MASTERY_BALANCE_SCALE;

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
  const mastered = spBalanceCumLevel(current) >= SP_MASTERED_CUMLEVEL;
  return {
    cumLevel: current,
    requiredCumLevel: SP_MASTERED_REQUIRED_CUMLEVEL,
    mastered,
    remainingCumLevel: mastered
      ? 0
      : Math.max(0, SP_MASTERED_REQUIRED_CUMLEVEL - current),
    milestoneSp: spMilestonesForCumLevel(current),
    masteryBonusSp: mastered ? SP_MASTERED_JOB_BONUS : 0,
  };
}

// 한 직업군 cumLevel → 마일스톤 SP 개수(점감). 간격이 SP 마다 +WIDEN 벌어지는 등차 임계의 역.
//   임계 T(n) = BASE·n + WIDEN·n(n-1)/2 ≤ cum 인 최대 n. 근의공식 닫힌형(루프 불필요).
//   cum ≤ 0 → 0. (역수식 floor 경계 부동소수 안정용 +1e-9.)
export function spMilestonesForCumLevel(cumLevel: number): number {
  const raw = spBalanceCumLevel(Number(cumLevel));
  const cum = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
  if (cum < SP_MILESTONE_BASE) return 0;
  const a = SP_MILESTONE_BASE;
  const d = SP_MILESTONE_WIDEN;
  const n =
    (d / 2 - a + Math.sqrt((a - d / 2) ** 2 + 2 * d * cum)) / d + 1e-9;
  return Math.max(0, Math.floor(n));
}

// SP 예산 계산 — 각 직업군 밸런스 숙련도 점감 마일스톤 합 + 정복 보너스 + 기본. 소프트캡.
//   groups = proficiency.groups (직업군별 { cumLevel }). 구조적 인자(순환 import 회피).
//   직업군은 확장형 — 4개 하드코딩 아님, groups 를 순회(새 직업군 추가 시 자동 반영).
//   정복 = balance(cumLevel)≥SP_MASTERED_CUMLEVEL(환생 보존 → 여러 직업 정복 누적, tier 기반 아님).
//   spCapBonus — SP 열매(협동 보스 보상) 사용분. 소프트캡(40) 위에 더해 천장을 올린다(영구
//   빌드폭). 🔑 기본 0 → 기존 모든 콜러/플레이어 예산 byte-identical(SP 열매 미사용 시 무변).
export function calcSpBudget(
  groups: Record<string, { cumLevel?: number; tier?: number }> | null | undefined,
  spCapBonus = 0,
): number {
  let milestoneSp = 0;
  let masteredBonus = 0;
  for (const g of Object.values(groups ?? {})) {
    const cum = Number(g?.cumLevel) || 0;
    milestoneSp += spMilestonesForCumLevel(cum);
    if (spBalanceCumLevel(cum) >= SP_MASTERED_CUMLEVEL) {
      masteredBonus += SP_MASTERED_JOB_BONUS;
    }
  }
  const bonus = Math.max(0, Math.floor(Number(spCapBonus) || 0));
  return Math.min(SP_MAX_SOFT_CAP, SP_BASE + milestoneSp + masteredBonus) + bonus;
}

// 두 cumLevel 사이에 새로 넘은 SP 마일스톤 수("스킬포인트 +N 획득!" 알림용).
//   cumLevel 은 단조 증가(addCumLevel 누적·환생도 보존)라 각 마일스톤은 평생 1회만 넘는다 →
//   레벨업 시점(old→new)에서 차분만 보면 별도 영속 카운터 없이 정확히 1회 발화. 음수 방지.
export function spMilestonesCrossed(
  oldCumLevel: number,
  newCumLevel: number,
): number {
  return Math.max(
    0,
    spMilestonesForCumLevel(newCumLevel) - spMilestonesForCumLevel(oldCumLevel),
  );
}

// === 거점 행동 비용 (스태미나 → 골드/전투 쿨다운으로 대체) ====================
export const OUTPOST_MOVE_GOLD_COST = 25; // 거점 이동 1회(자유이동·재진입 무료)
export const CLAIM_GOLD_COST_BY_TIER: Record<number, number> = {
  1: 500,
  2: 1500,
  3: 4000,
  4: 9000,
}; // 점령 골드 sink(선택 — 전투 쿨다운과 병행)

// === 모험가(무직) HP 패시브 =================================================
// 코어루프 on + 무직(=모험가)일 때만 적용(coreLoopMaxHpMult). 그 외/flag off = 1.0.
export const ADVENTURER_MAXHP_BONUS_PCT = 10;

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
