import "server-only";

// 솔로 전투 승리 보상 서버 lib — /api/battle/claim-victory 핵심 (EPIC #3-3 Phase 1).
//
// 권위: 서버. 클라는 enemyName + encounterId + 몇 가지 stat (finalPlayerHp/maxHp/
// damageTaken/potionsConsumed) 만 보낸다. 서버가 monster 정의에서 base reward 를 읽고
// deterministic seed (encounterId+userId FNV-1a → mulberry32) 로 드랍 RNG 굴림.
//
// 적용 saves: character.v2 (gold/exp/level/hp/mp) + inventory.v2 (materials/equipment/
// droppedEquipment/skillBooks) + crafting.v2 (recipes) + paragon.v1 (만렙 잉여 EXP).
//
// Phase 1 스코프 밖 (클라 잔존):
//  - 칭호 grants (first_blood / close_call / monster.onDefeatTitleId / potion_overload)
//  - 스토리플래그 (monster.onDefeatFlag / mad_slash·deep_wound·frenzy·thunder·light_glide 마일스톤)
//  - 누적 카운터 (adventureLog.addKill / incrementNoDamageWin / battle losses)
//  - quest progress (recordKill — kill_within_hp / no_potion_boss 의뢰 판정)
//  - regen 룬 HP 회복 (서버가 보상 적용 시 같이 하지만 hpAfterRegen 반환 → 클라가 setHp)

import { and, eq, inArray } from "drizzle-orm";
import { guildMembers, guilds, savesKv } from "@/db/schema";
import { upsertSave, type DbExecutor } from "@/lib/server/savesKv";
import {
  applyExpGain,
  applyNewbieBonus,
  MAX_LEVEL,
  XP_RATE_MULT,
  getNewbieDropMultiplier,
} from "@/lib/leveling";
import { computeParagonBonus, readInitialParagon } from "@/lib/paragon";
import {
  maxHpForLevel,
  maxMpForLevel,
} from "@/adventure/character/defaults";
import { computeRuneBonus } from "@/adventure/character/runeBonus";
import { MONSTERS, type Monster } from "@/adventure/data/monsters";
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

const CHARACTER_KEY = "character.v2";
const INVENTORY_KEY = "inventory.v2";
const CRAFTING_KEY = "crafting.v2";
const PARAGON_KEY = "paragon.v1";

const REWARD_SAVES_KEYS = [
  CHARACTER_KEY,
  INVENTORY_KEY,
  CRAFTING_KEY,
  PARAGON_KEY,
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
  | {
      kind: "recipe_one_of_already_known";
      /** 풀 전체를 이미 알고 있어서 학습 못함 — 클라 안내 토스트. */
      recipeIds: string[];
    }
  | { kind: "skill_book"; bookId: string; name: string };

export type BattleClaimOutcome = {
  enemyName: string;
  isBoss: boolean;
  /** 신규 적용 (false 면 dedup 이후 도입할 idempotent retry). Phase 1 은 항상 true. */
  applied: boolean;
  /** 멀티플라이어 반영 후 실제 적립 EXP — 클라 토스트 표시용. */
  expGained: number;
  /** 신참 ×2 적용 여부 — 토스트 라벨용. */
  expBonusApplied: boolean;
  /** EXP 곱셈 분해 (토스트 표시용). */
  expMultParts: {
    guild: number;
    rune: number;
    paragon: number;
  };
  /** 드롭에서 누적된 골드 (gold drop kind). character.gold 증가량. */
  goldGained: number;
  /** 재생의 룬 + finalPlayerHp 합산 → 적용 후 HP. clamp(0..maxHp). */
  hpAfterRegen: number;
  /** regen 가 더해진 양. > 0 이면 클라가 "재생의 룬 — HP +N" 토스트. */
  hpRegenHealed: number;
  /** 굴려진 드랍들 — 클라가 loot/milestone 토스트로 표시. */
  drops: ResolvedBattleDrop[];
  saves: BattleRewardSavesSnapshot;
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
      if (unknown.length === 0) {
        drops.push({
          kind: "recipe_one_of_already_known",
          recipeIds: [...drop.recipeIds],
        });
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
};

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
  const invPrev =
    (saves[INVENTORY_KEY] as Record<string, unknown> | undefined) ?? {};
  const craftingPrev =
    (saves[CRAFTING_KEY] as Record<string, unknown> | undefined) ?? {};
  const paragonPrev =
    (saves[PARAGON_KEY] as Record<string, unknown> | undefined) ?? {};

  const playerLevel =
    typeof charPrev.level === "number" ? charPrev.level : 1;
  const equippedRunes = (charPrev.equippedRunes as
    | (EquippedRune | null)[]
    | undefined) ?? undefined;
  const runeBonus = computeRuneBonus(equippedRunes);
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
  const expMult = guildExpMult * runeExpMult * paragonRewardMult;
  const dropMult = guildDropMult * runeDropMult * newbieDropMult;

  // EXP 계산 — monster.exp + newbie ×2 (Lv30 미만).
  const baseExp = monster.exp ?? 0;
  const expBonus = applyNewbieBonus(baseExp, playerLevel);
  const boostedExp = Math.floor(expBonus.gained * expMult * XP_RATE_MULT);

  // 드랍 — luk 부터 monster equipped 등을 pull, deterministic rng.
  const luk = typeof charPrev.stats === "object" && charPrev.stats !== null
    ? Number((charPrev.stats as Record<string, unknown>).luk ?? 0) || 0
    : 0;
  const luckMultiplier = 1 + luk * 0.01;

  const rng = mulberry32(battleSeed(input.encounterId, userId));
  const dropResult = rollDrops(rng, invPrev, craftingPrev, {
    luckMultiplier,
    dropMult,
    paragonRewardMult,
    monster,
  });

  // character.v2 mutation — EXP + level transition + paragon overflow + gold (drop) + hp regen.
  let charNext: Record<string, unknown> = { ...charPrev };
  let paragonNext: Record<string, unknown> = { ...paragonPrev };
  let charChanged = false;
  let paragonChanged = false;

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
        charNext.mp = maxMpForLevel(next.level);
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

  // 저장.
  if (charChanged) await upsertSave(tx, userId, CHARACTER_KEY, charNext);
  if (dropResult.invNext !== invPrev) {
    await upsertSave(tx, userId, INVENTORY_KEY, dropResult.invNext);
  }
  if (dropResult.craftingNext !== craftingPrev) {
    await upsertSave(tx, userId, CRAFTING_KEY, dropResult.craftingNext);
  }
  if (paragonChanged) await upsertSave(tx, userId, PARAGON_KEY, paragonNext);

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
    },
    goldGained: dropResult.goldGained,
    hpAfterRegen,
    hpRegenHealed: Math.max(0, hpAfterRegen - finalHp),
    drops: dropResult.drops,
    saves: {
      [CHARACTER_KEY]: charChanged ? charNext : charPrev,
      [INVENTORY_KEY]: dropResult.invNext,
      [CRAFTING_KEY]: dropResult.craftingNext,
      [PARAGON_KEY]: paragonChanged ? paragonNext : paragonPrev,
    },
  };
}
