import "server-only";

// 솔로 전투 승리 보상 서버 lib — /api/battle/claim-victory 핵심.
//
// 권위: 서버. 클라는 enemyName + encounterId + 몇 가지 stat (finalPlayerHp/maxHp/
// damageTaken/potionsConsumedTotal) 만 보낸다. 서버가 monster 정의에서 base reward 를
// 읽고 deterministic seed (encounterId+userId FNV-1a → mulberry32) 로 드랍 RNG 굴림.
//
// 적용 saves (Phase 1+2+3):
//   character.v2 / inventory.v2 / crafting.v2 / paragon.v1 /
//   adventure-log.v2 / storyFlags.v2 / quest-progress.v2.
//
// Phase 2 추가: 칭호 grants(first_blood/close_call/potion_overload/monster.onDefeatTitleId)
// + monster.onDefeatFlag + 누적 카운터(monsters[].kills · noDamageWins) + 마일스톤 5종
// (mad_slash 100승 / deep_wound 50보스 / frenzy 1000회 / thunder 거인10 / light_glide 천공인첫).
//
// Phase 3 추가:
//   - encounterId 서버 dedup — character.v2.lastBattleEncounterId 와 같으면 applied:false +
//     현재 saves 그대로 반환. 응답 손실 후 retry 시 보상 중복 차단.
//   - quest progress 서버화 — 활성 kill / kill_within_hp / no_potion_boss 의뢰 진행을
//     같은 트랜잭션 안에서 recordKillIntoProgress 로 적용. readyQuestIds 반환.
//   - 길드 의뢰 kill 보고 — applyGuildQuestKills 헬퍼로 같은 tx (chunk A 와 동일 패턴).
//
// 클라 잔존: 패배 페널티(respawn / 마을 강제 이동 / incrementBattleLosses) — 보상이 없어
// 보안 면이 없고 UX 측 흐름이 마을 이동·치료소 sub 라 클라가 더 단순.

import { and, eq, inArray } from "drizzle-orm";
import { guildMembers, guilds, savesKv } from "@/db/schema";
import { upsertSave, type DbExecutor } from "@/lib/server/savesKv";
import {
  applyExpGain,
  applyNewbieBonus,
  levelBandExpMultiplier,
  MAX_LEVEL,
  XP_RATE_MULT,
  getNewbieDropMultiplier,
} from "@/lib/leveling";
import { computeParagonBonus, readInitialParagon } from "@/lib/paragon";
import { maxHpForLevel } from "@/adventure/character/defaults";
import { computeRuneBonus } from "@/adventure/character/runeBonus";
import {
  ZERO_ENCHANT_COMBAT_BONUS,
  accumulateEnchantCombat,
  isEnchantAffixId,
  type EnchantCombatBonus,
  type EnchantSlot,
} from "@/adventure/character/enchant";
import { MONSTERS, type Monster } from "@/adventure/data/monsters";
import { WORLD_MAP } from "@/adventure/data/world";
import { MATERIALS } from "@/adventure/data/materials";
import { ITEMS, isLuckyFind } from "@/adventure/data/items";
import { rollDropQuality, type DropQuality } from "@/adventure/data/dropQuality";
import { RECIPES } from "@/adventure/data/recipes";
import { SKILL_BOOKS, type SkillBookId } from "@/adventure/data/skillBooks";
import {
  resolveBuffMultiplier,
  type GuildBuffSlot,
} from "@/adventure/data/guildBuffs";
import type { EquippedRune } from "@/adventure/data/runes";
import { STORY_FLAGS_STORAGE_KEY } from "@/adventure/storyFlags/storage";
import {
  type QuestProgressMap,
} from "@/adventure/quests/storage";
import {
  applyGuildQuestKills,
  type GuildQuestKill,
} from "@/lib/server/guildQuestKills";
import { recordKillIntoProgress } from "@/lib/server/questKillProgress";

const CHARACTER_KEY = "character.v2";
const INVENTORY_KEY = "inventory.v2";
const CRAFTING_KEY = "crafting.v2";
const PARAGON_KEY = "paragon.v1";
const ADVENTURE_LOG_KEY = "adventure-log.v2";
const QUEST_PROGRESS_KEY = "quest-progress.v2";

const REWARD_SAVES_KEYS = [
  CHARACTER_KEY,
  INVENTORY_KEY,
  CRAFTING_KEY,
  PARAGON_KEY,
  ADVENTURE_LOG_KEY,
  STORY_FLAGS_STORAGE_KEY,
  QUEST_PROGRESS_KEY,
] as const;

export type BattleRewardSavesSnapshot = Partial<
  Record<(typeof REWARD_SAVES_KEYS)[number], unknown>
>;

export class BattleClaimError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "BattleClaimError";
  }
}

