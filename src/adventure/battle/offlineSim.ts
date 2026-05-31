// 오프라인 자동 사냥 시뮬레이션.
// 페이지가 background/closed 상태인 동안에는 JS가 돌지 못하므로,
// 사용자가 돌아왔을 때 "그 동안 일어났을 일"을 결정적으로 한 번에 계산해 보상으로 지급한다.
//
// 정확성보다 일관성/단순성을 우선:
// - engine.ts의 advanceTurn 그대로 재사용 — 실시간 자동 전투와 결과 분포 동일
// - 시간은 전투당 라이브 쿨다운(battleCooldownMs ≈ 600~5000ms)만 경과 — 전투 자체는 즉시
// - 시뮬 가능 시간은 OFFLINE_SIM_MAX_MS(6시간)로 cap, 그리고 input.maxBattles 로 전투 수도 cap
//   (원샷 캐릭터가 한 묶음에 수천 킬 쏟는 것 방지 — 자동 사냥 collect 가 AUTO_HUNT_MAX_BATTLES 주입)

import { pickEnemyName, type Region } from "../data/world";
import { MONSTERS } from "../data/monsters";
import { monsterGoldReward } from "./monsterGold";
import { POTIONS, type PotionId } from "../data/potions";
import { type MaterialId } from "../data/materials";
import { type ItemId } from "../data/items";
import { rollDropQuality, type DropQuality } from "../data/dropQuality";
import { type SkillBookId } from "../data/skillBooks";
import {
  advanceTurn,
  initialBattleState,
  setBattleLogCollection,
  type BattleState,
  type PlayerAction,
  type PlayerCombat,
} from "./engine";
import {
  applyV2BuffsToMap,
  applyV2DotsToTarget,
  resolveV2SkillCast,
  tickV2BuffMap,
  tickV2Dots,
} from "./combatShared";
import type { V2SkillsState } from "../data/v2/v2Skills";
import {
  AUTO_HUNT_REVIVE_DELAY_MS,
  AUTO_HUNT_REVIVE_POTION_REFILL,
} from "./autoHunt";
import {
  applyExpGain,
  applyNewbieBonus,
  getNewbieDropMultiplier,
  levelBandExpMultiplier,
  XP_RATE_MULT,
} from "@/lib/leveling";

export const OFFLINE_SIM_MAX_MS = 6 * 60 * 60 * 1000;

// 라이브 자동 전투의 전투 사이 쿨다운 — useBattle.ts 의 computeBattleCooldown / 상수와 동일해야 함.
// (useBattle.ts 는 React hook 이라 여기서 import 하지 않고 값을 복제 — 양쪽을 함께 고칠 것.)
// 위탁/오프라인 sim 도 이 페이싱을 그대로 따른다: 전투 자체는 "즉시" 끝나고, 한 전투가 끝날
// 때마다 battleCooldownMs(min(턴 수, 6)) ≈ 1500~3000ms 만큼 흐른 것으로 친다. 턴 수 기준이라
// 출혈/철벽/연타 같은 스킬 메시지가 많아도 페이싱은 안 흔들린다.
const BATTLE_COOLDOWN_PER_TURN_MS = 500;
const BATTLE_COOLDOWN_MIN_MS = 1500;
const BATTLE_COOLDOWN_MAX_MS = 3000;
const BATTLE_TURN_CLAMP = 6;
function battleCooldownMs(turns: number): number {
  const raw = turns * BATTLE_COOLDOWN_PER_TURN_MS;
  return Math.max(BATTLE_COOLDOWN_MIN_MS, Math.min(BATTLE_COOLDOWN_MAX_MS, raw));
}
// 안전망 — advanceTurn 이 (양쪽 회피 등으로) 무한히 안 끝나는 비정상 전투 차단.
const MAX_TURNS_PER_BATTLE = 2000;

