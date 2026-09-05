import { type PotionId } from "@/adventure/data/potions";
import { type BerserkerCombatState } from "./berserkerCombat";
import {
  type BattleLogEntry,
  type BattleTurnState,
  type PlayerAction,
  type PlayerCombat,
} from "./engineState";
import { type Tier7BattleResources } from "./engineState";
import { type LawInscriptionState } from "./lawInscription";
import { type Tier6UniqueRuntimeState } from "./tier6UniqueEffects";
import { type TripleWardState } from "./tripleWard";

// ── 타입 정의 ───────────────────────────────────────────────────────────────

export type PvPPhase = "p1" | "p2" | "ended";


export type PvPOutcome = "p1_win" | "p2_win" | "draw";


export type PvPPhaseEndOptions = {
  tickDefenderDots?: boolean;
  /** 감전 등으로 본 행동이 취소됐을 때 분신·난무 같은 공격 후속타만 생략한다. */
  skipOffensiveFollowups?: boolean;
};


// 각 사이드별 1회성 토글. PvE 의 BattleFlags 와 비교해 Monster 전용(phaseTriggered, enrageTriggered) 제거.
export type PvPSideFlags = {
  enduranceTriggered: boolean;
  assassinateUsed: boolean;
  luckyBuffActive: boolean;
  fatedChainCritPending: boolean;
  skillCritAfterEvadePending: boolean;
  statusBlockUsed: boolean;
  trackedShieldBreakUsed?: boolean;
};


// 각 사이드별 누적 보너스/페널티. PvE 의 BattleBuffs 와 비교해 enemyDefBonus(phase trigger),
// enemyAtkBonus(enrage) 제거. enemyAtkPenalty/enemyDefPenalty 는 opponentAtkPenalty/opponentDefPenalty
// 로 의미 일관화 (이 사이드가 상대에게 적용한 페널티).
// AP 스킬 지속 효과 — 모두 "이 사이드 자신에게 걸린/이 사이드가 상대에게 건" 효과로 정의:
//   playerXxx     → 자기-효과 (결의/광기/폭주). 자기 공격/방어 시 사용.
//   enemyXxx      → 외향 효과 (약점노출/둔화). 자기 공격 시 사용.
//   enemyAttackBlockedCount → 방어용 카운터 (잔상). 상대가 공격해 올 때 소비.
//   enemySilenceTurnsLeft → 호환용 (PvP 는 몬스터 skill 없어 무효).
export type PvPSideBuffs = {
  rampageAtkBonus: number;
  opponentAtkPenalty: number;
  opponentDefPenalty: number;
  cyclingChiBonus: number;
  potionHealPct: number;
  // 결의 — 자기가 받는 피해 -pct% (defender 일 때 적용).
  playerDmgReductionPct: number;
  playerDmgReductionTurnsLeft: number;
  // 광기 — 자기 ATK +atkPct% / 자기 DEF -defPct%.
  playerAtkBuffPct: number;
  playerAtkBuffTurnsLeft: number;
  playerDefDebuffPct: number;
  playerDefDebuffTurnsLeft: number;
  // 폭주 — 자기 SPD ×mult.
  playerSpdMult: number;
  playerSpdTurnsLeft: number;
  // 약점 노출 — 공격 시 상대 DEF -pct%.
  enemyDefDebuffPct: number;
  enemyDefDebuffTurnsLeft: number;
  enemyMagicDefDebuffPct?: number;
  enemyMagicDefDebuffTurnsLeft?: number;
  // 둔화 — SPD 비교에서 상대 SPD ×mult.
  enemySpdMult: number;
  enemySpdTurnsLeft: number;
  // 천뢰 — PvP 에선 무효 (몬스터 skill 없음) 하지만 호환용 보관.
  enemySilenceTurnsLeft: number;
  // 잔상 — 상대 공격 N회 무효 (defender 일 때 소비).
  enemyAttackBlockedCount: number;
  // 흡령 — 시한부 흡혈. 가한 데미지의 pct% 만큼 자가 회복. turnsLeft 0 이면 비활성.
  playerLifestealPct: number;
  playerLifestealTurnsLeft: number;
  tier6UnityHealPct?: number;
  tier6UnityTurnsLeft?: number;
};