// 드랍 결과 1건 — 클라 토스트용. 서버가 어느 종류를 줬는지 명시.
export type ResolvedBattleDrop =
  | { kind: "material"; materialId: string; name: string; amount: number }
  | { kind: "gold"; amount: number }
  | {
      kind: "equip";
      itemId: string;
      name: string;
      quality: DropQuality;
      lucky: boolean;
    }
  | { kind: "recipe"; recipeId: string; name: string }
  | { kind: "skill_book"; bookId: string; name: string };

export type BattleClaimOutcome = {
  enemyName: string;
  isBoss: boolean;
  /** false 면 같은 encounterId 로 이미 처리됨 — saves 현재 상태 그대로 반환 (idempotent retry). */
  applied: boolean;
  /** 멀티플라이어 반영 후 실제 적립 EXP — 클라 토스트 표시용. */
  expGained: number;
  /** 신참 ×2 적용 여부 — 토스트 라벨용. */
  expBonusApplied: boolean;
  /** EXP 곱셈 분해 (토스트 표시용). enchant=별빛 풍요 합산. */
  expMultParts: {
    guild: number;
    rune: number;
    paragon: number;
    enchant: number;
  };
  /** 드롭에서 누적된 골드 (gold drop kind). character.gold 증가량. */
  goldGained: number;
  /** 재생의 룬 + finalPlayerHp 합산 → 적용 후 HP. clamp(0..maxHp). */
  hpAfterRegen: number;
  /** regen 가 더해진 양. > 0 이면 클라가 "재생의 룬 — HP +N" 토스트. */
  hpRegenHealed: number;
  /** 굴려진 드랍들 — 클라가 loot/milestone 토스트로 표시. */
  drops: ResolvedBattleDrop[];
  /** Phase 2 신규 — 이번 처치로 신규 획득한 칭호 ID 목록. 클라 grantTitle 토스트 chain. */
  grantedTitleIds: string[];
  /** Phase 2 신규 — 마일스톤 스킬북 지급 토스트. 클라가 그대로 milestone 토스트로 띄움. */
  milestones: Array<{ bookId: string; message: string }>;
  /** Phase 3 신규 — active → ready 로 전환된 의뢰 ID 들. 클라가 quest_ready 토스트. */
  readyQuestIds: string[];
  saves: BattleRewardSavesSnapshot;
};

// 마일스톤 정의 — flag 가 박혀 있지 않고 카운트 충족 시 1회 지급. 모두 storyFlags.v2 의
// 단일 flag 로 dedup. 클라 onBattleEnd 의 동일 데이터가 옮겨온 것.
type MilestoneSpec = {
  flag: string;
  bookId: SkillBookId;
  message: string;
};
const MILESTONE_MAD_SLASH: MilestoneSpec = {
  flag: "mad_slash_book_granted",
  bookId: "book_mad_slash",
  message: "✨ 무피해 100회 승리 — '스킬북 — 광살참' 을 손에 넣었다!",
};
const MILESTONE_DEEP_WOUND: MilestoneSpec = {
  flag: "deep_wound_book_granted",
  bookId: "book_deep_wound",
  message: "✨ 보스 50회 처치 — '스킬북 — 깊은 상처' 를 손에 넣었다!",
};
const MILESTONE_FRENZY: MilestoneSpec = {
  flag: "frenzy_book_granted",
  bookId: "book_frenzy",
  message: "✨ 누적 1000회 처치 — '스킬북 — 폭주' 를 손에 넣었다!",
};
const MILESTONE_THUNDER: MilestoneSpec = {
  flag: "thunder_strike_book_granted",
  bookId: "book_thunder_strike",
  message: "✨ 운봉의 거인 10회 처치 — '스킬북 — 천뢰 일격' 을 손에 넣었다!",
};
const MILESTONE_LIGHT_GLIDE: MilestoneSpec = {
  flag: "light_glide_book_granted",
  bookId: "book_light_glide",
  message: "✨ 천공인의 왕 처치 — '스킬북 — 빛의 활공' 을 손에 넣었다!",
};

// ─────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────

function fnv1a(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

function battleSeed(encounterId: string, userId: string): number {
  return fnv1a(`${encounterId}:${userId}`);
}

function recipeName(id: string): string {
  return RECIPES.find((r) => r.id === id)?.name ?? id;
}

// 길드 활성 버프 — questReward 의 private helper 와 동일한 모양. 트랜잭션 안에서 호출.
async function readGuildBuffs(
  tx: DbExecutor,
  userId: string,
): Promise<GuildBuffSlot[]> {
  const memberRows = await tx
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (memberRows.length === 0) return [];
  const guildRows = await tx
    .select({ buffs: guilds.buffs })
    .from(guilds)
    .where(eq(guilds.id, memberRows[0].guildId))
    .limit(1);
  const buffs = guildRows[0]?.buffs;
  return Array.isArray(buffs) ? (buffs as GuildBuffSlot[]) : [];
}

async function readSavesForUpdate(
  tx: DbExecutor,
  userId: string,
): Promise<BattleRewardSavesSnapshot> {
  const rows = await tx
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.userId, userId),
        inArray(savesKv.key, REWARD_SAVES_KEYS as unknown as string[]),
      ),
    )
    .for("update");
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return out as BattleRewardSavesSnapshot;
}

