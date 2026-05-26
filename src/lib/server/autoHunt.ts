// 자동 사냥(타이머형 원정) 서버 lib — collect 트랜잭션의 핵심 로직.
//
// /api/hunt/{dispatch,collect,status} 가 이 모듈을 쓴다. dispatch 가 baseline(시작시각·지역·HP)
// 을 users 컬럼에 박고, collect 가 baseline 부터 NOW(최대 4시간, 그리고 전투 수도 cap)까지의
// 시뮬을 트랜잭션 밖에서 한 번에 처리한 뒤 사냥을 종료한다. (tx 분리 — PR #142.)
//
// (옛 "오프라인 사냥/서버 권위" 모델의 offlineHunt.ts 를 복구·간소화한 것 — away/back 상태머신·
//  outbox·claimId 풀 멱등성·deferred baseline advance 는 제거. lastClaimResult 는 lost-response
//  재시도 replay 용으로만 남김.)

import { and, eq } from "drizzle-orm";
import { savesKv, users } from "@/db/schema";
import { upsertSave, type DbExecutor } from "@/lib/server/savesKv";
import type {
  OfflineSimInput,
  OfflineSimResult,
} from "@/adventure/battle/offlineSim";
import { pickAutoAction } from "@/adventure/battle/pickAutoAction";
import {
  AUTO_HUNT_EFFICIENCY,
  AUTO_HUNT_MAX_BATTLES,
  AUTO_HUNT_SIM_BUDGET_MS,
} from "@/adventure/battle/autoHunt";
import { baseCharacter } from "@/adventure/character/defaults";
import { derivePlayerCombat } from "@/adventure/character/derivePlayerCombat";
import {
  isAPSkillCondition,
  type APSkillCondition,
} from "@/adventure/character/apSkills";
import { applyExpGain } from "@/lib/leveling";
import {
  addParagonExp as addParagonExpPure,
  computeParagonBonus,
  readInitialParagon,
  type ParagonState,
} from "@/lib/paragon";
import { rehydrateEquippedItem } from "@/adventure/character/rehydrateEquip";
import type { EquippedItem } from "@/adventure/character/types";
import {
  ZERO_ENCHANT_COMBAT_BONUS,
  accumulateEnchantCombat,
  type EnchantCombatBonus,
} from "@/adventure/character/enchant";
import { STAT_KEYS, type StatKey } from "@/adventure/data/stats";
import { WORLD_MAP, START_REGION_ID, type RegionId } from "@/adventure/data/world";
import { potionMax, type PotionId } from "@/adventure/data/potions";
import { MONSTERS } from "@/adventure/data/monsters";
import {
  applyGuildQuestKills,
  type GuildQuestKill,
} from "@/lib/server/guildQuestKills";
import { recordKillIntoProgress } from "@/lib/server/questKillProgress";
import { STORY_FLAGS_STORAGE_KEY } from "@/adventure/storyFlags/storage";
import { ADVENTURE_LOG_KEY, type MonsterLogEntry, type TitleLogEntry } from "@/adventure/log/storage";
import { QUEST_PROGRESS_KEY, type QuestProgressMap } from "@/adventure/quests/storage";
// type-only — useAutoPotionConfig 자체는 "use client" 지만 type 임포트는 erase 됨.
import type { AutoPotionConfig } from "@/adventure/inventory/useAutoPotionConfig";

// engine/useBattle 의 PLAYER_TURN_INTERVAL_MS 와 동일 (useBattle 은 "use client" 라 import 불가 → 인라인).
const PLAYER_TURN_INTERVAL_MS = 250;