export type OfflineSimInput = {
  player: PlayerCombat;
  playerName: string;
  region: Region;
  /** 신참 보너스(Lv30 미만) 판정 시작 레벨. 사이클 중 누적 EXP 로 레벨업하면 그 시점부터 보너스 OFF. */
  playerLevel: number;
  /** 시뮬 시작 시점의 누적 EXP — 사이클 중 레벨업 판정에 사용. 미지정 시 0. */
  playerExp?: number;
  potions: Partial<Record<PotionId, number>>;
  // [DEPRECATED] 옛 모델의 턴당 시간 — 현재 무시됨. 시간은 전투당 라이브 쿨다운으로 경과한다.
  // (입력 호환을 위해 필드만 유지.)
  turnIntervalMs: number;
  // 페이지 비운 실제 시간(ms). cap 미적용 raw 값.
  awayMs: number;
  // 진행할 전투 수 상한 — 강한 캐릭터가 시간 cap 안에서 과도하게 많은 전투를 도는 것 방지.
  // 미지정 시 무제한(시간 cap 만 적용). 자동 사냥은 AUTO_HUNT_MAX_BATTLES 를 넣는다.
  maxBattles?: number;
  // 자동 행동 결정 — pickAutoAction을 그대로 주입.
  pickAction: (state: BattleState) => PlayerAction;
  // 드롭률 보정 — onBattleEnd 와 동일 공식 (1 + luk*0.01, cap 1.0).
  luk: number;
  // 이미 보유 중인 제작서 판정. recipe 드롭은 미보유 상태에서만 학습.
  knowsRecipe: (recipeId: string) => boolean;
  // 적 선택 + 드롭 굴림에 쓰일 RNG. 테스트에서 시드 가능.
  rng?: () => number;
  /**
   * Wall-clock 예산(ms). sim 이 이 시간을 넘기면 외측 루프에서 즉시 종료하고
   * 그 시점까지의 결과를 돌려준다. 서버에서 단일 EC2 의 이벤트 루프를 한 collect
   * 가 수 초 동안 점유하는 사고를 방지 — 미지정 시 무제한(기존 동작). 클라/테스트는
   * 굳이 쓸 필요 없음.
   */
  runBudgetMs?: number;
  /**
   * 레벨 추적용 EXP 배수 — sim 내 runningLevel 이 *최종 저장 레벨*과 일치하도록, 각 킬의
   * raw EXP 에 이 배수를 곱한 값으로 레벨업을 추적한다(밴드 배율·신참 경계 판정 정합).
   * = efficiency × 파라곤 × 부여(autoHunt 후처리와 동일). result.expGained 는 raw 유지 —
   * 영속 캐시 의미 불변. 미지정 시 1(기존 동작 — 클라/테스트 직접 호출).
   */
  expLevelTrackingMult?: number;
  /**
   * v2 스킬 상태 (PR-4a) — learned/equipped. 미지정 또는 빈 배열이면 v2 스킬 cast no-op.
   * MP/cooldown 풀은 전투마다 풀충전·리셋 (단판 모델).
   */
  v2Skills?: V2SkillsState;
};

export type OfflineSimResult = {
  simulatedMs: number; // 실제 시뮬레이션된 시간 (cap 적용)
  cappedByLimit: boolean; // OFFLINE_SIM_MAX_MS에 걸렸는지
  battles: number; // 끝까지 진행된 전투 수
  wins: number;
  killsByName: Record<string, number>;
  expGained: number;
  /** 신참 보너스가 한 번이라도 적용됐는지 — UI 배지용. */
  expBonusApplied: boolean;
  goldGained: number;
  materialsGained: Partial<Record<MaterialId, number>>;
  // 드랍된 장비 + 그 품질 등급(0=기본/1=정교한/2=빼어난). 같은 아이템/등급이라도 1개씩 push.
  equipsGained: { itemId: ItemId; quality: DropQuality }[];
  recipesLearned: string[]; // 미보유였던 것만 — onApply 가 그대로 learn 호출.
  /** 드랍된 스킬북 — 같은 책 여러 권이면 같은 횟수만큼 push. */
  skillBooksGained: SkillBookId[];
  potionsConsumed: Partial<Record<PotionId, number>>;
  /**
   * 부활 시퀀스로 사이클 중 지급된 포션 수 (potionId → 지급 누계).
   * applyResultToSaves 가 인벤토리에 더해주고, potionsConsumed 는 동일 사이클에 쓰인
   * 만큼 깎인다 — 둘이 별개라 같은 포션이 양쪽에 동시에 잡혀도 정합성 OK.
   */
  potionsGranted: Partial<Record<PotionId, number>>;
  /** 사이클 중 부활한 횟수 — 0 이면 부활 발동 없음. */
  revives: number;
  finalPlayerHp: number;
  /**
   * 마지막 전투가 패배로 끝났는지. 현재는 부활 시퀀스가 무제한이라 사이클이 사망으로
   * 끝나는 케이스는 사실상 없음 (cap 직전 사망 후 부활 → cap 초과로 정상 종료). 응답
   * 호환을 위해 필드만 유지하되 항상 false 를 기대해도 무방.
   */
  died: boolean;
  /** runBudgetMs 가 발동돼 sim 이 잘렸으면 true (observability). */
  cappedByBudget?: boolean;
};