// ─────────────────────────────────────────────────────────────
// Drop rolling
// ─────────────────────────────────────────────────────────────

type DropApplyContext = {
  luckMultiplier: number;
  dropMult: number;
  paragonRewardMult: number;
  monster: Monster;
};

function rollDrops(
  rng: () => number,
  inv: Record<string, unknown>,
  crafting: Record<string, unknown>,
  ctx: DropApplyContext,
): {
  invNext: Record<string, unknown>;
  craftingNext: Record<string, unknown>;
  goldGained: number;
  drops: ResolvedBattleDrop[];
} {
  let invChanged = false;
  let craftingChanged = false;
  const invMaterials = {
    ...((inv.materials as Record<string, number> | undefined) ?? {}),
  };
  const invEquipment = {
    ...((inv.equipment as Record<string, number> | undefined) ?? {}),
  };
  const invDropped = {
    ...((inv.droppedEquipment as Record<string, Record<string, number>>
      | undefined) ?? {}),
  };
  const invSkillBooks = {
    ...((inv.skillBooks as Record<string, number> | undefined) ?? {}),
  };
  const knownRecipes = Array.isArray(crafting.known)
    ? [...(crafting.known as string[])]
    : [];
  const shareableRecipes = Array.isArray(crafting.shareable)
    ? [...(crafting.shareable as string[])]
    : [];
  const knownSet = new Set(knownRecipes);
  const shareableSet = new Set(shareableRecipes);

  let goldGained = 0;
  const drops: ResolvedBattleDrop[] = [];

  if (!ctx.monster.drops) {
    return {
      invNext: inv,
      craftingNext: crafting,
      goldGained: 0,
      drops: [],
    };
  }

  for (const drop of ctx.monster.drops) {
    const adjustedChance = Math.min(
      1,
      drop.chance * ctx.luckMultiplier * ctx.dropMult,
    );
    if (rng() >= adjustedChance) continue;
    if (drop.kind === "material") {
      const amount = drop.amount ?? 1;
      invMaterials[drop.materialId] =
        (invMaterials[drop.materialId] ?? 0) + amount;
      invChanged = true;
      drops.push({
        kind: "material",
        materialId: drop.materialId,
        name: MATERIALS[drop.materialId]?.name ?? drop.materialId,
        amount,
      });
    } else if (drop.kind === "gold") {
      const boostedGold = Math.floor(drop.amount * ctx.paragonRewardMult);
      goldGained += boostedGold;
      drops.push({ kind: "gold", amount: boostedGold });
    } else if (drop.kind === "equip") {
      const q = rollDropQuality(rng, ctx.monster.dropQualityBias ?? 1);
      if (q === 0) {
        invEquipment[drop.itemId] = (invEquipment[drop.itemId] ?? 0) + 1;
      } else {
        const key = String(q);
        const map = { ...(invDropped[drop.itemId] ?? {}) };
        map[key] = (map[key] ?? 0) + 1;
        invDropped[drop.itemId] = map;
      }
      invChanged = true;
      const equipDef = ITEMS[drop.itemId];
      drops.push({
        kind: "equip",
        itemId: drop.itemId,
        name: equipDef.name,
        quality: q,
        lucky: isLuckyFind(equipDef),
      });
    } else if (drop.kind === "equip_one_of") {
      // 풀에서 균등 추첨 — equip 단일과 동일하게 dropQuality 굴림.
      if (drop.itemIds.length === 0) continue;
      const pickIdx = Math.floor(rng() * drop.itemIds.length);
      const pickId = drop.itemIds[pickIdx];
      const q = rollDropQuality(rng, ctx.monster.dropQualityBias ?? 1);
      if (q === 0) {
        invEquipment[pickId] = (invEquipment[pickId] ?? 0) + 1;
      } else {
        const key = String(q);
        const map = { ...(invDropped[pickId] ?? {}) };
        map[key] = (map[key] ?? 0) + 1;
        invDropped[pickId] = map;
      }
      invChanged = true;
      const equipDef = ITEMS[pickId];
      drops.push({
        kind: "equip",
        itemId: pickId,
        name: equipDef.name,
        quality: q,
        lucky: isLuckyFind(equipDef),
      });
    } else if (drop.kind === "recipe") {
      if (knownSet.has(drop.recipeId)) continue;
      knownSet.add(drop.recipeId);
      knownRecipes.push(drop.recipeId);
      if (!shareableSet.has(drop.recipeId)) {
        shareableSet.add(drop.recipeId);
        shareableRecipes.push(drop.recipeId);
      }
      craftingChanged = true;
      drops.push({
        kind: "recipe",
        recipeId: drop.recipeId,
        name: recipeName(drop.recipeId),
      });
    } else if (drop.kind === "recipe_one_of") {
      if (drop.recipeIds.length === 0) continue;
      const unknown = drop.recipeIds.filter((id) => !knownSet.has(id));
      // 풀 전체를 이미 알고 있으면 조용히 스킵 — 직접 recipe 드랍(이미 보유 시 continue)과
      // 동일 정책. 이미 수집 완료한 제작서엔 보상 알림을 띄우지 않는다.
      if (unknown.length === 0) {
        continue;
      }
      const pick = unknown[Math.floor(rng() * unknown.length)]!;
      knownSet.add(pick);
      knownRecipes.push(pick);
      if (!shareableSet.has(pick)) {
        shareableSet.add(pick);
        shareableRecipes.push(pick);
      }
      craftingChanged = true;
      drops.push({
        kind: "recipe",
        recipeId: pick,
        name: recipeName(pick),
      });
    } else if (drop.kind === "skill_book") {
      invSkillBooks[drop.bookId] = (invSkillBooks[drop.bookId] ?? 0) + 1;
      invChanged = true;
      const book = SKILL_BOOKS[drop.bookId as SkillBookId];
      drops.push({
        kind: "skill_book",
        bookId: drop.bookId,
        name: book?.name ?? drop.bookId,
      });
    }
  }

  const invNext = invChanged
    ? {
        ...inv,
        materials: invMaterials,
        equipment: invEquipment,
        droppedEquipment: invDropped,
        skillBooks: invSkillBooks,
      }
    : inv;
  const craftingNext = craftingChanged
    ? { ...crafting, known: knownRecipes, shareable: shareableRecipes }
    : crafting;
  return { invNext, craftingNext, goldGained, drops };
}