// xmur3 + mulberry32 — 결정적 PRNG. seed = hash(userId, baselineMs).
// HTTP 응답 손실 후 같은 baseline 으로 재시도해도 같은 결과 나오도록 결정성 확보.
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function makeRng(userId: string, baselineMs: number): () => number {
  const seedFn = xmur3(`${userId}:${baselineMs}`);
  let a = seedFn();
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// savesKv 에서 sim 입력 조립.
type SavedCharacter = {
  hp?: number;
  level?: number;
  exp?: number;
  gold?: number;
  stats?: Partial<Record<StatKey, number>>;
  equipped?: {
    weapon?: EquippedItem | null;
    armor?: EquippedItem | null;
    accessory?: EquippedItem | null;
  } | null;
  equippedSkills?: string[];
  /** 신 포맷 — 슬롯 인덱스 별 특기. */
  equippedFeats?: (string | null)[];
  /** 레거시 — 단일 특기 슬롯 시절 필드. 읽기 호환만. */
  equippedFeat?: string;
  /** 학습한 AP 스킬 이름 — equippedSkills 와 교집합이 실제 장착 AP 스킬. */
  learnedAPSkills?: string[];
  /** AP 스킬 슬롯의 발동 조건 맵 — skillName 키. 미지정 = always. */
  apSkillConditions?: Record<string, unknown>;
  [k: string]: unknown;
};

type SavedStoryFlags = {
  flags?: string[];
  [k: string]: unknown;
};

type SavedTraining = {
  allocated?: Partial<Record<StatKey, number>>;
  /** 미사용 단련 포인트 — 레벨업 1당 +1 (라이브 사냥은 클라에서, 위탁 사냥은 서버에서). */
  points?: number;
  [k: string]: unknown;
};

type SavedInventory = {
  potions?: Partial<Record<PotionId, number>>;
  materials?: Record<string, number>;
  equipment?: Record<string, number>;
  /** 드랍 고품질 인스턴스 — itemId → ("1"|"2" → 개수). 기본 등급은 equipment[] 에 합산. */
  droppedEquipment?: Record<string, Record<string, number>>;
  /** 종류 별 포션 상한 추가분 (퀘스트 보상). potionMax(bonus) 가 실제 cap. */
  potionCapacityBonus?: number;
  /** 학습 전 스킬북 — bookId → 개수. */
  skillBooks?: Record<string, number>;
  [k: string]: unknown;
};

type SavedCrafting = {
  known?: string[];
  shareable?: unknown;
  [k: string]: unknown;
};

type SavedMap = {
  currentRegionId?: RegionId;
  visitedRegionIds?: RegionId[];
  respawnRegionId?: RegionId;
};

type SavedAdventureLog = {
  monsters?: Record<string, MonsterLogEntry>;
  titles?: Record<string, TitleLogEntry>;
  battleLosses?: number;
  [k: string]: unknown;
};

function allocatedFrom(training: SavedTraining): Record<StatKey, number> {
  return STAT_KEYS.reduce(
    (acc, k) => {
      acc[k] = training.allocated?.[k] ?? 0;
      return acc;
    },
    { str: 0, dex: 0, vit: 0, spd: 0, luk: 0, int: 0 } as Record<StatKey, number>,
  );
}

// ⚠️ 반드시 craftTier/dropQuality 까지 반영하는 공용 헬퍼를 써야 한다 — 베이스 아이템만
// 돌려주면 걸작/빼어난 장비 보너스가 사라져 위탁 사냥에서 stat 임계치 위에 있던 빌드의
// feat(흡혈/곡예/천칭 등)이 침묵 비활성화된다. applyResultToSaves 의 maxHp 재계산도 동일.
function equippedFrom(character: SavedCharacter) {
  return {
    weapon: rehydrateEquippedItem(character.equipped?.weapon),
    armor: rehydrateEquippedItem(character.equipped?.armor),
    accessory: rehydrateEquippedItem(character.equipped?.accessory),
  };
}

// 위탁 사냥 보상 finalize 에서 사용 — char.equipped 의 3 슬롯 enchantSlots 합산.
// rehydrate 가 enchantSlots 를 보존하므로 그대로 누적. harvest(드랍) 은 offlineSim 안에서
// 굴려야 효과가 있어 여기선 사용 X. fortune/bounty 만 finalize 멀티에 반영.
function readCharEnchantBonusForHunt(
  character: SavedCharacter,
): EnchantCombatBonus {
  const acc: EnchantCombatBonus = { ...ZERO_ENCHANT_COMBAT_BONUS };
  const eq = equippedFrom(character);
  for (const item of [eq.weapon, eq.armor, eq.accessory]) {
    accumulateEnchantCombat(acc, item?.enchantSlots);
  }
  return acc;
}

// 위탁 사냥 EXP 부스트 배수 — 파라곤 풍요(pctGoldExp) × 별빛 부여 bounty(EXP). 사냥 sim 은
// raw EXP 를 적립하고, 이 배수는 결과 반영 시점(applyResultToSaves)에 곱한다. 단일 진실원 —
// assembleSimInput 의 expLevelTrackingMult(= efficiency × 이 값)와 applyResultToSaves 의 실제
// 부스트가 항상 일치해야 sim 레벨 추적과 최종 저장 레벨이 어긋나지 않는다. (efficiency 는 별도.)
export function huntExpBoostMult(
  character: SavedCharacter,
  paragonAllocations: Parameters<typeof computeParagonBonus>[0],
): number {
  const paragonBonus = computeParagonBonus(paragonAllocations);
  const enchant = readCharEnchantBonusForHunt(character);
  return (1 + paragonBonus.pctGoldExp / 100) * (1 + enchant.bountyPct / 100);
}

// 서버측 raw → typed APSkillCondition 변환. 클라 parseAPSkillConditions 와 동일.
function parseAPSkillConditionsSaved(
  raw: unknown,
): Partial<Record<string, APSkillCondition>> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Partial<Record<string, APSkillCondition>> = {};
  for (const [name, cond] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof name === "string" && isAPSkillCondition(cond)) {
      out[name] = cond;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

async function readKv<T>(
  tx: DbExecutor,
  userId: string,
  key: string,
  lock: boolean,
): Promise<T | null> {
  const q = tx
    .select()
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, key)));
  const rows = lock ? await q.for("update") : await q.limit(1);
  return (rows[0]?.value as T | undefined) ?? null;
}

