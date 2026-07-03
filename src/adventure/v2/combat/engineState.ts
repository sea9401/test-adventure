import type { Monster } from "@/adventure/data/monsters";
import type { V2Element } from "@/adventure/data/v2/elements";
import type { SignatureEffect } from "@/adventure/data/v2/v2Equipment";
import type { Potion, PotionId } from "@/adventure/data/potions";
import type { APSkill, APSkillCondition } from "@/adventure/character/apSkills";

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
      /**
       * ATB 타임라인 틱(이 행동이 발생한 시각). resolveBattleAtb / resolveBattlePvPAtb 가
       * 찍는다. UI 가 일정 틱 윈도우(ATB_LOG_WINDOW_TICKS) 단위로 로그를 묶어 한 박스에
       * 보여줄 때 사용. 레거시(고정교대) 엔진·옛 로그는 미동봉(undefined) → UI 가 턴 단위로 폴백.
       */
      t?: number;
    }
  | {
      // 매 턴 종료 시점 (그리고 전투 종료 시) 양쪽 HP 스냅샷. UI 가 텍스트형 막대로 렌더.
      // text 는 미사용이지만 옛 코드가 e.text 를 참조할 때 깨지지 않게 빈 문자열로 둔다.
      kind: "hp_bar";
      text: string;
      turn?: "player" | "enemy";
      side?: "p1" | "p2";
      /** ATB 타임라인 틱(위 variant 의 t 와 동일 의미). 윈도우 그룹화용. */
      t?: number;
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
  // 장비 시그니처 — 전투당 1회 상태이상 무효 사용 여부.
  statusBlockUsed: boolean;
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
  // 저주 (curse 스킬) — 플레이어에 누적되는 저주 스택. threshold 이상이면 적 페이즈 시작에 폭발하며
  // threshold 만큼 소모되고, 남은 스택은 적 평타 피해를 증폭한다. 마법방어/상태방어 대응 축.
  curseStacks: number;
  // 철벽 (4티어) — 남은 보호막. 받는 피해를 먼저 흡수. 회복 안 됨.
  playerShield: number;
  // 회피 강화로 적립된 보장 회피 잔량 — enemy phase 에서 % 회피 판정 전에 우선 소모.
  evadesRemaining: number;
  // 무피해 난무 (4티어) — 이 전투에서 플레이어가 실제로 받은 누적 HP 피해 (보호막 흡수분 제외). 0 = 무피해.
  damageTakenThisCombat: number;
  // 약점 적중 — DEF 무시 큐 남은 카운트. 트리거 시 weakpointExtraAttacks 만큼 누적, 공격당 1 감산.
  weakpointDefIgnoreLeft: number;
  // ── 전문화 시그니처(c) 전투내 누적 — 신규. 0 = 미보유/미누적. ──
  // 강체(금강) — 받은 HP 피해 비례로 누적된 DEF 보너스(전투 내, 상한 = 기본 DEF).
  braceDefBonus: number;
  // 연격세(연환) — 적중할 때마다 누적된 ATK 보너스(전투 내, 상한).
  comboAtkBonus: number;
  // 절초(연환) — 전투 내 누적 적중 횟수(마무리 강타 주기 판정용).
  comboHitCount: number;
  // 고유 시그니처(포식자) — 전투 내 누적 적중 횟수(N타마다 추가타 주기·Phase 2). every_n_hits
  //   시그니처 미장착이면 0 고정(증가 안 함) → byte-identical.
  signatureHitCount: number;
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
  skillDmgReducePct: number; // 철포 — 받는 피해 -%(받피감 버프, 직업 킷 재설계)
  skillDmgReduceTurns: number;
  skillReflectBoostPct: number; // 반사 태세 — 모든 반사 피해 +%
  skillReflectBoostTurns: number;
  enemyVulnPct: number; // 속박 — 적 받는 피해 +%(전 데미지)
  enemyVulnTurns: number;
  // 원소술사 — 빛(실명: 적 회피 -%) / 어둠(암흑: 적 명중 -%). enemyVuln 미러(타겟 디버프).
  enemyEvasionDownPct: number; // 실명 — 적 회피 -%p(플레이어 명중↑)
  enemyEvasionDownTurns: number;
  enemyAccuracyDownPct: number; // 암흑 — 적 명중 -%p(적 헛침↑)
  enemyAccuracyDownTurns: number;
  enemyHealReducePct: number; // 화상 — 적 회복 효과 -%(회복 스킬·재생). 흡혈 제외.
  enemyHealReduceTurns: number;
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

// 절초 주기(COMBO_FINISHER_PERIOD)·SPELL_STACK_CAP·MAGIC_VULN_STACK_CAP 은 v2CombatConstants 로
// 이관 — PvE/PvP 공용. 기존 import 경로 호환 재노출.
export { COMBO_FINISHER_PERIOD } from "@/adventure/data/v2/v2CombatConstants";

export type PlayerCombat = {
  /** v2 전투 숫자 단위 스케일. 미지정이면 전투 진입 전 현재 스케일로 보정된다. */
  combatNumberScale?: number;
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
  // v2 스킬 — 나한권(VIT 비례 딜) 스케일용 VIT total, 전문화 스킬 차수 flat(baseFlatByTier) 해석용 차수.
  vitStat?: number;
  // v2 스킬 — scaling:"dex"/"luk" 비례 딜(도적 직군) 스케일용 DEX/LUK total. 0/undefined=no-op.
  dexStat?: number;
  lukStat?: number;
  // v2 스킬 — scaling:"all" 비례 딜용 최종 스탯 합계(STR/VIT/DEX/SPD/INT/SPI/LUK).
  allStatTotal?: number;
  classTier?: number;
  atk: number;
  // v2 마법 공격력(magicAtk = INT 환산). scaling="magic" 스킬이 atk 대신 이 값으로 스케일.
  // 0/undefined(라이브·STR/DEX 빌드·적) = 마법 경로 비활성, v2DamageAmount 가 atk 로 폴백.
  magicAtk?: number;
  def: number;
  spd: number; // 선공 판정에 사용
  evasionPct: number; // 0~100, 표시 전용(캡 75). 전투 회피는 evaRating 대결.
  // 회피 대결형 — 캡 없는 raw 회피레이팅. 전투(PvE 양방향·PvP)가 공격자 명중과 dodgeChance 대결.
  //   미지정 시 evasionPct 로 폴백(레거시/일부 테스트). derive 는 항상 채움.
  evaRating?: number;
  // v2 명중률 — 표시 전용(캡 35). 전투 명중은 accRating(대결형 Slice 2).
  accuracyPct?: number;
  // 회피 대결형 Slice 2 — 캡 없는 raw 명중레이팅. 방어자 회피 대결을 누른다(evaRating 대칭).
  //   미지정 시 accuracyPct 로 폴백(레거시/일부 테스트). derive 는 항상 채움.
  accRating?: number;
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
  // 원소 통달(원소술사 패시브) — 속성 유리/불리 +%p. 스킬 cast 시 elementAdvPct/disPct 에 가산. 0=미보유.
  elementAdvPctBonus?: number;
  elementDisPctBonus?: number;
  // 이중 행운 — 첫 크리티컬 발동 시 회피/크리티컬 +bonus% 발동, 전투 종료까지 유지. 0 이면 미보유.
  doubleLuck?: { evade: number; crit: number };
  // 가드 — 첫 N턴 동안 받는 피해 -reduction. 둘 다 0 이면 스킬 미보유.
  guard?: { turns: number; reduction: number };
  // 재생 — interval 턴마다 HP +amount. 둘 다 0 이면 스킬 미보유.
  regen?: { interval: number; amount: number };
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
  // 수호자 반사 — 피격 시 내 방어력 기반 고정 데미지(derive 가 def×thornsDefPct% 환산).
  //   PvE enemyPhase + PvP applyOnHitReflect 양쪽이 가산. 0/undefined = 미장착.
  thornsFlatFromDef?: number;
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
  // 재생(regen) — 매 플레이어 턴 시작 시 maxHp의 %만큼 회복(별빛 인챈트). 0/undefined = 미보유.
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
  // 명시적 훅 — 평타를 마법공격력(magicAtk) 기반으로 전환, 적 magicDef(없으면 def 폴백)로 경감. undefined=미보유.
  passiveMagicBasicAttack?: boolean;
  // 전문화 패시브(철벽검류 등) — 받는 피해 -pct%(항상 활성, 곱연산). enchantEndurePct 와 동류,
  // 가드/평탄감소 전. derive 가 전문화 aggregate(받피감)로 채움. 0/undefined=미보유.
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
  // ── 전문화 시그니처(c) 전투내 누적형 ──
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
  // ── 고유 아이템 발동형 시그니처(Phase 2) — 장착 세트/단품의 전투내 발동 효과 ──
  // 미장착/없음 = undefined → 엔진 훅 미발화(골든 byte-identical). derive 가 활성분만 채운다.
  equipSignatures?: SignatureEffect[];
  // 밤그림자(5차 LUK 캡스톤) — 스킬 치명에도 크리 오버플로(75% 초과분 크리뎀) 적용. 미보유 = undefined.
  skillCritOverflow?: boolean;
};

// AP 스킬 발동 슬롯 형태 — v2 미장착이라 런타임 비활성이나, apSel no-op scaffolding 의
// 타입 앵커로 유지(발동 경로·조건평가 함수는 제거됨).
export type EquippedAPSkill = { skill: APSkill; condition: APSkillCondition };

export type PlayerAction =
  | { kind: "attack" }
  | { kind: "use_potion"; potionId: PotionId; potion: Potion };