// ─────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────

export type BattleClaimInput = {
  encounterId: string;
  enemyName: string;
  finalPlayerHp: number;
  playerMaxHp: number;
  isBoss: boolean;
  bossAttempt?: BossAttemptClaimSnapshot;
  /** Phase 2: 무피해 승리 판정 (광살참 100승 마일스톤). */
  damageTakenThisCombat: number;
  /** Phase 2: potion_overload 칭호(5병 이상 사용) 판정. */
  potionsConsumedTotal: number;
};

export type BossAttemptClaimSnapshot = {
  regionId: string;
  date: string;
  count: number;
  lastAttemptAtMs?: number;
};

export function mergeBossAttemptSnapshotForClaim(
  character: Record<string, unknown>,
  enemyName: string,
  snapshot: BossAttemptClaimSnapshot | undefined,
): boolean {
  if (!snapshot) return false;
  const region = WORLD_MAP.regions.find(
    (r) => r.id === snapshot.regionId && r.boss?.monsterName === enemyName,
  );
  if (!region) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.date)) return false;
  if (!Number.isInteger(snapshot.count) || snapshot.count <= 0) return false;
  const lastAttemptAtMs =
    typeof snapshot.lastAttemptAtMs === "number" &&
    Number.isFinite(snapshot.lastAttemptAtMs) &&
    snapshot.lastAttemptAtMs >= 0
      ? snapshot.lastAttemptAtMs
      : undefined;

  const prevAttempts =
    character.bossAttempts &&
    typeof character.bossAttempts === "object" &&
    !Array.isArray(character.bossAttempts)
      ? (character.bossAttempts as Record<string, unknown>)
      : {};
  const prevEntryRaw = prevAttempts[snapshot.regionId];
  const prevEntry =
    prevEntryRaw && typeof prevEntryRaw === "object" && !Array.isArray(prevEntryRaw)
      ? (prevEntryRaw as Record<string, unknown>)
      : null;
  const prevSameDate = prevEntry?.date === snapshot.date;
  const prevCount =
    prevSameDate && typeof prevEntry?.count === "number"
      ? prevEntry.count
      : 0;
  const prevLast =
    prevSameDate && typeof prevEntry?.lastAttemptAtMs === "number"
      ? prevEntry.lastAttemptAtMs
      : undefined;
  const nextEntry: { date: string; count: number; lastAttemptAtMs?: number } = {
    date: snapshot.date,
    count: Math.max(prevCount, snapshot.count),
  };
  if (lastAttemptAtMs !== undefined || prevLast !== undefined) {
    nextEntry.lastAttemptAtMs = Math.max(prevLast ?? 0, lastAttemptAtMs ?? 0);
  }

  const same =
    prevSameDate &&
    prevCount === nextEntry.count &&
    (prevLast ?? undefined) === (nextEntry.lastAttemptAtMs ?? undefined);
  if (same) return false;
  character.bossAttempts = {
    ...prevAttempts,
    [snapshot.regionId]: nextEntry,
  };
  return true;
}