export type LoadedState = {
  character: SavedCharacter;
  inventory: SavedInventory;
  crafting: SavedCrafting;
  map: SavedMap;
  training: SavedTraining;
  storyFlags: SavedStoryFlags;
  /** 100레벨 도달 후 잉여 EXP 적립처. 신규 유저는 빈 상태로 시드. */
  paragon: ParagonState;
  /** 도감 — monsters[].kills · titles · battleLosses 누적용. */
  adventureLog: SavedAdventureLog;
  /** 길드 의뢰 외에 NPC 의뢰(`quest-progress.v2`) kill 진행 누적용. */
  questProgress: QuestProgressMap;
};

// sim 에 필요한 모든 savesKv 키를 읽음.
// 결과 반영 대상이라 보통은 for update — character/inventory/crafting 은 항상, map 은 사망 시
// (respawn), training 은 레벨업 시(단련 포인트) 쓰여진다. 동시 클라 PATCH 와의 lost-update 방지.
// lock=false 는 collect tx1 의 "sim 입력 스냅샷" 용도 — tx 가 짧게 끝나야 하므로 잠금 없이 읽고,
// 결과 적용은 별도 tx2 에서 lock=true 로 다시 읽어 델타 기반으로 반영한다.
export async function loadStateForSim(
  tx: DbExecutor,
  userId: string,
  lock = true,
): Promise<LoadedState | null> {
  const character = await readKv<SavedCharacter>(tx, userId, "character.v2", lock);
  if (!character) return null;
  const inventory =
    (await readKv<SavedInventory>(tx, userId, "inventory.v2", lock)) ?? {};
  const crafting =
    (await readKv<SavedCrafting>(tx, userId, "crafting.v2", lock)) ?? {};
  const map = (await readKv<SavedMap>(tx, userId, "map.v2", lock)) ?? {};
  const training =
    (await readKv<SavedTraining>(tx, userId, "training.v2", lock)) ?? {};
  const storyFlags =
    (await readKv<SavedStoryFlags>(tx, userId, STORY_FLAGS_STORAGE_KEY, lock)) ??
    {};
  const paragonRaw = await readKv<unknown>(tx, userId, "paragon.v1", lock);
  const paragon = readInitialParagon(paragonRaw);
  const adventureLog =
    (await readKv<SavedAdventureLog>(tx, userId, ADVENTURE_LOG_KEY, lock)) ?? {};
  const questProgress =
    (await readKv<QuestProgressMap>(tx, userId, QUEST_PROGRESS_KEY, lock)) ?? {};
  return {
    character,
    inventory,
    crafting,
    map,
    training,
    storyFlags,
    paragon,
    adventureLog,
    questProgress,
  };
}

// sim 입력 조립 — derivePlayerCombat 으로 PlayerCombat 만들고 region/potions/luk 등 패키징.
export type AssembleSimInputOpts = {
  state: LoadedState;
  baselineHp: number;
  baselineRegionId: RegionId;
  awayMs: number;
  rng: () => number;
  /** 자동 포션 룰 — v1 은 빈 배열(공격만). */
  autoPotionRules: AutoPotionConfig["rules"];
  playerName: string;
};

