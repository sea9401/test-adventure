import type { Monster } from "@/adventure/data/monsters";
import type { V2Element } from "@/adventure/data/v2/elements";
import { statusNameForDebuffStat } from "@/adventure/data/v2/statusEffects";
import {
  computeMpRestoreAmount,
  type Potion,
  type PotionId,
} from "@/adventure/data/potions";
import {
  applyV2BuffsToMap,
  applyV2DotsToTarget,
  defaultV2MaxMpFor,
  decrementTimedBuffs,
  extractApEffect,
  makeBleedDot,
  makePoisonDot,
  potionHealAmount,
  resolveV2SkillCast,
  type V2SkillCastResult,
  distributeBoostedHits,
  rollAttackCount,
  tickV2BuffMap,
  tickV2Dots,
  v2AtkBuffMult,
  v2DefBuffMult,
  V2_BASE_MISS_PCT,
} from "./combatShared";
import {
  CRIT_OVERFLOW_DMG_CAP,
  CRIT_OVERFLOW_DMG_PER_PCT,
  CRIT_PCT_CAP,
  EVASION_PCT_CAP,
} from "@/adventure/data/stats";
import {
  ANALYSIS_PENALTY_CAP_PCT,
  CRIT_MULT_BASE,
  ETERNAL_GALE_ABSOLUTE_CAP,
  GALE_CHAIN_MAX_PER_TURN,
  HEAVEN_DECREE_HP_PCT,
  IMPACT_WAVE_INTERVAL,
  LUCKY_STAR_DAMAGE_MULT,
  MAGIC_VULN_STACK_CAP,
  POWER_ATTACK_TURN_INTERVAL,
  RAMPAGE_START_TURN,
  SPELL_STACK_CAP,
} from "@/adventure/data/v2/v2CombatConstants";
import {
  type APSkill,
  type APSkillCondition,
} from "@/adventure/character/apSkills";

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
      /**
       * v2 마법 시스템 MP 스냅샷. playerMaxMp=0 이면 INT 0(라이브 캐릭) — UI 는 바 안 그림.
       * 옛 로그(서버 캐시·DB)는 미동봉 → optional. PR-5b 부터 채움.
       */
      playerMp?: number;
      playerMaxMp?: number;
      /** 적 MP 스냅샷. 몬스터가 v2MaxMp 미정의면 0 → UI 비표시. */
      enemyMp?: number;
      enemyMaxMp?: number;
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
  // ── 계파 시그니처(c) 전투내 누적 — 신규. 0 = 미보유/미누적. ──
  // 강체(금강) — 받은 HP 피해 비례로 누적된 DEF 보너스(전투 내, 상한 = 기본 DEF).
  braceDefBonus: number;
  // 연격세(연환) — 적중할 때마다 누적된 ATK 보너스(전투 내, 상한).
  comboAtkBonus: number;
  // 절초(연환) — 전투 내 누적 적중 횟수(마무리 강타 주기 판정용).
  comboHitCount: number;
  // 주문 중첩(워메이지) — 전투 내 누적 스킬 시전 횟수(시전당 스킬 데미지 가산).
  spellCastCount: number;
  // 약점 노출(마도사) — 적에 누적된 마법 취약 스택(스택당 받는 마법 피해 +%).
  enemyMagicVulnStacks: number;
  // ── PR2-B-2c 스킬 temp 버프 — pct + 남은 턴(턴>0 일 때만 적용). 매 플레이어 턴 tick. ──
  skillRegenPct: number; // 운기 — 매턴 maxHP% 회복
  skillRegenTurns: number;
  skillCritPct: number; // 연환집중 — 치명률 +%
  skillCritTurns: number;
  skillEvasionPct: number; // 선풍각 — 회피 +%(PvE 죽은축, PvP 유효)
  skillEvasionTurns: number;
  enemyVulnPct: number; // 속박 — 적 받는 피해 +%(전 데미지)
  enemyVulnTurns: number;
};

export type BattleState = {
  enemy: Monster;
  enemyHp: number;
  playerHp: number;
  playerMaxHp: number;
  // v2 마법 시스템 자원. INT 가 있는 캐릭만 > 0. 단판 전투당 풀충전 모델 —
  // 전투 시작 시 = playerMaxMp, 마법 발동 시 차감.
  // 라이브 캐릭(INT=0)은 둘 다 0 — MP 바 표시·소비 메커닉 자체 비활성.
  playerMp: number;
  playerMaxMp: number;
  // v2 스킬 (v2_skill_*) 시스템 — PR-4a framework. 옛 spell 시스템 폐기 (PR-7a) — 모든 마법
  // 시전은 V2_SKILLS 카탈로그 + V2SkillsState 로 통합. MP 풀은 단판 풀충전 모델 (시작 = maxMp).
  // equipped 빈 배열이면 cast 분기 no-op. cooldown 맵은 키 없음 = ready.
  v2Skills: import("@/adventure/data/v2/v2Skills").V2SkillsState;
  v2SkillCooldowns: import("./combatShared").V2SkillCooldowns;
  // v2 스킬 selfBuff/enemyDebuff (PR-4b/PR-5b). AP buff slot 과 별개 — 동거 가능. pct 는 정수 퍼센트.
  // 매 그 사이드의 turn 진입 시 turns -1, 0 도달이면 제거.
  //   v2SelfBuffs: 플레이어가 자기에게 건 강화.
  //   v2SelfDebuffs: 적이 플레이어에게 건 약화 (PR-5b 부터 monster v2 가능).
  //   enemyV2SelfBuffs: 적이 자기에게 건 강화 (PR-5b 부터, monster v2 cast 결과).
  //   enemyV2Debuffs: 플레이어가 적에게 건 약화.
  // damage 계산에 stat 곱셈 반영 — PR-5a 부터 일반 공격에도 적용 (격리 해제).
  v2SelfBuffs: import("./combatShared").V2BuffMap;
  v2SelfDebuffs: import("./combatShared").V2BuffMap;
  enemyV2SelfBuffs: import("./combatShared").V2BuffMap;
  enemyV2Debuffs: import("./combatShared").V2BuffMap;
  // PR-5b — monster 의 v2 자원. equipped 가 있고 maxMp > 0 일 때만 cast 활성.
  // 라이브 잡몹(v2Skills 미장착)은 둘 다 0 → cast no-op. 단판 풀충전 모델.
  enemyV2Skills: import("@/adventure/data/v2/v2Skills").V2SkillsState;
  enemyV2SkillCooldowns: import("./combatShared").V2SkillCooldowns;
  enemyMp: number;
  enemyMaxMp: number;
  // PR-8 — v2 DoT (지속 피해). dot effect 가 target 에 박힌 결과.
  //   playerV2Dots: 적이 player 에 박은 DoT (매 player turn 진입 시 tick → playerHp 차감).
  //   enemyV2Dots: player 가 적에 박은 DoT (매 enemy phase 진입 시 tick → enemyHp 차감).
  // DEF 무시. 같은 label 은 refresh (덮어쓰기).
  playerV2Dots: import("./combatShared").V2Dot[];
  enemyV2Dots: import("./combatShared").V2Dot[];
  log: BattleLogEntry[];
  phase: BattlePhase;
  outcome: BattleOutcome | null;
  playerAttacksLeft: number;
  turn: BattleTurnState;
  flags: BattleFlags;
  buffs: BattleBuffs;
  stacks: BattleStacks;
  /** 보스 전투 여부 — 충돌파/천명 같은 %HP 효과가 BOSS_PCT_HP_DAMAGE_MULT 로 감산. */
  isBoss?: boolean;
};

/** 보스에 대한 %HP 비례 추가 데미지(충돌파/천명) 감산 계수. 1.0 = 그대로, 0.1 = 1/10. */
export const BOSS_PCT_HP_DAMAGE_MULT = 0.1;

// 절초 (연환 시그니처) — 누적 적중 N타째마다 마무리 강타. 구조적 주기(위력은 데이터 comboFinisherBonusPct).
const COMBO_FINISHER_PERIOD = 4;
// SPELL_STACK_CAP·MAGIC_VULN_STACK_CAP(주문중첩·약점노출 누적 상한)은 v2CombatConstants 로
// 이관 — PvE/PvP 공용(무한 인플레 방지, 위력은 데이터 pct 다이얼).

