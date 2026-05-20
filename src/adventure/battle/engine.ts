import type { Monster } from "../data/monsters";
import { type Potion, type PotionId } from "../data/potions";
import { potionHealAmount, rollAttackCount } from "./combatShared";
import { EVASION_PCT_CAP } from "../data/stats";
import {
  CRIT_MULT_BASE,
  ETERNAL_GALE_ABSOLUTE_CAP,
  GALE_CHAIN_MAX_PER_TURN,
  HEAVEN_DECREE_HP_PCT,
  IMPACT_WAVE_INTERVAL,
  LUCKY_STAR_DAMAGE_MULT,
  POWER_ATTACK_TURN_INTERVAL,
  RAMPAGE_START_TURN,
} from "../character/skills";
import {
  AP_BATTLE_START,
  AP_CAP,
  DEFAULT_AP_SKILL_CONDITION,
  type APSkill,
  type APSkillCondition,
  type APSkillId,
} from "../character/apSkills";

export type BattleLogEntry =
  | {
      kind: "player_attack" | "enemy_attack" | "info" | "phase_trigger" | "turn_marker";
      text: string;
      /**
       * 이 entry 가 발생한 페이즈. UI 가 좌/우 레인 분할에 사용 — info entry 의 사이드를
       * 결정. attack kind 는 그대로 좌(player)/우(enemy) 라 turn 보조 없이도 동작.
       * resolveBattle 이 advanceTurn 전후의 phase 차이를 보고 사후 태깅한다 (engine
       * 호출부 변경 최소화). 옛 로그 (서버 캐시 / DB) 는 미동봉 — 클라 폴백.
       */
      turn?: "player" | "enemy";
      /**
       * PvP 전용 — 이 entry 를 발생시킨 액터 사이드 (p1/p2). engine-pvp 의 resolveBattlePvP
       * 가 advanceTurnPvP 전후의 log 차분을 보고 태깅한다. API 가 "me=p1" 관점으로
       * `turn` / `kind` 를 재매핑할 때 사용. PvE 에는 미사용.
       */
      side?: "p1" | "p2";
    }
  | {
      // 매 턴 종료 시점 (그리고 전투 종료 시) 양쪽 HP 스냅샷. UI 가 텍스트형 막대로 렌더.
      // text 는 미사용이지만 옛 코드가 e.text 를 참조할 때 깨지지 않게 빈 문자열로 둔다.
      kind: "hp_bar";
      text: string;
      turn?: "player" | "enemy";
      side?: "p1" | "p2";
      playerHp: number;
      playerMaxHp: number;
      enemyHp: number;
      enemyMaxHp: number;
      /** 그 시점의 AP. apMax=0 이면 AP 스킬 미장착 — UI 는 핍 안 그림. */
      ap: number;
      apMax: number;
    };

export type BattleOutcome = "win" | "lose";

export type BattlePhase = "player" | "enemy" | "ended";

// 진행 카운터 + 턴마다 리셋되는 1회용 게이트들.
export type BattleTurnState = {
  // 완료된 플레이어 턴 수 — 강공격(N턴마다 발동) 트리거에 사용. 진행 중인 턴은 미포함.
  completedPlayerTurns: number;
  // 종료된 적 페이즈 수 — 가드("첫 N턴" 의미) 가 선공자에 무관하게 N번 발동하도록
  // 적 페이즈 시작 직전에 비교하고 페이즈 종료 시 +1.
  enemyPhasesCompleted: number;
  // 그 턴의 첫 공격이 아직 안 나갔는지 — 강공격(첫 공격에만 보너스) 트리거에 사용.
  // 새 턴 시작 시 true, 첫 공격 후 false. 연타(같은 턴 연장)에는 영향 없음.
  firstAttackPending: boolean;
  // 연타가 한 턴에 한 번만 발동하도록 막는 게이트 — 새 턴 시작 시 false 로 리셋.
  doubleStrikeUsedThisTurn: boolean;
  // 광속이 한 턴에 한 번만 발동하도록 막는 게이트 — 새 턴 시작 시 false 로 리셋. 연타와 별개.
  lightspeedUsedThisTurn: boolean;
  // 풍사슬 (5티어) — 이번 턴 풍사슬 체인 발동 횟수. 턴 종료 시 0 으로 리셋. 캡 GALE_CHAIN_MAX_PER_TURN.
  galeChainsThisTurn: number;
  // 연참 (특기) — 이번 턴에 크리티컬이 한 번이라도 났는지. 턴 종료 시 false 로 리셋.
  critThisTurn: boolean;
  // 연참 (특기) — 이번 턴에 연참 추가타가 이미 발동했는지 (턴당 1회). 턴 종료 시 false 로 리셋.
  riposteUsedThisTurn: boolean;
  // 약점 적중 (2티어 특기) — 이번 턴에 약점 적중 추가타가 이미 발동했는지. 턴 종료 시 리셋. 턴당 1회.
  weakpointUsedThisTurn: boolean;
  // 연쇄 운명 (2티어 특기) — 이번 턴에 연쇄 운명 트리거가 이미 발동했는지. 턴 종료 시 리셋. 턴당 1회.
  fatedChainTriggeredThisTurn: boolean;
  // 이번 턴에 발동한 AP 스킬 id — null = 미발동. 턴 종료 시 null 로 리셋. 한 턴 최대 1개 정책.
  apSkillFiredThisTurn: APSkillId | null;
  // 집중의 호흡 (AP) — 큐된 크리뎀 +pct%. 다음 평타 1번에 critRoll 강제 + 크리뎀 멀티 보너스.
  // 0 = 미큐. 발동 즉시 비활성 (1발 소비). 턴 종료에는 리셋 안 됨 — 턴 가로질러 유지.
  focusedBreathCritDmgBonusPct: number;
  // 빛의 활공 (AP) — 다음 플레이어 턴 시작 시 attackCount 에 가산할 큐된 추가 공격.
  // 0 = 미큐. 다음 턴 시작에 소비.
  queuedExtraAttacks: number;
  // 몬스터 다대시 — 이번 enemy phase 에서 남은 공격 횟수 (현재 처리 중인 공격 포함).
  // advanceTurn 시작에서 phase==="enemy" 이고 0 이면 rollEnemyAttackCount 로 초기화.
  // 각 enemy 공격 종료 시 -1, 0 보다 크면 phase 가 "enemy" 로 유지되어 호출자가 같은 phase 를 다시 굴린다.
  // 그림자 보법(전체 무효)은 0 으로 강제. 보스 bonusAttackChancePct 기반.
  enemyAttacksLeft: number;
};

// 전투당 1회성 토글 — 한 번 켜지면 그 전투 동안 유지.
export type BattleFlags = {
  // 페이즈 트리거 1회성 가드. 트리거 발동 후 true 로 전환되어 같은 전투에서 중복 발동 방지.
  phaseTriggered: boolean;
  // "격노" 1회성 가드 — 발동 후 true 로 전환되어 같은 전투에서 중복 발동 방지.
  enrageTriggered: boolean;
  // 불굴 1회성 가드. 발동 후 true — 같은 전투에서 두 번째 치명 피해에는 정상 사망.
  enduranceTriggered: boolean;
  // 암살 (특기) — 전투 첫 공격에 1회 발동 후 true. 같은 전투에서 재발동 안 함.
  assassinateUsed: boolean;
  // 이중 행운 — 첫 크리티컬 발동 시 true 로 전환, 전투 종료까지 유지. 회피/크리티컬 보너스 적용 게이트.
  luckyBuffActive: boolean;
  // 연쇄 운명 — 다음 공격 1회 크리 100% 보장 큐. 트리거 발동 후 true, 다음 공격에서 소비되며 false.
  fatedChainCritPending: boolean;
};

// 누적 +/- 보너스/페널티 (수치, 0 기준으로 더해짐).
export type BattleBuffs = {
  // 적 페이즈 트리거로 누적된 DEF 보너스. 기본 0, 트리거 발동 시 enemy.phaseTrigger.defBonus 만큼 증가.
  enemyDefBonus: number;
  // 잡몹 스킬 "격노"로 누적된 적 ATK 보너스. 기본 0, 발동 시 enemy.skill.atkBonus 만큼 증가.
  enemyAtkBonus: number;
  // 막다른 격노 (5티어) — 그 전투 동안 누적된 ATK 보너스. 매 플레이어 턴 종료 시(RAMPAGE_START_TURN 후) +rampagePerTurn.
  rampageAtkBonus: number;
  // 약점 분석 (5티어) — 매 플레이어 턴 종료 시 누적된 적 ATK·DEF 페널티 (각각 clamp to 0).
  enemyAtkPenalty: number;
  enemyDefPenalty: number;
  // 회전 운기 (2티어 특기) — 그 전투 누적 회피/크리 보너스(%). 매 플레이어 턴 시작 시 +cyclingChiPerTurn.
  cyclingChiBonus: number;
  // 연단의 룬 합산 — 포션 회복량 +% (initialBattleState 에서 player.potionHealPct 로 시드).
  potionHealPct: number;
  // ── 지속 시간 효과 (AP 스킬 PR-2) ──
  // 받는 피해 -pct% (결의). turnsLeft 0 이면 비활성.
  playerDmgReductionPct: number;
  playerDmgReductionTurnsLeft: number;
  // 자신 ATK +pct% (광기). turnsLeft 0 이면 비활성. atkPct 0 도 비활성.
  playerAtkBuffPct: number;
  playerAtkBuffTurnsLeft: number;
  // 자신 DEF -pct% (광기). turnsLeft 0 이면 비활성. 본인 받는 피해 계산 시 적용.
  playerDefDebuffPct: number;
  playerDefDebuffTurnsLeft: number;
  // 자신 SPD ×mult (폭주). turnsLeft 0 이면 비활성 (mult=1 로 취급).
  playerSpdMult: number;
  playerSpdTurnsLeft: number;
  // 적 DEF -pct% (약점 노출). 곱연산으로 enemy.def 에 적용.
  enemyDefDebuffPct: number;
  enemyDefDebuffTurnsLeft: number;
  // 적 SPD ×mult (둔화). 천칭 크리 계산에 영향.
  enemySpdMult: number;
  enemySpdTurnsLeft: number;
  // 천뢰 일격 (AP) — 적 스킬 봉인 잔여 라운드. > 0 이면 enemy.skill 효과 비활성.
  enemySilenceTurnsLeft: number;
  // 잔상 (AP) — 적 공격 무효 잔량. > 0 이면 적 페이즈에서 데미지 적용 직전 1회 소비.
  enemyAttackBlockedCount: number;
  // 흡령 (AP) — 가한 데미지의 pct% 만큼 자가 회복. turnsLeft 0 이면 비활성.
  // 룬 lifesteal/특기 흡혈과 별개 가산. 라벨은 "흡령" 으로 구분.
  playerLifestealPct: number;
  playerLifestealTurnsLeft: number;
};

// 가변 자원 스택 / 잔량 카운트.
export type BattleStacks = {
  // 출혈 (4티어) — 누적 스택. 매 적 턴 시작 시 스택당 bleedDmgPerStack 만큼 적 HP 감소 (DEF 무시).
  bleedStacks: number;
  // 한기 (chill 스킬) — 플레이어에 누적되는 추위 스택. 적 chill 공격이 적중할 때마다 +perHit.
  // 적 페이즈 시작 시 threshold 이상이면 스택당 dmgPerStack 만큼 플레이어 HP 감소 (DEF·보호막 무시).
  // 출혈의 미러(적→플레이어). 무한 탱킹 차단용 시간압.
  chillStacks: number;
  // 철벽 (4티어) — 남은 보호막. 받는 피해를 먼저 흡수. 회복 안 됨.
  playerShield: number;
  // 회피 강화로 적립된 보장 회피 잔량 — enemy phase 에서 % 회피 판정 전에 우선 소모.
  evadesRemaining: number;
  // 무피해 난무 (4티어) — 이 전투에서 플레이어가 실제로 받은 누적 HP 피해 (보호막 흡수분 제외). 0 = 무피해.
  damageTakenThisCombat: number;
  // 약점 적중 — DEF 무시 큐 남은 카운트. 트리거 시 weakpointExtraAttacks 만큼 누적, 공격당 1 감산.
  weakpointDefIgnoreLeft: number;
};

export type BattleState = {
  enemy: Monster;
  enemyHp: number;
  playerHp: number;
  playerMaxHp: number;
  log: BattleLogEntry[];
  phase: BattlePhase;
  outcome: BattleOutcome | null;
  playerAttacksLeft: number;
  turn: BattleTurnState;
  flags: BattleFlags;
  buffs: BattleBuffs;
  stacks: BattleStacks;
  // AP 스킬 자원 — 매 플레이어 행동 +1, cap=AP_CAP, 전투 시작 시 AP_BATTLE_START.
  // 스킬 발동 시 cost 만큼 차감. equippedAPSkills 미장착이면 0 으로 두고 무시.
  ap: number;
  /** 보스 전투 여부 — 충돌파/천명 같은 %HP 효과가 BOSS_PCT_HP_DAMAGE_MULT 로 감산. */
  isBoss?: boolean;
};

/** 보스에 대한 %HP 비례 추가 데미지(충돌파/천명) 감산 계수. 1.0 = 그대로, 0.1 = 1/10. */
export const BOSS_PCT_HP_DAMAGE_MULT = 0.1;