export function assembleSimInput(opts: AssembleSimInputOpts): OfflineSimInput {
  const { state, baselineHp, baselineRegionId, awayMs, rng, autoPotionRules } =
    opts;
  const character = state.character;

  // 레거시 equippedFeat 호환 — readInitial 과 동일 정규화.
  const equippedFeats =
    character.equippedFeats ??
    (character.equippedFeat ? [character.equippedFeat] : undefined);

  const derived = derivePlayerCombat({
    level: character.level ?? 1,
    baseStats: baseCharacter.stats,
    allocatedStats: allocatedFrom(state.training),
    equipped: equippedFrom(character),
    equippedSkills: character.equippedSkills,
    equippedFeats,
    learnedAPSkills: character.learnedAPSkills,
    apSkillConditions: parseAPSkillConditionsSaved(character.apSkillConditions),
    storyFlagIds: new Set(state.storyFlags.flags ?? []),
    paragonAllocations: state.paragon.allocations,
    hp: baselineHp,
  });

  const region =
    WORLD_MAP.regions.find((r) => r.id === baselineRegionId) ??
    WORLD_MAP.regions.find((r) => r.id === START_REGION_ID)!;

  const potions = state.inventory.potions ?? {};
  const knownSet = new Set(state.crafting.known ?? []);

  return {
    player: { ...derived.player, hp: baselineHp },
    playerName: opts.playerName,
    region,
    playerLevel: character.level ?? 1,
    playerExp: character.exp ?? 0,
    potions,
    turnIntervalMs: PLAYER_TURN_INTERVAL_MS,
    awayMs,
    maxBattles: AUTO_HUNT_MAX_BATTLES,
    // 서버에서만 wall-clock 예산을 건다 — collect 한 건이 이벤트 루프를 수 초씩
    // 점유하지 않도록. 클라/테스트의 simulateOfflineHunt 직접 호출은 영향 없음.
    runBudgetMs: AUTO_HUNT_SIM_BUDGET_MS,
    luk: derived.totalStats.luk,
    knowsRecipe: (id) => knownSet.has(id),
    pickAction: (battleState) =>
      pickAutoAction(battleState, {
        rules: autoPotionRules,
        potions,
      }),
    rng,
    // sim 의 runningLevel 을 최종 저장 레벨과 일치시키기 위한 EXP 배수 —
    // efficiency(applyAutoHuntEfficiency) × 부스트(applyResultToSaves) 와 동일 공식.
    expLevelTrackingMult:
      AUTO_HUNT_EFFICIENCY *
      huntExpBoostMult(character, state.paragon.allocations),
  };
}

// sim 결과를 savesKv 의 character/inventory/crafting/training/map 에 반영.
// 클라 onApply (page.tsx) 와 동일 순서로:
//   1) 인벤토리 — 포션 차감 + 재료/장비 추가
//   2) 제작서 학습
//   3) 캐릭터 — gold/exp/level/hp
//   3-b) 레벨업이면 training.v2 의 단련 포인트 += levelsGained
//   4) 사망이면 map.v2 의 currentRegionId 를 respawn 으로
// HP 는 "설정"이 아니라 "델타"로 적용 — 위탁 중 다른 데서(퀘스트 보상 레벨업 등) HP 가 바뀌어도 안전.
// 단 사망이면 0, 사이클 중 레벨업이면 풀회복(useCharacterState.addExp 와 동일).
// 트랜잭션 안에서 호출되므로 부분 실패 없음.
export type ApplyResultOpts = {
  state: LoadedState;
  result: OfflineSimResult;
  died: boolean;
  /** sim 시작 시점 HP — newHp 델타 계산용. */
  baselineHp: number;
};

export type ApplyResultOutcome = {
  newCharacter: SavedCharacter;
  newInventory: SavedInventory;
  newCrafting: SavedCrafting;
  newTraining: SavedTraining;
  newRespawnRegionId: RegionId | null;
  /** 잉여 EXP 가 파라곤으로 흘러 들어갔으면 갱신된 상태. 아니면 null (쓰기 스킵). */
  newParagon: ParagonState | null;
  /** 이번 위탁으로 active→ready 로 전환된 의뢰 ID 들. 클라가 quest_ready 토스트. */
  readyQuestIds: string[];
  /** 이번 위탁으로 신규 grant 된 칭호 ID 들. 클라 milestone 토스트. (현재는 first_blood 뿐.) */
  grantedTitleIds: string[];
};