export type PlayerCombat = {
  hp: number;
  maxHp: number;
  // v2 마법 시스템 — derive 에서 INT × MP_PER_INT + V2_BASE_MP 로 계산.
  // INT 0 인 캐릭(라이브) 은 0/undefined → 전투 메커닉·UI 자동 비활성.
  // optional 로 둠 — 라이브 PlayerCombat 객체 리터럴(테스트 다수)이 매번 안 박아도 되게.
  maxMp?: number;
  // 현재 mp — character.v2.mp 저장값. 미지정이면 maxMp 풀충전 (옛 단판 모델 fallback).
  // 사냥 후 finalState.playerMp 가 character.v2.mp 에 저장 → 다음 사냥 시 그대로 시드.
  mp?: number;
  // v2 스킬 데미지 계산용 INT total (derive 결과 totalStats.int 그대로). v2 스킬에서 int stat
  // buff/debuff 보정 등에 사용. 0/undefined = no-op.
  intStat?: number;
  // v2 스킬 — 나한권(VIT 비례 딜) 스케일용 VIT total, 계파 스킬 차수 flat(baseFlatByTier) 해석용 차수.
  vitStat?: number;
  classTier?: number;
  atk: number;
  // v2 마법 공격력(magicAtk = INT 환산). scaling="magic" 스킬이 atk 대신 이 값으로 스케일.
  // 0/undefined(라이브·STR/DEX 빌드·적) = 마법 경로 비활성, v2DamageAmount 가 atk 로 폴백.
  magicAtk?: number;
  def: number;
  spd: number; // 선공 판정에 사용
  evasionPct: number; // 0~100, 적 공격 회피 확률
  // v2 명중률 (PR-6) — 적 evasionPct 에서 %p 차감. 0/undefined = 차감 없음(라이브 기존 동작).
  // 라이브 적의 `enemy.accuracy` 와 대칭. v2 derive 가 totalStats.dex × 0.25 로 채움.
  accuracyPct?: number;
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
  // PR-2 v2 전투 재설계 신규 축 — 옵셔널 (라이브 미사용, v2 경로만 읽음).
  // magicDef: scaling="magic" 데미지에서 차감(combatShared). critResistPct: 피격 시 상대 치명 확률 −%p.
  // minDamage: 데미지 하한. healMult: heal effect 스케일(1.0=무영향).
  magicDef?: number;
  critResistPct?: number;
  minDamage?: number;
  healMult?: number;
  // PR-5b v2 — 평타 속성(무기 ?? 캐릭, atk 에 baked)·캐릭 속성(스킬 기본·피격 방어). 미지정=neutral.
  attackElement?: V2Element;
  characterElement?: V2Element;
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
  // 출혈 — 적중 시 tagged DoT 로 출혈 1스택. flat + ATK 계수, DEF 무시.
  bleedOnHit?: { flatPerStack: number; atkCoefPerStack: number };
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
  // 관통(pierce) — flat. 플레이어가 굴리는 모든 공격에서 적 facing DEF 에서 직접 차감. 0/undefined = 미보유.
  enchantPierceFlat?: number;
  // 폭주(berserk) — 자신 HP 30% 이하일 때 ATK 곱연산 +%. atk 최종값에 멀티 적용. 0/undefined = 미보유.
  enchantBerserkBonusPct?: number;
  // 파괴(breaker) — 보스 적에게 가하는 모든 피해에 곱연산 +%. isBoss 일 때만. 0/undefined = 미보유.
  enchantBreakerBossBonusPct?: number;
  // 흡혈(lifesteal) — 가한 피해의 % 만큼 HP 회복. runeLifestealPct 와 합산되는 별개 라벨. 0/undefined = 미보유.
  enchantLifestealPct?: number;
  // 중독 — 적중 시 tagged DoT 로 중독 1스택. 최대HP 비례 + ATK cap, DEF 무시.
  poisonOnHit?: { pctMaxHpPerStack: number };
  // 처형(execute) — 적 HP 25% 이하일 때 추가 피해(%). executionDamageMult 가 0 이면 25%/1+pct 로 자동 시드,
  // 기존 처형 스킬과 같이 보유 시 곱연산으로 더해진다. 0/undefined = 미보유.
  enchantExecuteBonusPct?: number;
  // ── 직업 패시브 (v2 직업색 — 시그니처 대체) — v2Passives.ts·derive 가 채움 ──
  // 2026-06-03 재설계: 직업군당 효과 1개. (검사 atk+STR·인술 critMult 는 derive 에서 끝, 엔진 필드 없음.)
  // 사제 — 매 플레이어 턴 시작 시 maxHp 의 %만큼 회복. enchantRegenPctPerTurn 과 별개 누적. 0/undefined=미보유.
  passiveTurnHealPctMaxHp?: number;
  // 궁수 — 평타 방어 관통(%). 적 def 에서 그만큼 추가 무시(assassin/AP 30% 레이어 뒤 곱). 0/undefined=미보유.
  passiveDefPenetrationPct?: number;
  // 무도가 — 피격 생존 시 chancePct% 로 적에게 ATK 반격(반격의 룬과 동일 패턴). 0/undefined=미보유.
  passiveCounterChancePct?: number;
  // 마법사 — 평타를 마법공격력(magicAtk) 기반으로 전환, 적 magicDef(없으면 def 폴백)로 경감. undefined=미보유.
  passiveMagicBasicAttack?: boolean;
  // 계파 패시브(철벽검류 등) — 받는 피해 -pct%(항상 활성, 곱연산). enchantEndurePct 와 동류,
  // 가드/평탄감소 전. derive 가 계파 aggregate(받피감)로 채움. 0/undefined=미보유.
  // docs/v2-job-spec-passives-plan.md §3-A·§6. (P3b 엔진 훅 — P3c derive 가 주입.)
  passiveDamageTakenReductionPct?: number;
  // 워메이지 주문 연사 — 스킬 발동 확률 %p 가산(resolveV2SkillCast 의 procChance 에 합산). 0/undefined=미보유.
  skillProcChanceAdd?: number;
  // 워메이지 마력 순환 — 매 플레이어 턴 종료 시 MP 회복(flat). HP 회복과 독립. 0/undefined=미보유.
  mpRegenPerTurn?: number;
  // 기사 흘려막기 — 피격 시 % 확률로 피해 완전 무효(enchant 가드와 동류 지점). 0/undefined=미보유.
  damageNullifyChancePct?: number;
  // 궁사 난사 — 그 턴 첫 타가 아닌 추가타 데미지 +%(다단 히트 본체 강화). 0/undefined=미보유.
  extraHitDmgPct?: number;
  // 독사 부식 — 중독(출혈 스택)된 적의 DEF -pct%(playerFacingEnemyDef 곱연산). 0/undefined=미보유.
  poisonedEnemyDefReductionPct?: number;
  // 검투사 혈광 — 적 출혈 중이면 그 턴 공격 횟수 굴림에 추가 공격 확률 +%p(속도=연타). 0/undefined=미보유.
  extraAttackChancePctWhileEnemyBleeding?: number;
  // ── 계파 시그니처(c) 전투내 누적형 ──
  // 금강 강체 — 받은 HP 피해의 %를 DEF 로 누적(state.stacks.braceDefBonus, 상한=기본 DEF). 0/undefined=미보유.
  defGainOnHitPct?: number;
  // 연환 연격세 — 적중당 ATK 의 %를 ATK 로 누적(state.stacks.comboAtkBonus). 0/undefined=미보유.
  comboAtkPctPerHit?: number;
  // 연환 절초 — COMBO_FINISHER_PERIOD 타째 본타에 데미지 +%(마무리 강타). 0/undefined=미보유.
  comboFinisherBonusPct?: number;
  // 워메이지 주문 중첩 — 스킬 시전마다 그 이후 스킬 데미지 +%(state.stacks.spellCastCount × pct). 0/undefined=미보유.
  skillDmgPctPerCast?: number;
  // 마도사 약점 노출 — 스킬 적중 시 적 마법취약 +1스택, 스택당 받는 마법피해 +%. 0/undefined=미보유.
  enemyMagicVulnPctPerStack?: number;
  // 워메이지 절제(직업 특성) — 스킬 마나 소모 -pct%(시전 시 소모분 일부 환급). 0/undefined=미보유.
  mpCostReductionPct?: number;
};



// AP 스킬 발동 슬롯 형태 — v2 미장착이라 런타임 비활성이나, apSel no-op scaffolding 의
// 타입 앵커로 유지(발동 경로·조건평가 함수는 제거됨).
export type EquippedAPSkill = { skill: APSkill; condition: APSkillCondition };

export type PlayerAction =
  | { kind: "attack" }
  | { kind: "use_potion"; potionId: PotionId; potion: Potion };

// 로그는 전체 보관 — 종료 후 알림에 첨부되는 battleLog 도 같은 배열을 사용한다.
// BattleScene 은 스크롤 컨테이너라 길이가 늘어도 UX 영향 없음.
//
// 자동사냥 시뮬(offlineSim)은 전투 로그를 전혀 안 읽는데, 수천 전투 × 수천 턴 동안 매
// appendLog 가 [...log] 로 점점 커지는 배열을 복사해 O(턴²) 의 순수 낭비가 쌓인다. 시뮬은
// setBattleLogCollection(false) 로 꺼서 appendLog 가 같은 배열 ref 를 그대로 반환(복사·증가
// 0)하게 한다. simulateOfflineHunt 는 완전 동기라 try/finally 로 감싸면 동시 요청과 간섭하지
// 않는다. 라이브/PvP 는 기본 on 이라 로그 동작이 byte-identical 하다.
let battleLogCollectionEnabled = true;
export function setBattleLogCollection(enabled: boolean): void {
  battleLogCollectionEnabled = enabled;
}

export function appendLog(
  log: BattleLogEntry[],
  entry: BattleLogEntry,
): BattleLogEntry[] {
  return battleLogCollectionEnabled ? [...log, entry] : log;
}

// 데미지 최소 비율 — 순수 감산(atk-def)이 0 이하가 되는 "방어력 임계 초과 = 1딜 고정" 절벽을 완화.
// 공격력의 이 비율(올림)만큼은 항상 들어간다. 정상 장비 구간에선 atk-def 가 항상 더 커서 무의미하고,
// def 가 atk 의 ~0.85 배를 넘는 (= 한참 저장비/저레벨) 구간에서만 체감된다.
// 플레이어↔적 양쪽 공격에 모두 적용 — 방어력을 무한 적층해 무피격이 되는 것도 같이 막힌다.
export const DAMAGE_FLOOR_FRACTION = 0.15;

// 방어 관통 비율 — 암살/약점 적중/DEF무시 AP 스킬이 무시하는 적 DEF 비율.
// 2026-05-23: 완전 무시(DEF 0)가 "선턴 이김"·방어 무력화의 주범이라, 0.3(30%)만 무시하도록
// 완화. 방어 투자가 70% 는 항상 유효. (정확 스킬의 비례 관통도 같은 0.3 캡 — skills.ts)
export const DEF_IGNORE_FRACTION = 0.3;

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
  // 호출 측에서 시한부 버프가 반영된 buffs 를 전달(없으면 state.buffs).
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
  // 약점 노출 (AP) — 적 DEF -pct%. 곱연산.
  const afterDebuff =
    buffs.enemyDefDebuffTurnsLeft > 0 && buffs.enemyDefDebuffPct > 0
      ? Math.round(afterEnchantPierce * (1 - buffs.enemyDefDebuffPct / 100))
      : afterEnchantPierce;
  // 부식 (독사 시그니처) — 중독된 적의 DEF -pct%. 곱연산으로 마지막에.
  const corrodePct = player.poisonedEnemyDefReductionPct ?? 0;
  return corrodePct > 0 && isEnemyPoisoned(state)
    ? Math.round(afterDebuff * (1 - corrodePct / 100))
    : afterDebuff;
}

function isEnemyBleeding(state: BattleState): boolean {
  return state.enemyV2Dots.some((d) => d.tag === "bleed" && d.stacks > 0 && d.turns > 0);
}

function isEnemyPoisoned(state: BattleState): boolean {
  return state.enemyV2Dots.some((d) => d.tag === "poison" && d.stacks > 0 && d.turns > 0);
}

function applyPlayerOnHitDots(
  state: BattleState,
  player: PlayerCombat,
  add?: { bleedStacks?: number; poisonStacks?: number },
): BattleState {
  const dots: import("./combatShared").V2Dot[] = [];
  const bleedStacks =
    (add?.bleedStacks ?? 0) + (player.bleedOnHit ? 1 : 0);
  if (bleedStacks > 0) {
    dots.push(makeBleedDot({
      stacks: bleedStacks,
      flatPerStack: player.bleedOnHit?.flatPerStack ?? 0,
      sourceAtk: player.atk,
    }));
  }
  const poisonStacks =
    (add?.poisonStacks ?? 0) + (player.poisonOnHit ? 1 : 0);
  if (player.poisonOnHit && poisonStacks > 0) {
    dots.push(makePoisonDot({
      stacks: poisonStacks,
      pctMaxHpPerStack: player.poisonOnHit.pctMaxHpPerStack,
      sourceAtk: player.atk,
    }));
  }
  if (dots.length === 0) return state;
  return {
    ...state,
    enemyV2Dots: applyV2DotsToTarget(state.enemyV2Dots, dots),
  };
}

// 다음 플레이어 턴의 공격 횟수. 로직(100% 초과 = 정수부 확정 추가타 + 나머지 확률)은
// combatShared.rollAttackCount 로 단일화 — PvP 엔진과 공유해 한쪽만 바뀌는 divergence 방지.
// export — offlineSim 의 시전 턴 종료가 resolveBattle 과 동일하게 다음 턴 공격수를 재굴림하도록.
export function rollPlayerAttackCount(player: PlayerCombat): number {
  return rollAttackCount(player);
}