export type PvPSideStacks = {
  patternAlternateLastSkillByPair?: Record<string, string>;
  tripleWard: TripleWardState;
  fortressImpact: number;
  ironWallReflectCharges: number;
  /** 골렘 변이 — 전투 한정 중량(0..3). */
  mutationWeight: number;
  lawInscriptions?: LawInscriptionState;
  /** 이 전투자가 상대에게서 받은 한기. */
  frostChillStacks?: number;
  playerShield: number;
  trackedSetShield?: number;
  evadesRemaining: number;
  damageTakenThisCombat: number;
  weakpointDefIgnoreLeft: number;
  // 강체/장비 시그니처 — 받은 HP 피해 비례로 누적된 DEF 보너스(전투 내, 상한 = 기본 DEF).
  braceDefBonus: number;
  // PR2-B 전문화 스킬 temp 버프 — PvE BattleStacks 미러. 전부 0/turns=0 이면 inert(골든 불변).
  skillRegenPct: number; // 운기 — 매 자기 턴 maxHp %
  skillRegenTurns: number;
  skillCritPct: number; // 연환집중 — 치명률 +%p
  skillCritTurns: number;
  skillEvasionPct: number; // 선풍각 — 회피도 +%
  skillEvasionTurns: number;
  accuracyDownPct: number; // 암흑 — 이 side 의 적중도 -%.
  accuracyDownTurns: number;
  skillDmgReducePct: number; // 진홍 심판·철포 — 받는 피해 -%
  skillDmgReduceTurns: number;
  skillReflectBoostPct: number; // 활성 반사 증폭 — 모든 반사 피해 +%
  skillReflectBoostTurns: number;
  enemyVulnPct: number; // 속박 — 시전자가 가하는 피해 +% (받는 쪽 취약)
  enemyVulnTurns: number;
  enemyMagicVulnPct?: number;
  enemyMagicVulnTurns?: number;
  // 화상(원소술사 불) — 이 side 에 걸린 회복 감소 디버프(상대가 부착). 이 side 의 회복(회복 스킬·재생)
  //   −healReducePct%. 흡혈/공격파생 회복은 제외. 자기 턴(cast hook)에 turns 감소.
  healReducePct: number;
  healReduceTurns: number;
  damageDownPct: number; // 쇠약 — 이 side 가 주는 직접 피해 -%.
  damageDownTurns: number;
  skillProcDownPct: number; // 금제 — 이 side 의 스킬 발동률 -%p.
  skillProcDownTurns: number;
  dotVulnPct: number; // 침식 — 이 side 가 받는 DoT/마법취약 피해 +%.
  dotVulnTurns: number;
  // 약점 노출(마도사) — 이 side 에 누적된 마법취약 스택(상대가 부착). 스택당 받는 스킬피해 +%
  // (상대 enemyMagicVulnPctPerStack), 비전 작렬 payoff 가 소비. 감쇠 없음·MAGIC_VULN_STACK_CAP 상한.
  magicVulnStacks: number;
  // 주문 중첩(워메이지) — 이 side(시전자)의 누적 스킬 시전 횟수. 스택당 스킬피해 +skillDmgPctPerCast%.
  // 감쇠 없음·SPELL_STACK_CAP 상한.
  spellCastCount: number;
  // 절초 — 누적 적중 4타째마다 피해 증폭. PvE BattleStacks.comboHitCount 미러.
  comboHitCount: number;
  // 고유 시그니처 — 이 side 의 평타·스킬 누적 적중 횟수(N회마다 추가 기본 공격). 미장착=0 고정.
  signatureHitCount: number;
  // every_n_hits 로 예약된 추가 기본 공격 잔량. 이 공격은 자기 자신의 다음 주기 적중에는 포함하지 않는다.
  signatureBonusAttacksLeft: number;
  /** 이 side에 걸린 감전 행동 상태. */
  shockAction?: import("./shockAction").ShockActionState;
  /** 6T 시그니처를 하나라도 장착했을 때만 생성하는 전투 한정 자원. */
  tier6Uniques?: Tier6UniqueRuntimeState;
  /** 내부 7차 스킬을 장착했을 때만 생성하는 전투 한정 자원. */
  tier7?: Tier7BattleResources;
};