export async function applyResultToSaves(
  tx: DbExecutor,
  userId: string,
  { state, result, died, baselineHp }: ApplyResultOpts,
): Promise<ApplyResultOutcome> {
  // 1) 인벤토리.
  const inv = { ...state.inventory };
  const potions = { ...(inv.potions ?? {}) } as Record<string, number>;
  for (const [id, n] of Object.entries(result.potionsConsumed)) {
    if (!n) continue;
    potions[id] = Math.max(0, (potions[id] ?? 0) - n);
  }
  // 부활 보급 — sim 내부에서 작은 회복약을 충전 목표치까지 채워준 만큼 인벤토리에도 더한다.
  // tx1(스냅샷) 과 tx2(잠금) 사이에 클라가 상점·퀘스트 등으로 인벤을 패치해 보유량이
  // 늘면 그대로 더할 때 cap(potionMax) 을 넘을 수 있어 — potionCapacityBonus 기반 상한으로
  // 클램프. (cap 초과분은 silently 잘림, 클라 add() 와 동일 정책.)
  const potionCap = potionMax(inv.potionCapacityBonus ?? 0);
  for (const [id, n] of Object.entries(result.potionsGranted ?? {})) {
    if (!n) continue;
    potions[id] = Math.min(potionCap, (potions[id] ?? 0) + n);
  }
  const materials = { ...(inv.materials ?? {}) } as Record<string, number>;
  for (const [id, n] of Object.entries(result.materialsGained)) {
    if (!n) continue;
    materials[id] = (materials[id] ?? 0) + n;
  }
  const equipment = { ...(inv.equipment ?? {}) } as Record<string, number>;
  const droppedEquipment: Record<string, Record<string, number>> = {};
  for (const [k, v] of Object.entries(inv.droppedEquipment ?? {})) {
    droppedEquipment[k] = { ...v };
  }
  for (const { itemId, quality } of result.equipsGained) {
    if (quality === 0) {
      equipment[itemId] = (equipment[itemId] ?? 0) + 1;
    } else {
      const key = String(quality);
      const map = { ...(droppedEquipment[itemId] ?? {}) };
      map[key] = (map[key] ?? 0) + 1;
      droppedEquipment[itemId] = map;
    }
  }
  const skillBooks = { ...(inv.skillBooks ?? {}) } as Record<string, number>;
  for (const id of result.skillBooksGained ?? []) {
    skillBooks[id] = (skillBooks[id] ?? 0) + 1;
  }
  const newInventory: SavedInventory = {
    ...inv,
    potions,
    materials,
    equipment,
    droppedEquipment,
    skillBooks,
  };

  // 2) 제작서 학습 — sim 단계에서 미보유만 골라낸 상태라 중복 가드 1번 더 (안전망).
  const knownArr = Array.isArray(state.crafting.known)
    ? [...(state.crafting.known as string[])]
    : [];
  const knownSet = new Set(knownArr);
  for (const rid of result.recipesLearned) {
    if (!knownSet.has(rid)) {
      knownArr.push(rid);
      knownSet.add(rid);
    }
  }
  const newCrafting: SavedCrafting = { ...state.crafting, known: knownArr };

  // 3) 캐릭터 — gold/exp/level/hp.
  const character = state.character;
  // 파라곤 풍요 트랙 → 골드/EXP 획득 % 보너스. 사냥 시뮬은 자체 멀티플라이어 없이
  // 적의 raw EXP/gold 를 적립하므로, sim 결과를 캐릭터에 반영하는 이 시점에 곱한다.
  // 별빛 마법부여 — bounty(EXP), fortune(골드) 같은 timing 에 곱연산.
  // harvest(드랍률) 는 offlineSim 안에서 굴려야 하므로 여기선 적용 불가 (limitation).
  const paragonBonus = computeParagonBonus(state.paragon.allocations);
  const paragonRewardMult = 1 + paragonBonus.pctGoldExp / 100;
  const enchantBonusForHunt = readCharEnchantBonusForHunt(character);
  const enchantGoldMult = 1 + enchantBonusForHunt.fortunePct / 100;
  // EXP 부스트는 공유 헬퍼로 — assembleSimInput 의 expLevelTrackingMult 와 동일 공식이라야
  // sim 레벨 추적과 최종 저장 레벨이 일치한다(단일 진실원).
  const boostedExpGained = Math.floor(
    result.expGained * huntExpBoostMult(character, state.paragon.allocations),
  );
  const boostedGoldGained = Math.floor(
    result.goldGained * paragonRewardMult * enchantGoldMult,
  );
  const newLevelExp = computeFinalLevelExp(
    character.level ?? 1,
    character.exp ?? 0,
    boostedExpGained,
  );
  // 새 레벨 기준 maxHp — derivePlayerCombat 과 동일하게 VIT·불굴(endurance HP%) 등을
  // 모두 반영해 계산한다. (예전엔 maxHpForLevel + vit*2 만 직접 계산해 불굴 보너스를
  //  빼먹어서, 불굴 빌드는 위탁 사냥 후 HP 가 비보너스 최대치로 깎였다 — 무피해
  //  사이클에서도 아래 Math.min(maxHpNew, ...) 가 진짜 최대치를 끌어내렸다.)
  const maxHpNewEquippedFeats =
    character.equippedFeats ??
    (character.equippedFeat ? [character.equippedFeat] : undefined);
  const maxHpNew = derivePlayerCombat({
    level: newLevelExp.level,
    baseStats: baseCharacter.stats,
    allocatedStats: allocatedFrom(state.training),
    equipped: equippedFrom(character),
    equippedSkills: character.equippedSkills,
    equippedFeats: maxHpNewEquippedFeats,
    storyFlagIds: new Set(state.storyFlags.flags ?? []),
    paragonAllocations: state.paragon.allocations,
    hp: result.finalPlayerHp,
  }).maxHp;

  let newHp: number;
  if (died) {
    newHp = 0;
  } else if (newLevelExp.levelsGained > 0) {
    // 레벨업 = VIT 보너스만큼 풀회복 (useCharacterState.addExp 와 동일).
    newHp = maxHpNew;
  } else {
    // HP 델타 — 위탁 시작 이후 캐릭터 HP 가 외부에서 바뀌었어도(회복 등) 흡수.
    const hpDelta = result.finalPlayerHp - baselineHp;
    const curHp = character.hp ?? baseCharacter.hp;
    newHp = Math.max(0, Math.min(maxHpNew, curHp + hpDelta));
  }

  const newCharacter: SavedCharacter = {
    ...character,
    gold: (character.gold ?? 0) + boostedGoldGained,
    level: newLevelExp.level,
    exp: newLevelExp.exp,
    hp: newHp,
  };

  // 3-b) 레벨업 시 단련 포인트 지급 (레벨업 1당 +1).
  // 라이브 사냥은 useLevelUpDetection 이 클라에서 레벨 델타를 보고 주지만, 위탁 사냥은
  // collect 직후 page reload 라 클라가 델타를 못 봐서 포인트가 유실된다 → 서버가 직접 적립.
  let newTraining: SavedTraining = state.training;
  if (newLevelExp.levelsGained > 0) {
    newTraining = {
      ...state.training,
      points: (state.training.points ?? 0) + newLevelExp.levelsGained,
    };
  }

  // 3-c) 100레벨 도달 후 잉여 EXP → 파라곤 적립. overflowExp 가 0 이면 그대로 둠.
  // useCharacterState.addExp 의 onParagonOverflow 와 같은 시맨틱 — 단지 서버 tx 안.
  let newParagon: ParagonState | null = null;
  if (newLevelExp.overflowExp > 0) {
    const updated = addParagonExpPure(state.paragon, newLevelExp.overflowExp);
    if (updated !== state.paragon) newParagon = updated;
  }

  // savesKv 쓰기 — version++.
  await upsertSave(tx, userId, "character.v2", newCharacter);
  await upsertSave(tx, userId, "inventory.v2", newInventory);
  if (result.recipesLearned.length > 0) {
    await upsertSave(tx, userId, "crafting.v2", newCrafting);
  }
  if (newLevelExp.levelsGained > 0) {
    await upsertSave(tx, userId, "training.v2", newTraining);
  }
  if (newParagon) {
    await upsertSave(tx, userId, "paragon.v1", newParagon);
  }

  // 3-d) 길드 의뢰 kill 진행 — sim 의 killsByName 을 monster.phaseTrigger 유무로
  // kill_monster / kill_boss 로 분류해 한 번에 보고. 같은 트랜잭션이라 길드 fame /
  // 멤버 인박스 보상까지 atomic. (EPIC #3-3 chunk A — 라이브 onBattleEnd 의
  // reportGuildKill 패턴을 서버 권위 경로에서도 마찬가지로.)
  const kills: GuildQuestKill[] = [];
  for (const [name, count] of Object.entries(result.killsByName)) {
    if (count <= 0) continue;
    const isBoss = MONSTERS[name]?.phaseTrigger != null;
    kills.push({
      kind: isBoss ? "kill_boss" : "kill_monster",
      name,
      count,
    });
  }
  await applyGuildQuestKills(tx, userId, kills);

  // 3-e) NPC 의뢰 진행(`quest-progress.v2`) + 도감(`adventure-log.v2`) 누적 — 옛
  // useAutoHuntResultHandler 가 클라에서 돌리던 mutation 을 서버로 이관. ctx 없이 호출 →
  // kill_within_hp / no_potion_boss 류는 자동 사냥에서 진행되지 않음(클라 동작 동일).
  const logPrev = state.adventureLog;
  const monstersPrev = logPrev.monsters ?? {};
  const monstersNext: Record<string, MonsterLogEntry> = { ...monstersPrev };
  let logChanged = false;
  let progressNext = state.questProgress;
  const readyQuestIds: string[] = [];
  const nowMs = Date.now();
  let anyKill = false;
  for (const [name, count] of Object.entries(result.killsByName)) {
    if (count <= 0) continue;
    anyKill = true;
    const existing = monstersNext[name];
    monstersNext[name] = {
      encountered: true,
      kills: (existing?.kills ?? 0) + count,
      firstSeenAt: existing?.firstSeenAt ?? nowMs,
      lastKilledAt: nowMs,
    };
    logChanged = true;
    for (let i = 0; i < count; i += 1) {
      const step = recordKillIntoProgress(progressNext, name);
      if (step.changed) {
        progressNext = step.next;
        for (const id of step.readyIds) readyQuestIds.push(id);
      }
    }
  }

  // 첫 처치 칭호 — idempotent. 이미 박혀 있으면 grantedTitleIds 에 안 들어감.
  const titlesPrev = logPrev.titles ?? {};
  const titlesNext: Record<string, TitleLogEntry> = { ...titlesPrev };
  const grantedTitleIds: string[] = [];
  if (anyKill && !titlesNext.first_blood) {
    titlesNext.first_blood = { obtainedAt: nowMs };
    grantedTitleIds.push("first_blood");
    logChanged = true;
  }

  // 패배 누적 — 옛 클라 incrementBattleLosses 의 서버 미러.
  let battleLossesNext =
    typeof logPrev.battleLosses === "number" ? logPrev.battleLosses : 0;
  if (died) {
    battleLossesNext += 1;
    logChanged = true;
  }

  if (logChanged) {
    const newLog: SavedAdventureLog = {
      ...logPrev,
      monsters: monstersNext,
      titles: titlesNext,
      battleLosses: battleLossesNext,
    };
    await upsertSave(tx, userId, ADVENTURE_LOG_KEY, newLog);
  }
  if (progressNext !== state.questProgress) {
    await upsertSave(tx, userId, QUEST_PROGRESS_KEY, progressNext);
  }

  // 4) 사망 시 map.v2 의 currentRegionId 도 respawn 으로 갱신.
  let newRespawnRegionId: RegionId | null = null;
  if (died) {
    const mapValue = state.map;
    const respawnId = mapValue.respawnRegionId ?? START_REGION_ID;
    const visited = mapValue.visitedRegionIds ?? [START_REGION_ID];
    const nextMap = {
      ...mapValue,
      currentRegionId: respawnId,
      visitedRegionIds: visited.includes(respawnId)
        ? visited
        : [...visited, respawnId],
    };
    await upsertSave(tx, userId, "map.v2", nextMap);
    newRespawnRegionId = respawnId;
  }

  return {
    newCharacter,
    newInventory,
    newCrafting,
    newTraining,
    newRespawnRegionId,
    newParagon,
    readyQuestIds,
    grantedTitleIds,
  };
}