export async function applyBattleClaim(
  tx: DbExecutor,
  userId: string,
  input: BattleClaimInput,
): Promise<BattleClaimOutcome> {
  const monster = MONSTERS[input.enemyName];
  if (!monster) throw new BattleClaimError("unknown_monster");
  if (
    !input.encounterId ||
    typeof input.encounterId !== "string" ||
    input.encounterId.length > 64
  ) {
    throw new BattleClaimError("invalid_encounter_id");
  }

  const saves = await readSavesForUpdate(tx, userId);
  const charPrev =
    (saves[CHARACTER_KEY] as Record<string, unknown> | undefined) ?? {};

  // ── Phase 3: encounterId dedup ─────────────────────────────────
  // 같은 encounterId 두 번째 호출(응답 손실 후 retry 등)은 mutation 생략 + 현재 saves 그대로.
  // 클라는 saves replaceFromSaved 로 그대로 적용 → 결국 latest 로 자가 수렴.
  if (
    typeof charPrev.lastBattleEncounterId === "string" &&
    charPrev.lastBattleEncounterId === input.encounterId
  ) {
    return {
      enemyName: input.enemyName,
      isBoss: input.isBoss,
      applied: false,
      expGained: 0,
      expBonusApplied: false,
      expMultParts: { guild: 1, rune: 1, paragon: 1, enchant: 1 },
      goldGained: 0,
      hpAfterRegen:
        typeof charPrev.hp === "number"
          ? charPrev.hp
          : Math.max(0, Math.min(input.finalPlayerHp, input.playerMaxHp)),
      hpRegenHealed: 0,
      drops: [],
      grantedTitleIds: [],
      milestones: [],
      readyQuestIds: [],
      saves: {
        [CHARACTER_KEY]: saves[CHARACTER_KEY],
        [INVENTORY_KEY]: saves[INVENTORY_KEY],
        [CRAFTING_KEY]: saves[CRAFTING_KEY],
        [PARAGON_KEY]: saves[PARAGON_KEY],
        [ADVENTURE_LOG_KEY]: saves[ADVENTURE_LOG_KEY],
        [STORY_FLAGS_STORAGE_KEY]: saves[STORY_FLAGS_STORAGE_KEY],
        [QUEST_PROGRESS_KEY]: saves[QUEST_PROGRESS_KEY],
      },
    };
  }

  const invPrev =
    (saves[INVENTORY_KEY] as Record<string, unknown> | undefined) ?? {};
  const craftingPrev =
    (saves[CRAFTING_KEY] as Record<string, unknown> | undefined) ?? {};
  const paragonPrev =
    (saves[PARAGON_KEY] as Record<string, unknown> | undefined) ?? {};
  const logPrev =
    (saves[ADVENTURE_LOG_KEY] as Record<string, unknown> | undefined) ?? {};
  const flagsPrev =
    (saves[STORY_FLAGS_STORAGE_KEY] as Record<string, unknown> | undefined) ??
    {};
  const progressPrev =
    (saves[QUEST_PROGRESS_KEY] as QuestProgressMap | undefined) ?? {};

  const playerLevel =
    typeof charPrev.level === "number" ? charPrev.level : 1;
  const equippedRunes = (charPrev.equippedRunes as
    | (EquippedRune | null)[]
    | undefined) ?? undefined;
  const runeBonus = computeRuneBonus(equippedRunes);
  // 별빛 마법부여 보상 보너스 — char.equipped 의 3 슬롯 enchantSlots 합산.
  // fortune(gold) / bounty(exp) / harvest(drop) 만 사용. 다른 affix 는 전투 엔진 측.
  const enchantBonus = readCharEnchantBonus(charPrev);
  const guildBuffs = await readGuildBuffs(tx, userId);
  const paragonNorm = readInitialParagon(saves[PARAGON_KEY]);
  const paragonBonus = computeParagonBonus(paragonNorm.allocations);

  // 멀티플라이어 — 클라 onBattleEnd 와 같은 식. 룬 합산은 char.equippedRunes 에서 직접.
  const guildExpMult = resolveBuffMultiplier(guildBuffs, "exp_mult");
  const guildDropMult = resolveBuffMultiplier(guildBuffs, "drop_mult");
  const runeExpMult = 1 + (runeBonus.exp_pct ?? 0) / 100;
  const runeDropMult = 1 + (runeBonus.drop_pct ?? 0) / 100;
  const newbieDropMult = getNewbieDropMultiplier(playerLevel);
  const paragonRewardMult = 1 + (paragonBonus.pctGoldExp ?? 0) / 100;
  // 별빛 마법부여 — fortune=골드드랍 / bounty=경험치 / harvest=재료드랍.
  const enchantExpMult = 1 + enchantBonus.bountyPct / 100;
  const enchantDropMult = 1 + enchantBonus.harvestPct / 100;
  const enchantGoldMult = 1 + enchantBonus.fortunePct / 100;
  const expMult = guildExpMult * runeExpMult * paragonRewardMult * enchantExpMult;
  const dropMult = guildDropMult * runeDropMult * newbieDropMult * enchantDropMult;

  // EXP 계산 — monster.exp + newbie ×2 (Lv30 미만).
  const baseExp = monster.exp ?? 0;
  const expBonus = applyNewbieBonus(baseExp, playerLevel);
  const boostedExp = Math.floor(
    expBonus.gained *
      expMult *
      XP_RATE_MULT *
      levelBandExpMultiplier(playerLevel),
  );

  // 드랍 — luk 부터 monster equipped 등을 pull, deterministic rng.
  const luk = typeof charPrev.stats === "object" && charPrev.stats !== null
    ? Number((charPrev.stats as Record<string, unknown>).luk ?? 0) || 0
    : 0;
  const luckMultiplier = 1 + luk * 0.01;

  const rng = mulberry32(battleSeed(input.encounterId, userId));
  const dropResult = rollDrops(rng, invPrev, craftingPrev, {
    luckMultiplier,
    dropMult,
    // paragon + 별빛 행운(fortune) 둘 다 골드 드랍에 곱연산.
    paragonRewardMult: paragonRewardMult * enchantGoldMult,
    monster,
  });

  // character.v2 mutation — EXP + level transition + paragon overflow + gold (drop) + hp regen.
  const charNext: Record<string, unknown> = { ...charPrev };
  let paragonNext: Record<string, unknown> = { ...paragonPrev };
  let charChanged = false;
  let paragonChanged = false;

  // 보스 도전 카운터는 전투 시작 시 클라가 먼저 기록한다. 승리 보상 응답이 서버의
  // character.v2 스냅샷으로 클라 상태를 교체하므로, 그 기록을 같은 저장 경로에서
  // 병합하지 않으면 응답이 bossAttempts 를 과거값(대개 없음)으로 되돌릴 수 있다.
  if (
    input.isBoss &&
    mergeBossAttemptSnapshotForClaim(
      charNext,
      input.enemyName,
      input.bossAttempt,
    )
  ) {
    charChanged = true;
  }

  if (boostedExp > 0) {
    const curExp = typeof charPrev.exp === "number" ? charPrev.exp : 0;
    const atMax = playerLevel >= MAX_LEVEL;
    if (atMax) {
      const curParagon =
        typeof paragonNext.paragonExp === "number"
          ? paragonNext.paragonExp
          : 0;
      paragonNext = { ...paragonNext, paragonExp: curParagon + boostedExp };
      paragonChanged = true;
    } else {
      const next = applyExpGain(playerLevel, curExp, boostedExp);
      charNext.exp = next.exp;
      if (next.levelsGained > 0) {
        charNext.level = next.level;
        // 레벨업 풀회복 — vit 보너스는 서버가 합성 stats 를 모르므로 base maxHp 만.
        charNext.hp = maxHpForLevel(next.level);
      }
      charChanged = true;
      if (next.overflowExp > 0) {
        const curParagon =
          typeof paragonNext.paragonExp === "number"
            ? paragonNext.paragonExp
            : 0;
        paragonNext = {
          ...paragonNext,
          paragonExp: curParagon + next.overflowExp,
        };
        paragonChanged = true;
      }
    }
  }

  // 드랍에서 누적된 골드.
  if (dropResult.goldGained > 0) {
    const curGold = typeof charNext.gold === "number" ? charNext.gold : 0;
    charNext.gold = curGold + dropResult.goldGained;
    charChanged = true;
  }

  // 재생 룬 — 클라가 보내준 finalPlayerHp 에 regen_pct 적용 → maxHp clamp.
  // 레벨업 풀회복이 있었다면 charNext.hp 가 이미 maxHpForLevel(L) 이라 regen 효과 무.
  const finalHp = Math.max(0, Math.min(input.finalPlayerHp, input.playerMaxHp));
  const runeRegenPct = runeBonus.regen_pct ?? 0;
  const runeRegenHeal =
    runeRegenPct > 0 && input.playerMaxHp > 0
      ? Math.floor((input.playerMaxHp * runeRegenPct) / 100)
      : 0;
  let hpAfterRegen = finalHp;
  if (typeof charNext.level === "number" && charNext.level !== playerLevel) {
    // 레벨업 풀회복으로 새 max 까지 회복된 케이스 — regen 효과 0.
    hpAfterRegen =
      typeof charNext.hp === "number" ? charNext.hp : finalHp;
  } else if (runeRegenHeal > 0) {
    hpAfterRegen = Math.min(input.playerMaxHp, finalHp + runeRegenHeal);
    charNext.hp = hpAfterRegen;
    charChanged = true;
  } else {
    // hp 변동 없음 — finalHp 그대로 (클라 setHp 가 어차피 따라가지만 saves 일관성).
    charNext.hp = finalHp;
    charChanged = true;
  }

  // ─── Phase 2: adventure-log + storyFlags 누적 / 칭호 / 마일스톤 ───────────────────
  let invNext: Record<string, unknown> = dropResult.invNext;
  const flagsArr = Array.isArray(flagsPrev.flags)
    ? [...(flagsPrev.flags as string[])]
    : [];
  const flagsSet = new Set(flagsArr);
  const titlesPrev =
    (logPrev.titles as Record<string, { obtainedAt: number }> | undefined) ?? {};
  const titlesNext: Record<string, { obtainedAt: number }> = { ...titlesPrev };
  const grantedTitleIds: string[] = [];
  const nowMs = Date.now();

  const grantTitle = (titleId: string) => {
    if (titlesNext[titleId]) return;
    titlesNext[titleId] = { obtainedAt: nowMs };
    grantedTitleIds.push(titleId);
  };
  const setFlag = (flagId: string): boolean => {
    if (flagsSet.has(flagId)) return false;
    flagsSet.add(flagId);
    flagsArr.push(flagId);
    return true;
  };

  // 칭호 grants — 매번 idempotent (이미 보유면 무시).
  grantTitle("first_blood");
  if (input.finalPlayerHp === 1) grantTitle("close_call");
  if (input.potionsConsumedTotal >= 5) grantTitle("potion_overload");
  if (monster.onDefeatTitleId) grantTitle(monster.onDefeatTitleId);

  // monster.onDefeatFlag — idempotent.
  if (monster.onDefeatFlag) setFlag(monster.onDefeatFlag);

  // 누적 카운터 — addKill(this monster) + 무피해 시 noDamageWins++.
  const monstersMap =
    (logPrev.monsters as Record<
      string,
      {
        encountered?: boolean;
        kills?: number;
        firstSeenAt?: number;
        lastKilledAt?: number;
      }
    > | undefined) ?? {};
  const existingMon = monstersMap[input.enemyName];
  const newKills = (existingMon?.kills ?? 0) + 1;
  const monstersNext = {
    ...monstersMap,
    [input.enemyName]: {
      ...existingMon,
      encountered: true,
      kills: newKills,
      firstSeenAt: existingMon?.firstSeenAt ?? nowMs,
      lastKilledAt: nowMs,
    },
  };
  let noDamageWinsNext =
    typeof logPrev.noDamageWins === "number" ? logPrev.noDamageWins : 0;
  if (input.damageTakenThisCombat === 0) {
    noDamageWinsNext += 1;
  }

  // 누적 합산 — 마일스톤 판정용. monstersNext 를 기준으로 (이번 처치 반영본).
  let totalKillsAfter = 0;
  let bossKillsAfter = 0;
  for (const [name, m] of Object.entries(monstersNext)) {
    const k = m.kills ?? 0;
    totalKillsAfter += k;
    if (MONSTERS[name]?.phaseTrigger) bossKillsAfter += k;
  }

  // 마일스톤 — flag 미보유 + 카운트 충족 시 1회 지급. skillBook 추가는 별도.
  const milestones: Array<{ bookId: string; message: string }> = [];
  const milestoneBookCounts: Partial<Record<string, number>> = {};
  const tryGrantMilestone = (
    spec: MilestoneSpec,
    condition: boolean,
  ) => {
    if (!condition) return;
    if (!setFlag(spec.flag)) return; // 이미 박혀 있음.
    milestoneBookCounts[spec.bookId] = (milestoneBookCounts[spec.bookId] ?? 0) + 1;
    milestones.push({ bookId: spec.bookId, message: spec.message });
  };
  tryGrantMilestone(
    MILESTONE_MAD_SLASH,
    input.damageTakenThisCombat === 0 && noDamageWinsNext >= 100,
  );
  tryGrantMilestone(
    MILESTONE_DEEP_WOUND,
    !!monster.phaseTrigger && bossKillsAfter >= 50,
  );
  tryGrantMilestone(MILESTONE_FRENZY, totalKillsAfter >= 1000);
  tryGrantMilestone(
    MILESTONE_THUNDER,
    input.enemyName === "운봉의 거인" && (newKills >= 10),
  );
  tryGrantMilestone(MILESTONE_LIGHT_GLIDE, input.enemyName === "천공인의 왕");

  // 마일스톤 스킬북 — inventory.skillBooks 에 추가. drop 으로 이미 변경된 invNext 위에 누적.
  if (Object.keys(milestoneBookCounts).length > 0) {
    const curSkillBooks = {
      ...((invNext.skillBooks as Record<string, number> | undefined) ?? {}),
    };
    for (const [bookId, n] of Object.entries(milestoneBookCounts)) {
      if (!n) continue;
      curSkillBooks[bookId] = (curSkillBooks[bookId] ?? 0) + n;
    }
    invNext = { ...invNext, skillBooks: curSkillBooks };
  }

  const logChanged =
    monstersNext !== monstersMap ||
    noDamageWinsNext !==
      (typeof logPrev.noDamageWins === "number" ? logPrev.noDamageWins : 0) ||
    grantedTitleIds.length > 0;
  const logNext = logChanged
    ? {
        ...logPrev,
        monsters: monstersNext,
        noDamageWins: noDamageWinsNext,
        titles: titlesNext,
      }
    : logPrev;

  const flagsChanged = flagsArr.length !== (Array.isArray(flagsPrev.flags) ? (flagsPrev.flags as string[]).length : 0);
  const flagsNext = flagsChanged ? { ...flagsPrev, flags: flagsArr } : flagsPrev;

  // ── Phase 3: quest progress ───────────────────────────────────────
  // hpFraction / potionsUsed 컨텍스트 — kill_within_hp / no_potion_boss 의뢰 판정.
  // playerMaxHp 가 0/음수면 비율 0 (실용상 발생 X — input 검증에서 maxHp>0 이지만 방어).
  const hpFraction =
    input.playerMaxHp > 0 ? finalHp / input.playerMaxHp : 0;
  const questResult = recordKillIntoProgress(progressPrev, input.enemyName, {
    hpFraction,
    potionsUsed: input.potionsConsumedTotal,
  });
  const progressNext = questResult.next;
  const readyQuestIds = questResult.readyIds;

  // Phase 3: encounterId dedup 토큰 박기 — 어차피 char 는 항상 한 줄 이상 mutate 되지만
  // 모든 경로(드랍 0/EXP 0)에서도 토큰이 박히도록 명시.
  charNext.lastBattleEncounterId = input.encounterId;
  charChanged = true;

  // ─── 저장 ───
  if (charChanged) await upsertSave(tx, userId, CHARACTER_KEY, charNext);
  if (invNext !== invPrev) {
    await upsertSave(tx, userId, INVENTORY_KEY, invNext);
  }
  if (dropResult.craftingNext !== craftingPrev) {
    await upsertSave(tx, userId, CRAFTING_KEY, dropResult.craftingNext);
  }
  if (paragonChanged) await upsertSave(tx, userId, PARAGON_KEY, paragonNext);
  if (logChanged) {
    await upsertSave(tx, userId, ADVENTURE_LOG_KEY, logNext);
  }
  if (flagsChanged) {
    await upsertSave(tx, userId, STORY_FLAGS_STORAGE_KEY, flagsNext);
  }
  if (questResult.changed) {
    await upsertSave(tx, userId, QUEST_PROGRESS_KEY, progressNext);
  }

  // ── Phase 3: 길드 의뢰 kill 보고 — 같은 tx 안. chunk A 의 헬퍼 재활용.
  // monster.phaseTrigger 유무로 kill_boss / kill_monster 자동 분류 (page.tsx 의 옛 분기 동일).
  const guildKill: GuildQuestKill = {
    kind: monster.phaseTrigger != null ? "kill_boss" : "kill_monster",
    name: input.enemyName,
    count: 1,
  };
  await applyGuildQuestKills(tx, userId, [guildKill]);

  return {
    enemyName: input.enemyName,
    isBoss: input.isBoss,
    applied: true,
    expGained: boostedExp,
    expBonusApplied: expBonus.bonusApplied,
    expMultParts: {
      guild: guildExpMult,
      rune: runeExpMult,
      paragon: paragonRewardMult,
      enchant: enchantExpMult,
    },
    goldGained: dropResult.goldGained,
    hpAfterRegen,
    hpRegenHealed: Math.max(0, hpAfterRegen - finalHp),
    drops: dropResult.drops,
    grantedTitleIds,
    milestones,
    readyQuestIds,
    saves: {
      [CHARACTER_KEY]: charNext,
      [INVENTORY_KEY]: invNext,
      [CRAFTING_KEY]: dropResult.craftingNext,
      [PARAGON_KEY]: paragonChanged ? paragonNext : paragonPrev,
      [ADVENTURE_LOG_KEY]: logChanged ? logNext : logPrev,
      [STORY_FLAGS_STORAGE_KEY]: flagsChanged ? flagsNext : flagsPrev,
      [QUEST_PROGRESS_KEY]: questResult.changed ? progressNext : progressPrev,
    },
  };
}