export type PvPSide = {
  player: PlayerCombat;
  name: string;
  hp: number;
  maxHp: number;
  duelistBuff?: import("./duelistCombat").DuelistBuff | null;
  duelistCritHastePending?: boolean;
  // v2 마법 풀 — 일기토/토너먼트 매치 시작 시 풀충전 (PR-3·4). INT 0 = 둘 다 0.
  mp: number;
  maxMp: number;
  magicBarrier?: number;
  maxMagicBarrier?: number;
  attacksLeft: number;
  // 유격 (skirmishNextTurnBonus) — 이 사이드가 회피 성공 시 누적, 다음 자기 공격 페이즈
  // 시작 시 attacksLeft 에 더해지고 0 으로 리셋. PvE 의 enemy phase 내 직접 가산을
  // PvP 에선 페이즈 분리 때문에 별도 슬롯이 필요.
  nextTurnAttackBonus: number;
  turn: BattleTurnState;
  flags: PvPSideFlags;
  buffs: PvPSideBuffs;
  stacks: PvPSideStacks;
  // v2 스킬 (v2_skill_*) — PR-4a framework. 라이브 spells.ts 와 별개. equipped 빈 배열이면 no-op.
  v2Skills: import("@/adventure/data/v2/v2Skills").V2SkillsState;
  v2SkillCooldowns: import("./combatShared").V2SkillCooldowns;
  // v2 스킬 buff slot (PR-4b). pct 정수, turns 매 attacker turn 진입 시 -1.
  // v2SelfBuffs: 이 side 가 자기에게 건 강화. v2SelfDebuffs: 상대가 이 side 에 건 약화.
  v2SelfBuffs: import("./combatShared").V2BuffMap;
  v2SelfDebuffs: import("./combatShared").V2BuffMap;
  // PR-8 — DoT (지속 피해). 상대가 이 side 에 박은 dot. 매 자기 turn 진입 시 tick → hp 차감.
  v2Dots: import("./combatShared").V2Dot[];
  berserker?: BerserkerCombatState;
};


export type PvPBattleState = {
  p1: PvPSide;
  p2: PvPSide;
  phase: PvPPhase;
  outcome: PvPOutcome | null;
  log: BattleLogEntry[];
  // 호출 표면별 최종 피해 배율. 미지정(일반 PvP)은 1, 아레나는 라우트에서 0.65를 주입한다.
  // HP 비용·자해·회복에는 사용하지 않고 상대에게 가하는 피해 경로에서만 읽는다.
  damageMultiplier?: number;
  // 호출 표면별 회복·보호막 생성 배율. 미지정(일반 PvP)은 1, 아레나는 0.65를 주입한다.
  // 직접 보호막은 이 값을 적용하고, 회복 전환 보호막은 보정된 실제 회복량을 기준으로 계산한다.
  sustainMultiplier?: number;
};


// ── 메인 advanceTurn ─────────────────────────────────────────────────────────

export type PvPAttackDamageResult = {
  assassinFires: boolean;
  critRoll: boolean;
  crushReduction: number;
  cyclingChiThisTurn: number;
  decreeFires: boolean;
  dmg: number;
  enduringStrikeBonus: number;
  executionActive: boolean;
  fatedChainConsumed: boolean;
  focusedBreathConsumed: boolean;
  impactFires: boolean;
  luckyStarFires: boolean;
  manaShieldBypassDmg: number;
  manaShieldEligibleDmg: number;
  totalDmg: number;
  weakpointDefIgnore: boolean;
};


// 방어자 측 능력 통합은 PR-1b 에서. (파일 상단 시리즈 노트 참조.)

// ── 결판 (full simulation) ─────────────────────────────────────────────────

export type PvPResolveContext = {
  pickAction: (state: PvPBattleState, who: "p1" | "p2") => PlayerAction;
  potions: { p1: Partial<Record<PotionId, number>>; p2: Partial<Record<PotionId, number>> };
  // 전투 시작 로그에 박을 전술 안내 한 줄(양측 전술 라벨). 호출부가 문자열로 빌드해 넘긴다
  // (엔진은 stance 를 모름 — 순환 의존 회피). 미지정이면 추가 안 함.
  openingNote?: string;
  // 상대에게 가하는 최종 피해 배율. 기본 1이며 아레나처럼 특정 호출 표면만 조정할 때 사용한다.
  damageMultiplier?: number;
  // HP 회복과 새 보호막 생성 배율. 기본 1이며 아레나에서만 별도 조정한다.
  sustainMultiplier?: number;
  // 선공 추첨값(0 이상 1 미만). 테스트·재현 경로는 명시하고 실제 전투는 Math.random 1회를 쓴다.
  initiativeRoll?: number;
  // v2 스킬 상태 (PR-4a) — saves_kv "skills.v2" 의 learned/equipped, 양 side 별도. 미지정/빈 배열이면
  // v2 스킬 cast no-op. 라우트가 saves_kv 에서 읽어 넘긴다.
  v2Skills?: {
    p1?: import("@/adventure/data/v2/v2Skills").V2SkillsState;
    p2?: import("@/adventure/data/v2/v2Skills").V2SkillsState;
  };
};


export type PvPBattleResolution = {
  outcome: PvPOutcome;
  finalState: PvPBattleState;
  potionsConsumed: {
    p1: Partial<Record<PotionId, number>>;
    p2: Partial<Record<PotionId, number>>;
  };
  turns: number;
};


// PvP 결판 — 양쪽이 turn cap 까지 결판 못 내면 무승부.
export const PVP_TURN_CAP = 100;