// (character.exp, result.expGained) 을 합쳐 최종 레벨/EXP 계산.
// simulateOfflineHunt 는 result.expGained 만 반환하고 누적 레벨업은 내부 추적만 하므로,
// 여기서 한 번 더 applyExpGain 으로 동일 결과 도출.
function computeFinalLevelExp(
  level: number,
  exp: number,
  gained: number,
): {
  level: number;
  exp: number;
  levelsGained: number;
  overflowExp: number;
} {
  if (gained <= 0) return { level, exp, levelsGained: 0, overflowExp: 0 };
  return applyExpGain(level, exp, gained);
}

// users 의 자동 사냥 baseline 컬럼 갱신 — dispatch/collect 가 공유.
// (컬럼명은 옛 "오프라인 사냥" 잔재 — huntActive=위탁 진행중, huntBaselineAt=시작시각,
//  huntRegion=위탁 지역, huntBaselineHp=시작 HP, lastClaimResult=수령 결과 캐시.)
export type BaselineUpdate = {
  huntActive?: boolean;
  huntRegion?: string | null;
  huntBaselineHp?: number | null;
  huntBaselineAt?: Date | null;
  huntPredictedDeathAt?: Date | null;
  lastClaimId?: string | null;
  lastClaimResult?: OfflineSimResult | null;
};