// 혈광 (검투사 시그니처) — 적이 출혈 중이면 그 턴 공격 횟수 굴림에 추가 공격 확률 +%p.
// rollPlayerAttackCount 를 감싸 enemyBleeding 일 때만 extraAttackChancePct 를 부풀린다.
// 미보유(0/undefined)·출혈 없음이면 그대로 통과 → 라이브/비계파 무변.
function rollPlayerAttackCountWithBleed(
  state: BattleState,
  player: PlayerCombat,
): number {
  const bonus = player.extraAttackChancePctWhileEnemyBleeding ?? 0;
  if (bonus <= 0 || !isEnemyBleeding(state)) {
    return rollPlayerAttackCount(player);
  }
  return rollPlayerAttackCount({
    ...player,
    extraAttackChancePct: (player.extraAttackChancePct ?? 0) + bonus,
  });
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
  // PR-5a: v2 buff/debuff 격리 해제 — 반격 데미지도 일반 공격과 동일하게 v2 buff 곱셈.
  const v2AtkMult = v2AtkBuffMult(state.v2SelfBuffs, state.v2SelfDebuffs);
  const v2DefMult = v2DefBuffMult(state.enemyV2SelfBuffs, state.enemyV2Debuffs);
  const atk = v2AtkMult !== 1
    ? Math.floor((player.atk + bonus) * v2AtkMult)
    : player.atk + bonus;
  const def = playerFacingEnemyDef(state, player);
  const v2EffDef = v2DefMult !== 1 ? Math.floor(def * v2DefMult) : def;
  const dmg = damageBetween(atk, v2EffDef);
  const enemyHp = Math.max(0, state.enemyHp - dmg);
  let next: BattleState = {
    ...state,
    enemyHp,
    log: appendLog(state.log, {
      kind: "player_attack",
      text: `[반격] ${dmg} 피해를 입혔다.`,
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

// 매 플레이어 턴 종료 시 자가 회복 — 직업 패시브 가호(HP %) + 워메이지 마력 순환(MP flat).
function applyPassiveTurnHealIfAny(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  // 워메이지 마력 순환 — MP 회복(flat). HP 회복과 독립이라 HP 가 가득이어도 돈다.
  // MP 가 자원화된 v2 에서 시전 페이스를 받쳐 주는 시그니처.
  let s = state;
  const mpRegen = player.mpRegenPerTurn ?? 0;
  if (
    mpRegen > 0 &&
    s.turn.completedPlayerTurns > 0 &&
    s.playerMp < s.playerMaxMp
  ) {
    const newMp = Math.min(s.playerMaxMp, s.playerMp + mpRegen);
    const actualMp = newMp - s.playerMp;
    if (actualMp > 0) {
      s = {
        ...s,
        playerMp: newMp,
        log: appendLog(s.log, {
          kind: "info",
          text: `[마력 순환] ${playerName}의 MP +${actualMp}`,
        }),
      };
    }
  }

  const pct = player.passiveTurnHealPctMaxHp ?? 0;
  if (pct <= 0) return s;
  if (s.turn.completedPlayerTurns === 0) return s;
  if (s.playerHp >= s.playerMaxHp) return s;
  const heal = Math.floor((s.playerMaxHp * pct) / 100);
  if (heal <= 0) return s;
  const newHp = Math.min(s.playerMaxHp, s.playerHp + heal);
  const actual = newHp - s.playerHp;
  return {
    ...s,
    playerHp: newHp,
    log: appendLog(s.log, {
      kind: "info",
      text: `[가호] ${playerName}의 HP +${actual}`,
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
  // 메인 데미지 라인 — 라벨에 행운의 별/천명 합쳐 박는다.
  const dmgLabels: string[] = [label];
  if (luckyStarFires) dmgLabels.push("행운의 별");
  if (decreeFires) dmgLabels.push("천명");
  let log = appendLog(state.log, {
    kind: "player_attack",
    text: `[${dmgLabels.join(" + ")}] ${totalDmg} 피해를 입혔다.`,
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

  let next = applyPhaseTriggerIfAny(applyPlayerOnHitDots({
    ...state,
    enemyHp,
    playerHp: newPlayerHp,
    log,
  }, player));
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
// export — offlineSim 의 시전 턴 종료가 resolveBattle 과 동일한 턴 종료 효과(재생·격노 등)를 거치도록.
// ⚠️ 선행조건: 호출 전에 state.turn.completedPlayerTurns 가 이미 +1 된 상태여야 한다
// (막다른 격노 발동 턴·재생 주기 modulo 판정이 이 값을 기준으로 한다).
// PR2-B-2c — 스킬 temp 버프(운기/연환집중/선풍각/속박)를 cast 결과로 갱신. tick 이 턴 종료
// (finishPlayerTurn)에 효과 적용 후 -1 하므로, 시드 = turns 그대로(시전 턴 포함 정확히 N턴).
// (구 +1 시드는 버그 — Codex 검토: 3턴 선언이 4번 발동했음.)
function applySkillTempBuffs(
  prev: BattleStacks,
  result: V2SkillCastResult,
): BattleStacks {
  const crit = result.selfBuffPctToApply.find((b) => b.target === "crit");
  const eva = result.selfBuffPctToApply.find((b) => b.target === "evasion");
  return {
    ...prev,
    skillRegenPct: result.selfRegenToApply?.pctMaxHpPerTurn ?? prev.skillRegenPct,
    skillRegenTurns: result.selfRegenToApply ? result.selfRegenToApply.turns : prev.skillRegenTurns,
    skillCritPct: crit?.pct ?? prev.skillCritPct,
    skillCritTurns: crit ? crit.turns : prev.skillCritTurns,
    skillEvasionPct: eva?.pct ?? prev.skillEvasionPct,
    skillEvasionTurns: eva ? eva.turns : prev.skillEvasionTurns,
    enemyVulnPct: result.enemyVulnToApply?.pct ?? prev.enemyVulnPct,
    enemyVulnTurns: result.enemyVulnToApply ? result.enemyVulnToApply.turns : prev.enemyVulnTurns,
  };
}

export function finishPlayerTurn(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  let st = state;
  // PR2-B-2c — 운기 리젠(매턴 maxHP%) 적용 후 전 temp 버프 tick(turns -1).
  {
    const s = st.stacks;
    if (s.skillRegenTurns > 0 && s.skillRegenPct > 0 && st.playerHp > 0) {
      const heal = Math.floor((st.playerMaxHp * s.skillRegenPct) / 100);
      const before = st.playerHp;
      const nextHp = Math.min(st.playerMaxHp, before + heal);
      if (nextHp > before) {
        st = {
          ...st,
          playerHp: nextHp,
          log: appendLog(st.log, {
            kind: "info",
            text: `[운기] ${playerName}의 HP +${nextHp - before}`,
            turn: "player",
          }),
        };
      }
    }
    st = {
      ...st,
      stacks: {
        ...st.stacks,
        skillRegenTurns: Math.max(0, s.skillRegenTurns - 1),
        skillCritTurns: Math.max(0, s.skillCritTurns - 1),
        skillEvasionTurns: Math.max(0, s.skillEvasionTurns - 1),
        enemyVulnTurns: Math.max(0, s.enemyVulnTurns - 1),
      },
    };
  }
  // 분신/난무 추가타 ATK — 메인 공격이 적용한 AP 시한부 ATK 버프(광기 등) 를 동일하게 반영.
  // state.buffs 는 이 시점에 이번 턴의 timed buff 가 박힌 상태.
  const buffedAtkPct =
    st.buffs.playerAtkBuffTurnsLeft > 0 ? st.buffs.playerAtkBuffPct : 0;
  const buffedAtk =
    buffedAtkPct > 0
      ? player.atk + Math.floor((player.atk * buffedAtkPct) / 100)
      : player.atk;
  // PR-5a: 그림자 분신·무피해 난무 모두 v2 buff/debuff 격리 해제 적용.
  const v2AtkMultExtra = v2AtkBuffMult(st.v2SelfBuffs, st.v2SelfDebuffs);
  const v2DefMultExtra = v2DefBuffMult(st.enemyV2SelfBuffs, st.enemyV2Debuffs);
  const applyV2Atk = (rawAtk: number): number =>
    v2AtkMultExtra !== 1 ? Math.floor(rawAtk * v2AtkMultExtra) : rawAtk;
  const applyV2Def = (rawDef: number): number =>
    v2DefMultExtra !== 1 ? Math.floor(rawDef * v2DefMultExtra) : rawDef;
  // 그림자 분신 — ATK 의 N% 로 1회. 6티어 그림자 군단 보유 시 추가 횟수만큼 더 발동.
  const clonePct = player.shadowCloneAtkPct ?? 0;
  const cloneExtra = player.shadowLegionExtraClones ?? 0;
  const cloneCount = clonePct > 0 ? 1 + cloneExtra : 0;
  if (st.phase !== "ended" && cloneCount > 0) {
    for (let i = 0; i < cloneCount; i += 1) {
      if (st.phase === "ended") break;
      const cloneDmg = damageBetween(
        applyV2Atk(Math.floor((buffedAtk * clonePct) / 100)),
        applyV2Def(playerFacingEnemyDef(st, player)),
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
      const fd = damageBetween(
        applyV2Atk(buffedAtk),
        applyV2Def(playerFacingEnemyDef(st, player)),
      );
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
  // 약점 분석 (5티어) — 매 플레이어 턴 종료 시 적 ATK·DEF 누적 페널티 +N, 단 raw stat 의
  // ANALYSIS_PENALTY_CAP_PCT 까지만. 캡 없는 무한 누적이 자동 사냥 부활 페널티와 결합해
  // DEX 빌드 wins 가 비선형 폭증하던 사고 차단. 캡 도달 후엔 누적 멈춤 — 로그도 갱신 시에만.
  const analysis = player.analysisPerTurn ?? 0;
  if (analysis > 0) {
    const atkCap = Math.floor(st.enemy.atk * ANALYSIS_PENALTY_CAP_PCT);
    const defCap = Math.floor(st.enemy.def * ANALYSIS_PENALTY_CAP_PCT);
    const nextAtkPen = Math.min(atkCap, st.buffs.enemyAtkPenalty + analysis);
    const nextDefPen = Math.min(defCap, st.buffs.enemyDefPenalty + analysis);
    if (
      nextAtkPen > st.buffs.enemyAtkPenalty ||
      nextDefPen > st.buffs.enemyDefPenalty
    ) {
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
  }
  st = applyBaselineRegenIfAny(st, player, playerName);
  st = applyRegenIfAny(st, player, playerName);
  st = applyEnchantRegenIfAny(st, player, playerName);
  st = applyPassiveTurnHealIfAny(st, player, playerName);
  return st;
}

// 선공 — SPD가 높은 쪽이 먼저 공격. 동점이면 플레이어 우선.
export function initialBattleState(
  player: PlayerCombat,
  enemy: Monster,
  playerName: string,
  v2Skills: import("@/adventure/data/v2/v2Skills").V2SkillsState = { learned: [], equipped: [] },
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
  // 전투 시작 시 MP 시드 — character.v2.mp 가 있으면 그 값, 없으면 maxMp (옛 단판 모델 fallback).
  // PR-potion-auto-restore 이후 단판 풀충전 폐기 — mp 가 사냥 사이 보존되고 포션으로 회복.
  const playerMaxMp = Math.max(0, player.maxMp ?? 0);
  const playerMpStart = Math.min(
    playerMaxMp,
    Math.max(0, player.mp ?? playerMaxMp),
  );
  return {
    enemy,
    enemyHp: enemy.hp,
    playerHp: player.hp,
    playerMaxHp: player.maxHp,
    playerMp: playerMpStart,
    playerMaxMp,
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
      chillStacks: 0,
      playerShield: startShield,
      evadesRemaining: player.guaranteedEvades ?? 0,
      damageTakenThisCombat: 0,
      weakpointDefIgnoreLeft: 0,
      braceDefBonus: 0,
      comboAtkBonus: 0,
      comboHitCount: 0,
      spellCastCount: 0,
      enemyMagicVulnStacks: 0,
      skillRegenPct: 0,
      skillRegenTurns: 0,
      skillCritPct: 0,
      skillCritTurns: 0,
      skillEvasionPct: 0,
      skillEvasionTurns: 0,
      enemyVulnPct: 0,
      enemyVulnTurns: 0,
    },
    // 장착된 AP 스킬이 있을 때만 의미. 없으면 그냥 0 으로 두고 회복/소비 노옵.
    v2Skills,
    v2SkillCooldowns: {},
    v2SelfBuffs: {},
    v2SelfDebuffs: {},
    enemyV2SelfBuffs: {},
    enemyV2Debuffs: {},
    // PR-5b — monster.v2Skills 가 있으면 enemy v2 시드. 없으면 빈 배열로 무력화.
    // v2MaxMp 미지정 시 defaultV2MaxMpFor (equipped 의 max mpCost × 3) 로 자동 시드.
    enemyV2Skills: enemy.v2Skills ?? { learned: [], equipped: [] },
    enemyV2SkillCooldowns: {},
    enemyMp: enemy.v2MaxMp !== undefined
      ? Math.max(0, enemy.v2MaxMp)
      : defaultV2MaxMpFor(enemy.v2Skills ?? { learned: [], equipped: [] }),
    enemyMaxMp: enemy.v2MaxMp !== undefined
      ? Math.max(0, enemy.v2MaxMp)
      : defaultV2MaxMpFor(enemy.v2Skills ?? { learned: [], equipped: [] }),
    // PR-8 — DoT 시작 시 빈 배열. cast 결과로 박힘.
    playerV2Dots: [],
    enemyV2Dots: [],
  };
}

// AP 지속 효과 라운드 카운터 -1. 새 플레이어 턴 진입 시(직전 적 페이즈 종료 후)
// 호출되어 결의/광기/약점 노출/둔화/폭주 의 turnsLeft 를 1씩 깎고 0 으로 클램프.
// pct/mult 값은 그대로 두지만 turnsLeft 가 0 이면 적용 쪽에서 무시한다.
function decrementTimedEffects(buffs: BattleBuffs): BattleBuffs {
  return decrementTimedBuffs(buffs);
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
  const enteringEnemyPhase =
    state.phase === "enemy" && state.turn.enemyAttacksLeft <= 0;
  if (enteringEnemyPhase) {
    state = {
      ...state,
      turn: {
        ...state.turn,
        enemyAttacksLeft: rollEnemyAttackCount(state.enemy),
      },
    };
    const enemyDotTick = tickV2Dots(state.enemyV2Dots, state.enemy.hp);
    if (enemyDotTick.totalDmg > 0) {
      const newHp = Math.max(0, state.enemyHp - enemyDotTick.totalDmg);
      state = applyPhaseTriggerIfAny({
        ...state,
        enemyHp: newHp,
        enemyV2Dots: enemyDotTick.nextDots,
        log: appendLog(state.log, {
          kind: "player_attack",
          text: `[${state.enemyV2Dots
            .filter((d) => d.turns > 0)
            .map((d) => d.label)
            .join(" + ")}] ${enemyDotTick.totalDmg} 피해를 입혔다.`,
        }),
      });
      if (state.enemyHp <= 0) {
        return {
          ...state,
          log: appendLog(state.log, {
            kind: "info",
            text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
          }),
          phase: "ended",
          outcome: "win",
        };
      }
    } else {
      state = { ...state, enemyV2Dots: enemyDotTick.nextDots };
    }
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
        playerAttacksLeft: rollPlayerAttackCountWithBleed(next, player),
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

    // AP 스킬 — 그 턴 첫 공격 명중에 슬롯 순서로 최대 3개 발동. 공격형은 최대 1개.
    // AP 스킬은 v2 미장착(equippedAPSkills 항상 빈값) — 발동 경로 제거, no-op 상수로 통과.
    const apSel: {
      offensive: EquippedAPSkill | null;
      utilities: EquippedAPSkill[];
      totalCost: number;
    } = { offensive: null, utilities: [], totalCost: 0 };
    const apOffensiveFires = apSel.offensive;
    const apUtilityFires = apSel.utilities;
    const apAllFired = apOffensiveFires
      ? [apOffensiveFires, ...apUtilityFires]
      : apUtilityFires;
    const apOffensiveSkill = apOffensiveFires?.skill ?? null;
    const apAllFiredSkills = apAllFired.map((e) => e.skill);
    // atk_multiplier 계열 효과 — 광살참(multi_hit_self_damage)과 천뢰 일격
    // (atk_multiplier_with_silence) 도 atkMult/ignoresDef/ignoresEvasion 을 공유.
    // apMultEffect 는 아래(atk_plus_spd_pct_bonus·multi_hit_self_damage 자해)에서도 쓰여 유지.
    // atkMult/ignoresDef/ignoresEvasion/hits 파생은 combatShared.extractApEffect 로 단일화
    // (PvP 엔진과 공유 — ignoresEvasion = true 면 적 회피 굴림 스킵, 광살참 hits = N 번 누적).
    const apMultEffect = apOffensiveSkill?.effect;
    const {
      atkMult: apAtkMult,
      ignoresDef: apIgnoresDef,
      ignoresEvasion: apIgnoresEvasion,
      hits: apHits,
    } = extractApEffect(apMultEffect);

    // 적 회피 — 데미지 굴리기 전에 1차 판정. 회피하면 공격 1회가 그대로 빗나간다.
    // 정확 슬롯 시 적 evasion 에 배수(<1) 가 곱해져 부분 무력화.
    // v2 명중률(PR-6): player.accuracyPct 가 적 evasion 에서 %p 차감. 0/undefined =
    // 차감 없음(라이브 기존 동작 보존). 라이브 enemy.accuracy 와 대칭.
    // AP 스킬의 ignoresEvasion = true 면 회피 판정 자체 스킵.
    const precisionMult = player.precisionEvasionMult ?? 1;
    const rawEnemyEvasionPct = (state.enemy.evasionPct ?? 0) * precisionMult;
    const playerAccuracy = player.accuracyPct ?? 0;
    // 기본 명중 90%(빗나감 10%) + 적 회피 − 내 명중 (하한 없음 — 고회피 적은 그대로).
    const missPct = Math.max(
      0,
      V2_BASE_MISS_PCT + rawEnemyEvasionPct - playerAccuracy,
    );
    if (!apIgnoresEvasion && missPct > 0 && Math.random() * 100 < missPct) {
      const log = appendLog(state.log, {
        kind: "player_attack",
        text:
          rawEnemyEvasionPct > 0
            ? `${state.enemy.name}이(가) 공격을 피했다.`
            : "공격이 빗나갔다.",
      });
      const attacksLeft = state.playerAttacksLeft - 1;
      if (attacksLeft > 0) {
        return {
          ...state,
          log,
          playerAttacksLeft: attacksLeft,
          turn: { ...state.turn, firstAttackPending: false },
        };
      }
      const ended: BattleState = {
        ...state,
        log,
        phase: "enemy",
        playerAttacksLeft: rollPlayerAttackCountWithBleed(state, player),
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
          // fatedChainCritPending 은 "다음 공격" 까지 살아 있어야 하므로 턴 경계에서 리셋 안 함.
        },
      };
      return finishPlayerTurn(ended, player, playerName);
    }

    // AP 스킬 시한부 버프 — 발동턴 damage calc 부터 효과 받도록 buffs 를 미리 갱신.
    // decrementTimedEffects 는 다음 플레이어 턴 진입 시 -1 → 발동턴 + (turns-1) 후속턴 = 총 turns 턴.
    // evasion 직후이라 — 회피된 공격에는 AP 가 발동 안 하니 그 분기는 위에서 이미 return 된 상태.
    const nextBuffsTimed = state.buffs;

    // 암살 (특기) — 전투 첫 공격이면 발동: 적 DEF 무시 + 데미지 배수 (배수는 아래에서 적용).
    const assassinFires =
      (player.assassinateDmgMult ?? 0) > 1 &&
      !state.flags.assassinateUsed &&
      state.turn.completedPlayerTurns === 0 &&
      isFirstAttackOfTurn;
    // 약점 적중 (2티어 특기) — 큐가 있으면 이 공격은 적 DEF 일부 관통. 트리거 자체는 아래 크리 처리 후.
    const weakpointDefIgnore = state.stacks.weakpointDefIgnoreLeft > 0;
    // 분쇄 — 강공격 발동 턴, 그 공격에 한해 적 DEF -crushDefReduction (분쇄 먼저 적용).
    // baseDef 는 보스 취약(armorVulnerable) + 정확(armorPierceFraction) 비례 관통이 이미 반영된 값.
    // 2026-05-23: 암살/약점/AP 의 방어 관통은 완전 무시(0)가 아니라 DEF_IGNORE_FRACTION(30%)만 무시.
    // 분쇄(고정 감산) 후 30% 관통을 곱연산으로 적용 — 방어 투자가 70% 는 항상 유효.
    const crushReduction = player.crushDefReduction ?? 0;
    const baseDef = playerFacingEnemyDef(state, player, nextBuffsTimed);
    const afterCrush =
      bonus > 0 && crushReduction > 0
        ? Math.max(0, baseDef - crushReduction)
        : baseDef;
    const afterIgnore =
      assassinFires || weakpointDefIgnore || apIgnoresDef
        ? Math.round(afterCrush * (1 - DEF_IGNORE_FRACTION))
        : afterCrush;
    // 궁수 패시브 — 평타 방어 관통(%). 위 30% 무시 레이어 뒤에 곱연산(방어 투자가 항상 일부 유효).
    const archerPenPct = player.passiveDefPenetrationPct ?? 0;
    const targetDef =
      archerPenPct > 0
        ? Math.round(afterIgnore * (1 - archerPenPct / 100))
        : afterIgnore;
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
    const baseCritPct =
      (player.critChancePct ?? 0) +
      // PR2-B-2c 연환집중 — 치명률 temp 버프.
      (state.stacks.skillCritTurns > 0 ? state.stacks.skillCritPct : 0);
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
    // 크리 확률은 CRIT_PCT_CAP(75%) 캡. 초과분은 크리 데미지로 자동 변환 — 캡 도달 후에도
    // LUK 투자 의미를 유지(빌드 수렴 방지, 회피 오버플로와 대칭).
    const rawCritPct =
      baseCritPct + luckCritBonus + balanceCritBonus + universalLuckBonus + cyclingChiThisTurn;
    const effectiveCritPct = Math.min(CRIT_PCT_CAP, rawCritPct);
    const critOverflowDmgBonus = Math.min(
      CRIT_OVERFLOW_DMG_CAP,
      Math.max(0, rawCritPct - CRIT_PCT_CAP) * CRIT_OVERFLOW_DMG_PER_PCT,
    );
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
    // 마법사 패시브 — 평타를 마법공격력 기반으로 전환. PvE 적(몬스터)은 magicDef 가 없어
    // targetDef(물방)로 경감된다(의도 — "마공 vs 물방"). PvP(아레나)는 engine-pvp 별도.
    const basicAttackPower = player.passiveMagicBasicAttack
      ? (player.magicAtk ?? player.atk)
      : player.atk;
    const atkBeforeApMult =
      basicAttackPower +
      state.buffs.rampageAtkBonus +
      bonus +
      berserkBonus +
      enchantBerserkBonus +
      gustBonus +
      enduringStrikeBonus +
      madnessAtkBonus +
      // 연격세 (연환 시그니처) — 전투 내 누적 ATK 보너스. 미보유면 0 → 무변.
      state.stacks.comboAtkBonus;
    // PR-5a: v2 buff/debuff 격리 해제 — 일반 공격 damage 에도 atk 곱셈으로 반영.
    // attacker 의 v2 self buff (str/dex/spd/luk) 합산, target 의 v2 vit debuff/buff 가 def 곱셈.
    const v2AtkMultPlayer = v2AtkBuffMult(state.v2SelfBuffs, state.v2SelfDebuffs);
    const v2DefMultEnemy = v2DefBuffMult(state.enemyV2SelfBuffs, state.enemyV2Debuffs);
    const v2EffectiveAtk = v2AtkMultPlayer !== 1 ? Math.floor(atkBeforeApMult * v2AtkMultPlayer) : atkBeforeApMult;
    const v2EffectiveTargetDef = v2DefMultEnemy !== 1 ? Math.floor(targetDef * v2DefMultEnemy) : targetDef;
    const baseDmgSingleHit = damageBetween(
      apAtkMult !== 1 ? Math.floor(v2EffectiveAtk * apAtkMult) : v2EffectiveAtk,
      v2EffectiveTargetDef,
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
    // critOverflowDmgBonus — 크리 확률 캡 초과분이 변환된 크리뎀 보너스(stats.ts 참조).
    const critMult =
      (player.critMult ?? CRIT_MULT_BASE) +
      focusedBreathCritDmgBonus +
      critOverflowDmgBonus;
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
    const dmgAfterBreaker = breakerActive
      ? Math.max(1, Math.floor(dmgAfterBrace * (1 + breakerPct / 100)))
      : dmgAfterBrace;
    // 난사 (궁사 시그니처) — 그 턴 첫 타(본타)가 아닌 추가타에 한해 데미지 +extraHitDmgPct%.
    // 다단 히트(연사) 본체를 키우는 시그니처라 본타는 영향 없음. 모든 배수 뒤 마지막 곱.
    const extraHitPct = player.extraHitDmgPct ?? 0;
    const dmgAfterExtraHit =
      extraHitPct > 0 && !isFirstAttackOfTurn
        ? Math.max(1, Math.floor(dmgAfterBreaker * (1 + extraHitPct / 100)))
        : dmgAfterBreaker;
    // 절초 (연환 시그니처) — 누적 적중 COMBO_FINISHER_PERIOD 타째 본타에 마무리 강타 +%.
    // comboHitCount 는 이 적중이 적용되면 afterDamage 에서 +1 → (현재 count + 1) 이 이번 타 순번.
    const comboFinisherPct = player.comboFinisherBonusPct ?? 0;
    const comboFinisherFires =
      comboFinisherPct > 0 &&
      (state.stacks.comboHitCount + 1) % COMBO_FINISHER_PERIOD === 0;
    const dmgBeforeVuln = comboFinisherFires
      ? Math.max(1, Math.floor(dmgAfterExtraHit * (1 + comboFinisherPct / 100)))
      : dmgAfterExtraHit;
    // PR2-B-2c 속박 — 적 취약(받는 피해 +%). 모든 평타 배수 끝 마지막 곱.
    const dmg =
      state.stacks.enemyVulnTurns > 0
        ? Math.max(1, Math.floor(dmgBeforeVuln * (1 + state.stacks.enemyVulnPct / 100)))
        : dmgBeforeVuln;
    // 연격세 (연환 시그니처) — 이 적중으로 ATK 보너스 누적(상한 = 기본 ATK).
    const comboAtkPct = player.comboAtkPctPerHit ?? 0;
    const nextComboAtkBonus =
      comboAtkPct > 0
        ? Math.min(
            player.atk,
            state.stacks.comboAtkBonus +
              Math.floor((player.atk * comboAtkPct) / 100),
          )
        : state.stacks.comboAtkBonus;
    // 절초 — 적중 누적 카운트 +1(절초 보유 시에만 증가, 미보유는 0 고정).
    const nextComboHitCount =
      comboFinisherPct > 0
        ? state.stacks.comboHitCount + 1
        : state.stacks.comboHitCount;
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
    for (const skill of apAllFiredSkills) labels.push(skill.name);
    const prefix = labels.length > 0 ? `[${labels.join(" + ")}] ` : "";
    let log = appendLog(state.log, {
      kind: "player_attack",
      text: `${prefix || "공격! "}${totalDmg} 피해를 입혔다.`,
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
    // 출혈/중독 — 적중 시 tagged DoT 로 누적 (다음 적 턴부터 tick).
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
    // 비-atk_multiplier AP 효과 처리 — 본타와 같이 발동되는 부가 효과.
    let playerHpAfterAPHeal = newPlayerHp;
    let apBleedAdd = 0;
    let apEvadesAdd = 0;
    let comboExtraAttacks = 0;
    let queuedExtraAttacksAdd = 0;
    let focusedBreathQueueBonusPct = 0;
    let shouldCleanseDebuffs = false;

    for (const skill of apAllFiredSkills) {
      const effect = skill.effect;
      if (effect.kind === "heal_pct") {
        const amount = Math.floor((state.playerMaxHp * effect.pct) / 100);
        const healed = Math.min(state.playerMaxHp, playerHpAfterAPHeal + amount);
        const actual = healed - playerHpAfterAPHeal;
        playerHpAfterAPHeal = healed;
        if (actual > 0) {
          log = appendLog(log, {
            kind: "info",
            text: `[${skill.name}] ${playerName}의 HP +${actual}`,
          });
        }
      } else if (effect.kind === "apply_bleed") {
        apBleedAdd += effect.stacks;
        log = appendLog(log, {
          kind: "info",
          text: `[${skill.name}] ${state.enemy.name}에게 출혈 +${effect.stacks}스택`,
        });
      } else if (effect.kind === "add_guaranteed_evades") {
        apEvadesAdd += effect.count;
        log = appendLog(log, {
          kind: "info",
          text: `[${skill.name}] 보장 회피 +${effect.count}`,
        });
      } else if (effect.kind === "extra_attack_this_turn") {
        comboExtraAttacks += effect.count;
        log = appendLog(log, {
          kind: "info",
          text: `[${skill.name}] 이번 턴 추가 공격 +${effect.count}`,
        });
      } else if (effect.kind === "queued_extra_attacks_next_turn") {
        queuedExtraAttacksAdd += effect.count;
        log = appendLog(log, {
          kind: "info",
          text: `[${skill.name}] 다음 턴 행동 +${effect.count}`,
        });
      } else if (effect.kind === "crit_buff_next_attack") {
        focusedBreathQueueBonusPct = effect.critDmgBonusPct;
        log = appendLog(log, {
          kind: "info",
          text: `[${skill.name}] 다음 공격 크리 보장 + 크리뎀 +${effect.critDmgBonusPct}%`,
        });
      } else if (effect.kind === "cleanse_debuffs") {
        shouldCleanseDebuffs = true;
        log = appendLog(log, {
          kind: "info",
          text: `[${skill.name}] ${playerName}의 모든 디버프 해제`,
        });
      } else if (effect.kind === "player_dmg_reduction_turns") {
        log = appendLog(log, {
          kind: "info",
          text: `[${skill.name}] ${effect.turns}턴간 받는 피해 -${effect.pct}%`,
        });
      } else if (effect.kind === "enemy_def_debuff_pct_turns") {
        log = appendLog(log, {
          kind: "info",
          text: `[${skill.name}] ${effect.turns}턴간 ${state.enemy.name}의 DEF -${effect.pct}%`,
        });
      } else if (effect.kind === "player_atk_buff_def_debuff_pct_turns") {
        log = appendLog(log, {
          kind: "info",
          text: `[${skill.name}] ${effect.turns}턴간 ATK +${effect.atkPct}%, DEF -${effect.defPct}%`,
        });
      } else if (effect.kind === "enemy_spd_mult_turns") {
        log = appendLog(log, {
          kind: "info",
          text: `[${skill.name}] ${effect.turns}턴간 ${state.enemy.name}의 SPD ×${effect.mult}`,
        });
      } else if (effect.kind === "player_spd_mult_turns") {
        log = appendLog(log, {
          kind: "info",
          text: `[${skill.name}] ${effect.turns}턴간 SPD ×${effect.mult}`,
        });
      } else if (effect.kind === "atk_multiplier_with_silence") {
        log = appendLog(log, {
          kind: "info",
          text: `[${skill.name}] ${state.enemy.name} ${effect.silenceTurns}턴간 스킬 봉인`,
        });
      } else if (effect.kind === "block_next_enemy_attack") {
        log = appendLog(log, {
          kind: "info",
          text: `[${skill.name}] ${state.enemy.name}의 다음 공격 ${effect.count}회 무효`,
        });
      } else if (effect.kind === "lifesteal_dmg_pct_turns") {
        log = appendLog(log, {
          kind: "info",
          text: `[${skill.name}] ${effect.turns}턴간 가한 피해의 ${effect.pct}% HP 회복`,
        });
      }
    }

    // 광살참 (multi_hit_self_damage) — 공격형 fire 에서만 자해 HP 적용.
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
        text: `[${apOffensiveSkill!.name}] ${playerName}의 HP -${madSlashSelfDmg} (자해)`,
      });
    }
    // 페이즈 트리거 검사 — 데미지 적용 직후, 사망 분기 전에 처리해야 트리거된 def 가
    // 같은 턴 후속 공격(다중공격/연타)에 즉시 반영된다.
    const afterDamage = applyPhaseTriggerIfAny(applyPlayerOnHitDots({
      ...state,
      enemyHp,
      enemyV2Dots: state.enemyV2Dots,
      playerHp: playerHpAfterMadSlash,
      log,
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
        chillStacks: shouldCleanseDebuffs ? 0 : state.stacks.chillStacks,
        evadesRemaining: state.stacks.evadesRemaining + apEvadesAdd,
        weakpointDefIgnoreLeft: newWeakpointDefIgnoreLeft,
        comboAtkBonus: nextComboAtkBonus,
        comboHitCount: nextComboHitCount,
      },
      turn: {
        ...state.turn,
        critThisTurn: state.turn.critThisTurn || critRoll,
        fatedChainTriggeredThisTurn:
          state.turn.fatedChainTriggeredThisTurn || fatedChainFires,
        weakpointUsedThisTurn: state.turn.weakpointUsedThisTurn || weakpointFires,
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
    }, player, { bleedStacks: apBleedAdd }));
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
      playerAttacksLeft: rollPlayerAttackCountWithBleed(afterDamage, player),
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
      },
    };
    return finishPlayerTurn(ended, player, playerName);
  }

  // ── 한기 (chill) — 적 페이즈 시작 시 한기 스택당 고정 피해 (DEF·보호막 무시) ──────
  // 출혈의 미러. threshold 이상부터 발동. 스택은 적 chill 공격 적중 시 누적(아래 적 공격부).
  // 이미 몸에 스민 추위는 천뢰 일격 silence 와 무관하게 틱한다.
  const chillSkill =
    state.enemy.skill?.kind === "chill" ? state.enemy.skill : null;
  if (
    chillSkill &&
    enteringEnemyPhase &&
    chillSkill.dmgPerStack > 0 &&
    state.stacks.chillStacks >= chillSkill.threshold
  ) {
    // DEF 부분감산 — defMitigationFraction 만큼 플레이어 DEF 를 깎아낸다(미지정/0 = DEF 무시, 기존
    // 동작). 하한 1 — 아무리 DEF 가 높아도 한기는 최소 1 은 들어가 시간압 취지가 죽지 않는다.
    const chillDefCut = Math.round(
      player.def * (chillSkill.defMitigationFraction ?? 0),
    );
    const chillDmgRaw = Math.max(
      1,
      state.stacks.chillStacks * chillSkill.dmgPerStack - chillDefCut,
    );
    const chillDmgAfterResolve =
      state.buffs.playerDmgReductionTurnsLeft > 0 &&
      state.buffs.playerDmgReductionPct > 0
        ? Math.floor(chillDmgRaw * (1 - state.buffs.playerDmgReductionPct / 100))
        : chillDmgRaw;
    const endurePct = player.enchantEndurePct ?? 0;
    const chillDmgAfterEndure =
      endurePct > 0
        ? Math.floor(chillDmgAfterResolve * (1 - endurePct / 100))
        : chillDmgAfterResolve;
    const chillDmg = Math.max(1, chillDmgAfterEndure);
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
  // PR-5a: v2 buff/debuff 격리 해제 — 추정 데미지도 일관 적용 (적의 atk debuff + player def buff).
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
    // PR-5b: enemy 의 self buff 도 합산 (monster v2 cast 결과).
    const v2AtkMultE = v2AtkBuffMult(state.enemyV2SelfBuffs, state.enemyV2Debuffs);
    const v2DefMultP = v2DefBuffMult(state.v2SelfBuffs, state.v2SelfDebuffs);
    const v2EffAtk = v2AtkMultE !== 1 ? Math.floor(effAtk * v2AtkMultE) : effAtk;
    const v2EffDef = v2DefMultP !== 1 ? Math.floor(effDef * v2DefMultP) : effDef;
    return damageBetween(v2EffAtk, v2EffDef);
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
    const next: BattleState = {
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
  // 한기 슬로우 — chill 스택당 회피율 감소(굼떠짐). 미지정/0 = 효과 없음. 회피는 0 미만 안 됨.
  const chillSlowPct =
    state.enemy.skill?.kind === "chill"
      ? state.stacks.chillStacks *
        (state.enemy.skill.evasionPenaltyPerStack ?? 0)
      : 0;
  // 적 명중(accuracy) — 유효 회피에서 %p 차감. 0/undefined = 차감 없음(기존 동작).
  // chillSlowPct 와 같은 자리에서 빼 회피 캡 적용 후 감산. 고탑 보스가 층 비례로 보유.
  const enemyAccuracy = state.enemy.accuracy ?? 0;
  const effectiveEvadePct = Math.max(
    0,
    Math.min(
      EVASION_PCT_CAP,
      player.evasionPct +
        luckEvadeBonus +
        universalLuckEvadeBonus +
        state.buffs.cyclingChiBonus +
        // PR2-B-2c 선풍각 — 회피 temp 버프.
        (state.stacks.skillEvasionTurns > 0 ? state.stacks.skillEvasionPct : 0),
    ) - chillSlowPct - enemyAccuracy,
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
    const next: BattleState = {
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
  // 흘려막기 (기사 시그니처) — 낮은 확률로 피해를 통째로 흘려낸다. enchant 가드와 동류 지점:
  // 회피·럭키 방패 계열과 나란히, 받아내기 전에 굴리는 % 완전 무효.
  const nullifyPct = player.damageNullifyChancePct ?? 0;
  if (nullifyPct > 0 && Math.random() * 100 < nullifyPct) {
    const log = appendLog(state.log, {
      kind: "info",
      text: `[흘려막기] ${playerName}이(가) ${state.enemy.name}의 공격을 흘려냈다!`,
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
    const next: BattleState = {
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
  // maxStacks 지정 시 상한 클램프 — 무한 누적 폭주 방지.
  const chillStacksNext =
    skill?.kind === "chill" && skill.maxStacks !== undefined
      ? Math.min(skill.maxStacks, state.stacks.chillStacks + chillAdd)
      : state.stacks.chillStacks + chillAdd;
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
  // 강체 (금강 시그니처) — 전투 내 누적 DEF 보너스를 기본 DEF 에 더해 진짜 방어력처럼 취급
  // (pierce/취약 곱연산 대상). 미보유면 braceDefBonus=0 → 무변.
  const defWithBrace = player.def + state.stacks.braceDefBonus;
  const pierced =
    skill?.kind === "pierce"
      ? Math.max(0, defWithBrace - skill.armorPierce)
      : defWithBrace;
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
  // PR-5a/5b: enemy 측 v2 buff/debuff 합산. PR-5b 부터 monster v2 cast 가능 → enemyV2SelfBuffs
  // 도 합산. player 의 v2 self buff/debuff 는 player.def 곱셈으로 반영.
  const v2AtkMultEnemy = v2AtkBuffMult(state.enemyV2SelfBuffs, state.enemyV2Debuffs);
  const v2DefMultPlayer = v2DefBuffMult(state.v2SelfBuffs, state.v2SelfDebuffs);
  const v2EffectiveEnemyAtk = v2AtkMultEnemy !== 1 ? Math.floor(effectiveEnemyAtk * v2AtkMultEnemy) : effectiveEnemyAtk;
  const v2EffectivePlayerDef = v2DefMultPlayer !== 1 ? Math.floor(effectivePlayerDef * v2DefMultPlayer) : effectivePlayerDef;
  const baseEnemyDmg = damageBetween(v2EffectiveEnemyAtk, v2EffectivePlayerDef);
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
  // 계파 패시브 받피감(passiveDamageTakenReductionPct) — 받는 피해 -pct%(철벽검류 등). 항상 활성,
  // 인내(endure) 다음·가드 전 곱연산. 최소 1 클램프. 0/undefined = 미보유(라이브 무변).
  const passiveReducePct = player.passiveDamageTakenReductionPct ?? 0;
  const passiveReduced =
    passiveReducePct > 0
      ? Math.max(1, Math.floor(enduredDmg * (1 - passiveReducePct / 100)))
      : enduredDmg;
  // 가드 — 첫 N번의 적 페이즈 동안 받는 피해 -reduction. 선공자에 무관하게
  // enemyPhasesCompleted 가 N 미만이면 이번 페이즈가 그 N 중 하나.
  const guard = player.guard;
  const guarded =
    guard && guard.turns > 0 && state.turn.enemyPhasesCompleted < guard.turns
      ? Math.max(0, passiveReduced - guard.reduction)
      : passiveReduced;
  // 굳건한 의지 (2티어 특기) — 받은 피해 평탄 -(N) 감소. 가드 뒤에 적용.
  const steadfastFlat = player.steadfastWillFlat ?? 0;
  const dmg = steadfastFlat > 0 ? Math.max(0, guarded - steadfastFlat) : guarded;
  const guardApplied = guarded < passiveReduced;
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
  // 강체 (금강 시그니처) — 이번에 받은 HP 피해의 % 만큼 DEF 보너스 누적(상한 = 기본 DEF).
  // 받은 만큼 단단해지는 탱커. dmgToHp(보호막 흡수 후 실제 HP 피해) 기준.
  const braceGainPct = player.defGainOnHitPct ?? 0;
  const nextBraceDefBonus =
    braceGainPct > 0 && dmgToHp > 0
      ? Math.min(
          player.def,
          state.stacks.braceDefBonus +
            Math.floor((dmgToHp * braceGainPct) / 100),
        )
      : state.stacks.braceDefBonus;
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
    text: `${atkPrefix || "공격! "}${dmgToHp} 피해를 입혔다.`,
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
    // PR-5a: 룬 반격도 v2 buff/debuff 격리 해제 일관 적용.
    const v2AtkMultC = v2AtkBuffMult(state.v2SelfBuffs, state.v2SelfDebuffs);
    const v2DefMultC = v2DefBuffMult(state.enemyV2SelfBuffs, state.enemyV2Debuffs);
    const counterDef = playerFacingEnemyDef(state, player);
    const counterDmg = damageBetween(
      v2AtkMultC !== 1 ? Math.floor(player.atk * v2AtkMultC) : player.atk,
      v2DefMultC !== 1 ? Math.floor(counterDef * v2DefMultC) : counterDef,
    );
    enemyHpAfterRuneCounter = Math.max(0, enemyHpAfterThorns - counterDmg);
    log = appendLog(log, {
      kind: "player_attack",
      text: `[반격의 룬] ${state.enemy.name}에게 ${counterDmg} 반격 피해.`,
    });
  }
  // 무도가 패시브 — 피격 생존 시 일정 확률로 ATK 반격(반격의 룬과 동일 패턴, 별개 누적).
  const martialCounterPct = player.passiveCounterChancePct ?? 0;
  let enemyHpAfterMartialCounter = enemyHpAfterRuneCounter;
  if (
    martialCounterPct > 0 &&
    playerHp > 0 &&
    enemyHpAfterRuneCounter > 0 &&
    Math.random() * 100 < martialCounterPct
  ) {
    const v2AtkMultM = v2AtkBuffMult(state.v2SelfBuffs, state.v2SelfDebuffs);
    const v2DefMultM = v2DefBuffMult(state.enemyV2SelfBuffs, state.enemyV2Debuffs);
    const counterDefM = playerFacingEnemyDef(state, player);
    const counterDmgM = damageBetween(
      v2AtkMultM !== 1 ? Math.floor(player.atk * v2AtkMultM) : player.atk,
      v2DefMultM !== 1 ? Math.floor(counterDefM * v2DefMultM) : counterDefM,
    );
    enemyHpAfterMartialCounter = Math.max(0, enemyHpAfterRuneCounter - counterDmgM);
    log = appendLog(log, {
      kind: "player_attack",
      text: `[반격] ${state.enemy.name}에게 ${counterDmgM} 반격 피해.`,
    });
  }
  if (playerHp <= 0) {
    return {
      ...state,
      playerHp,
      enemyHp: enemyHpAfterMartialCounter,
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
        braceDefBonus: nextBraceDefBonus,
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
  if (enemyHpAfterMartialCounter <= 0) {
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
        braceDefBonus: nextBraceDefBonus,
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
    enemyHp: enemyHpAfterMartialCounter,
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
      braceDefBonus: nextBraceDefBonus,
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
  // 전투 시작 로그에 박을 안내 한 줄(전술 등). 호출부가 문자열로 빌드해 넘긴다
  // (엔진은 stance 를 모름 — 순환 의존 회피). 미지정이면 추가 안 함.
  openingNote?: string;
  // v2 스킬 상태 (PR-4a) — saves_kv "skills.v2" 의 learned/equipped. 미지정/빈 배열이면
  // v2 스킬 cast no-op. 라우트가 saves_kv 에서 읽어 넘긴다.
  v2Skills?: import("@/adventure/data/v2/v2Skills").V2SkillsState;
  // 무한 루프 가드 턴 상한(플레이어 턴 기준). 미지정이면 500(기본 안전캡). 스파링처럼
  // "안 죽는 샌드백을 N턴만 두들기는" 용도면 낮춰 넘긴다(예: 50) — 도달 시 lose 로 종료.
  maxTurns?: number;
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
  enemy: import("@/adventure/data/monsters").Monster,
  playerName: string,
  ctx: ResolveContext,
): BattleResolution {
  const potions: Partial<Record<PotionId, number>> = { ...ctx.potions };
  const consumed: Partial<Record<PotionId, number>> = {};
  let state = initialBattleState(player, enemy, playerName, ctx.v2Skills);
  // 보스 전투 여부 — 충돌파/천명 같은 %HP 효과 감산 (BOSS_PCT_HP_DAMAGE_MULT) 에 사용.
  if (ctx.isBoss) state = { ...state, isBoss: true };
  // v2 마법 (PR-7b) — 매 player turn 시작 시 cast. 전투 시작 시 sweep 폐기.
  // INT 0(라이브) 캐릭은 자동 미발동. cast hook 은 main loop 안.
  // 선공자 캐시 — 사이클(1턴) 정의가 선공자에 따라 달라진다.
  //   - 플레이어 선공: 사이클 = [player phase → enemy phase] — enemy→player 전환이 사이클 끝.
  //   - 적 선공:      사이클 = [enemy phase → player phase]  — player→enemy 전환이 사이클 끝.
  // 마커는 사이클 끝 시점에 다음 사이클 번호를 박는다 (단, 첫 사이클의 "1턴" 마커는 루프 진입 전 이미 박힘).
  const playerFirstStrike = state.phase === "player";
  // 턴 마커 — 그 턴 시작 시점 AP 동봉. 미장착 캐릭터도 그대로 노출 (시스템 발견용).
  const turnMarkerText = (turnNo: number): string => `${turnNo}턴`;
  // 그 시점 HP 스냅샷 — 매 턴 종료 시 + 전투 종료 시 로그 마지막에 박는다.
  const hpBarEntry = (s: BattleState): BattleLogEntry => ({
    kind: "hp_bar",
    text: "",
    turn: "player",
    playerHp: s.playerHp,
    playerMaxHp: s.playerMaxHp,
    enemyHp: s.enemyHp,
    enemyMaxHp: s.enemy.hp,
    playerMp: s.playerMp,
    playerMaxMp: s.playerMaxMp,
    enemyMp: s.enemyMp,
    enemyMaxMp: s.enemyMaxMp,
  });
  // 초기 entry (적 등장 / 선공 / 능력 안내 등) 는 player 턴으로 태깅. 첫 턴 marker 도 박는다.
  // openingNote(전술 안내 등)가 있으면 적 등장 다음·첫 턴 marker 앞에 info 로 끼운다.
  const openingExtra: BattleLogEntry[] = ctx.openingNote
    ? [{ kind: "info", text: ctx.openingNote, turn: "player" as const }]
    : [];
  state = {
    ...state,
    log: [
      ...state.log.map((e) => ({ ...e, turn: "player" as const })),
      ...openingExtra,
      {
        kind: "turn_marker",
        text: turnMarkerText(1),
        turn: "player" as const,
      },
    ],
  };
  let turns = 0;
  // v2 스킬 (v2_skill_*) — PR-4a framework. phase-entry flag 로 dedupe — player phase 가
  // enemy 로 빠졌다가 돌아올 때마다 정확히 1회 cast. (포션-only 턴 종료가 completedPlayerTurns
  // 를 증가시키지 않아 옛 counter 기반 dedupe 는 한 turn 미시전 케이스가 있어 채택.)
  let v2CastedThisPlayerPhase = false;
  // PR-5b — enemy phase 진입 시 1회 cast. phase 가 enemy 가 아니게 되면 reset.
  let v2CastedThisEnemyPhase = false;

  while (state.phase !== "ended") {
    let action: PlayerAction = { kind: "attack" };
    // PR-5b 회귀: enemy phase 가 player 로 전환되면 enemy cast flag reset (offlineSim 과 동작 일치).
    if (state.phase === "player") {
      v2CastedThisEnemyPhase = false;
    }
    if (state.phase === "player") {
      // v2 스킬 cast (PR-4b) — MP 차감 + cooldown set + 효과 적용 (damage/heal/buff/debuff).
      // 매 player phase 진입 시 1회 — buff/debuff turn -1 tick + cast.
      if (!v2CastedThisPlayerPhase) {
        v2CastedThisPlayerPhase = true;
        // 0) PR-8 — player 가 받는 DoT tick (적이 박은 dot). DEF 무시. lethal 처리.
        // 적이 박은 dot 이므로 enemy_attack 로그 (오른쪽 적 레인).
        const playerDotTick = tickV2Dots(state.playerV2Dots, state.playerMaxHp);
        if (playerDotTick.totalDmg > 0) {
          const before = state.playerHp;
          const newHp = Math.max(0, before - playerDotTick.totalDmg);
          const dotLabels = state.playerV2Dots
            .filter((d) => d.turns > 0)
            .map((d) => d.label)
            .join(" + ");
          state = {
            ...state,
            playerHp: newHp,
            playerV2Dots: playerDotTick.nextDots,
            log: appendLog(state.log, {
              kind: "enemy_attack",
              text: `[${dotLabels}] ${playerDotTick.totalDmg} 피해를 입었다.`,
            }),
          };
          if (state.playerHp <= 0) {
            state = {
              ...state,
              log: appendLog(state.log, {
                kind: "info",
                text: `플레이어가 쓰러졌다.`,
                turn: "player",
              }),
              outcome: "lose",
              phase: "ended",
            };
            continue;
          }
        } else {
          // 누적 데미지 0 (dot 비어있음) 라도 tick 결과 next 로 갱신.
          state = { ...state, playerV2Dots: playerDotTick.nextDots };
        }
        // 1) buff/debuff tick (cast 전에 — 새 buff 는 발동턴부터 turns 만큼 유지).
        const tickedSelfBuffs = tickV2BuffMap(state.v2SelfBuffs);
        const tickedSelfDebuffs = tickV2BuffMap(state.v2SelfDebuffs);
        const tickedEnemyDebuffs = tickV2BuffMap(state.enemyV2Debuffs);
        // 2) cast 결정 + 효과 계산.
        let result = resolveV2SkillCast({
          skills: state.v2Skills,
          cooldowns: state.v2SkillCooldowns,
          procRoll: Math.random() * 100,
          procChanceBonus: player.skillProcChanceAdd ?? 0,
          attacker: {
            mp: state.playerMp,
            atk: player.atk,
            magicAtk: player.magicAtk ?? player.atk,
            minDamage: player.minDamage,
            healMult: player.healMult,
            maxHp: state.playerMaxHp,
            // PR2-B — def/vit 비례 딜·현재HP(사혈격/기공순환)·maxMp(보호막/명상)·차수 flat.
            def: player.def,
            vit: player.vitStat,
            currentHp: state.playerHp,
            maxMp: state.playerMaxMp,
            classTier: player.classTier,
            selfBuffs: tickedSelfBuffs,
            selfDebuffs: tickedSelfDebuffs,
            // PR-5b — 플레이어 평타 속성(baked) + 캐릭 속성(스킬 기본).
            attackElement: player.attackElement,
            characterElement: player.characterElement,
          },
          target: {
            def: state.enemy.def,
            // PR-5b: monster 측 v2 self buff 도 def 곱셈에 반영 (격리 해제 일관).
            selfBuffs: state.enemyV2SelfBuffs,
            selfDebuffs: tickedEnemyDebuffs,
            // PR-5b — 피격 몬스터 속성(상성).
            element: state.enemy.element,
            // PR2-B — 처단(처형 임계)·스택 payoff(참절/중독폭발/비전작렬).
            currentHp: state.enemyHp,
            maxHp: state.enemy.hp,
            bleedStacks: state.enemyV2Dots.filter((d) => d.tag === "bleed").reduce((s, d) => s + d.stacks, 0),
            poisonStacks: state.enemyV2Dots.filter((d) => d.tag === "poison").reduce((s, d) => s + d.stacks, 0),
            magicVulnStacks: state.stacks.enemyMagicVulnStacks,
          },
        });
        // 스킬도 명중 영향(2026-06-06) — 데미지 스킬은 발동 후 미스 판정(평타와 같은 공식). 미스면 적
        //   효과(데미지·DoT·디버프)만 무효, MP·쿨다운은 발동 시점에 소모됨·자버프/자힐은 유지. 데미지>0
        //   일 때만 롤(스킬 안 터졌거나 자버프 스킬엔 롤 안 함 → RNG 드리프트 방지).
        let skillMissed = false;
        if (result.castSkillId && result.enemyDamage > 0) {
          const sMissPct = Math.max(
            0,
            V2_BASE_MISS_PCT +
              (state.enemy.evasionPct ?? 0) * (player.precisionEvasionMult ?? 1) -
              (player.accuracyPct ?? 0),
          );
          if (sMissPct > 0 && Math.random() * 100 < sMissPct) {
            skillMissed = true;
            result = {
              ...result,
              enemyDamage: 0,
              dotsToApplyToTarget: [],
              enemyDebuffsToApply: [],
            };
          }
        }
        // 주문 중첩(워메이지)·약점 노출(마도사) — 스킬 데미지 배수(현재 누적 스택 기준, 적용은 이번 시전부터).
        //   주문중첩: 누적 시전 횟수 × skillDmgPctPerCast.  약점노출: 적 마법취약 스택 × enemyMagicVulnPctPerStack.
        // 둘 다 미보유면 스택 0 → 배수 1 → 무변. 적중 후 아래에서 스택 증가.
        const spellStackMult =
          1 +
          (state.stacks.spellCastCount * (player.skillDmgPctPerCast ?? 0)) / 100;
        const magicVulnMult =
          1 +
          (state.stacks.enemyMagicVulnStacks *
            (player.enemyMagicVulnPctPerStack ?? 0)) /
            100;
        // PR2-B-2c 속박 — 적 취약(받는 피해 +%) 가산.
        const vulnMult =
          state.stacks.enemyVulnTurns > 0
            ? 1 + state.stacks.enemyVulnPct / 100
            : 1;
        const boostedSkillDamage = Math.floor(
          result.enemyDamage * spellStackMult * magicVulnMult * vulnMult,
        );
        // 시전이 발동(castSkillId)했으면 누적 증가. 주문중첩=매 시전, 약점노출=적중(데미지>0) 시. 상한 클램프.
        const nextSpellCastCount =
          (player.skillDmgPctPerCast ?? 0) > 0 && result.castSkillId
            ? Math.min(SPELL_STACK_CAP, state.stacks.spellCastCount + 1)
            : state.stacks.spellCastCount;
        const nextMagicVulnStacks =
          (player.enemyMagicVulnPctPerStack ?? 0) > 0 &&
          result.castSkillId &&
          result.enemyDamage > 0
            ? Math.min(
                MAGIC_VULN_STACK_CAP,
                state.stacks.enemyMagicVulnStacks + 1,
              )
            : state.stacks.enemyMagicVulnStacks;
        // 절제(워메이지 특성) — 스킬 마나 소모 -%. resolveV2SkillCast 가 이미 풀 코스트를 깐
        // result.nextMp 에, 소모분(costPaid)의 pct% 를 환급. 미시전이면 costPaid 0 → 무변.
        const mpCostReduction = player.mpCostReductionPct ?? 0;
        const costPaid = state.playerMp - result.nextMp;
        const mpRefund =
          mpCostReduction > 0 && costPaid > 0
            ? Math.floor((costPaid * mpCostReduction) / 100)
            : 0;
        const adjustedNextMp = Math.min(
          state.playerMaxMp,
          result.nextMp + mpRefund,
        );
        // 3) state 업데이트 — MP, cooldown, buff/debuff map, HP delta, log.
        let nextEnemyHp = state.enemyHp;
        let nextPlayerHp = state.playerHp;
        let nextLog = state.log;
        // 시전 별도 로그 폐기 — damage/heal 로그에 prefix 로 스킬명 포함.
        // damage 효과: 일반 공격과 같은 player_attack kind. 스킬명을 평타 "공격!" 자리의 액션
        //   라벨로 표기("강타! N 피해를 입혔다."). 브라켓 태그 대신 발동 스킬을 앞세운다.
        if (result.enemyDamage > 0 && result.castSkillName) {
          nextEnemyHp = Math.max(0, nextEnemyHp - boostedSkillDamage);
          // 다단 스킬은 타마다 한 줄. 부스트는 타당 raw 비율로 분배(합 = boostedSkillDamage).
          // 단일타는 그대로 한 줄(기존과 동일).
          const perHit =
            result.hitDamages.length > 1
              ? distributeBoostedHits(result.hitDamages, boostedSkillDamage)
              : [boostedSkillDamage];
          for (const hit of perHit) {
            if (hit <= 0) continue; // 분배 반올림으로 0 이 된 타는 줄 생략(합은 이미 차감됨).
            nextLog = appendLog(nextLog, {
              kind: "player_attack",
              text: `${result.castSkillName}! ${hit} 피해를 입혔다.`,
            });
          }
        } else if (skillMissed && result.castSkillName) {
          nextLog = appendLog(nextLog, {
            kind: "player_attack",
            text: `${result.castSkillName}! 빗나갔다.`,
          });
        }
        // heal 효과: damage 없는 회복형 스킬 (회복/강화회복) — player_attack kind 로 통일.
        if (result.selfHeal > 0 && result.castSkillName) {
          const before = nextPlayerHp;
          nextPlayerHp = Math.min(state.playerMaxHp, nextPlayerHp + result.selfHeal);
          const actual = nextPlayerHp - before;
          if (actual > 0) {
            nextLog = appendLog(nextLog, {
              kind: "player_attack",
              text: `${result.castSkillName}! HP ${actual} 회복했다.`,
            });
          }
        }
        // PR2-B 사혈격 — 현재 HP 소모(자살 방지 최소 1).
        if (result.selfHpCost > 0) {
          const cost = Math.min(Math.max(0, nextPlayerHp - 1), result.selfHpCost);
          if (cost > 0) {
            nextPlayerHp -= cost;
            nextLog = appendLog(nextLog, {
              kind: "info",
              text: `${result.castSkillName ?? "사혈"}! 생명력 ${cost} 소모`,
              turn: "player",
            });
          }
        }
        const nextSelfBuffs = applyV2BuffsToMap(tickedSelfBuffs, result.selfBuffsToApply);
        const nextEnemyDebuffs = applyV2BuffsToMap(tickedEnemyDebuffs, result.enemyDebuffsToApply);
        // PR-8 — dot effect 결과를 적 측 v2Dots 에 박음. 같은 label refresh.
        const nextEnemyDots = applyV2DotsToTarget(state.enemyV2Dots, result.dotsToApplyToTarget);
        for (const b of result.selfBuffsToApply) {
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[${result.castSkillName ?? "강화"}] ${b.stat.toUpperCase()} +${b.pct}% (${b.turns}턴)`,
            turn: "player",
          });
        }
        for (const d of result.enemyDebuffsToApply) {
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[${[result.castSkillName, statusNameForDebuffStat(d.stat)].filter(Boolean).join(" + ") || "약화"}] ${d.stat.toUpperCase()} -${d.pct}% (${d.turns}턴)`,
            turn: "player",
          });
        }
        for (const dot of result.dotsToApplyToTarget) {
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[${[result.castSkillName, dot.label].filter(Boolean).join(" + ")}] +${dot.stacks}스택 (${dot.turns}턴)`,
            turn: "player",
          });
        }
        state = {
          ...state,
          playerHp: nextPlayerHp,
          enemyHp: nextEnemyHp,
          playerMp: adjustedNextMp,
          v2SkillCooldowns: result.nextCooldowns,
          v2SelfBuffs: nextSelfBuffs,
          v2SelfDebuffs: tickedSelfDebuffs, // (PvE 는 적이 enemyDebuff 안 박아서 갱신 X — tick 만 반영)
          enemyV2Debuffs: nextEnemyDebuffs,
          enemyV2Dots: nextEnemyDots,
          stacks: {
            // PR2-B-2c — 운기/연환집중/선풍각/속박 temp 버프 갱신.
            ...applySkillTempBuffs(state.stacks, result),
            spellCastCount: nextSpellCastCount,
            enemyMagicVulnStacks: nextMagicVulnStacks,
            // PR2-B 마나 보호막 — 흡수량(maxHP%+maxMP%)을 playerShield 풀에 누적.
            playerShield:
              state.stacks.playerShield +
              (result.shieldToApply
                ? result.shieldToApply.hp + result.shieldToApply.mp
                : 0),
          },
          log: nextLog,
        };
        // lethal 체크 — v2 damage 로 적 사망 시 정상 종료 처리 (옛 spell cast 분기와 일관).
        if (state.enemyHp <= 0) {
          state = {
            ...state,
            log: appendLog(state.log, {
              kind: "info",
              text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
              turn: "player",
            }),
            outcome: "win",
            phase: "ended",
            turn: {
              ...state.turn,
              completedPlayerTurns: state.turn.completedPlayerTurns + 1,
            },
          };
          continue;
        }
        // cast 발동 시 그 턴 전체 소진 → phase=enemy 직행. 다대시(attacksLeft>1) 캐릭도
        // 강타 1번으로 그 턴 종료. 의도: 1턴 1행동 (강타 OR 일반공격, 양립 X).
        //
        // ⚠️ 시전도 "완료한 플레이어 턴" 이다 — 평타 종료 경로(아래 일반 공격 분기)와 똑같이
        // completedPlayerTurns 를 +1 하고 턴 플래그를 리셋한 뒤 finishPlayerTurn(턴 종료 효과:
        // 재생·막다른 격노·약점 분석 등)을 거쳐야 한다. 예전엔 여기서 증가를 빠뜨려서, 매 턴
        // 마법을 시전하는 캐릭터(MP 충분한 버스트 마법사)는 completedPlayerTurns 가 0 에
        // 고정됐다. 그 결과 사이클 종료 마커("N턴")·턴별 HP 스냅샷이 completedPlayerTurns>0
        // 게이트(아래 cycleEnded 블록)에 걸려 영영 안 찍히고, 전투 전체 행동이 첫 "1턴" 그룹에
        // 쌓이는 버그가 났다. 턴 기반 효과(재생/강공격 주기/버프 감소/보스 턴 캡)도 같이 멈췄다.
        if (result.castSkillId) {
          const ended: BattleState = {
            ...state,
            phase: "enemy",
            playerAttacksLeft: rollPlayerAttackCountWithBleed(state, player),
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
            },
          };
          state = finishPlayerTurn(ended, player, playerName);
          continue;
        }
      }
    } else if (state.phase === "enemy") {
      // PR-5b — enemy 의 v2 스킬 cast (player cast hook 미러). monster.v2Skills 미지정이면 no-op.
      v2CastedThisPlayerPhase = false;
      if (!v2CastedThisEnemyPhase) {
        v2CastedThisEnemyPhase = true;
        const tickedEnemySelfBuffs = tickV2BuffMap(state.enemyV2SelfBuffs);
        const tickedEnemyDebuffsLocal = tickV2BuffMap(state.enemyV2Debuffs);
        const tickedPlayerDebuffs = tickV2BuffMap(state.v2SelfDebuffs);
        const result = resolveV2SkillCast({
          skills: state.enemyV2Skills,
          cooldowns: state.enemyV2SkillCooldowns,
          procRoll: Math.random() * 100,
          attacker: {
            mp: state.enemyMp,
            atk: state.enemy.atk,
            maxHp: state.enemy.hp, // monster.hp = max hp (정적)
            // PR2-B — 상대 caster(Monster 타입)는 def/현재HP/maxMp 만(vit/차수 없음 → 기본값 안전).
            def: state.enemy.def,
            currentHp: state.enemyHp,
            maxMp: state.enemyMaxMp,
            selfBuffs: tickedEnemySelfBuffs,
            selfDebuffs: tickedEnemyDebuffsLocal,
            // PR-5b — 몬스터 평타·스킬 모두 자기 속성(atk 에 baked). 보정=1(이중계산 방지).
            attackElement: state.enemy.element,
            characterElement: state.enemy.element,
          },
          target: {
            def: player.def,
            magicDef: player.magicDef,
            selfBuffs: state.v2SelfBuffs,
            selfDebuffs: tickedPlayerDebuffs,
            // PR-5b — 피격 플레이어의 방어 속성(캐릭 속성).
            element: player.characterElement,
            // PR2-B — 상대(플레이어)의 처단/스택 payoff 대상 = 시전자 player.
            currentHp: state.playerHp,
            maxHp: state.playerMaxHp,
            bleedStacks: state.playerV2Dots.filter((d) => d.tag === "bleed").reduce((s, d) => s + d.stacks, 0),
            poisonStacks: state.playerV2Dots.filter((d) => d.tag === "poison").reduce((s, d) => s + d.stacks, 0),
          },
        });
        let nextPlayerHp = state.playerHp;
        let nextEnemyHp = state.enemyHp;
        let nextLog = state.log;
        // 시전 별도 로그 폐기 — damage/heal 로그에 prefix 로 스킬명 포함.
        // 적의 v2 damage 는 일반 적 공격과 같은 enemy_attack kind 로 통일.
        if (result.enemyDamage > 0 && result.castSkillName) {
          nextPlayerHp = Math.max(0, nextPlayerHp - result.enemyDamage);
          nextLog = appendLog(nextLog, {
            kind: "enemy_attack",
            text: `${result.castSkillName}! ${result.enemyDamage} 피해를 입혔다.`,
          });
        }
        // 적의 self heal — enemy_attack kind (적 측 행동).
        if (result.selfHeal > 0 && result.castSkillName) {
          const before = nextEnemyHp;
          nextEnemyHp = Math.min(state.enemy.hp, nextEnemyHp + result.selfHeal);
          const actual = nextEnemyHp - before;
          if (actual > 0) {
            nextLog = appendLog(nextLog, {
              kind: "enemy_attack",
              text: `${result.castSkillName}! ${state.enemy.name} HP ${actual} 회복했다.`,
            });
          }
        }
        // PR2-B 사혈격(상대 시전) — 상대 HP 소모(자살 방지 최소 1).
        if (result.selfHpCost > 0) {
          nextEnemyHp = Math.max(1, nextEnemyHp - result.selfHpCost);
        }
        const nextEnemySelfBuffs = applyV2BuffsToMap(tickedEnemySelfBuffs, result.selfBuffsToApply);
        // enemyDebuff effect (적이 player 에 거는 약화) → state.v2SelfDebuffs 갱신.
        const nextPlayerDebuffs = applyV2BuffsToMap(tickedPlayerDebuffs, result.enemyDebuffsToApply);
        // PR-8 — enemy cast 의 dot 결과 → state.playerV2Dots 박힘 (target=player).
        const nextPlayerDots = applyV2DotsToTarget(state.playerV2Dots, result.dotsToApplyToTarget);
        for (const b of result.selfBuffsToApply) {
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[${result.castSkillName ?? "강화"}] ${b.stat.toUpperCase()} +${b.pct}% (${b.turns}턴)`,
            turn: "enemy",
          });
        }
        for (const d of result.enemyDebuffsToApply) {
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[${[result.castSkillName, statusNameForDebuffStat(d.stat)].filter(Boolean).join(" + ") || "약화"}] ${d.stat.toUpperCase()} -${d.pct}% (${d.turns}턴)`,
            turn: "enemy",
          });
        }
        for (const dot of result.dotsToApplyToTarget) {
          nextLog = appendLog(nextLog, {
            kind: "info",
            text: `[${[result.castSkillName, dot.label].filter(Boolean).join(" + ")}] +${dot.stacks}스택 (${dot.turns}턴)`,
            turn: "enemy",
          });
        }
        state = {
          ...state,
          playerHp: nextPlayerHp,
          enemyHp: nextEnemyHp,
          enemyMp: result.nextMp,
          enemyV2SkillCooldowns: result.nextCooldowns,
          enemyV2SelfBuffs: nextEnemySelfBuffs,
          enemyV2Debuffs: tickedEnemyDebuffsLocal,
          v2SelfDebuffs: nextPlayerDebuffs,
          playerV2Dots: nextPlayerDots,
          log: nextLog,
        };
        // lethal — enemy v2 damage 로 player 사망 시 outcome=lose.
        if (state.playerHp <= 0) {
          state = {
            ...state,
            log: appendLog(state.log, {
              kind: "info",
              text: `플레이어가 쓰러졌다.`,
              turn: "enemy",
            }),
            outcome: "lose",
            phase: "ended",
          };
          continue;
        }
      }
    } else {
      // ended 등 — 둘 다 reset.
      v2CastedThisPlayerPhase = false;
      v2CastedThisEnemyPhase = false;
    }
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
    // PR-7b cast hook 으로 ended 가 박힐 수 있어 안전 가드 — 도달 시 다음 iter 종료.
    if (state.phase === "ended") continue;
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
            text: turnMarkerText(turnNo),
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
    // 병리적 조합이면 적의 타임아웃 패배로 강제 종료. ctx.maxTurns 로 상한을 낮출 수 있다
    // (스파링 = 안 죽는 샌드백을 maxTurns 턴까지 두들기고 lose 로 종료). turns 도달 시 그 턴에
    // 멈추므로(>=) maxTurns 가 곧 표기 턴 수와 일치한다.
    if (turns >= (ctx.maxTurns ?? 500)) {
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
  if (potion.effect.kind === "heal_mp") {
    // PR-6 — MP 회복 포션. v2 스킬 자원 충전용. maxMp 0 (INT 없는 캐릭) 이면 회복 0 → 사실상 no-op.
    const restore = computeMpRestoreAmount(potion, state.playerMaxMp);
    const newMp = Math.min(state.playerMaxMp, state.playerMp + restore);
    const actual = newMp - state.playerMp;
    return {
      ...state,
      playerMp: newMp,
      log: appendLog(state.log, {
        kind: "info",
        text: `${playerName}이(가) ${potion.name}을(를) 마셨다 — MP +${actual} (${state.playerMp} → ${newMp})`,
      }),
    };
  }
  return state;
}