export type PlayerCombat = {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number; // 선공 판정에 사용
  evasionPct: number; // 0~100, 적 공격 회피 확률
  attackCount: number; // 한 턴에 가하는 공격 횟수 (>=1)
  // 매 턴 시작 시 이 확률(0~100)로 추가 공격 1회. SPD 의 기본 환산.
  extraAttackChancePct?: number;
  // 강공격 보너스 — POWER_ATTACK_TURN_INTERVAL 턴마다 첫 공격에 추가 피해. 0/undefined = 스킬 미보유.
  powerAttackBonus?: number;
  // 분쇄 — 강공격 발동 턴, 그 공격에 한해 적 DEF 감산. 0/undefined = 스킬 미보유.
  crushDefReduction?: number;
  // 정확 — 플레이어의 모든 공격이 적 DEF 의 이 비율(0~1)을 무시. 0/undefined = 스킬 미보유.
  armorPierceFraction?: number;
  // 회피 강화 — 전투 시작 시 적립할 보장 회피 횟수. 0/undefined = 스킬 미보유.
  guaranteedEvades?: number;
  // 반격 — 회피 성공 시 즉시 카운터 1회, ATK + bonus 데미지. 0/undefined = 스킬 미보유.
  counterAtkBonus?: number;
  // 연타 — N턴마다 그 턴 마지막 공격 후 추가 1회 공격. undefined = 스킬 미보유.
  extraAttackEveryNTurns?: number;
  // 기습 — 전투 첫 플레이어 턴 추가 공격. 0/undefined = 스킬 미보유.
  vanguardFirstTurnBonus?: number;
  // 크리티컬 — 매 공격마다 발동 확률(0~100). 0/undefined = 스킬 미보유.
  critChancePct?: number;
  // 크리티컬 데미지 배수. undefined = CRIT_MULT_BASE 사용. luk 비례로 호출 측이 계산.
  critMult?: number;
  // 이중 행운 — 첫 크리티컬 발동 시 회피/크리티컬 +bonus% 발동, 전투 종료까지 유지. 0 이면 미보유.
  doubleLuck?: { evade: number; crit: number };
  // 가드 — 첫 N턴 동안 받는 피해 -reduction. 둘 다 0 이면 스킬 미보유.
  guard?: { turns: number; reduction: number };
  // 재생 — interval 턴마다 HP +amount. 둘 다 0 이면 스킬 미보유.
  regen?: { interval: number; amount: number };
  // 자연회복 — 모든 빌드 공통 상시 baseline. interval 턴마다 HP +amount.
  baselineRegen?: { interval: number; amount: number };
  // 처형 — 적 HP 비율이 hpFraction 미만일 때 데미지 ×mult. mult <= 1 또는 hpFraction <= 0 = 미보유.
  executionDamageMult?: number;
  executionHpFraction?: number;
  // 정확 — 적 evasionPct 에 곱할 배수 (0~1). undefined/1 = 미보유 (정상 회피).
  precisionEvasionMult?: number;
  // 불굴 — true 면 전투당 1회 HP 0 데미지를 HP 1 로 막아준다.
  enduranceActive?: boolean;
  // 광속 — 매 턴 마지막 공격 후 추가 1회 공격 확률(%). 0/undefined = 미보유.
  lightspeedExtraAttackPct?: number;
  // ── 특기 (특기 전용 슬롯, 1개만) ──────────────────────────────────────
  // 흡혈 — 크리티컬로 준 피해의 N% 만큼 HP 회복. 0/undefined = 미장착.
  lifestealCritHealPct?: number;
  // 곡예 — 회피(보장/%/행운의 방패) 성공 시 HP +amount. 0/undefined = 미장착.
  evadeHealAmount?: number;
  // 천칭 — (내SPD − 적SPD) 1당 추가 크리티컬 확률(%). 0/undefined = 미장착.
  balanceCritPctPerSpdDiff?: number;
  // 행운의 방패 — 피격을 무효화할 확률(%). 0/undefined = 미장착.
  luckyShieldBlockPct?: number;
  // ── 4티어 ──────────────────────────────────────────────────────────────
  // 출혈 — 적중 시 출혈 1스택, 매 적 턴마다 스택당 이만큼 고정 피해(DEF 무시). 0/undefined = 미보유.
  bleedDmgPerStack?: number;
  // 그림자 분신 — 매 플레이어 턴 종료 시 분신이 ATK 의 N% 로 추가 공격 1회. 0/undefined = 미보유.
  shadowCloneAtkPct?: number;
  // 철벽 — 전투 시작 시 받는 보호막. 0/undefined = 미보유.
  bulwarkShield?: number;
  // 무피해 난무 — 무피해 턴 종료 시 추가 공격 횟수. 0/undefined = 미보유.
  flurryAttacks?: number;
  // 천명 — 매 공격마다 적 현재 HP 의 HEAVEN_DECREE_HP_PCT% 를 추가 고정 피해로 줄 확률(%). 0/undefined = 미보유.
  heavenDecreeChancePct?: number;
  // ── 특기 (Phase 3) ─────────────────────────────────────────────────────
  // 광전사 — 잃은 HP 1%당 ATK +N%. 0/undefined = 미장착.
  berserkAtkPctPerLostHpPct?: number;
  // 암살 — 전투 첫 공격의 데미지 배수 (DEF 무시 동반). >1 일 때만 발동. 0/undefined = 미장착.
  assassinateDmgMult?: number;
  // 질풍검 — 턴 첫 공격에 (공격 횟수 × N) ATK 보너스. 0/undefined = 미장착.
  gustAtkPerAttack?: number;
  // 연참 — 그 턴 크리 발동 시 추가 공격 N회 (턴당 1회). 0/undefined = 미장착.
  riposteExtra?: number;
  // 유격 — 회피 성공 시 다음 플레이어 턴 공격 횟수 +N. 0/undefined = 미장착.
  skirmishNextTurnBonus?: number;
  // 반사 갑주 — 피격 시 받은 HP 피해의 N% 를 적에게 반사. 0/undefined = 미장착.
  thornsPct?: number;
  // ── 2티어 특기 (각 스탯 50 도달) ────────────────────────────────────────
  // 불굴의 일격 — 매 턴 본타에 (전투 누적 피해 × N) 추가. 0/undefined = 미장착.
  enduringStrikeMult?: number;
  // 약점 적중 — 크리티컬 발동 시 즉시 DEF 무시 추가 공격 N회 (턴당 1회). 0/undefined = 미장착.
  weakpointExtraAttacks?: number;
  // 광속 격투 — 매 턴 기본 공격 횟수 +N. derive 단계에서 attackCount 에 합산되므로 엔진은 직접 안 씀
  // (정보 보존용으로만 보관).
  lightHandExtraAttack?: number;
  // 연쇄 운명 — 크리 발동 시 다음 공격 1회 크리 100% 보장 (턴당 1회 트리거). 0/undefined = 미장착.
  fatedChainActive?: boolean;
  // 반사 회피 — 회피 성공 시 받았을 피해의 N 비율을 적에게 반사. 0/undefined = 미장착.
  reflexEvadeMult?: number;
  // 그림자 보법 — 매 적 턴 시작 시 N% 확률로 그 턴 모든 적 공격 무효. 0/undefined = 미장착.
  shadowStepPct?: number;
  // 행운의 흡혈 — 모든 공격 피해의 N% HP 회복 (크리 외도 포함). 0/undefined = 미장착.
  luckyLifestealPct?: number;
  // 무한 가시 — 매 적 공격에 적 ATK 의 N% 반사 (회피/피격 무관). 0/undefined = 미장착.
  infiniteThornsAtkPct?: number;
  // 굳건한 의지 — 받은 피해 평탄 -(N) 감소 (받는 피해 > 0 일 때, 최소 1로 클램프). 0/undefined = 미장착.
  steadfastWillFlat?: number;
  // 회전 운기 — 매 플레이어 턴 시작 시 회피/크리 +N% 누적 (전투 종료까지). 0/undefined = 미장착.
  cyclingChiPerTurn?: number;
  // 연단의 룬 합산 — 포션 회복량 +%. 0/undefined = 미장착.
  potionHealPct?: number;
  // 반격의 룬 합산 — 피격 시 ATK 데미지로 반격 발동 확률 %. 0/undefined = 미장착.
  runeCounterChancePct?: number;
  // 흡혈의 룬 합산 — 명중 시 가한 피해의 % 만큼 HP 회복. 0/undefined = 미장착.
  runeLifestealPct?: number;
  // ── 5티어 (각 스탯 65 도달) — 만렙 확장 패키지 ────────────────────────
  // 막다른 격노 — 전투 RAMPAGE_START_TURN 턴 경과 후, 매 플레이어 턴 종료 시 ATK 영구 +N 누적. 0/undefined = 미보유.
  rampagePerTurn?: number;
  // 약점 분석 — 매 플레이어 턴 종료 시 적 ATK·DEF 각각 -N 누적 (clamp to 0). 0/undefined = 미보유.
  analysisPerTurn?: number;
  // 가시 갑옷 — 피격 시 받은 HP 피해의 N% 를 적에게 반사 (반사 갑주와 별도 누적). 0/undefined = 미보유.
  bramblePct?: number;
  // 풍사슬 — 추가 공격(연타·광속·이전 풍사슬) 발동 후 N% 확률로 1회 더 (한 턴 최대 GALE_CHAIN_MAX_PER_TURN 회). 0/undefined = 미보유.
  galeChainChancePct?: number;
  // 행운의 별 — 모든 공격이 N% 확률로 데미지 ×LUCKY_STAR_DAMAGE_MULT (크리티컬과 별개·중첩). 0/undefined = 미보유.
  luckyStarChancePct?: number;
  // ── 6티어 (각 스탯 85 도달) — 만렙 확장 패키지 ────────────────────────
  // 충돌파 — 매 IMPACT_WAVE_INTERVAL 턴마다 본타가 적 현재 HP 의 N% 추가 고정 피해 (DEF 무시). 0/undefined = 미보유.
  impactWaveHpPct?: number;
  // 그림자 군단 — 매 플레이어 턴 종료 시 분신 추가 횟수 (기존 분신과 누적). 0/undefined = 미보유.
  shadowLegionExtraClones?: number;
  // 흡혈 갑옷 — 피격 시 받은 HP 피해의 N% HP 회복. 0/undefined = 미보유.
  bloodfeastPct?: number;
  // 무한 풍사슬 — 풍사슬 확률에 더할 보너스(%). 5티어 풍사슬 슬롯 같이 장착해야 의미.
  eternalGaleBonusPct?: number;
  // 무한 풍사슬 — true 면 풍사슬 한 턴 캡 해제. 5티어와 동반 장착 시.
  eternalGaleNoCap?: boolean;
  // 만물 행운 — 회피·크리·추가타 모든 확률에 더할 보너스(%). 0/undefined = 미보유.
  universalLuckBonusPct?: number;
  // ── 별빛 마법부여 — 발동형 affix (정적 might/swift/insight 는 EquippedItem.bonus 에 합쳐짐) ──
  // 가드(가드) — 피격 시 % 확률로 피해 완전 무효. 룬/회피 굴림 전에 1회 굴림. 0/undefined = 미보유.
  enchantGuardBlockPct?: number;
  // 인내(endure) — 받는 피해 -%. 가드/철벽 전에 곱연산 (결의 AP 와 비슷한 위치). 0/undefined = 미보유.
  enchantEndurePct?: number;
  // 반사(reflect) — 받은 HP 피해의 %를 적에게 반사. thorns/bramble 과 합산되는 별개 라벨. 0/undefined = 미보유.
  enchantReflectPct?: number;
  // 재생(regen) — 매 플레이어 턴 시작 시 maxHp의 %만큼 회복. baselineRegen 과 별개. 0/undefined = 미보유.
  enchantRegenPctPerTurn?: number;
  // 보호막(barrier) — 전투 시작 시 maxHp의 % 를 playerShield 로 추가. bulwarkShield 와 별개 누적. 0/undefined = 미보유.
  enchantBarrierPctMaxHp?: number;
  // 각성(awaken) — 매 플레이어 턴 시작 시 % 확률로 AP +1. AP_CAP 클램프. 0/undefined = 미보유.
  enchantAwakenApChancePct?: number;
  // 관통(pierce) — flat. 플레이어가 굴리는 모든 공격에서 적 facing DEF 에서 직접 차감. 0/undefined = 미보유.
  enchantPierceFlat?: number;
  // 폭주(berserk) — 자신 HP 30% 이하일 때 ATK 곱연산 +%. atk 최종값에 멀티 적용. 0/undefined = 미보유.
  enchantBerserkBonusPct?: number;
  // 파괴(breaker) — 보스 적에게 가하는 모든 피해에 곱연산 +%. isBoss 일 때만. 0/undefined = 미보유.
  enchantBreakerBossBonusPct?: number;
  // 흡혈(lifesteal) — 가한 피해의 % 만큼 HP 회복. runeLifestealPct 와 합산되는 별개 라벨. 0/undefined = 미보유.
  enchantLifestealPct?: number;
  // 독공(venom) — 본타 공격 시 % 확률로 적에게 출혈 스택 1 부여 (bleed). 발동 확률 별개. 0/undefined = 미보유.
  enchantVenomChancePct?: number;
  // 독공 dot 누적 — 출혈 스택당 추가되는 고정 피해(DEF 무시). 기존 bleedDmgPerStack 와 합산. 0/undefined = 미보유.
  enchantVenomDmgPerStack?: number;
  // 처형(execute) — 적 HP 25% 이하일 때 추가 피해(%). executionDamageMult 가 0 이면 25%/1+pct 로 자동 시드,
  // 기존 처형 스킬과 같이 보유 시 곱연산으로 더해진다. 0/undefined = 미보유.
  enchantExecuteBonusPct?: number;
  // AP 스킬 — 학습 + 슬롯 장착 된 것만. 슬롯 순서 보존. 빈 배열/undefined = 미장착.
  // 매 플레이어 턴 첫 공격 시 슬롯 순서로 condition 만족 + cost<=AP 인 첫 1개 발동.
  // 한 턴 최대 1개. condition 미지정 슬롯은 always 로 해석.
  equippedAPSkills?: ReadonlyArray<EquippedAPSkill>;
};

// 장착된 AP 스킬 + 사용자가 슬롯에 건 발동 조건.
export type EquippedAPSkill = {
  skill: APSkill;
  condition: APSkillCondition;
};

// 슬롯 발동 조건 평가 — state 가 현재 시점에 조건을 만족하면 true.
// AP affordable 체크와는 별개; 호출자가 둘 다 확인 후 발동.
// no_self_effect_active 평가 시 slot 의 skill effect 가 필요하므로 skill 도 받는다.
export function evaluateAPSkillCondition(
  condition: APSkillCondition,
  state: BattleState,
  skill: APSkill,
): boolean {
  switch (condition.kind) {
    case "always":
      return true;
    case "ap_at_least":
      return state.ap >= condition.value;
    case "ap_at_most":
      return state.ap <= condition.value;
    case "hp_below_pct":
      return state.playerMaxHp > 0
        ? (state.playerHp / state.playerMaxHp) * 100 < condition.value
        : false;
    case "hp_above_pct":
      return state.playerMaxHp > 0
        ? (state.playerHp / state.playerMaxHp) * 100 >= condition.value
        : false;
    case "enemy_hp_below_pct":
      return state.enemy.hp > 0
        ? (state.enemyHp / state.enemy.hp) * 100 < condition.value
        : false;
    case "enemy_hp_above_pct":
      return state.enemy.hp > 0
        ? (state.enemyHp / state.enemy.hp) * 100 >= condition.value
        : false;
    case "every_n_turns": {
      // turn 1 (completedPlayerTurns = 0) 부터 시작해 X 의 배수마다. value < 1 이면 매 턴.
      const n = Math.max(1, Math.floor(condition.value));
      return state.turn.completedPlayerTurns % n === 0;
    }
    case "enemy_max_hp_at_least":
      return state.enemy.hp >= condition.value;
    case "no_self_effect_active":
      return !isAPSkillEffectActive(skill.effect, state);
  }
}

// 스킬 효과가 현재 활성 상태인지 — no_self_effect_active 조건이 사용.
// 단발 효과 (atk_multiplier·heal_pct·cleanse_debuffs 등) 는 lingering 이 없으므로 항상 false.
// 지속/스택 효과는 해당 state 필드 > 0 여부.
function isAPSkillEffectActive(
  effect: APSkill["effect"],
  state: BattleState,
): boolean {
  switch (effect.kind) {
    // 단발 — 즉시 적용 후 흔적 없음.
    case "atk_multiplier":
    case "heal_pct":
    case "atk_multiplier_with_silence":
    case "multi_hit_self_damage":
    case "atk_plus_spd_pct_bonus":
    case "cleanse_debuffs":
    case "crit_buff_next_attack":
    case "extra_attack_this_turn":
      return false;
    // 적에게 출혈 스택 부여 — 누적 스택이 1 이상이면 활성. (재시전은 보통 무의미.)
    case "apply_bleed":
      return state.stacks.bleedStacks > 0;
    // 보장 회피 잔량 부여 — 잔량 > 0 이면 활성.
    case "add_guaranteed_evades":
      return state.stacks.evadesRemaining > 0;
    // 결의 — 받는 피해 감소 지속.
    case "player_dmg_reduction_turns":
      return state.buffs.playerDmgReductionTurnsLeft > 0;
    // 약점 노출 — 적 DEF 디버프 지속.
    case "enemy_def_debuff_pct_turns":
      return state.buffs.enemyDefDebuffTurnsLeft > 0;
    // 광기 — 자신 ATK+ / DEF- 지속.
    case "player_atk_buff_def_debuff_pct_turns":
      return (
        state.buffs.playerAtkBuffTurnsLeft > 0 ||
        state.buffs.playerDefDebuffTurnsLeft > 0
      );
    // 둔화 — 적 SPD 감속 지속.
    case "enemy_spd_mult_turns":
      return state.buffs.enemySpdTurnsLeft > 0;
    // 폭주 — 자신 SPD 가속 지속.
    case "player_spd_mult_turns":
      return state.buffs.playerSpdTurnsLeft > 0;
    // 빛의 활공 — 다음 턴 추가 공격 큐잉. playerAttacksLeft 큐가 1 보다 큰 동안 활성으로 본다.
    case "queued_extra_attacks_next_turn":
      return state.playerAttacksLeft > 1;
    // 잔상 — 적 공격 블록 잔량.
    case "block_next_enemy_attack":
      return state.buffs.enemyAttackBlockedCount > 0;
    // 흡령 — 시한부 흡혈 지속.
    case "lifesteal_dmg_pct_turns":
      return state.buffs.playerLifestealTurnsLeft > 0;
  }
}

export type PlayerAction =
  | { kind: "attack" }
  | { kind: "use_potion"; potionId: PotionId; potion: Potion };

// 로그는 전체 보관 — 종료 후 알림에 첨부되는 battleLog 도 같은 배열을 사용한다.
// BattleScene 은 스크롤 컨테이너라 길이가 늘어도 UX 영향 없음.
export function appendLog(
  log: BattleLogEntry[],
  entry: BattleLogEntry,
): BattleLogEntry[] {
  return [...log, entry];
}

// 데미지 최소 비율 — 순수 감산(atk-def)이 0 이하가 되는 "방어력 임계 초과 = 1딜 고정" 절벽을 완화.
// 공격력의 이 비율(올림)만큼은 항상 들어간다. 정상 장비 구간에선 atk-def 가 항상 더 커서 무의미하고,
// def 가 atk 의 ~0.85 배를 넘는 (= 한참 저장비/저레벨) 구간에서만 체감된다.
// 플레이어↔적 양쪽 공격에 모두 적용 — 방어력을 무한 적층해 무피격이 되는 것도 같이 막힌다.
export const DAMAGE_FLOOR_FRACTION = 0.15;

export function damageBetween(atk: number, def: number): number {
  const minByAtk = Math.ceil(Math.max(0, atk) * DAMAGE_FLOOR_FRACTION);
  return Math.max(1, minByAtk, atk - def);
}

// 플레이어 공격이 마주하는 적 DEF — 누적 페이즈 보너스 포함, 보스 취약(armorVulnerable)·
// 정확 스킬(armorPierceFraction) 비례 관통을 차례로 적용. 본타는 여기에 분쇄(고정 감산)/
// 암살(DEF 0)을 추가로 얹으므로 호출 측에서 따로 처리하고, 단순 추가타(분신/난무/반격)는 이 값 그대로.
function playerFacingEnemyDef(
  state: BattleState,
  player: PlayerCombat,
  // 발동턴 AP 시한부 버프(약점 노출 등) 적용을 위해 buffs 를 별도 인자로 받을 수 있음.
  // 기본은 state.buffs — 그 외 호출 측에서 applyTimedBuffFromApSkill 결과를 전달.
  buffs: BattleBuffs = state.buffs,
): number {
  // 약점 분석(5티어)의 누적 페널티는 raw def 에 직접 적용 → 음수 클램프.
  const raw = Math.max(
    0,
    state.enemy.def + buffs.enemyDefBonus - buffs.enemyDefPenalty,
  );
  const afterVuln = Math.round(raw * (1 - (state.enemy.armorVulnerable ?? 0)));
  const frac = player.armorPierceFraction ?? 0;
  const afterPierce =
    frac > 0 ? Math.round(afterVuln * (1 - frac)) : afterVuln;
  // 별빛 관통(enchant pierce) — flat. 약점 노출 곱연산 직전에 직접 차감. 0 클램프.
  const enchantPierce = player.enchantPierceFlat ?? 0;
  const afterEnchantPierce =
    enchantPierce > 0 ? Math.max(0, afterPierce - enchantPierce) : afterPierce;
  // 약점 노출 (AP) — 적 DEF -pct%. 곱연산으로 마지막에 반영.
  if (buffs.enemyDefDebuffTurnsLeft > 0 && buffs.enemyDefDebuffPct > 0) {
    return Math.round(afterEnchantPierce * (1 - buffs.enemyDefDebuffPct / 100));
  }
  return afterEnchantPierce;
}