export function simulateOfflineHunt(input: OfflineSimInput): OfflineSimResult {
  const cap = Math.min(input.awayMs, OFFLINE_SIM_MAX_MS);
  const cappedByLimit = input.awayMs > OFFLINE_SIM_MAX_MS;
  const maxBattles = input.maxBattles ?? Infinity;
  const rng = input.rng ?? Math.random;
  // 레벨 추적용 EXP 배수 — 후처리(efficiency×파라곤×부여)와 동일. 미지정 시 1(기존 동작).
  const expLevelTrackingMult = input.expLevelTrackingMult ?? 1;
  // wall-clock 예산 — 시작 시각 + 마감 시각 캐시. 미지정 시 Infinity (기존 동작).
  const runDeadline =
    typeof input.runBudgetMs === "number" && input.runBudgetMs > 0
      ? Date.now() + input.runBudgetMs
      : Infinity;

  const result: OfflineSimResult = {
    simulatedMs: 0,
    cappedByLimit,
    battles: 0,
    wins: 0,
    killsByName: {},
    expGained: 0,
    expBonusApplied: false,
    goldGained: 0,
    materialsGained: {},
    equipsGained: [],
    recipesLearned: [],
    skillBooksGained: [],
    potionsConsumed: {},
    potionsGranted: {},
    revives: 0,
    finalPlayerHp: input.player.hp,
    died: false,
  };

  if (cap <= 0) return result;
  if (input.region.enemies.length === 0) return result;

  const potions: Partial<Record<PotionId, number>> = { ...input.potions };
  // 같은 사이클 안에서 같은 제작서를 두 번 굴려 중복 학습되지 않도록.
  const learnedThisSim = new Set<string>();
  const luckMultiplier = 1 + input.luk * 0.01;
  let currentHp = input.player.hp;
  let elapsed = 0;
  // 신참 보너스 ×2 (EXP + 드롭) 판정용 — 매 처치마다 누적 EXP 로 레벨업 추적.
  // 레벨이 임계치 (NEWBIE_BONUS_LEVEL_THRESHOLD) 도달하는 순간부터 다음 처치에는 보너스 OFF.
  let runningLevel = input.playerLevel;
  let runningExp = input.playerExp ?? 0;

  // 시뮬은 전투 로그를 안 읽으므로 로그 수집을 끈다 — appendLog 의 O(턴²) 배열 복사 제거.
  // 동기 함수라 try/finally 로 플래그를 반드시 복구(라이브/PvP 로 누수 방지).
  setBattleLogCollection(false);
  try {
  while (elapsed < cap && currentHp > 0 && result.battles < maxBattles) {
    // wall-clock 예산 초과 시 즉시 종료 — 이벤트 루프 점유 방지.
    // (전투 한 판 단위로만 체크 — 내측 turn 루프는 짧으므로 충분.)
    if (runDeadline !== Infinity && Date.now() > runDeadline) {
      result.cappedByBudget = true;
      break;
    }
    const enemyName = pickEnemyName(input.region, rng);
    if (!enemyName) break;
    const enemy = MONSTERS[enemyName];
    if (!enemy) break;

    const playerForBattle: PlayerCombat = { ...input.player, hp: currentHp };
    let state = initialBattleState(
      playerForBattle,
      enemy,
      input.playerName,
      input.v2Skills,
    );
    let battleFinished = false;
    let turns = 0;
    // PR-4a: v2 스킬 cast dedupe — phase-entry flag. player phase 에 진입할 때마다 1회만
    // cast. (completedPlayerTurns 기반 dedupe 는 potion-only turn 종료 케이스에서 한 turn 을
    // 건너뛰는 버그가 있어 phase flag 로 대체.)
    let v2CastedThisPlayerPhase = false;
    // PR-5b — enemy v2 cast dedupe.
    let v2CastedThisEnemyPhase = false;

    while (state.phase !== "ended" && turns < MAX_TURNS_PER_BATTLE) {
      turns += 1;
      let action: PlayerAction = { kind: "attack" };
      if (state.phase === "player") {
        v2CastedThisEnemyPhase = false;
      } else {
        // enemy/ended — player flag reset.
        v2CastedThisPlayerPhase = false;
      }
      // PR-5b: enemy phase 진입 시 1회 enemy v2 cast. resolveBattle 미러 (로그 X).
      // PR-8: dot tick 도 phase 진입 시 (cast 전).
      if (state.phase === "enemy" && !v2CastedThisEnemyPhase) {
        v2CastedThisEnemyPhase = true;
        // 0) enemyV2Dots tick → enemyHp 차감. lethal 처리.
        const enemyDotTick = tickV2Dots(state.enemyV2Dots);
        if (enemyDotTick.totalDmg > 0) {
          state = {
            ...state,
            enemyHp: Math.max(0, state.enemyHp - enemyDotTick.totalDmg),
            enemyV2Dots: enemyDotTick.nextDots,
          };
          if (state.enemyHp <= 0) {
            state = {
              ...state,
              outcome: "win",
              phase: "ended",
              turn: {
                ...state.turn,
                completedPlayerTurns: state.turn.completedPlayerTurns + 1,
              },
            };
            continue;
          }
        } else {
          state = { ...state, enemyV2Dots: enemyDotTick.nextDots };
        }
        const tEBuffs = tickV2BuffMap(state.enemyV2SelfBuffs);
        const tEDebuffs = tickV2BuffMap(state.enemyV2Debuffs);
        const tPDebuffs = tickV2BuffMap(state.v2SelfDebuffs);
        const ec = resolveV2SkillCast({
          skills: state.enemyV2Skills,
          cooldowns: state.enemyV2SkillCooldowns,
          attacker: {
            mp: state.enemyMp,
            atk: state.enemy.atk,
            maxHp: state.enemy.hp,
            selfBuffs: tEBuffs,
            selfDebuffs: tEDebuffs,
            // PR-5b — 몬스터 속성(보정=1).
            attackElement: state.enemy.element,
            characterElement: state.enemy.element,
          },
          target: {
            def: playerForBattle.def,
            magicDef: playerForBattle.magicDef,
            selfBuffs: state.v2SelfBuffs,
            selfDebuffs: tPDebuffs,
            element: playerForBattle.characterElement,
          },
        });
        const nextEBuffs = applyV2BuffsToMap(tEBuffs, ec.selfBuffsToApply);
        const nextPDebuffs = applyV2BuffsToMap(tPDebuffs, ec.enemyDebuffsToApply);
        const nextPDots = applyV2DotsToTarget(state.playerV2Dots, ec.dotsToApplyToTarget);
        state = {
          ...state,
          enemyMp: ec.nextMp,
          enemyV2SkillCooldowns: ec.nextCooldowns,
          enemyV2SelfBuffs: nextEBuffs,
          enemyV2Debuffs: tEDebuffs,
          v2SelfDebuffs: nextPDebuffs,
          playerV2Dots: nextPDots,
          playerHp: Math.max(0, state.playerHp - ec.enemyDamage),
          enemyHp: Math.min(state.enemy.hp, state.enemyHp + ec.selfHeal),
        };
        if (state.playerHp <= 0) {
          state = {
            ...state,
            outcome: "lose",
            phase: "ended",
          };
          continue;
        }
      }
      if (state.phase === "player") {
        // v2 스킬 cast (PR-4b — MP + cd + 효과 적용). offlineSim 은 로그 미수집 → log entry skip.
        // PR-8 — playerV2Dots tick (적이 박은 dot) → playerHp 차감.
        if (!v2CastedThisPlayerPhase) {
          v2CastedThisPlayerPhase = true;
          const playerDotTick = tickV2Dots(state.playerV2Dots);
          if (playerDotTick.totalDmg > 0) {
            state = {
              ...state,
              playerHp: Math.max(0, state.playerHp - playerDotTick.totalDmg),
              playerV2Dots: playerDotTick.nextDots,
            };
            if (state.playerHp <= 0) {
              state = { ...state, outcome: "lose", phase: "ended" };
              continue;
            }
          } else {
            state = { ...state, playerV2Dots: playerDotTick.nextDots };
          }
          const tickedSelfBuffs = tickV2BuffMap(state.v2SelfBuffs);
          const tickedSelfDebuffs = tickV2BuffMap(state.v2SelfDebuffs);
          const tickedEnemyDebuffs = tickV2BuffMap(state.enemyV2Debuffs);
          const cast = resolveV2SkillCast({
            skills: state.v2Skills,
            cooldowns: state.v2SkillCooldowns,
            attacker: {
              mp: state.playerMp,
              atk: playerForBattle.atk,
              magicAtk: playerForBattle.magicAtk ?? playerForBattle.atk,
              minDamage: playerForBattle.minDamage,
              healMult: playerForBattle.healMult,
              maxHp: state.playerMaxHp,
              selfBuffs: tickedSelfBuffs,
              selfDebuffs: tickedSelfDebuffs,
              attackElement: playerForBattle.attackElement,
              characterElement: playerForBattle.characterElement,
            },
            target: {
              def: state.enemy.def,
              // PR-5b: enemy 측 v2 buff 도 사용 (monster v2 cast 결과 + def buff 가 vit buff).
              selfBuffs: state.enemyV2SelfBuffs,
              selfDebuffs: tickedEnemyDebuffs,
              element: state.enemy.element,
            },
          });
          const nextSelfBuffs = applyV2BuffsToMap(tickedSelfBuffs, cast.selfBuffsToApply);
          const nextEnemyDebuffs = applyV2BuffsToMap(
            tickedEnemyDebuffs,
            cast.enemyDebuffsToApply,
          );
          const nextEnemyDots = applyV2DotsToTarget(state.enemyV2Dots, cast.dotsToApplyToTarget);
          state = {
            ...state,
            playerMp: cast.nextMp,
            v2SkillCooldowns: cast.nextCooldowns,
            v2SelfBuffs: nextSelfBuffs,
            v2SelfDebuffs: tickedSelfDebuffs,
            enemyV2Debuffs: nextEnemyDebuffs,
            enemyV2Dots: nextEnemyDots,
            playerHp: Math.min(
              state.playerMaxHp,
              state.playerHp + cast.selfHeal,
            ),
            enemyHp: Math.max(0, state.enemyHp - cast.enemyDamage),
          };
          // v2 damage lethal — advanceTurn 호출 전에 outcome 박고 종료.
          if (state.enemyHp <= 0) {
            state = {
              ...state,
              outcome: "win",
              phase: "ended",
              turn: {
                ...state.turn,
                completedPlayerTurns: state.turn.completedPlayerTurns + 1,
              },
            };
            continue;
          }
        }
        const picked = input.pickAction(state);
        if (picked.kind === "use_potion") {
          const have = potions[picked.potionId] ?? 0;
          if (have > 0) {
            potions[picked.potionId] = have - 1;
            result.potionsConsumed[picked.potionId] =
              (result.potionsConsumed[picked.potionId] ?? 0) + 1;
            action = picked;
          } else {
            // 보유량 0이면 자동으로 공격으로 폴백 (실시간 useBattle와 동일).
            action = { kind: "attack" };
          }
        } else {
          action = picked;
        }
      }

      state = advanceTurn(state, playerForBattle, input.playerName, action);
    }

    if (state.phase === "ended") {
      battleFinished = true;
      result.battles += 1;
      if (state.outcome === "win") {
        result.wins += 1;
        result.killsByName[enemyName] =
          (result.killsByName[enemyName] ?? 0) + 1;
        // 킬당 base 골드(raw). gold 드롭과 동일하게 후처리(efficiency×paragon×부여)된다.
        result.goldGained += monsterGoldReward(enemy);
        // 이 처치 시점의 레벨 — EXP 보너스·밴드 배율·드롭 보너스 모두 *이 킬 직전* 레벨로
        // 일관 판정한다. (이 킬의 EXP 로 레벨업하더라도 그건 다음 킬부터 반영.)
        const levelAtKill = runningLevel;
        const expBonus = applyNewbieBonus(enemy.exp, levelAtKill);
        const gained = Math.floor(
          expBonus.gained * XP_RATE_MULT * levelBandExpMultiplier(levelAtKill),
        );
        // result.expGained 는 raw 누계 — 영속 캐시(lastClaimResult)의 의미를 보존한다
        // (후처리 applyAutoHuntEfficiency × applyResultToSaves 가 동일하게 곱하던 그 입력).
        result.expGained += gained;
        if (expBonus.bonusApplied) result.expBonusApplied = true;
        // 레벨 추적은 *effective* EXP(= gained × expLevelTrackingMult)로 굴린다. 최종 저장
        // 레벨은 raw 에 efficiency(0.9)×파라곤×부여 를 곱해 재계산하므로(autoHunt), sim 의
        // runningLevel 이 raw 로만 추적하면 둘이 어긋났다(밴드 배율·신참 경계 오판). 호출부
        // (assembleSimInput)가 후처리와 *동일한 배수*를 expLevelTrackingMult 로 주입해 일치시킨다.
        // result.expGained 는 여전히 raw — 캐시 의미 불변.
        const levelGain =
          expLevelTrackingMult === 1
            ? gained
            : Math.floor(gained * expLevelTrackingMult);
        const after = applyExpGain(runningLevel, runningExp, levelGain);
        runningLevel = after.level;
        runningExp = after.exp;
        // 드롭 — onBattleEnd 와 동일 로직(LUK 멀티 + 신참 ×2 + cap 1.0).
        // 신참 드롭 ×2 도 EXP 보너스와 *같은* levelAtKill 로 판정 — 레벨 30 을 넘기는 그 한 킬이
        // EXP 는 신참, 드롭은 비신참으로 어긋나던 것을 일치시킨다.
        const newbieDropMult = getNewbieDropMultiplier(levelAtKill);
        if (enemy.drops) {
          for (const drop of enemy.drops) {
            const adjustedChance = Math.min(
              1,
              drop.chance * luckMultiplier * newbieDropMult,
            );
            if (rng() >= adjustedChance) continue;
            if (drop.kind === "material") {
              const amount = drop.amount ?? 1;
              result.materialsGained[drop.materialId] =
                (result.materialsGained[drop.materialId] ?? 0) + amount;
            } else if (drop.kind === "gold") {
              result.goldGained += drop.amount;
            } else if (drop.kind === "equip") {
              // 드랍 품질 등급 롤 — onBattleEnd 와 동일(보스 bias 반영). seeded rng 스트림에 추가.
              result.equipsGained.push({
                itemId: drop.itemId,
                quality: rollDropQuality(rng, enemy.dropQualityBias ?? 1),
              });
            } else if (drop.kind === "equip_one_of") {
              // 풀에서 균등 추첨 — equip 단일과 동일하게 dropQuality 도 굴린다.
              if (drop.itemIds.length === 0) continue;
              const pick = drop.itemIds[Math.floor(rng() * drop.itemIds.length)];
              result.equipsGained.push({
                itemId: pick,
                quality: rollDropQuality(rng, enemy.dropQualityBias ?? 1),
              });
            } else if (drop.kind === "recipe") {
              if (
                input.knowsRecipe(drop.recipeId) ||
                learnedThisSim.has(drop.recipeId)
              )
                continue;
              learnedThisSim.add(drop.recipeId);
              result.recipesLearned.push(drop.recipeId);
            } else if (drop.kind === "skill_book") {
              result.skillBooksGained.push(drop.bookId);
            } else if (drop.kind === "recipe_one_of") {
              if (drop.recipeIds.length === 0) continue;
              // 풀에서 미보유만 추리고 그 안에서 균등 추첨 — 이미 아는 항목으로 뽑혀
              // 빈손이 되는 사고 방지. 같은 sim 안의 직전 학습도 미보유 풀에서 제외.
              const unknown = drop.recipeIds.filter(
                (id) => !input.knowsRecipe(id) && !learnedThisSim.has(id),
              );
              if (unknown.length === 0) continue;
              const pick = unknown[Math.floor(rng() * unknown.length)];
              learnedThisSim.add(pick);
              result.recipesLearned.push(pick);
            }
          }
        }
        currentHp = state.playerHp;
        // 시간은 라이브 자동 전투와 동일하게 — 전투 자체는 즉시, 전투당 쿨다운만 경과.
        elapsed += battleCooldownMs(
          Math.min(state.turn.completedPlayerTurns, BATTLE_TURN_CLAMP),
        );
      } else {
        // 패배 — 부활 시퀀스: 20분 페널티 + maxHp 까지 회복 + 작은 회복약 15까지 충전.
        // sim 시계가 cap 을 넘으면 외부 while 조건이 자연히 끊는다 (cap 직전 사망의 정상 처리).
        result.revives += 1;
        elapsed += AUTO_HUNT_REVIVE_DELAY_MS;
        currentHp = input.player.maxHp;
        const have = potions["potion_heal_s"] ?? 0;
        if (have < AUTO_HUNT_REVIVE_POTION_REFILL) {
          const grant = AUTO_HUNT_REVIVE_POTION_REFILL - have;
          potions["potion_heal_s"] = have + grant;
          result.potionsGranted["potion_heal_s"] =
            (result.potionsGranted["potion_heal_s"] ?? 0) + grant;
        }
        // 부활했으므로 break 하지 않고 외부 while 로 계속 — 시계가 cap 미만이면 다음 전투 시작.
      }
    }
    if (!battleFinished) break;
  }
  } finally {
    setBattleLogCollection(true);
  }

  result.simulatedMs = Math.min(elapsed, cap);
  result.finalPlayerHp = currentHp;
  return result;
}