export async function updateBaseline(
  tx: DbExecutor,
  userId: string,
  patch: BaselineUpdate,
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (patch.huntActive !== undefined) set.huntActive = patch.huntActive;
  if (patch.huntRegion !== undefined) set.huntRegion = patch.huntRegion;
  if (patch.huntBaselineHp !== undefined)
    set.huntBaselineHp = patch.huntBaselineHp;
  if (patch.huntBaselineAt !== undefined)
    set.huntBaselineAt = patch.huntBaselineAt;
  if (patch.huntPredictedDeathAt !== undefined)
    set.huntPredictedDeathAt = patch.huntPredictedDeathAt;
  if (patch.lastClaimId !== undefined) set.lastClaimId = patch.lastClaimId;
  if (patch.lastClaimResult !== undefined)
    set.lastClaimResult = patch.lastClaimResult;
  if (Object.keys(set).length === 0) return;
  await tx.update(users).set(set).where(eq(users.id, userId));
}

/** 보여줄 만한 결과인지 — 전투 1판 이상 / 사망 / 부활(보급) 중 하나. */
export function hasMeaningfulResult(result: OfflineSimResult): boolean {
  return result.battles > 0 || result.died || (result.revives ?? 0) > 0;
}

// collect tx1 의 클레임 결정. users row 와 NOW 만 보면 정해지는 순수 함수.
// (state 로딩은 호출자가 별도로 — tx 안에서 짧게 잠금 없이 읽는다.)
export type ClaimSnapshot = {
  huntActive: boolean;
  huntBaselineAt: Date | null;
  huntBaselineHp: number | null;
  huntRegion: string | null;
  lastClaimResult: OfflineSimResult | null;
};