// 다음 플레이어 턴의 공격 횟수. 로직(100% 초과 = 정수부 확정 추가타 + 나머지 확률)은
// combatShared.rollAttackCount 로 단일화 — PvP 엔진과 공유해 한쪽만 바뀌는 divergence 방지.
function rollPlayerAttackCount(player: PlayerCombat): number {
  return rollAttackCount(player);
}

// 한 번의 enemy phase 진입 시 결정되는 총 공격 횟수 — base 1 + bonusAttackChancePct 기반.
// rollPlayerAttackCount 와 같은 100%↑ 정수확정 규칙. 0/undefined = 1대.
function rollEnemyAttackCount(enemy: Monster): number {
  const chance = enemy.bonusAttackChancePct ?? 0;
  if (chance <= 0) return 1;
  const guaranteed = Math.floor(chance / 100);
  const remainder = chance - guaranteed * 100;
  return 1 + guaranteed + (Math.random() * 100 < remainder ? 1 : 0);
}

// enemy 공격 1회 종료 시 호출 — 남은 공격이 있으면 phase="enemy" 유지, 0 이면 "player".
// 그림자 보법처럼 모든 공격 무효인 경우 호출자가 enemyAttacksLeft 를 0 으로 강제하고 phase: "player" 직접 set.
function finishEnemyAttack(state: BattleState): BattleState {
  const remaining = Math.max(0, state.turn.enemyAttacksLeft - 1);
  return {
    ...state,
    turn: { ...state.turn, enemyAttacksLeft: remaining },
    phase: remaining > 0 ? "enemy" : "player",
  };
}

// 페이즈 트리거 — 적 HP 가 phaseTrigger.hpFraction 미만으로 떨어진 순간 1회 발동.
// enemyDefBonus 누적 + 알림 로그. 이미 죽었거나 발동했으면 무시. 호출 측은 enemyHp 가
// 갱신된 state 를 넘겨야 한다.
function applyPhaseTriggerIfAny(state: BattleState): BattleState {
  const trigger = state.enemy.phaseTrigger;
  if (!trigger || state.flags.phaseTriggered) return state;
  if (state.enemyHp <= 0) return state;
  const threshold = state.enemy.hp * trigger.hpFraction;
  if (state.enemyHp >= threshold) return state;
  return {
    ...state,
    flags: { ...state.flags, phaseTriggered: true },
    buffs: {
      ...state.buffs,
      enemyDefBonus: state.buffs.enemyDefBonus + trigger.defBonus,
    },
    log: appendLog(state.log, { kind: "phase_trigger", text: trigger.message }),
  };
}

// 반격 — 회피 직후 카운터 1회. 적이 죽으면 ended 로 종료.
// 크리티컬 / 강공격 등은 적용하지 않음 — 별도 단순 데미지.
function applyCounterIfAny(
  state: BattleState,
  player: PlayerCombat,
): { state: BattleState; ended: boolean } {
  const bonus = player.counterAtkBonus ?? 0;
  if (bonus <= 0) return { state, ended: false };
  const dmg = damageBetween(
    player.atk + bonus,
    playerFacingEnemyDef(state, player),
  );
  const enemyHp = Math.max(0, state.enemyHp - dmg);
  let next: BattleState = {
    ...state,
    enemyHp,
    log: appendLog(state.log, {
      kind: "player_attack",
      text: `[반격] ${state.enemy.name}에게 ${dmg} 피해를 입혔다.`,
    }),
  };
  next = applyPhaseTriggerIfAny(next);
  if (enemyHp <= 0) {
    return {
      state: {
        ...next,
        log: appendLog(next.log, {
          kind: "info",
          text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
        }),
        phase: "ended",
        outcome: "win",
      },
      ended: true,
    };
  }
  return { state: next, ended: false };
}

// 재생 — 플레이어 턴 종료 후 (completedPlayerTurns 증가 후) 호출.
// completedPlayerTurns 가 interval 의 배수일 때 HP +amount.
function applyRegenIfAny(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  const regen = player.regen;
  if (!regen || regen.interval <= 0 || regen.amount <= 0) return state;
  if (state.turn.completedPlayerTurns === 0) return state;
  if (state.turn.completedPlayerTurns % regen.interval !== 0) return state;
  if (state.playerHp >= state.playerMaxHp) return state;
  const newHp = Math.min(state.playerMaxHp, state.playerHp + regen.amount);
  const actual = newHp - state.playerHp;
  return {
    ...state,
    playerHp: newHp,
    log: appendLog(state.log, {
      kind: "info",
      text: `[재생] ${playerName}의 HP +${actual}`,
    }),
  };
}

// 자연회복 — 모든 빌드 공통. applyRegenIfAny 와 같은 로직, 다른 interval/amount.
function applyBaselineRegenIfAny(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  const r = player.baselineRegen;
  if (!r || r.interval <= 0 || r.amount <= 0) return state;
  if (state.turn.completedPlayerTurns === 0) return state;
  if (state.turn.completedPlayerTurns % r.interval !== 0) return state;
  if (state.playerHp >= state.playerMaxHp) return state;
  const newHp = Math.min(state.playerMaxHp, state.playerHp + r.amount);
  const actual = newHp - state.playerHp;
  return {
    ...state,
    playerHp: newHp,
    log: appendLog(state.log, {
      kind: "info",
      text: `[자연회복] ${playerName}의 HP +${actual}`,
    }),
  };
}

// 별빛 재생(regen) — 매 플레이어 턴 종료 시 maxHp 의 %만큼 회복.
// interval 없이 매 턴 발동. 이미 풀 HP 면 노옵. 회복량은 정수 floor.
function applyEnchantRegenIfAny(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  const pct = player.enchantRegenPctPerTurn ?? 0;
  if (pct <= 0) return state;
  if (state.turn.completedPlayerTurns === 0) return state;
  if (state.playerHp >= state.playerMaxHp) return state;
  const heal = Math.floor((state.playerMaxHp * pct) / 100);
  if (heal <= 0) return state;
  const newHp = Math.min(state.playerMaxHp, state.playerHp + heal);
  const actual = newHp - state.playerHp;
  return {
    ...state,
    playerHp: newHp,
    log: appendLog(state.log, {
      kind: "info",
      text: `[재생] ${playerName}의 HP +${actual}`,
    }),
  };
}

// 별빛 각성(awaken) — 매 플레이어 턴 종료 시 % 확률로 AP +1. AP_CAP 클램프.
// equippedAPSkills 미장착이면 AP 시스템 자체가 비활성이라 발동 무의미.
function applyEnchantAwakenIfAny(
  state: BattleState,
  player: PlayerCombat,
): BattleState {
  const pct = player.enchantAwakenApChancePct ?? 0;
  if (pct <= 0) return state;
  if (state.turn.completedPlayerTurns === 0) return state;
  if ((player.equippedAPSkills?.length ?? 0) === 0) return state;
  if (state.ap >= AP_CAP) return state;
  if (Math.random() * 100 >= pct) return state;
  return {
    ...state,
    ap: Math.min(AP_CAP, state.ap + 1),
    log: appendLog(state.log, {
      kind: "info",
      text: `[각성] AP +1 (현 ${Math.min(AP_CAP, state.ap + 1)})`,
    }),
  };
}

// 부가 공격(분신/난무 등) 1회 — 본인 빌드로 발동시킨 추가타라 "**모든 공격**" / "**매 공격마다**"
// 로 설명된 효과는 함께 적용한다:
//   - 출혈 +1 스택 (bleedDmgPerStack 보유 시)
//   - 행운의 별 (5티어) — 확률 × 데미지 배수
//   - 천명 (4티어) — 확률 × 적 현재 HP %
//   - 흡혈류 (행운의 흡혈 / 흡혈의 룬 / 흡령) — 비크리 기반만 적용 (extras 는 크리 안 굴림)
// 미적용: 본타 정체성에 묶인 것들 — 크리/강공격/충돌파/약점적중/연참/연쇄운명/암살/AP 스킬 발동,
//   AP +1 (행동 자원이라 분신 회복원 되면 AP 스킬 페이싱 망가짐).
// 자동 반사(반격/가시/반사 회피) 는 별도 경로 — 여기 안 옴.
function dealExtraEnemyDamage(
  state: BattleState,
  baseDmg: number,
  label: string,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  // 행운의 별 — 모든 공격 ×배수.
  const luckyStarPct = player.luckyStarChancePct ?? 0;
  const luckyStarFires =
    luckyStarPct > 0 && Math.random() * 100 < luckyStarPct;
  const dmgAfterLuckyStar = luckyStarFires
    ? Math.floor(baseDmg * LUCKY_STAR_DAMAGE_MULT)
    : baseDmg;
  // 천명 — 적 현재 HP % (보스에는 BOSS_PCT_HP_DAMAGE_MULT 감산).
  const decreeFires =
    (player.heavenDecreeChancePct ?? 0) > 0 &&
    Math.random() * 100 < player.heavenDecreeChancePct!;
  const decreeBaseDmg = decreeFires
    ? Math.floor((state.enemyHp * HEAVEN_DECREE_HP_PCT) / 100)
    : 0;
  const decreeDmg = state.isBoss
    ? Math.floor(decreeBaseDmg * BOSS_PCT_HP_DAMAGE_MULT)
    : decreeBaseDmg;
  const totalDmg = dmgAfterLuckyStar + decreeDmg;
  const enemyHp = Math.max(0, state.enemyHp - totalDmg);
  // 흡혈류 — 크리 흡혈(lifestealCritHealPct) 은 extras 가 크리 안 굴리므로 제외. 그 외 셋만.
  const luckyLifestealHeal =
    (player.luckyLifestealPct ?? 0) > 0
      ? Math.floor((totalDmg * player.luckyLifestealPct!) / 100)
      : 0;
  const runeLifestealHeal =
    (player.runeLifestealPct ?? 0) > 0
      ? Math.floor((totalDmg * player.runeLifestealPct!) / 100)
      : 0;
  const apLifestealHeal =
    state.buffs.playerLifestealTurnsLeft > 0 && state.buffs.playerLifestealPct > 0
      ? Math.floor((totalDmg * state.buffs.playerLifestealPct) / 100)
      : 0;
  const totalHeal = luckyLifestealHeal + runeLifestealHeal + apLifestealHeal;
  const newPlayerHp =
    totalHeal > 0
      ? Math.min(state.playerMaxHp, state.playerHp + totalHeal)
      : state.playerHp;
  const actualHeal = newPlayerHp - state.playerHp;
  // 출혈 +1 — 적중 시 매번. (본타와 같은 룰.)
  const bleedStacks =
    (player.bleedDmgPerStack ?? 0) > 0
      ? state.stacks.bleedStacks + 1
      : state.stacks.bleedStacks;

  // 메인 데미지 라인 — 라벨에 행운의 별/천명 합쳐 박는다.
  const dmgLabels: string[] = [label];
  if (luckyStarFires) dmgLabels.push("행운의 별");
  if (decreeFires) dmgLabels.push("천명");
  let log = appendLog(state.log, {
    kind: "player_attack",
    text: `[${dmgLabels.join(" + ")}] ${state.enemy.name}에게 ${totalDmg} 피해를 입혔다.`,
  });
  if (actualHeal > 0) {
    const healLabels: string[] = [];
    if (luckyLifestealHeal > 0) healLabels.push("행운의 흡혈");
    if (runeLifestealHeal > 0) healLabels.push("흡혈의 룬");
    if (apLifestealHeal > 0) healLabels.push("흡령");
    log = appendLog(log, {
      kind: "info",
      text: `[${healLabels.join(" + ")}] ${playerName}의 HP +${actualHeal}`,
    });
  }

  let next = applyPhaseTriggerIfAny({
    ...state,
    enemyHp,
    playerHp: newPlayerHp,
    stacks: { ...state.stacks, bleedStacks },
    log,
  });
  if (enemyHp <= 0) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
      }),
      phase: "ended",
      outcome: "win",
    };
  }
  return next;
}

// 플레이어 턴 종료 후 처리 — 그림자 분신 추가타 → 무피해 난무 추가타들 → 재생.
// 추가타로 적이 죽으면 즉시 종료(이후 단계 건너뜀). 종전 applyRegenIfAny 호출을 이 함수로 대체.
function finishPlayerTurn(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  let st = state;
  // 분신/난무 추가타 ATK — 메인 공격이 적용한 AP 시한부 ATK 버프(광기 등) 를 동일하게 반영.
  // state.buffs 는 이 시점에 이번 턴의 timed buff 가 박힌 상태.
  const buffedAtkPct =
    st.buffs.playerAtkBuffTurnsLeft > 0 ? st.buffs.playerAtkBuffPct : 0;
  const buffedAtk =
    buffedAtkPct > 0
      ? player.atk + Math.floor((player.atk * buffedAtkPct) / 100)
      : player.atk;
  // 그림자 분신 — ATK 의 N% 로 1회. 6티어 그림자 군단 보유 시 추가 횟수만큼 더 발동.
  const clonePct = player.shadowCloneAtkPct ?? 0;
  const cloneExtra = player.shadowLegionExtraClones ?? 0;
  const cloneCount = clonePct > 0 ? 1 + cloneExtra : 0;
  if (st.phase !== "ended" && cloneCount > 0) {
    for (let i = 0; i < cloneCount; i += 1) {
      if (st.phase === "ended") break;
      const cloneDmg = damageBetween(
        Math.floor((buffedAtk * clonePct) / 100),
        playerFacingEnemyDef(st, player),
      );
      st = dealExtraEnemyDamage(
        st,
        cloneDmg,
        cloneExtra > 0 ? "그림자 군단" : "그림자 분신",
        player,
        playerName,
      );
    }
  }
  // 무피해 난무 — 이 전투에서 받은 피해가 0이면 추가 공격 N회.
  const flurry = player.flurryAttacks ?? 0;
  if (st.phase !== "ended" && flurry > 0 && st.stacks.damageTakenThisCombat === 0) {
    for (let i = 0; i < flurry; i += 1) {
      if (st.phase === "ended") break;
      const fd = damageBetween(buffedAtk, playerFacingEnemyDef(st, player));
      st = dealExtraEnemyDamage(st, fd, "무피해 난무", player, playerName);
    }
  }
  if (st.phase === "ended") return st;
  // 막다른 격노 (5티어) — RAMPAGE_START_TURN 턴 후부터 매 플레이어 턴 종료 시 ATK 영구 누적.
  // completedPlayerTurns 는 이 시점에 막 +1 된 상태 (ended state 진입 후) — 1턴 종료 시 1.
  const rampage = player.rampagePerTurn ?? 0;
  if (rampage > 0 && st.turn.completedPlayerTurns >= RAMPAGE_START_TURN) {
    const nextBonus = st.buffs.rampageAtkBonus + rampage;
    st = {
      ...st,
      buffs: { ...st.buffs, rampageAtkBonus: nextBonus },
      log: appendLog(st.log, {
        kind: "info",
        text: `[막다른 격노] ATK +${rampage} (누적 +${nextBonus})`,
      }),
    };
  }
  // 약점 분석 (5티어) — 매 플레이어 턴 종료 시 적 ATK·DEF 누적 페널티 +N.
  const analysis = player.analysisPerTurn ?? 0;
  if (analysis > 0) {
    const nextAtkPen = st.buffs.enemyAtkPenalty + analysis;
    const nextDefPen = st.buffs.enemyDefPenalty + analysis;
    st = {
      ...st,
      buffs: {
        ...st.buffs,
        enemyAtkPenalty: nextAtkPen,
        enemyDefPenalty: nextDefPen,
      },
      log: appendLog(st.log, {
        kind: "info",
        text: `[약점 분석] ${st.enemy.name} ATK·DEF -${analysis} (누적 -${nextAtkPen}/-${nextDefPen})`,
      }),
    };
  }
  st = applyBaselineRegenIfAny(st, player, playerName);
  st = applyRegenIfAny(st, player, playerName);
  st = applyEnchantRegenIfAny(st, player, playerName);
  return applyEnchantAwakenIfAny(st, player);
}