// character.v2 의 equipped 슬롯 3개에서 enchantSlots 만 추려 합산.
// 보상 멀티(fortune/bounty/harvest) 만 쓰지만 헬퍼는 전체 EnchantCombatBonus 를 반환 — 추후
// 서버에서 발동형 affix 도 검증할 일이 생기면 그대로 재사용.
function readCharEnchantBonus(
  charPrev: Record<string, unknown>,
): EnchantCombatBonus {
  const acc: EnchantCombatBonus = { ...ZERO_ENCHANT_COMBAT_BONUS };
  const equipped = charPrev.equipped;
  if (!equipped || typeof equipped !== "object") return acc;
  for (const key of ["weapon", "armor", "accessory"] as const) {
    const slot = (equipped as Record<string, unknown>)[key];
    if (!slot || typeof slot !== "object") continue;
    const raw = (slot as { enchantSlots?: unknown }).enchantSlots;
    if (!Array.isArray(raw)) continue;
    const parsed: EnchantSlot[] = [];
    for (const s of raw) {
      if (!s || typeof s !== "object") continue;
      const aid = (s as { affixId?: unknown }).affixId;
      const val = (s as { value?: unknown }).value;
      if (!isEnchantAffixId(aid)) continue;
      if (typeof val !== "number" || !Number.isFinite(val)) continue;
      parsed.push({ affixId: aid, value: val });
    }
    accumulateEnchantCombat(acc, parsed);
  }
  return acc;
}