// 알림 문구로 합치기 좋은 한 줄 요약. 비어있으면 빈 문자열.
export function summarizeOfflineResult(r: OfflineSimResult): string {
  if (r.battles === 0 && !r.died && (r.revives ?? 0) === 0) return "";
  const parts: string[] = [];
  if (r.wins > 0) parts.push(`처치 ${r.wins}`);
  if (r.expGained > 0)
    parts.push(`EXP +${r.expGained}${r.expBonusApplied ? " (신참 ×2)" : ""}`);
  if (r.goldGained > 0) parts.push(`골드 +${r.goldGained}`);
  const dropCount =
    Object.values(r.materialsGained).reduce((a, b) => a + (b ?? 0), 0) +
    r.equipsGained.length +
    r.recipesLearned.length;
  if (dropCount > 0) parts.push(`드롭 ${dropCount}`);
  const usedPotions = Object.entries(r.potionsConsumed).filter(
    ([, n]) => (n ?? 0) > 0,
  );
  if (usedPotions.length > 0) {
    const txt = usedPotions
      .map(([id, n]) => {
        const name = POTIONS[id as PotionId]?.name ?? id;
        return `${name} ×${n}`;
      })
      .join(", ");
    parts.push(`소비 ${txt}`);
  }
  if ((r.revives ?? 0) > 0) parts.push(`부활 ${r.revives}회`);
  if (r.died) parts.push("사망");
  return parts.join(" · ");
}