// 선공 — SPD가 높은 쪽이 먼저 공격. 동점이면 플레이어 우선.
export function initialBattleState(
  player: PlayerCombat,
  enemy: Monster,
  playerName: string,
): BattleState {
  const playerFirst = player.spd >= enemy.spd;
  const initiator = playerFirst ? playerName : enemy.name;
  const vanguardBonus = player.vanguardFirstTurnBonus ?? 0;
  const log: BattleLogEntry[] = [
    {
      kind: "info",
      text: `${enemy.name}이(가) 나타났다!`,
    },
    {
      kind: "info",
      text: `${initiator}의 선공.`,
    },
  ];
  if (vanguardBonus > 0) {
    log.push({
      kind: "info",
      text: `[기습] 첫 턴 추가 공격 ${vanguardBonus}회!`,
    });
  }
  if (enemy.skill) {
    log.push({
      kind: "info",
      text: `${enemy.name} — 능력 [${enemy.skill.name}]`,
    });
  }
  const bulwarkStart = player.bulwarkShield ?? 0;
  // 별빛 보호막(barrier) — maxHp 의 %. 정수 floor. 철벽과 별개 라벨로 보여주되 같은 스택에 누적.
  const barrierPct = player.enchantBarrierPctMaxHp ?? 0;
  const barrierStart =
    barrierPct > 0 ? Math.floor((player.maxHp * barrierPct) / 100) : 0;
  const startShield = bulwarkStart + barrierStart;
  if (bulwarkStart > 0) {
    log.push({ kind: "info", text: `[철벽] 보호막 ${bulwarkStart} 전개` });
  }
  if (barrierStart > 0) {
    log.push({ kind: "info", text: `[보호막] 별빛이 ${barrierStart} 둘렀다` });
  }
  return {
    enemy,
    enemyHp: enemy.hp,
    playerHp: player.hp,
    playerMaxHp: player.maxHp,
    log,
    phase: playerFirst ? "player" : "enemy",
    outcome: null,
    playerAttacksLeft: rollPlayerAttackCount(player) + vanguardBonus,
    turn: {
      completedPlayerTurns: 0,
      enemyPhasesCompleted: 0,
      firstAttackPending: true,
      doubleStrikeUsedThisTurn: false,
      lightspeedUsedThisTurn: false,
      galeChainsThisTurn: 0,
      critThisTurn: false,
      riposteUsedThisTurn: false,
      weakpointUsedThisTurn: false,
      fatedChainTriggeredThisTurn: false,
      apSkillFiredThisTurn: null,
      focusedBreathCritDmgBonusPct: 0,
      queuedExtraAttacks: 0,
      enemyAttacksLeft: 0,
    },
    flags: {
      phaseTriggered: false,
      enrageTriggered: false,
      enduranceTriggered: false,
      assassinateUsed: false,
      luckyBuffActive: false,
      fatedChainCritPending: false,
    },
    buffs: {
      enemyDefBonus: 0,
      enemyAtkBonus: 0,
      rampageAtkBonus: 0,
      enemyAtkPenalty: 0,
      enemyDefPenalty: 0,
      cyclingChiBonus: 0,
      potionHealPct: player.potionHealPct ?? 0,
      playerDmgReductionPct: 0,
      playerDmgReductionTurnsLeft: 0,
      playerAtkBuffPct: 0,
      playerAtkBuffTurnsLeft: 0,
      playerDefDebuffPct: 0,
      playerDefDebuffTurnsLeft: 0,
      playerSpdMult: 1,
      playerSpdTurnsLeft: 0,
      enemyDefDebuffPct: 0,
      enemyDefDebuffTurnsLeft: 0,
      enemySpdMult: 1,
      enemySpdTurnsLeft: 0,
      enemySilenceTurnsLeft: 0,
      enemyAttackBlockedCount: 0,
      playerLifestealPct: 0,
      playerLifestealTurnsLeft: 0,
    },
    stacks: {
      bleedStacks: 0,
      chillStacks: 0,
      playerShield: startShield,
      evadesRemaining: player.guaranteedEvades ?? 0,
      damageTakenThisCombat: 0,
      weakpointDefIgnoreLeft: 0,
    },
    // 장착된 AP 스킬이 있을 때만 의미. 없으면 그냥 0 으로 두고 회복/소비 노옵.
    ap: (player.equippedAPSkills?.length ?? 0) > 0 ? AP_BATTLE_START : 0,
  };
}

// AP 지속 효과 라운드 카운터 -1. 새 플레이어 턴 진입 시(직전 적 페이즈 종료 후)
// 호출되어 결의/광기/약점 노출/둔화/폭주 의 turnsLeft 를 1씩 깎고 0 으로 클램프.
// pct/mult 값은 그대로 두지만 turnsLeft 가 0 이면 적용 쪽에서 무시한다.
function decrementTimedEffects(buffs: BattleBuffs): BattleBuffs {
  return {
    ...buffs,
    playerDmgReductionTurnsLeft: Math.max(0, buffs.playerDmgReductionTurnsLeft - 1),
    playerAtkBuffTurnsLeft: Math.max(0, buffs.playerAtkBuffTurnsLeft - 1),
    playerDefDebuffTurnsLeft: Math.max(0, buffs.playerDefDebuffTurnsLeft - 1),
    playerSpdTurnsLeft: Math.max(0, buffs.playerSpdTurnsLeft - 1),
    enemyDefDebuffTurnsLeft: Math.max(0, buffs.enemyDefDebuffTurnsLeft - 1),
    enemySpdTurnsLeft: Math.max(0, buffs.enemySpdTurnsLeft - 1),
    enemySilenceTurnsLeft: Math.max(0, buffs.enemySilenceTurnsLeft - 1),
    playerLifestealTurnsLeft: Math.max(0, buffs.playerLifestealTurnsLeft - 1),
  };
}

// AP 스킬이 set 하는 시한부 효과를 buffs 에 즉시 반영 — 발동턴 damage calc 부터 효과 받도록.
// decrementTimedEffects 는 다음 플레이어 턴 진입 시점에 -1 하므로, 발동턴 + (turns-1) 후속턴 = 총 turns 턴의 실효 효과.
// 호출 측에서 evasion 통과 후에만 호출 — 적이 회피하면 AP 발동/소비 자체가 일어나지 않으므로 buffs 도 그대로.
function applyTimedBuffFromApSkill(
  buffs: BattleBuffs,
  apSkillFires: APSkill | null,
): BattleBuffs {
  if (!apSkillFires) return buffs;
  const e = apSkillFires.effect;
  switch (e.kind) {
    case "player_dmg_reduction_turns":
      return {
        ...buffs,
        playerDmgReductionPct: e.pct,
        playerDmgReductionTurnsLeft: e.turns,
      };
    case "enemy_def_debuff_pct_turns":
      return {
        ...buffs,
        enemyDefDebuffPct: e.pct,
        enemyDefDebuffTurnsLeft: e.turns,
      };
    case "player_atk_buff_def_debuff_pct_turns":
      return {
        ...buffs,
        playerAtkBuffPct: e.atkPct,
        playerAtkBuffTurnsLeft: e.turns,
        playerDefDebuffPct: e.defPct,
        playerDefDebuffTurnsLeft: e.turns,
      };
    case "enemy_spd_mult_turns":
      return {
        ...buffs,
        enemySpdMult: e.mult,
        enemySpdTurnsLeft: e.turns,
      };
    case "player_spd_mult_turns":
      return {
        ...buffs,
        playerSpdMult: e.mult,
        playerSpdTurnsLeft: e.turns,
      };
    case "atk_multiplier_with_silence":
      return {
        ...buffs,
        enemySilenceTurnsLeft: e.silenceTurns,
      };
    case "cleanse_debuffs":
      return {
        ...buffs,
        playerDefDebuffPct: 0,
        playerDefDebuffTurnsLeft: 0,
      };
    case "block_next_enemy_attack":
      return {
        ...buffs,
        enemyAttackBlockedCount: buffs.enemyAttackBlockedCount + e.count,
      };
    case "lifesteal_dmg_pct_turns":
      return {
        ...buffs,
        playerLifestealPct: e.pct,
        playerLifestealTurnsLeft: e.turns,
      };
    default:
      return buffs;
  }
}