export type ClaimDecision =
  | { kind: "ready"; baselineMs: number; baselineHp: number | null; regionId: string }
  | { kind: "replay"; result: OfflineSimResult }
  | { kind: "noop"; reason: "no_user" | "inactive" | "too_soon" | "no_region" }
  | { kind: "clear_baseline"; reason: "no_region" };

export function decideClaim(
  u: ClaimSnapshot | null,
  nowMs: number,
  minCollectMs: number,
): ClaimDecision {
  if (!u) return { kind: "noop", reason: "no_user" };
  if (!u.huntActive || !u.huntBaselineAt) {
    if (u.lastClaimResult) return { kind: "replay", result: u.lastClaimResult };
    return { kind: "noop", reason: "inactive" };
  }
  const elapsedMs = nowMs - u.huntBaselineAt.getTime();
  if (elapsedMs < minCollectMs) return { kind: "noop", reason: "too_soon" };
  if (!u.huntRegion) return { kind: "clear_baseline", reason: "no_region" };
  return {
    kind: "ready",
    baselineMs: u.huntBaselineAt.getTime(),
    baselineHp: u.huntBaselineHp,
    regionId: u.huntRegion,
  };
}

// collect tx2 의 winner 결정. tx1 에서 캡처한 baselineMs 가 여전히 유효한지 본다.
// - 여전히 active 하고 같은 baseline → 내가 적용한다 (winner).
// - 그 외 (다른 collect 가 끝냈거나, 새 dispatch 가 baseline 을 갈아엎었거나) → lastClaimResult 로 replay 또는 noop.
export type WinnerDecision =
  | { kind: "winner" }
  | { kind: "replay"; result: OfflineSimResult }
  | { kind: "lost" };

export function decideWinner(
  u: ClaimSnapshot,
  capturedBaselineMs: number,
): WinnerDecision {
  const stillSameBaseline =
    u.huntActive && u.huntBaselineAt?.getTime() === capturedBaselineMs;
  if (stillSameBaseline) return { kind: "winner" };
  if (u.lastClaimResult) return { kind: "replay", result: u.lastClaimResult };
  return { kind: "lost" };
}