// 한 턴 진행 — 현재 phase 측이 행동하고 결과를 다음 BattleState로 반환.
// player phase는 action(공격 또는 물약)으로 분기. attack이면 attackCount 만큼 연속 공격.
// phase === "ended" 이면 그대로 반환.
export function advanceTurn(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
  action: PlayerAction = { kind: "attack" },
): BattleState {
  if (state.phase === "ended") return state;

  // 새 enemy phase 진입 시 다대시 횟수 초기화 — 첫 공격 진입 시점에만 굴림.
  // 다대시 중간(enemyAttacksLeft>0)에는 통과. 이 한 곳에서 잡으면 player→enemy 전환 지점들에서
  // 별도 초기화 코드 안 둬도 됨.
  if (state.phase === "enemy" && state.turn.enemyAttacksLeft <= 0) {
    state = {
      ...state,
      turn: {
        ...state.turn,
        enemyAttacksLeft: rollEnemyAttackCount(state.enemy),
      },
    };
  }

  // 새 플레이어 턴 진입 시 지속 효과 turnsLeft -1 (직전 enemy 페이즈 완료 후).
  // turn 1 (completedPlayerTurns=0) 은 가드 — 발동도 안 된 상태에서 깎을 게 없음.
  // 빛의 활공 큐도 같이 소비 — queuedExtraAttacks 를 playerAttacksLeft 에 가산하고 0 으로 리셋.
  if (
    state.phase === "player" &&
    state.turn.firstAttackPending &&
    state.turn.completedPlayerTurns > 0
  ) {
    const consumeQueued = state.turn.queuedExtraAttacks;
    state = {
      ...state,
      buffs: decrementTimedEffects(state.buffs),
      playerAttacksLeft: state.playerAttacksLeft + consumeQueued,
      turn: { ...state.turn, queuedExtraAttacks: 0 },
    };
  }

  if (state.phase === "player") {
    if (action.kind === "use_potion") {
      const next = applyPotionEffect(state, action.potion, playerName);
      // 포션은 공격이 아니라 그 턴의 공격 "1회" 를 소모한다. 추가타 빌드(attackCount>1)는
      // 마신 뒤에도 남은 공격으로 계속 싸울 수 있고, 마지막 1회였다면 적 페이즈로 넘어간다.
      // (기본 1회 공격 캐릭터는 attacksLeft 가 0 이 되어 기존과 동일하게 턴이 끝난다.)
      // turn 플래그(firstAttackPending 등)는 그대로 둔다 — 포션은 공격이 아니므로 다음 실제
      // 공격이 여전히 그 턴의 첫 공격(강공격/AP 트리거)으로 취급된다.
      const attacksLeft = next.playerAttacksLeft - 1;
      if (attacksLeft > 0) {
        return { ...next, playerAttacksLeft: attacksLeft };
      }
      return {
        ...next,
        phase: "enemy",
        playerAttacksLeft: rollPlayerAttackCount(player),
        turn: { ...next.turn, firstAttackPending: true },
      };
    }

    // 강공격 발동 — POWER_ATTACK_TURN_INTERVAL 턴마다 그 턴의 첫 공격이 ATK + bonus.
    // 진행 중인 턴 번호 = completedPlayerTurns + 1. 첫 공격 여부는 firstAttackPending 으로 판단
    // (확률 기반 추가 공격 / 기습 보너스로 attackCount 비교가 신뢰할 수 없음).
    const turnNumber = state.turn.completedPlayerTurns + 1;
    const isFirstAttackOfTurn = state.turn.firstAttackPending;
    const bonus =
      isFirstAttackOfTurn &&
      turnNumber % POWER_ATTACK_TURN_INTERVAL === 0 &&
      (player.powerAttackBonus ?? 0) > 0
        ? player.powerAttackBonus!
        : 0;

    // AP 스킬 — 그 턴 첫 공격일 때만 슬롯 순서로 condition 만족 + cost<=AP 인 첫 1개 발동.
    // 한 턴 1개 정책 (apSkillFiredThisTurn null 체크). 강공격과 동시 발동 가능 (별개 트리거).
    const apSkillFires =
      isFirstAttackOfTurn &&
      state.turn.apSkillFiredThisTurn === null &&
      (player.equippedAPSkills?.length ?? 0) > 0
        ? player.equippedAPSkills!.find(
            (e) =>
              e.skill.apCost <= state.ap &&
              evaluateAPSkillCondition(e.condition, state, e.skill),
          )?.skill ?? null
        : null;
    // atk_multiplier 계열 효과 — 광살참(multi_hit_self_damage)과 천뢰 일격
    // (atk_multiplier_with_silence) 도 atkMult/ignoresDef/ignoresEvasion 을 공유.
    const apMultEffect = apSkillFires?.effect;
    const apAtkMult =
      apMultEffect?.kind === "atk_multiplier" ||
      apMultEffect?.kind === "multi_hit_self_damage" ||
      apMultEffect?.kind === "atk_multiplier_with_silence"
        ? apMultEffect.atkMult
        : 1;
    const apIgnoresDef =
      (apMultEffect?.kind === "atk_multiplier" ||
        apMultEffect?.kind === "multi_hit_self_damage" ||
        apMultEffect?.kind === "atk_multiplier_with_silence") &&
      apMultEffect.ignoresDef === true;
    // ignoresEvasion = true 면 적 회피 굴림 자체 스킵 — 천살 등이 사용.
    const apIgnoresEvasion =
      (apMultEffect?.kind === "atk_multiplier" ||
        apMultEffect?.kind === "multi_hit_self_damage" ||
        apMultEffect?.kind === "atk_multiplier_with_silence") &&
      apMultEffect.ignoresEvasion === true;
    // 광살참 hits — 같은 fire 에서 N 번 데미지 누적.
    const apHits =
      apMultEffect?.kind === "multi_hit_self_damage" ? apMultEffect.hits : 1;

    // 적 회피 — 데미지 굴리기 전에 1차 판정. 회피하면 공격 1회가 그대로 빗나간다.
    // 정확 슬롯 시 적 evasion 에 배수(<1) 가 곱해져 부분 무력화.
    // AP 스킬의 ignoresEvasion = true 면 회피 판정 자체 스킵.
    const precisionMult = player.precisionEvasionMult ?? 1;
    const enemyEvasionPct = (state.enemy.evasionPct ?? 0) * precisionMult;
    if (
      !apIgnoresEvasion &&
      enemyEvasionPct > 0 &&
      Math.random() * 100 < enemyEvasionPct
    ) {
      const log = appendLog(state.log, {
        kind: "player_attack",
        text: `${state.enemy.name}이(가) 공격을 피했다.`,
      });
      // AP 회복 — 공격 시도 자체가 행동이므로 회피되어도 +1 (cap 클램프).
      // AP 스킬은 회피 시 발동/소비 안 함 (apSkillFires 는 첫 공격 명중에만 적용).
      const nextAp = Math.min(AP_CAP, state.ap + 1);
      const attacksLeft = state.playerAttacksLeft - 1;
      if (attacksLeft > 0) {
        return {
          ...state,
          log,
          ap: nextAp,
          playerAttacksLeft: attacksLeft,
          turn: { ...state.turn, firstAttackPending: false },
        };
      }
      const ended: BattleState = {
        ...state,
        log,
        ap: nextAp,
        phase: "enemy",
        playerAttacksLeft: rollPlayerAttackCount(player),
        turn: {
          ...state.turn,
          completedPlayerTurns: state.turn.completedPlayerTurns + 1,
          doubleStrikeUsedThisTurn: false,
          lightspeedUsedThisTurn: false,
          critThisTurn: false,
          riposteUsedThisTurn: false,
          firstAttackPending: true,
          galeChainsThisTurn: 0,
          weakpointUsedThisTurn: false,
          fatedChainTriggeredThisTurn: false,
          apSkillFiredThisTurn: null,
          // fatedChainCritPending 은 "다음 공격" 까지 살아 있어야 하므로 턴 경계에서 리셋 안 함.
        },
      };
      return finishPlayerTurn(ended, player, playerName);
    }

    // AP 스킬 시한부 버프 — 발동턴 damage calc 부터 효과 받도록 buffs 를 미리 갱신.
    // decrementTimedEffects 는 다음 플레이어 턴 진입 시 -1 → 발동턴 + (turns-1) 후속턴 = 총 turns 턴.
    // evasion 직후이라 — 회피된 공격에는 AP 가 발동 안 하니 그 분기는 위에서 이미 return 된 상태.
    const nextBuffsTimed = applyTimedBuffFromApSkill(state.buffs, apSkillFires);

    // 암살 (특기) — 전투 첫 공격이면 발동: 적 DEF 무시 + 데미지 배수 (배수는 아래에서 적용).
    const assassinFires =
      (player.assassinateDmgMult ?? 0) > 1 &&
      !state.flags.assassinateUsed &&
      state.turn.completedPlayerTurns === 0 &&
      isFirstAttackOfTurn;
    // 약점 적중 (2티어 특기) — 큐가 있으면 이 공격은 DEF 무시. 트리거 자체는 아래 크리 처리 후.
    const weakpointDefIgnore = state.stacks.weakpointDefIgnoreLeft > 0;
    // 분쇄 — 강공격 발동 턴, 그 공격에 한해 적 DEF -crushDefReduction. 암살/약점 적중이면 DEF 0.
    // baseDef 는 보스 취약(armorVulnerable) + 정확(armorPierceFraction) 비례 관통이 이미 반영된 값 —
    // 분쇄는 그 위에 추가 고정 감산.
    const crushReduction = player.crushDefReduction ?? 0;
    const baseDef = playerFacingEnemyDef(state, player, nextBuffsTimed);
    const targetDef = assassinFires || weakpointDefIgnore || apIgnoresDef
      ? 0
      : bonus > 0 && crushReduction > 0
        ? Math.max(0, baseDef - crushReduction)
        : baseDef;
    // 광전사 (특기) — 잃은 HP 비율만큼 ATK 가산.
    // berserkAtkPctPerLostHpPct=0.5 → 잃은 HP 1%당 ATK +0.5% → 보너스ATK = atk × lostFraction × 0.5.
    const lostHpFraction = Math.max(0, 1 - state.playerHp / state.playerMaxHp);
    const berserkBonus =
      (player.berserkAtkPctPerLostHpPct ?? 0) > 0
        ? Math.floor(
            player.atk * lostHpFraction * player.berserkAtkPctPerLostHpPct!,
          )
        : 0;
    // 별빛 폭주(enchant berserk) — 자신 HP 30% 이하일 때 atk +pct%. 단계형 (광전사 특기와
    // 별개 누적).
    const enchantBerserkPct = player.enchantBerserkBonusPct ?? 0;
    const enchantBerserkActive =
      enchantBerserkPct > 0 && state.playerHp / state.playerMaxHp <= 0.3;
    const enchantBerserkBonus = enchantBerserkActive
      ? Math.floor((player.atk * enchantBerserkPct) / 100)
      : 0;
    // 질풍검 (특기) — 턴 첫 공격에 (그 턴 공격 횟수 × N) ATK 보너스.
    const gustBonus =
      (player.gustAtkPerAttack ?? 0) > 0 && isFirstAttackOfTurn
        ? state.playerAttacksLeft * player.gustAtkPerAttack!
        : 0;
    // 불굴의 일격 (2티어 특기) — 본타(턴 첫 공격) 에만 (이번 전투 누적 받은 피해 × N) 추가.
    const enduringStrikeBonus =
      (player.enduringStrikeMult ?? 0) > 0 && isFirstAttackOfTurn
        ? Math.floor(state.stacks.damageTakenThisCombat * player.enduringStrikeMult!)
        : 0;
    // 회전 운기 (2티어 특기) — 매 플레이어 턴 시작 시 +cyclingChiPerTurn(%) 누적. 그 턴 즉시 적용.
    const cyclingChiThisTurn =
      state.buffs.cyclingChiBonus +
      (isFirstAttackOfTurn ? player.cyclingChiPerTurn ?? 0 : 0);
    // 크리티컬 — 매 공격마다 critChancePct 확률로 발동. 이중 행운 발동 후엔 +crit 보너스.
    const baseCritPct = player.critChancePct ?? 0;
    const luckCritBonus = state.flags.luckyBuffActive
      ? player.doubleLuck?.crit ?? 0
      : 0;
    // 천칭 — 내 SPD 가 적보다 빠른 만큼 크리티컬 확률 가산.
    // SPD 버프/디버프 (폭주/둔화) 가 활성이면 곱연산으로 반영.
    const effectivePlayerSpd =
      nextBuffsTimed.playerSpdTurnsLeft > 0
        ? player.spd * nextBuffsTimed.playerSpdMult
        : player.spd;
    const effectiveEnemySpd =
      nextBuffsTimed.enemySpdTurnsLeft > 0
        ? state.enemy.spd * nextBuffsTimed.enemySpdMult
        : state.enemy.spd;
    const balanceCritBonus =
      (player.balanceCritPctPerSpdDiff ?? 0) > 0
        ? Math.floor(
            Math.max(0, effectivePlayerSpd - effectiveEnemySpd) *
              player.balanceCritPctPerSpdDiff!,
          )
        : 0;
    // 만물 행운 (6티어) — 크리티컬 확률 +N%.
    const universalLuckBonus = player.universalLuckBonusPct ?? 0;
    const effectiveCritPct =
      baseCritPct + luckCritBonus + balanceCritBonus + universalLuckBonus + cyclingChiThisTurn;
    // 연쇄 운명 (2티어 특기) — 큐가 있으면 이 공격 크리 강제. 큐는 아래에서 소비.
    const fatedChainConsumed = state.flags.fatedChainCritPending;
    // 집중의 호흡 (AP) — 큐가 있으면 이 공격 크리 강제 + 크리뎀 보너스. 1회 소비.
    // 발동 attack 자체는 fire 후에 셋팅돼서 그 다음 공격부터 적용 (자연스럽게 분리).
    const focusedBreathConsumed = state.turn.focusedBreathCritDmgBonusPct > 0;
    const focusedBreathCritDmgBonus =
      focusedBreathConsumed
        ? state.turn.focusedBreathCritDmgBonusPct / 100
        : 0;
    const critRoll =
      fatedChainConsumed || focusedBreathConsumed
        ? true
        : effectiveCritPct > 0
          ? Math.random() * 100 < effectiveCritPct
          : false;
    // AP 스킬의 atk_multiplier 는 모든 ATK 합산 후 곱 (강공격·격노·질풍 등의 보너스 포함).
    // 광기 (AP) — 자신 ATK +pct%. atk_multiplier 적용 전에 같이 합산.
    const madnessAtkBonus =
      nextBuffsTimed.playerAtkBuffTurnsLeft > 0 && nextBuffsTimed.playerAtkBuffPct > 0
        ? Math.floor((player.atk * nextBuffsTimed.playerAtkBuffPct) / 100)
        : 0;
    const atkBeforeApMult =
      player.atk +
      state.buffs.rampageAtkBonus +
      bonus +
      berserkBonus +
      enchantBerserkBonus +
      gustBonus +
      enduringStrikeBonus +
      madnessAtkBonus;
    const baseDmgSingleHit = damageBetween(
      apAtkMult !== 1 ? Math.floor(atkBeforeApMult * apAtkMult) : atkBeforeApMult,
      targetDef,
    );
    // 광살참 (AP) — 같은 fire 에서 hits 번 반복 데미지. apHits=1 이면 baseDmgSingleHit 그대로.
    const baseDmg = apHits > 1 ? baseDmgSingleHit * apHits : baseDmgSingleHit;
    // 폭풍 일격 (AP) — fire 시 (player.atk × spdPct/100) 추가 고정 데미지. targetDef 무시.
    const stormBonus =
      apMultEffect?.kind === "atk_plus_spd_pct_bonus"
        ? Math.floor((player.atk * apMultEffect.spdPct) / 100)
        : 0;
    // 처형 — 적 HP 비율 < executionHpFraction 일 때 데미지 ×executionDamageMult.
    // 강공격/분쇄 후 데미지에 곱하고, 크리티컬은 그 위에 다시 곱한다 (다단 누적).
    const exMult = player.executionDamageMult ?? 1;
    const exFraction = player.executionHpFraction ?? 0;
    const enemyMaxHp = state.enemy.hp;
    const executionActive =
      exMult > 1 && exFraction > 0 && state.enemyHp / enemyMaxHp < exFraction;
    const dmgAfterExecution = executionActive
      ? Math.max(1, Math.floor(baseDmg * exMult))
      : baseDmg;
    // 별빛 처형(enchant execute) — 적 HP 25% 이하일 때 추가 피해(%). 기존 처형 위에 곱연산.
    const enchantExePct = player.enchantExecuteBonusPct ?? 0;
    const enchantExeActive =
      enchantExePct > 0 && state.enemyHp / enemyMaxHp <= 0.25;
    const dmgAfterEnchantExe = enchantExeActive
      ? Math.max(1, Math.floor(dmgAfterExecution * (1 + enchantExePct / 100)))
      : dmgAfterExecution;
    // 집중의 호흡 (AP) — 그 1발 한정 critMult 에 +pct% 추가 (가산 후 한 번에 곱).
    const critMult =
      (player.critMult ?? CRIT_MULT_BASE) + focusedBreathCritDmgBonus;
    const dmgAfterCrit = critRoll
      ? Math.floor(dmgAfterEnchantExe * critMult)
      : dmgAfterEnchantExe;
    // 행운의 별 (5티어) — 크리티컬과 별개, 발동 시 데미지 ×LUCKY_STAR_DAMAGE_MULT.
    const luckyStarPct = player.luckyStarChancePct ?? 0;
    const luckyStarFires =
      luckyStarPct > 0 && Math.random() * 100 < luckyStarPct;
    const dmgAfterLuckyStar = luckyStarFires
      ? Math.floor(dmgAfterCrit * LUCKY_STAR_DAMAGE_MULT)
      : dmgAfterCrit;
    // 암살 (특기) — 위 모든 배수(처형/크리/행운의 별) 후에 다시 ×N.
    const dmgBeforeBrace = assassinFires
      ? Math.floor(dmgAfterLuckyStar * player.assassinateDmgMult!)
      : dmgAfterLuckyStar;
    // 잡몹 스킬 "방어 태세" — 이 적을 공격할 때 데미지 -damageReduction (최소 1로 클램프).
    // 천뢰 일격 silence 활성 시 brace 도 비활성.
    const braceReduction =
      nextBuffsTimed.enemySilenceTurnsLeft <= 0 &&
      state.enemy.skill?.kind === "brace"
        ? state.enemy.skill.damageReduction
        : 0;
    const dmgAfterBrace =
      braceReduction > 0 ? Math.max(1, dmgBeforeBrace - braceReduction) : dmgBeforeBrace;
    // 별빛 파괴(enchant breaker) — 보스 적에게 가하는 피해 +pct%. 모든 배수 끝나고 마지막 곱연산.
    const breakerPct = player.enchantBreakerBossBonusPct ?? 0;
    const breakerActive = breakerPct > 0 && state.isBoss === true;
    const dmg = breakerActive
      ? Math.max(1, Math.floor(dmgAfterBrace * (1 + breakerPct / 100)))
      : dmgAfterBrace;
    // 천명 (4티어) — 일정 확률로 적 현재 HP 의 일부를 추가 고정 피해 (이 공격의 보통 피해와 별개로 합산).
    // 보스 전투에는 BOSS_PCT_HP_DAMAGE_MULT 배 적용 (%HP 누진 폭딜 방지).
    const decreeFires =
      (player.heavenDecreeChancePct ?? 0) > 0 &&
      Math.random() * 100 < player.heavenDecreeChancePct!;
    const decreeBaseDmg = decreeFires
      ? Math.floor((state.enemyHp * HEAVEN_DECREE_HP_PCT) / 100)
      : 0;
    const decreeDmg = state.isBoss
      ? Math.floor(decreeBaseDmg * BOSS_PCT_HP_DAMAGE_MULT)
      : decreeBaseDmg;
    // 충돌파 (6티어) — 매 IMPACT_WAVE_INTERVAL 턴마다 본타 첫 공격에 적 현재 HP 의 N% 추가 고정 피해.
    const impactPct = player.impactWaveHpPct ?? 0;
    const impactFires =
      impactPct > 0 &&
      isFirstAttackOfTurn &&
      turnNumber % IMPACT_WAVE_INTERVAL === 0;
    const impactBaseDmg = impactFires
      ? Math.floor((state.enemyHp * impactPct) / 100)
      : 0;
    const impactDmg = state.isBoss
      ? Math.floor(impactBaseDmg * BOSS_PCT_HP_DAMAGE_MULT)
      : impactBaseDmg;
    const totalDmg = dmg + decreeDmg + impactDmg + stormBonus;
    const labels: string[] = [];
    if (bonus > 0) labels.push("강공격");
    if (bonus > 0 && crushReduction > 0) labels.push("분쇄");
    if (executionActive) labels.push("처형");
    if (enchantExeActive) labels.push("별빛 처형");
    if (enchantBerserkActive) labels.push("폭주");
    if (breakerActive) labels.push("파괴");
    if (critRoll) labels.push("크리티컬");
    if (luckyStarFires) labels.push("행운의 별");
    if (assassinFires) labels.push("암살");
    if (decreeFires) labels.push("천명");
    if (impactFires) labels.push("충돌파");
    if (enduringStrikeBonus > 0) labels.push("불굴의 일격");
    if (weakpointDefIgnore) labels.push("약점 적중");
    if (fatedChainConsumed) labels.push("연쇄 운명");
    if (apSkillFires) labels.push(apSkillFires.name);
    const prefix = labels.length > 0 ? `[${labels.join(" + ")}] ` : "";
    let log = appendLog(state.log, {
      kind: "player_attack",
      text: `${prefix}${state.enemy.name}에게 ${totalDmg} 피해를 입혔다.`,
    });
    // 이중 행운 — 첫 크리티컬 발동 순간 활성화, 후속 공격/회피 부터 보너스 적용.
    const shouldActivateLucky =
      critRoll &&
      !state.flags.luckyBuffActive &&
      (player.doubleLuck?.crit ?? 0) > 0;
    if (shouldActivateLucky) {
      log = appendLog(log, {
        kind: "info",
        text: `[이중 행운] 회피/크리티컬 +${player.doubleLuck!.crit}% 발동!`,
      });
    }
    const luckyBuffActive = state.flags.luckyBuffActive || shouldActivateLucky;
    // 흡혈 (특기) — 크리티컬로 준 피해의 % 만큼 HP 회복.
    const lifestealHeal =
      critRoll && (player.lifestealCritHealPct ?? 0) > 0
        ? Math.floor((dmg * player.lifestealCritHealPct!) / 100)
        : 0;
    // 행운의 흡혈 (2티어 특기) — 모든 공격 피해의 N% HP 회복 (크리 외도 포함).
    const luckyLifestealHeal =
      (player.luckyLifestealPct ?? 0) > 0
        ? Math.floor((dmg * player.luckyLifestealPct!) / 100)
        : 0;
    // 흡혈의 룬 — 명중 시 가한 피해의 N% HP 회복 (luckyLifesteal 과 같은 trigger, 별도 가산).
    const runeLifestealHeal =
      (player.runeLifestealPct ?? 0) > 0
        ? Math.floor((dmg * player.runeLifestealPct!) / 100)
        : 0;
    // 흡령 (AP 시한부) — buffs 의 turnsLeft 가 살아 있는 동안 가한 데미지의 pct% HP 회복.
    // 룬/특기 흡혈과 별개 가산. 같은 trigger(공격 명중) 라 같은 라인에서 합산 라벨.
    const apLifestealHeal =
      nextBuffsTimed.playerLifestealTurnsLeft > 0 && nextBuffsTimed.playerLifestealPct > 0
        ? Math.floor((dmg * nextBuffsTimed.playerLifestealPct) / 100)
        : 0;
    // 별빛 흡혈(enchant lifesteal) — 가한 피해의 pct% HP 회복. 다른 흡혈류와 별개 가산.
    const enchantLifestealHeal =
      (player.enchantLifestealPct ?? 0) > 0
        ? Math.floor((dmg * player.enchantLifestealPct!) / 100)
        : 0;
    const totalLifestealHeal =
      lifestealHeal +
      luckyLifestealHeal +
      runeLifestealHeal +
      apLifestealHeal +
      enchantLifestealHeal;
    const newPlayerHp =
      totalLifestealHeal > 0
        ? Math.min(state.playerMaxHp, state.playerHp + totalLifestealHeal)
        : state.playerHp;
    const actualLifesteal = newPlayerHp - state.playerHp;
    if (actualLifesteal > 0) {
      const lifestealLabels: string[] = [];
      if (lifestealHeal > 0) lifestealLabels.push("흡혈");
      if (luckyLifestealHeal > 0) lifestealLabels.push("행운의 흡혈");
      if (runeLifestealHeal > 0) lifestealLabels.push("흡혈의 룬");
      if (apLifestealHeal > 0) lifestealLabels.push("흡령");
      if (enchantLifestealHeal > 0) lifestealLabels.push("별빛 흡혈");
      log = appendLog(log, {
        kind: "info",
        text: `[${lifestealLabels.join(" + ")}] ${playerName}의 HP +${actualLifesteal}`,
      });
    }
    const enemyHp = Math.max(0, state.enemyHp - totalDmg);
    // 출혈 (4티어) — 적중하면 출혈 1스택 누적 (다음 적 턴부터 도트).
    // 별빛 독공(enchant venom) — % 확률로 출혈 1스택 추가. 같은 출혈 스택을 공유 — bleedDmgPerStack
    // 과 enchantVenomDmgPerStack 둘 다 합산해서 turnstart 에서 적용.
    const venomFires =
      (player.enchantVenomChancePct ?? 0) > 0 &&
      Math.random() * 100 < player.enchantVenomChancePct!;
    const bleedAddSkill = (player.bleedDmgPerStack ?? 0) > 0 ? 1 : 0;
    const bleedAddVenom = venomFires ? 1 : 0;
    const bleedStacks =
      state.stacks.bleedStacks + bleedAddSkill + bleedAddVenom;
    if (venomFires) {
      log = appendLog(log, {
        kind: "info",
        text: `[독공] ${state.enemy.name}에게 출혈 +1스택`,
      });
    }
    // 약점 적중 (2티어 특기) — 크리 발동 시 그 턴 1회, DEF 무시 큐 + 추가타 1회.
    const weakpointFires =
      critRoll &&
      (player.weakpointExtraAttacks ?? 0) > 0 &&
      !state.turn.weakpointUsedThisTurn;
    const weakpointAdd = weakpointFires ? player.weakpointExtraAttacks! : 0;
    if (weakpointFires) {
      log = appendLog(log, {
        kind: "info",
        text: `[약점 적중] 빈틈을 — 한 번 더!`,
      });
    }
    // 연쇄 운명 (2티어 특기) — 크리 발동 시 그 턴 1회, 다음 공격 1회 크리 강제 큐.
    const fatedChainFires =
      critRoll &&
      !!player.fatedChainActive &&
      !state.turn.fatedChainTriggeredThisTurn;
    if (fatedChainFires) {
      log = appendLog(log, {
        kind: "info",
        text: `[연쇄 운명] 별빛이 다음 결을 점지했다 — 다음 공격 크리 보장.`,
      });
    }
    // 약점 큐 카운터: 이 공격에 사용된 경우 -1, 트리거 발화 시 +weakpointAdd.
    const newWeakpointDefIgnoreLeft =
      Math.max(0, state.stacks.weakpointDefIgnoreLeft - (weakpointDefIgnore ? 1 : 0)) +
      weakpointAdd;
    // AP 회복 +1 (행동 1회 = 공격 1회 명중), 발동된 AP 스킬 있으면 cost 차감.
    // 회복이 먼저 — 그 턴 첫 공격이 ult cost 와 정확히 일치할 때도 예상대로 발동.
    const nextApAfter = Math.max(
      0,
      Math.min(AP_CAP, state.ap + 1) - (apSkillFires?.apCost ?? 0),
    );
    // 비-atk_multiplier AP 효과 처리 — 본타와 같이 발동되는 부가 효과.
    const apHealAmount =
      apSkillFires?.effect.kind === "heal_pct"
        ? Math.floor((state.playerMaxHp * apSkillFires.effect.pct) / 100)
        : 0;
    const apBleedAdd =
      apSkillFires?.effect.kind === "apply_bleed"
        ? apSkillFires.effect.stacks
        : 0;
    const apEvadesAdd =
      apSkillFires?.effect.kind === "add_guaranteed_evades"
        ? apSkillFires.effect.count
        : 0;
    const playerHpAfterAPHeal =
      apHealAmount > 0
        ? Math.min(state.playerMaxHp, newPlayerHp + apHealAmount)
        : newPlayerHp;
    const apHealActual = playerHpAfterAPHeal - newPlayerHp;
    if (apHealActual > 0) {
      log = appendLog(log, {
        kind: "info",
        text: `[${apSkillFires!.name}] ${playerName}의 HP +${apHealActual}`,
      });
    }
    if (apBleedAdd > 0) {
      log = appendLog(log, {
        kind: "info",
        text: `[${apSkillFires!.name}] ${state.enemy.name}에게 출혈 +${apBleedAdd}스택`,
      });
    }
    if (apEvadesAdd > 0) {
      log = appendLog(log, {
        kind: "info",
        text: `[${apSkillFires!.name}] 보장 회피 +${apEvadesAdd}`,
      });
    }
    // 시한부 효과 로그 — buffs state 는 evasion 직후 applyTimedBuffFromApSkill 로 이미 적용됨.
    // 여기서는 표시용 로그만 남긴다 (발동턴 damage calc 부터 효과 받음).
    if (apSkillFires?.effect.kind === "player_dmg_reduction_turns") {
      log = appendLog(log, {
        kind: "info",
        text: `[${apSkillFires.name}] ${apSkillFires.effect.turns}턴간 받는 피해 -${apSkillFires.effect.pct}%`,
      });
    } else if (apSkillFires?.effect.kind === "enemy_def_debuff_pct_turns") {
      log = appendLog(log, {
        kind: "info",
        text: `[${apSkillFires.name}] ${apSkillFires.effect.turns}턴간 ${state.enemy.name}의 DEF -${apSkillFires.effect.pct}%`,
      });
    } else if (
      apSkillFires?.effect.kind === "player_atk_buff_def_debuff_pct_turns"
    ) {
      log = appendLog(log, {
        kind: "info",
        text: `[${apSkillFires.name}] ${apSkillFires.effect.turns}턴간 ATK +${apSkillFires.effect.atkPct}%, DEF -${apSkillFires.effect.defPct}%`,
      });
    } else if (apSkillFires?.effect.kind === "enemy_spd_mult_turns") {
      log = appendLog(log, {
        kind: "info",
        text: `[${apSkillFires.name}] ${apSkillFires.effect.turns}턴간 ${state.enemy.name}의 SPD ×${apSkillFires.effect.mult}`,
      });
    } else if (apSkillFires?.effect.kind === "player_spd_mult_turns") {
      log = appendLog(log, {
        kind: "info",
        text: `[${apSkillFires.name}] ${apSkillFires.effect.turns}턴간 SPD ×${apSkillFires.effect.mult}`,
      });
    } else if (apSkillFires?.effect.kind === "atk_multiplier_with_silence") {
      // 천뢰 일격 — atk_multiplier 와 같이 발동 + 1턴 적 스킬 봉인.
      log = appendLog(log, {
        kind: "info",
        text: `[${apSkillFires.name}] ${state.enemy.name} ${apSkillFires.effect.silenceTurns}턴간 스킬 봉인`,
      });
    } else if (apSkillFires?.effect.kind === "cleanse_debuffs") {
      // 정화 — 플레이어에게 걸린 모든 디버프 제거. 현재는 광기 자신 DEF 페널티만 존재하지만
      // 미래 확장 대비 player-side debuff 필드 전부 리셋.
      log = appendLog(log, {
        kind: "info",
        text: `[${apSkillFires.name}] ${playerName}의 모든 디버프 해제`,
      });
    } else if (apSkillFires?.effect.kind === "block_next_enemy_attack") {
      // 잔상 — 적의 다음 공격 N회 무효. 적 페이즈에서 데미지 적용 전 1회 소비.
      log = appendLog(log, {
        kind: "info",
        text: `[${apSkillFires.name}] ${state.enemy.name}의 다음 공격 ${apSkillFires.effect.count}회 무효`,
      });
    } else if (apSkillFires?.effect.kind === "lifesteal_dmg_pct_turns") {
      // 흡령 — 시한부 흡혈 버프. turnsLeft 동안 매 공격 데미지의 pct% heal (앞쪽 totalLifestealHeal 합산).
      log = appendLog(log, {
        kind: "info",
        text: `[${apSkillFires.name}] ${apSkillFires.effect.turns}턴간 가한 피해의 ${apSkillFires.effect.pct}% HP 회복`,
      });
    }
    // 광살참 (multi_hit_self_damage) — 자해 HP. dmg 적용 후 player HP 에서 추가 감산.
    const madSlashSelfDmg =
      apMultEffect?.kind === "multi_hit_self_damage"
        ? Math.floor((state.playerMaxHp * apMultEffect.selfDmgPct) / 100)
        : 0;
    const playerHpAfterMadSlash =
      madSlashSelfDmg > 0
        ? Math.max(0, playerHpAfterAPHeal - madSlashSelfDmg)
        : playerHpAfterAPHeal;
    if (madSlashSelfDmg > 0) {
      log = appendLog(log, {
        kind: "info",
        text: `[${apSkillFires!.name}] ${playerName}의 HP -${madSlashSelfDmg} (자해)`,
      });
    }
    // 연환격 (extra_attack_this_turn) — 이번 턴 attacksLeft 즉시 가산.
    const comboExtraAttacks =
      apSkillFires?.effect.kind === "extra_attack_this_turn"
        ? apSkillFires.effect.count
        : 0;
    // 빛의 활공 (queued_extra_attacks_next_turn) — 다음 턴 시작 시 attacksLeft 에 가산할 큐.
    const queuedExtraAttacksAdd =
      apSkillFires?.effect.kind === "queued_extra_attacks_next_turn"
        ? apSkillFires.effect.count
        : 0;
    if (comboExtraAttacks > 0) {
      log = appendLog(log, {
        kind: "info",
        text: `[${apSkillFires!.name}] 이번 턴 추가 공격 +${comboExtraAttacks}`,
      });
    }
    if (queuedExtraAttacksAdd > 0) {
      log = appendLog(log, {
        kind: "info",
        text: `[${apSkillFires!.name}] 다음 턴 행동 +${queuedExtraAttacksAdd}`,
      });
    }
    // 집중의 호흡 큐잉 — 이 발동 attack 후 첫 평타에 적용. 현재 fire 의 critRoll 에는 영향 X.
    const focusedBreathQueueBonusPct =
      apSkillFires?.effect.kind === "crit_buff_next_attack"
        ? apSkillFires.effect.critDmgBonusPct
        : 0;
    if (focusedBreathQueueBonusPct > 0) {
      log = appendLog(log, {
        kind: "info",
        text: `[${apSkillFires!.name}] 다음 공격 크리 보장 + 크리뎀 +${focusedBreathQueueBonusPct}%`,
      });
    }
    // 페이즈 트리거 검사 — 데미지 적용 직후, 사망 분기 전에 처리해야 트리거된 def 가
    // 같은 턴 후속 공격(다중공격/연타)에 즉시 반영된다.
    const afterDamage = applyPhaseTriggerIfAny({
      ...state,
      enemyHp,
      playerHp: playerHpAfterMadSlash,
      log,
      ap: nextApAfter,
      flags: {
        ...state.flags,
        assassinateUsed: state.flags.assassinateUsed || assassinFires,
        luckyBuffActive,
        fatedChainCritPending: fatedChainFires
          ? true
          : fatedChainConsumed
            ? false
            : state.flags.fatedChainCritPending,
      },
      buffs: {
        ...nextBuffsTimed,
        // 2티어 특기 상태 갱신.
        cyclingChiBonus: cyclingChiThisTurn,
      },
      stacks: {
        ...state.stacks,
        bleedStacks: bleedStacks + apBleedAdd,
        evadesRemaining: state.stacks.evadesRemaining + apEvadesAdd,
        weakpointDefIgnoreLeft: newWeakpointDefIgnoreLeft,
      },
      turn: {
        ...state.turn,
        critThisTurn: state.turn.critThisTurn || critRoll,
        fatedChainTriggeredThisTurn:
          state.turn.fatedChainTriggeredThisTurn || fatedChainFires,
        weakpointUsedThisTurn: state.turn.weakpointUsedThisTurn || weakpointFires,
        apSkillFiredThisTurn: apSkillFires
          ? apSkillFires.id
          : state.turn.apSkillFiredThisTurn,
        // 집중의 호흡 — 발동되면 이번 fire 후부터 큐잉, 큐 활성 중 평타 1회 발사 시 0 으로 소비.
        focusedBreathCritDmgBonusPct: focusedBreathQueueBonusPct > 0
          ? focusedBreathQueueBonusPct
          : focusedBreathConsumed
            ? 0
            : state.turn.focusedBreathCritDmgBonusPct,
        // 빛의 활공 — 다음 턴 attacksLeft 에 가산할 큐. 일반 평타에선 0 유지.
        queuedExtraAttacks: queuedExtraAttacksAdd > 0
          ? queuedExtraAttacksAdd
          : state.turn.queuedExtraAttacks,
      },
    });
    if (enemyHp <= 0) {
      return {
        ...afterDamage,
        log: appendLog(afterDamage.log, {
          kind: "info",
          text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
        }),
        phase: "ended",
        outcome: "win",
        turn: {
          ...afterDamage.turn,
          completedPlayerTurns: state.turn.completedPlayerTurns + 1,
        },
      };
    }
    const attacksLeft =
      state.playerAttacksLeft - 1 + weakpointAdd + comboExtraAttacks;
    if (attacksLeft > 0) {
      return {
        ...afterDamage,
        playerAttacksLeft: attacksLeft,
        turn: { ...afterDamage.turn, firstAttackPending: false },
      };
    }
    // 마지막 공격이 끝난 시점 — 연타 발동 가능 여부 검사.
    const interval = player.extraAttackEveryNTurns;
    const canDoubleStrike =
      !!interval &&
      interval > 0 &&
      turnNumber % interval === 0 &&
      !state.turn.doubleStrikeUsedThisTurn;
    if (canDoubleStrike) {
      return {
        ...afterDamage,
        log: appendLog(afterDamage.log, { kind: "info", text: "[연타] 한 번 더!" }),
        phase: "player",
        playerAttacksLeft: 1,
        turn: {
          ...afterDamage.turn,
          doubleStrikeUsedThisTurn: true,
          firstAttackPending: false,
        },
      };
    }
    // 광속 — 마지막 공격 후 일정 확률로 추가 1회. 연타와 별개라 둘 다 슬롯 시
    // 한 턴에 +2 까지 발동 가능 (연타 → 광속 순서 — 연타가 먼저 빠져나간 다음 광속).
    const lightspeedPct = player.lightspeedExtraAttackPct ?? 0;
    const canLightspeed =
      lightspeedPct > 0 &&
      !state.turn.lightspeedUsedThisTurn &&
      Math.random() * 100 < lightspeedPct;
    if (canLightspeed) {
      return {
        ...afterDamage,
        log: appendLog(afterDamage.log, {
          kind: "info",
          text: "[광속] 잔상이 한 번 더 휘둘렀다!",
        }),
        phase: "player",
        playerAttacksLeft: 1,
        turn: {
          ...afterDamage.turn,
          lightspeedUsedThisTurn: true,
          firstAttackPending: false,
        },
      };
    }
    // 풍사슬 (5티어) — 추가 공격(연타·광속·이전 풍사슬) 발동 후 확률로 1회 더. 캡: GALE_CHAIN_MAX_PER_TURN.
    // 6티어 무한 풍사슬: 확률 +eternalGaleBonusPct% + 캡 해제.
    const baseGalePct = player.galeChainChancePct ?? 0;
    const eternalBonusPct = player.eternalGaleBonusPct ?? 0;
    const effectiveGalePct = baseGalePct + eternalBonusPct;
    const galeChainReady =
      state.turn.doubleStrikeUsedThisTurn ||
      state.turn.lightspeedUsedThisTurn ||
      state.turn.galeChainsThisTurn > 0;
    // 무한 풍사슬 시 절대 캡 (ETERNAL_GALE_ABSOLUTE_CAP) 까지만 — 정상 확률엔 도달 불가, cheese 방지용.
    const galeCap = player.eternalGaleNoCap
      ? ETERNAL_GALE_ABSOLUTE_CAP
      : GALE_CHAIN_MAX_PER_TURN;
    const canGaleChain =
      effectiveGalePct > 0 &&
      galeChainReady &&
      state.turn.galeChainsThisTurn < galeCap &&
      Math.random() * 100 < effectiveGalePct;
    if (canGaleChain) {
      return {
        ...afterDamage,
        log: appendLog(afterDamage.log, {
          kind: "info",
          text: "[풍사슬] 바람이 한 번 더 휘몰아친다!",
        }),
        phase: "player",
        playerAttacksLeft: 1,
        turn: {
          ...afterDamage.turn,
          galeChainsThisTurn: state.turn.galeChainsThisTurn + 1,
          firstAttackPending: false,
        },
      };
    }
    // 연참 (특기) — 이번 턴에 크리티컬이 났으면 추가 공격 N회 (턴당 1회).
    const canRiposte =
      (player.riposteExtra ?? 0) > 0 &&
      !state.turn.riposteUsedThisTurn &&
      afterDamage.turn.critThisTurn;
    if (canRiposte) {
      return {
        ...afterDamage,
        log: appendLog(afterDamage.log, {
          kind: "info",
          text: "[연참] 빈틈을 파고든다 — 한 번 더!",
        }),
        phase: "player",
        playerAttacksLeft: player.riposteExtra!,
        turn: {
          ...afterDamage.turn,
          riposteUsedThisTurn: true,
          firstAttackPending: false,
        },
      };
    }
    const ended: BattleState = {
      ...afterDamage,
      phase: "enemy",
      playerAttacksLeft: rollPlayerAttackCount(player),
      turn: {
        ...afterDamage.turn,
        completedPlayerTurns: state.turn.completedPlayerTurns + 1,
        doubleStrikeUsedThisTurn: false,
        lightspeedUsedThisTurn: false,
        critThisTurn: false,
        riposteUsedThisTurn: false,
        firstAttackPending: true,
        galeChainsThisTurn: 0,
        weakpointUsedThisTurn: false,
        fatedChainTriggeredThisTurn: false,
        apSkillFiredThisTurn: null,
      },
    };
    return finishPlayerTurn(ended, player, playerName);
  }

  // ── 출혈 (4티어) — 적 턴 시작 시 출혈 스택당 고정 피해 (DEF 무시) ──────────
  // 별빛 독공(venom) 도 같은 스택을 공유 — enchantVenomDmgPerStack 가 bleed dmg 에 가산.
  const bleedPerStack =
    (player.bleedDmgPerStack ?? 0) + (player.enchantVenomDmgPerStack ?? 0);
  if (state.stacks.bleedStacks > 0 && bleedPerStack > 0) {
    const bleedDmg = state.stacks.bleedStacks * bleedPerStack;
    const afterBleedHp = Math.max(0, state.enemyHp - bleedDmg);
    const bled = applyPhaseTriggerIfAny({
      ...state,
      enemyHp: afterBleedHp,
      log: appendLog(state.log, {
        kind: "info",
        text: `[출혈] ${state.enemy.name}이(가) 출혈로 ${bleedDmg} 피해 (스택 ${state.stacks.bleedStacks})`,
      }),
    });
    if (afterBleedHp <= 0) {
      return {
        ...bled,
        log: appendLog(bled.log, {
          kind: "info",
          text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
        }),
        phase: "ended",
        outcome: "win",
      };
    }
    state = bled;
  }

  // ── 한기 (chill) — 적 페이즈 시작 시 한기 스택당 고정 피해 (DEF·보호막 무시) ──────
  // 출혈의 미러. threshold 이상부터 발동. 스택은 적 chill 공격 적중 시 누적(아래 적 공격부).
  // 이미 몸에 스민 추위는 천뢰 일격 silence 와 무관하게 틱한다.
  const chillSkill =
    state.enemy.skill?.kind === "chill" ? state.enemy.skill : null;
  if (
    chillSkill &&
    chillSkill.dmgPerStack > 0 &&
    state.stacks.chillStacks >= chillSkill.threshold
  ) {
    const chillDmg = state.stacks.chillStacks * chillSkill.dmgPerStack;
    const afterChillHp = Math.max(0, state.playerHp - chillDmg);
    const chilled: BattleState = {
      ...state,
      playerHp: afterChillHp,
      stacks: {
        ...state.stacks,
        damageTakenThisCombat:
          state.stacks.damageTakenThisCombat + (state.playerHp - afterChillHp),
      },
      log: appendLog(state.log, {
        kind: "info",
        text: `[한기] ${chillSkill.name} — 추위가 ${chillDmg} 피해 (스택 ${state.stacks.chillStacks})`,
      }),
    };
    if (afterChillHp <= 0) {
      return {
        ...chilled,
        log: appendLog(chilled.log, {
          kind: "info",
          text: `${playerName}이(가) 얼어붙어 쓰러졌다...`,
        }),
        phase: "ended",
        outcome: "lose",
      };
    }
    state = chilled;
  }

  // 잔상 (AP) — 큐가 활성이면 적 공격 1회 무효. 데미지·반사 모두 스킵, count -1.
  // 회피·반사 우선순위보다 위에 둠 — "잔상" 은 적이 허를 쳐서 빈 자리만 후려치는 결.
  // 다대시 보스라도 잔상은 그 중 1대만 막음 (남은 추가타는 정상 진행).
  if (state.buffs.enemyAttackBlockedCount > 0) {
    return finishEnemyAttack({
      ...state,
      buffs: {
        ...state.buffs,
        enemyAttackBlockedCount: state.buffs.enemyAttackBlockedCount - 1,
      },
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
      },
      playerAttacksLeft:
        state.playerAttacksLeft + (player.skirmishNextTurnBonus ?? 0),
      log: appendLog(state.log, {
        kind: "info",
        text: `[잔상] ${state.enemy.name}의 공격이 잔상만 베어 갔다.`,
      }),
    });
  }

  // enemy phase — 그림자 보법 → 보장 회피 → % 회피 → 행운의 방패 → 데미지 (가드 적용) 순.
  // enemy phase 종료 시 enemyPhasesCompleted +1 (가드 카운터 진행).
  // 회피/방패 성공 시 곡예(특기) 장착이면 HP +evadeHealAmount.
  const evadeHeal = player.evadeHealAmount ?? 0;
  const healOnDodge = (hp: number): number =>
    evadeHeal > 0 ? Math.min(state.playerMaxHp, hp + evadeHeal) : hp;

  // 무한 가시 (2티어 특기) — 매 적 공격에 적 ATK 의 N% 반사 (회피/피격 무관).
  // 회피/피격 모든 분기에서 동일 적용 — helper 로 컴팩트하게.
  const infiniteThornsPct = player.infiniteThornsAtkPct ?? 0;
  const infiniteThornsDmg =
    infiniteThornsPct > 0
      ? Math.floor((state.enemy.atk * infiniteThornsPct) / 100)
      : 0;
  // 반사 회피 (2티어 특기) — 회피 성공 시 받았을 피해의 N 비율 반사. baseEnemyDmg 추정.
  const reflexEvadeMult = player.reflexEvadeMult ?? 0;
  const estimatedRawEnemyDmg = (() => {
    if (reflexEvadeMult <= 0) return 0;
    const sk = state.enemy.skill;
    const pierced =
      sk?.kind === "pierce" ? Math.max(0, player.def - sk.armorPierce) : player.def;
    const playerDefVuln = state.enemy.playerDefVulnerable ?? 0;
    const effDef =
      playerDefVuln > 0 ? Math.round(pierced * (1 - playerDefVuln)) : pierced;
    const effAtk = Math.max(
      0,
      state.enemy.atk + state.buffs.enemyAtkBonus - state.buffs.enemyAtkPenalty,
    );
    return damageBetween(effAtk, effDef);
  })();
  const reflexEvadeDmg =
    reflexEvadeMult > 0
      ? Math.floor(estimatedRawEnemyDmg * reflexEvadeMult)
      : 0;
  // 회피/무피격 분기에서 공통으로 적용할 반사 피해(무한 가시 + 반사 회피) — 적 HP 갱신용.
  const applyDodgeReflect = (
    log0: BattleLogEntry[],
    enemyHp0: number,
  ): { log: BattleLogEntry[]; enemyHp: number; killed: boolean } => {
    const totalReflect = infiniteThornsDmg + reflexEvadeDmg;
    if (totalReflect <= 0) return { log: log0, enemyHp: enemyHp0, killed: false };
    let nextLog = log0;
    const labels: string[] = [];
    if (infiniteThornsDmg > 0) labels.push("무한 가시");
    if (reflexEvadeDmg > 0) labels.push("반사 회피");
    const newEnemyHp = Math.max(0, enemyHp0 - totalReflect);
    nextLog = appendLog(nextLog, {
      kind: "player_attack",
      text: `[${labels.join(" + ")}] ${state.enemy.name}에게 ${totalReflect} 반사 피해.`,
    });
    return { log: nextLog, enemyHp: newEnemyHp, killed: newEnemyHp <= 0 };
  };

  // 그림자 보법 (2티어 특기) — 적 턴 시작 시 일정 확률로 그 턴 모든 적 공격 무효.
  const shadowStepPct = player.shadowStepPct ?? 0;
  if (shadowStepPct > 0 && Math.random() * 100 < shadowStepPct) {
    const healedHp = healOnDodge(state.playerHp);
    let log = appendLog(state.log, {
      kind: "info",
      text: `[그림자 보법] ${playerName}이(가) 모든 공격을 그림자처럼 흘려보냈다!`,
    });
    if (healedHp > state.playerHp) {
      log = appendLog(log, {
        kind: "info",
        text: `[곡예] ${playerName}의 HP +${healedHp - state.playerHp}`,
      });
    }
    const reflect = applyDodgeReflect(log, state.enemyHp);
    if (reflect.killed) {
      return {
        ...state,
        playerHp: healedHp,
        enemyHp: 0,
        turn: {
          ...state.turn,
          enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
        },
        log: appendLog(reflect.log, {
          kind: "info",
          text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
        }),
        phase: "ended",
        outcome: "win",
      };
    }
    // 그림자 보법은 그 턴 모든 적 공격 무효 — 다대시 보스라도 남은 추가타까지 모두 흘려보냄.
    let next: BattleState = {
      ...state,
      playerHp: healedHp,
      enemyHp: reflect.enemyHp,
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
        enemyAttacksLeft: 0,
      },
      playerAttacksLeft:
        state.playerAttacksLeft + (player.skirmishNextTurnBonus ?? 0),
      log: reflect.log,
    };
    const counter = applyCounterIfAny(next, player);
    if (counter.ended) return counter.state;
    next = counter.state;
    return { ...next, phase: "player" };
  }
  if (state.stacks.evadesRemaining > 0) {
    const healedHp = healOnDodge(state.playerHp);
    let log = appendLog(state.log, {
      kind: "info",
      text: `[회피 강화] ${state.enemy.name}의 공격을 회피했다!`,
    });
    if (healedHp > state.playerHp) {
      log = appendLog(log, {
        kind: "info",
        text: `[곡예] ${playerName}의 HP +${healedHp - state.playerHp}`,
      });
    }
    const reflect = applyDodgeReflect(log, state.enemyHp);
    if (reflect.killed) {
      return {
        ...state,
        playerHp: healedHp,
        enemyHp: 0,
        stacks: {
          ...state.stacks,
          evadesRemaining: state.stacks.evadesRemaining - 1,
        },
        turn: {
          ...state.turn,
          enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
        },
        log: appendLog(reflect.log, {
          kind: "info",
          text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
        }),
        phase: "ended",
        outcome: "win",
      };
    }
    let next: BattleState = {
      ...state,
      playerHp: healedHp,
      enemyHp: reflect.enemyHp,
      stacks: {
        ...state.stacks,
        evadesRemaining: state.stacks.evadesRemaining - 1,
      },
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
      },
      // 유격 (특기) — 회피 성공 시 다음 플레이어 턴 공격 횟수 +N (현재 playerAttacksLeft 는 다음 턴 선롤분).
      playerAttacksLeft:
        state.playerAttacksLeft + (player.skirmishNextTurnBonus ?? 0),
      log: reflect.log,
    };
    const counter = applyCounterIfAny(next, player);
    if (counter.ended) return counter.state;
    return finishEnemyAttack(counter.state);
  }
  // 이중 행운 — 활성 시 회피 확률 +bonus%.
  const luckEvadeBonus = state.flags.luckyBuffActive
    ? player.doubleLuck?.evade ?? 0
    : 0;
  // 만물 행운 (6티어) — 회피 확률에도 +N%.
  const universalLuckEvadeBonus = player.universalLuckBonusPct ?? 0;
  // 회전 운기 (2티어 특기) — 누적 보너스 회피에도 적용.
  // 회피 캡 EVASION_PCT_CAP — 100% 회피 무적 빌드 차단.
  // 보장 회피 (소모형 적립) 는 위쪽 분기에서 별도 처리되어 캡 무관 100% 회피 유지.
  const effectiveEvadePct = Math.min(
    EVASION_PCT_CAP,
    player.evasionPct +
      luckEvadeBonus +
      universalLuckEvadeBonus +
      state.buffs.cyclingChiBonus,
  );
  if (Math.random() * 100 < effectiveEvadePct) {
    const healedHp = healOnDodge(state.playerHp);
    let log = appendLog(state.log, {
      kind: "info",
      text: `${playerName}이(가) ${state.enemy.name}의 공격을 회피했다!`,
    });
    if (healedHp > state.playerHp) {
      log = appendLog(log, {
        kind: "info",
        text: `[곡예] ${playerName}의 HP +${healedHp - state.playerHp}`,
      });
    }
    const reflect = applyDodgeReflect(log, state.enemyHp);
    if (reflect.killed) {
      return {
        ...state,
        playerHp: healedHp,
        enemyHp: 0,
        turn: {
          ...state.turn,
          enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
        },
        log: appendLog(reflect.log, {
          kind: "info",
          text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
        }),
        phase: "ended",
        outcome: "win",
      };
    }
    let next: BattleState = {
      ...state,
      playerHp: healedHp,
      enemyHp: reflect.enemyHp,
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
      },
      // 유격 (특기) — 회피 성공 시 다음 플레이어 턴 공격 횟수 +N (현재 playerAttacksLeft 는 다음 턴 선롤분).
      playerAttacksLeft:
        state.playerAttacksLeft + (player.skirmishNextTurnBonus ?? 0),
      log: reflect.log,
    };
    const counter = applyCounterIfAny(next, player);
    if (counter.ended) return counter.state;
    return finishEnemyAttack(counter.state);
  }
  // 별빛 가드(enchant guard) — 회피/럭키 방패 전에 굴리는 % 블록. 슬롯당 5~20% 누적.
  // 회피와 별개 라벨 — 회피는 비켜서고, 가드는 받아낸 다음 흩어 낸다.
  const enchantGuardPct = player.enchantGuardBlockPct ?? 0;
  if (enchantGuardPct > 0 && Math.random() * 100 < enchantGuardPct) {
    const log = appendLog(state.log, {
      kind: "info",
      text: `[가드] ${playerName}이(가) ${state.enemy.name}의 공격을 흩어 냈다!`,
    });
    return finishEnemyAttack({
      ...state,
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
      },
      log,
    });
  }
  // 행운의 방패 (특기) — 위 회피가 모두 실패해도 일정 확률로 피해 무효 (행운 회피).
  const luckyBlockPct = player.luckyShieldBlockPct ?? 0;
  if (luckyBlockPct > 0 && Math.random() * 100 < luckyBlockPct) {
    const healedHp = healOnDodge(state.playerHp);
    let log = appendLog(state.log, {
      kind: "info",
      text: `[행운의 방패] ${playerName}이(가) ${state.enemy.name}의 공격을 흘려보냈다!`,
    });
    if (healedHp > state.playerHp) {
      log = appendLog(log, {
        kind: "info",
        text: `[곡예] ${playerName}의 HP +${healedHp - state.playerHp}`,
      });
    }
    const reflect = applyDodgeReflect(log, state.enemyHp);
    if (reflect.killed) {
      return {
        ...state,
        playerHp: healedHp,
        enemyHp: 0,
        turn: {
          ...state.turn,
          enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
        },
        log: appendLog(reflect.log, {
          kind: "info",
          text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
        }),
        phase: "ended",
        outcome: "win",
      };
    }
    let next: BattleState = {
      ...state,
      playerHp: healedHp,
      enemyHp: reflect.enemyHp,
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
      },
      // 유격 (특기) — 회피 성공 시 다음 플레이어 턴 공격 횟수 +N (현재 playerAttacksLeft 는 다음 턴 선롤분).
      playerAttacksLeft:
        state.playerAttacksLeft + (player.skirmishNextTurnBonus ?? 0),
      log: reflect.log,
    };
    const counter = applyCounterIfAny(next, player);
    if (counter.ended) return counter.state;
    return finishEnemyAttack(counter.state);
  }

  // ── 잡몹 스킬 (적 공격에 영향) ──────────────────────────────────────────
  // 천뢰 일격 (AP) — silence 활성 중엔 enemy.skill 전체 효과 비활성.
  const skill =
    state.buffs.enemySilenceTurnsLeft > 0 ? undefined : state.enemy.skill;
  // 한기 누적 — chill 공격이 적중하면 perHit 만큼 스택. 적 HP 가 deepHpFraction 미만이면 2배(깊은 한기).
  // silence 중엔 누적 안 됨(skill 이 undefined). 실제 DoT 는 다음 적 페이즈 시작에 틱.
  const chillAdd =
    skill?.kind === "chill"
      ? state.enemyHp < state.enemy.hp * (skill.deepHpFraction ?? 0)
        ? skill.perHit * 2
        : skill.perHit
      : 0;
  const chillStacksNext = state.stacks.chillStacks + chillAdd;
  // 격노 — 적 HP 가 maxHp×hpFraction 미만으로 떨어지는 순간 1회 발동, ATK +atkBonus (전투 종료까지 유지).
  const enrageReady =
    skill?.kind === "enrage" &&
    !state.flags.enrageTriggered &&
    state.enemyHp > 0 &&
    state.enemyHp < state.enemy.hp * skill.hpFraction;
  const enemyAtkBonus =
    enrageReady && skill?.kind === "enrage"
      ? state.buffs.enemyAtkBonus + skill.atkBonus
      : state.buffs.enemyAtkBonus;
  const enrageTriggered = state.flags.enrageTriggered || enrageReady;
  // 관통 — 잡몹 pierce 스킬의 고정 관통 먼저, 그 위에 보스 playerDefVulnerable 비례 관통.
  const pierced =
    skill?.kind === "pierce" ? Math.max(0, player.def - skill.armorPierce) : player.def;
  // 광기 (AP) — 자신 DEF -pct%. pierce 후, vulnerable 전에 곱연산.
  const piercedDebuffed =
    state.buffs.playerDefDebuffTurnsLeft > 0 && state.buffs.playerDefDebuffPct > 0
      ? Math.round(pierced * (1 - state.buffs.playerDefDebuffPct / 100))
      : pierced;
  const playerDefVuln = state.enemy.playerDefVulnerable ?? 0;
  const effectivePlayerDef =
    playerDefVuln > 0 ? Math.round(piercedDebuffed * (1 - playerDefVuln)) : piercedDebuffed;
  // 강타 — everyPhases 번째 적 페이즈마다 데미지 ×multiplier. 이번 페이즈 종료 후
  // enemyPhasesCompleted 가 N 의 배수가 되는지로 판단.
  const heavyBlowMult =
    skill?.kind === "heavy_blow" &&
    skill.everyPhases > 0 &&
    (state.turn.enemyPhasesCompleted + 1) % skill.everyPhases === 0
      ? skill.multiplier
      : 1;
  const heavyBlowFired = heavyBlowMult > 1;
  // 약점 분석(5티어)의 적 ATK 페널티는 raw atk 에 적용 → 0 클램프.
  const effectiveEnemyAtk = Math.max(
    0,
    state.enemy.atk + enemyAtkBonus - state.buffs.enemyAtkPenalty,
  );
  const baseEnemyDmg = damageBetween(effectiveEnemyAtk, effectivePlayerDef);
  const rawDmgBeforeReduction = heavyBlowFired
    ? Math.max(1, Math.floor(baseEnemyDmg * heavyBlowMult))
    : baseEnemyDmg;
  // 결의 (AP) — 받는 피해 -pct%. 가드/굳건/철벽 전에 곱연산으로 먼저 깎이도록.
  const rawDmg =
    state.buffs.playerDmgReductionTurnsLeft > 0 &&
    state.buffs.playerDmgReductionPct > 0
      ? Math.max(
          1,
          Math.floor(
            rawDmgBeforeReduction *
              (1 - state.buffs.playerDmgReductionPct / 100),
          ),
        )
      : rawDmgBeforeReduction;
  // 별빛 인내(enchant endure) — 받는 피해 -pct%. 결의 다음, 가드/굳건/철벽 전에 곱연산.
  // 항상 활성(시한부 X). 최소 1 클램프.
  const endurePct = player.enchantEndurePct ?? 0;
  const enduredDmg =
    endurePct > 0
      ? Math.max(1, Math.floor(rawDmg * (1 - endurePct / 100)))
      : rawDmg;
  const enduredApplied = enduredDmg < rawDmg;
  // 가드 — 첫 N번의 적 페이즈 동안 받는 피해 -reduction. 선공자에 무관하게
  // enemyPhasesCompleted 가 N 미만이면 이번 페이즈가 그 N 중 하나.
  const guard = player.guard;
  const guarded =
    guard && guard.turns > 0 && state.turn.enemyPhasesCompleted < guard.turns
      ? Math.max(0, enduredDmg - guard.reduction)
      : enduredDmg;
  // 굳건한 의지 (2티어 특기) — 받은 피해 평탄 -(N) 감소. 가드 뒤에 적용.
  const steadfastFlat = player.steadfastWillFlat ?? 0;
  const dmg = steadfastFlat > 0 ? Math.max(0, guarded - steadfastFlat) : guarded;
  const guardApplied = guarded < enduredDmg;
  const steadfastApplied = dmg < guarded;
  // 철벽 (4티어) — 보호막이 데미지를 먼저 흡수, 남은 만큼만 HP 에 적용. 무피해 난무는 dmgToHp 로 누적.
  const shieldAbsorbed = Math.min(state.stacks.playerShield, dmg);
  const dmgToHp = dmg - shieldAbsorbed;
  const newShield = state.stacks.playerShield - shieldAbsorbed;
  // 불굴 — HP 0 이 되는 데미지를 HP 1 로 막는다. 전투당 1회 (enduranceTriggered).
  const wouldKill = state.playerHp - dmgToHp <= 0;
  const enduranceFires =
    wouldKill && !!player.enduranceActive && !state.flags.enduranceTriggered;
  const playerHpAfterDmg = enduranceFires
    ? 1
    : Math.max(0, state.playerHp - dmgToHp);
  // 흡혈 갑옷 (6티어) — 받은 HP 피해의 N% HP 회복. HP 0 으로 죽은 후엔 미발동, 불굴로 버틴 후엔 발동.
  const bloodfeastPct = player.bloodfeastPct ?? 0;
  const bloodfeastHeal =
    bloodfeastPct > 0 && dmgToHp > 0 && playerHpAfterDmg > 0
      ? Math.floor((dmgToHp * bloodfeastPct) / 100)
      : 0;
  const playerHp =
    bloodfeastHeal > 0
      ? Math.min(state.playerMaxHp, playerHpAfterDmg + bloodfeastHeal)
      : playerHpAfterDmg;
  const enduranceTriggered = state.flags.enduranceTriggered || enduranceFires;
  // 로그 — 격노 발동 → 가드 → (강타 라벨 포함) 공격 → 불굴 순.
  let log = state.log;
  if (enrageReady && skill?.kind === "enrage") {
    log = appendLog(log, {
      kind: "info",
      text: `[${skill.name}] ${state.enemy.name}이(가) 격앙되어 공격력이 +${skill.atkBonus}!`,
    });
  }
  if (enduredApplied) {
    log = appendLog(log, {
      kind: "info",
      text: `[인내] 피해 -${rawDmg - enduredDmg}`,
    });
  }
  if (guardApplied) {
    log = appendLog(log, {
      kind: "info",
      text: `[가드] 피해 -${enduredDmg - guarded}`,
    });
  }
  if (steadfastApplied) {
    log = appendLog(log, {
      kind: "info",
      text: `[굳건한 의지] 피해 -${guarded - dmg}`,
    });
  }
  if (shieldAbsorbed > 0) {
    log = appendLog(log, {
      kind: "info",
      text: `[철벽] 보호막이 ${shieldAbsorbed} 흡수 (남은 ${newShield})`,
    });
  }
  const atkPrefix =
    heavyBlowFired && skill?.kind === "heavy_blow" ? `[${skill.name}] ` : "";
  log = appendLog(log, {
    kind: "enemy_attack",
    text: `${atkPrefix}${state.enemy.name}이(가) ${playerName}에게 ${dmgToHp} 피해를 입혔다.`,
  });
  if (enduranceFires) {
    log = appendLog(log, {
      kind: "info",
      text: `[불굴] 마지막 한 숨 — HP 1 로 버텼다!`,
    });
  }
  if (bloodfeastHeal > 0) {
    log = appendLog(log, {
      kind: "info",
      text: `[흡혈 갑옷] ${playerName}의 HP +${bloodfeastHeal}`,
    });
  }
  // 반사 갑주 (특기) + 가시 갑옷 (5티어) — 적이 넣은 피해(가드/굳건/철벽 감산 전, heavyBlow 반영)의
  // N% 를 적에게 반사. 둘 다 있으면 합산. 베이스가 pre-mit 이라 탱커 빌드여도 반사가 살아남는다.
  // 무한 가시 (2티어 특기) — 피격분과 별개로 적 ATK 의 N% 를 추가 반사 (회피/피격 무관).
  const thornsDmg =
    (player.thornsPct ?? 0) > 0
      ? Math.floor((rawDmgBeforeReduction * player.thornsPct!) / 100)
      : 0;
  const brambleDmg =
    (player.bramblePct ?? 0) > 0
      ? Math.floor((rawDmgBeforeReduction * player.bramblePct!) / 100)
      : 0;
  // 별빛 반사(enchant reflect) — 실제 HP 로 들어간 피해의 N% 만 반사 (회피·가드 무효
  // 시엔 0). 라벨은 "별빛 반사" 로 분리.
  const enchantReflectDmg =
    (player.enchantReflectPct ?? 0) > 0 && dmgToHp > 0
      ? Math.floor((dmgToHp * player.enchantReflectPct!) / 100)
      : 0;
  const reflectDmg =
    thornsDmg + brambleDmg + infiniteThornsDmg + enchantReflectDmg;
  const enemyHpAfterThorns = Math.max(0, state.enemyHp - reflectDmg);
  if (reflectDmg > 0) {
    const reflectLabels: string[] = [];
    if (thornsDmg > 0) reflectLabels.push("반사 갑주");
    if (brambleDmg > 0) reflectLabels.push("가시 갑옷");
    if (infiniteThornsDmg > 0) reflectLabels.push("무한 가시");
    if (enchantReflectDmg > 0) reflectLabels.push("별빛 반사");
    log = appendLog(log, {
      kind: "player_attack",
      text: `[${reflectLabels.join(" + ")}] ${state.enemy.name}에게 ${reflectDmg} 반사 피해.`,
    });
  }
  // 반격의 룬 — 피격 시 일정 확률로 적에게 ATK 데미지로 반격. 살아남았을 때만 발동.
  // 확률은 합산값. 100% 초과는 자연스럽게 항상 발동.
  const runeCounterPct = player.runeCounterChancePct ?? 0;
  let enemyHpAfterRuneCounter = enemyHpAfterThorns;
  if (
    runeCounterPct > 0 &&
    playerHp > 0 &&
    enemyHpAfterThorns > 0 &&
    Math.random() * 100 < runeCounterPct
  ) {
    const counterDmg = damageBetween(
      player.atk,
      playerFacingEnemyDef(state, player),
    );
    enemyHpAfterRuneCounter = Math.max(0, enemyHpAfterThorns - counterDmg);
    log = appendLog(log, {
      kind: "player_attack",
      text: `[반격의 룬] ${state.enemy.name}에게 ${counterDmg} 반격 피해.`,
    });
  }
  if (playerHp <= 0) {
    return {
      ...state,
      playerHp,
      enemyHp: enemyHpAfterRuneCounter,
      flags: {
        ...state.flags,
        enduranceTriggered,
        enrageTriggered,
      },
      buffs: {
        ...state.buffs,
        enemyAtkBonus,
      },
      stacks: {
        ...state.stacks,
        playerShield: newShield,
        chillStacks: chillStacksNext,
        damageTakenThisCombat: state.stacks.damageTakenThisCombat + dmgToHp,
      },
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
      },
      log: appendLog(log, {
        kind: "info",
        text: `${playerName}이(가) 쓰러졌다...`,
      }),
      phase: "ended",
      outcome: "lose",
    };
  }
  if (enemyHpAfterRuneCounter <= 0) {
    // 반사 / 반격 피해로 적이 쓰러짐 — 플레이어는 생존.
    return {
      ...state,
      playerHp,
      enemyHp: 0,
      flags: {
        ...state.flags,
        enduranceTriggered,
        enrageTriggered,
      },
      buffs: {
        ...state.buffs,
        enemyAtkBonus,
      },
      stacks: {
        ...state.stacks,
        playerShield: newShield,
        chillStacks: chillStacksNext,
        damageTakenThisCombat: state.stacks.damageTakenThisCombat + dmgToHp,
      },
      turn: {
        ...state.turn,
        enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
      },
      log: appendLog(log, {
        kind: "info",
        text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
      }),
      phase: "ended",
      outcome: "win",
    };
  }
  return finishEnemyAttack({
    ...state,
    playerHp,
    enemyHp: enemyHpAfterRuneCounter,
    flags: {
      ...state.flags,
      enduranceTriggered,
      enrageTriggered,
    },
    buffs: {
      ...state.buffs,
      enemyAtkBonus,
    },
    stacks: {
      ...state.stacks,
      playerShield: newShield,
      chillStacks: chillStacksNext,
      damageTakenThisCombat: state.stacks.damageTakenThisCombat + dmgToHp,
    },
    turn: {
      ...state.turn,
      enemyPhasesCompleted: state.turn.enemyPhasesCompleted + 1,
    },
    log,
  });
}

// 한 전투를 시작부터 끝까지 한 번에 시뮬한다. 결과(최종 상태 + 로그 + 턴 수 + 소비된 포션)만
// 반환하므로 실시간 UI/오프라인 시뮬 양쪽에서 동일하게 사용 가능.
//
// `pickAction`은 player phase에서 호출. 포션 사용 결정 시 호출 측에서 보유량 체크 X —
// 함수 내부에서 잔량을 추적하고 부족하면 attack으로 폴백한다.
export type ResolveContext = {
  pickAction: (state: BattleState) => PlayerAction;
  potions: Partial<Record<PotionId, number>>;
  // 보스 전투면 BOSS_TURN_CAP 턴 경과 시 패배로 타임아웃. 일반 전투에는 영향 없음.
  isBoss?: boolean;
};

// 보스 전투 타임아웃 — 플레이어 턴 기준. 정상 빌드는 10~30턴 안에 끝나므로
// 50턴 도달은 데미지 부족 / 무한 회피 스톨로 간주, 패배 처리.
export const BOSS_TURN_CAP = 50;

export type BattleResolution = {
  outcome: BattleOutcome;
  finalState: BattleState;
  potionsConsumed: Partial<Record<PotionId, number>>;
  turns: number;
};

export function resolveBattle(
  player: PlayerCombat,
  enemy: import("../data/monsters").Monster,
  playerName: string,
  ctx: ResolveContext,
): BattleResolution {
  const potions: Partial<Record<PotionId, number>> = { ...ctx.potions };
  const consumed: Partial<Record<PotionId, number>> = {};
  let state = initialBattleState(player, enemy, playerName);
  // 보스 전투 여부 — 충돌파/천명 같은 %HP 효과 감산 (BOSS_PCT_HP_DAMAGE_MULT) 에 사용.
  if (ctx.isBoss) state = { ...state, isBoss: true };
  // 선공자 캐시 — 사이클(1턴) 정의가 선공자에 따라 달라진다.
  //   - 플레이어 선공: 사이클 = [player phase → enemy phase] — enemy→player 전환이 사이클 끝.
  //   - 적 선공:      사이클 = [enemy phase → player phase]  — player→enemy 전환이 사이클 끝.
  // 마커는 사이클 끝 시점에 다음 사이클 번호를 박는다 (단, 첫 사이클의 "1턴" 마커는 루프 진입 전 이미 박힘).
  const playerFirstStrike = state.phase === "player";
  // 턴 마커 — 그 턴 시작 시점 AP 동봉. 미장착 캐릭터도 그대로 노출 (시스템 발견용).
  const turnMarkerText = (turnNo: number, ap: number): string =>
    `${turnNo}턴 · AP ${ap}`;
  // 그 시점 HP 스냅샷 — 매 턴 종료 시 + 전투 종료 시 로그 마지막에 박는다.
  // AP 스킬 장착자만 ap/apMax 가 의미 — 미장착은 ap=0, apMax=0 (UI 핍 미표시).
  const apMaxForLog = (player.equippedAPSkills?.length ?? 0) > 0 ? AP_CAP : 0;
  const hpBarEntry = (s: BattleState): BattleLogEntry => ({
    kind: "hp_bar",
    text: "",
    turn: "player",
    playerHp: s.playerHp,
    playerMaxHp: s.playerMaxHp,
    enemyHp: s.enemyHp,
    enemyMaxHp: s.enemy.hp,
    ap: s.ap,
    apMax: apMaxForLog,
  });
  // 초기 entry (적 등장 / 선공 / 능력 안내 등) 는 player 턴으로 태깅. 첫 턴 marker 도 박는다.
  state = {
    ...state,
    log: [
      ...state.log.map((e) => ({ ...e, turn: "player" as const })),
      {
        kind: "turn_marker",
        text: turnMarkerText(1, state.ap),
        turn: "player" as const,
      },
    ],
  };
  let turns = 0;

  while (state.phase !== "ended") {
    let action: PlayerAction = { kind: "attack" };
    if (state.phase === "player") {
      const picked = ctx.pickAction(state);
      if (picked.kind === "use_potion") {
        const have = potions[picked.potionId] ?? 0;
        if (have > 0) {
          potions[picked.potionId] = have - 1;
          consumed[picked.potionId] = (consumed[picked.potionId] ?? 0) + 1;
          action = picked;
        }
      } else {
        action = picked;
      }
    }
    // advanceTurn 호출 직전의 phase 가 이번 step 의 turn — 호출 안에서 phase 가 다음으로
    // 전환되더라도, 그 사이 push 된 entry 들은 모두 이 turn 의 것이다.
    const turnContext: "player" | "enemy" = state.phase;
    const prevLogLen = state.log.length;
    const prevPhase = state.phase;
    state = advanceTurn(state, player, playerName, action);
    // 새로 추가된 entry 에만 turn 을 부여. (이미 turn 이 있는 entry — 만약 직접 박은
    // 곳이 있어도 — 는 보존.)
    if (state.log.length > prevLogLen) {
      const tagged = state.log.map((e, idx) =>
        idx < prevLogLen || e.turn ? e : { ...e, turn: turnContext },
      );
      state = { ...state, log: tagged };
    }
    // 사이클 종료 시점 — 다음 사이클 시작 직전에 턴 marker 박기 (방금 끝난 턴의
    // HP 스냅샷도 함께). completedPlayerTurns 는 player phase 종료마다 +1 되므로
    // 두 케이스 모두 turnNo = completedPlayerTurns + 1 로 일관.
    //   - 플레이어 선공: enemy→player 전환 (사이클 = 내+적)
    //   - 적 선공:      player→enemy 전환 (사이클 = 적+내)
    // 첫 사이클의 "1턴" 마커는 루프 진입 전 이미 박혔으므로 completedPlayerTurns > 0 으로 건너뛴다.
    const cycleEnded = playerFirstStrike
      ? prevPhase === "enemy" && state.phase === "player"
      : prevPhase === "player" && state.phase === "enemy";
    if (cycleEnded && state.turn.completedPlayerTurns > 0) {
      const turnNo = state.turn.completedPlayerTurns + 1;
      state = {
        ...state,
        log: appendLog(
          appendLog(state.log, hpBarEntry(state)),
          {
            kind: "turn_marker",
            text: turnMarkerText(turnNo, state.ap),
            turn: "player",
          },
        ),
      };
    }
    turns += 1;

    // 보스 타임아웃 — completedPlayerTurns 가 BOSS_TURN_CAP 도달하면 패배로 종료.
    // 일반 전투는 영향 없음 (ctx.isBoss === false).
    if (
      ctx.isBoss &&
      state.phase !== "ended" &&
      state.turn.completedPlayerTurns >= BOSS_TURN_CAP
    ) {
      const timeoutLog = appendLog(
        appendLog(state.log, {
          kind: "info",
          text: `${BOSS_TURN_CAP}턴 경과 — 보스를 쓰러뜨리지 못했다.`,
        }),
        hpBarEntry(state),
      );
      return {
        outcome: "lose",
        finalState: {
          ...state,
          log: timeoutLog,
          phase: "ended",
          outcome: "lose",
        },
        potionsConsumed: consumed,
        turns,
      };
    }

    // 무한 루프 가드 — 정상 전투는 보통 수십 턴 안에 끝난다. 만약 데미지 0/회피 100% 같은
    // 병리적 조합이면 적의 타임아웃 패배로 강제 종료.
    if (turns > 500) {
      return {
        outcome: "lose",
        finalState: {
          ...state,
          log: appendLog(state.log, hpBarEntry(state)),
          phase: "ended",
          outcome: "lose",
        },
        potionsConsumed: consumed,
        turns,
      };
    }
  }

  return {
    outcome: state.outcome!,
    finalState: { ...state, log: appendLog(state.log, hpBarEntry(state)) },
    potionsConsumed: consumed,
    turns,
  };
}

// 물약 효과 적용 — 순수 함수. 인벤토리 차감은 호출 측 책임.
export function applyPotionEffect(
  state: BattleState,
  potion: Potion,
  playerName: string,
): BattleState {
  if (potion.effect.kind === "heal_hp") {
    const heal = potionHealAmount(
      potion,
      state.playerMaxHp,
      state.buffs.potionHealPct ?? 0,
    );
    const newHp = Math.min(state.playerMaxHp, state.playerHp + heal);
    const actual = newHp - state.playerHp;
    return {
      ...state,
      playerHp: newHp,
      log: appendLog(state.log, {
        kind: "info",
        text: `${playerName}이(가) ${potion.name}을(를) 마셨다 — HP +${actual} (${state.playerHp} → ${newHp})`,
      }),
    };
  }
  return state;
}
