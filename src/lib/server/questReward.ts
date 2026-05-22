import "server-only";

// 퀘스트 보상 서버 lib — /api/quests/claim 핵심.
//
// 권위: 서버. 클라는 questId 만 보낸다. 서버가 quest-progress.v2 의 state==='ready'
// 를 검사 후 character.v2 / inventory.v2 / storyFlags.v2 / adventure-log.v2 /
// quest-progress.v2 를 트랜잭션 안에서 mutate. 새 saves + 사람이 읽을 토큰 배열
// 을 응답에 담아 반환. 클라는 각 hook 의 replaceFromSaved 로 통째 교체 + 토큰을
// 토스트 한 줄로 합성.
//
// dedup: quest-progress.v2 의 state 전환 자체가 idempotent 가드. 같은 questId
// 두 번째 호출은 state!=='ready' 라 applied:false + 현재 saves 그대로 반환.
// 응답 손실 후 retry 안전.

import { and, eq, inArray } from "drizzle-orm";
import { guildMembers, guilds, savesKv } from "@/db/schema";
import {
  getQuestById,
  type Quest,
  type QuestReward,
} from "@/adventure/data/quests";
import { ITEMS } from "@/adventure/data/items";
import { MATERIALS } from "@/adventure/data/materials";
import { POTIONS, potionMax, type PotionId } from "@/adventure/data/potions";
import { RECIPES } from "@/adventure/data/recipes";
import { SKILL_BOOKS, type SkillBookId } from "@/adventure/data/skillBooks";
import {
  resolveBuffMultiplier,
  type GuildBuffSlot,
} from "@/adventure/data/guildBuffs";
import {
  applyExpGain,
  levelBandExpMultiplier,
  MAX_LEVEL,
  XP_RATE_MULT,
  applyNewbieBonus,
} from "@/lib/leveling";
import { computeParagonBonus, readInitialParagon } from "@/lib/paragon";
import {
  maxHpForLevel,
  maxMpForLevel,
} from "@/adventure/character/defaults";
import { STORY_FLAGS_STORAGE_KEY } from "@/adventure/storyFlags/storage";
import { bumpGuildFameFromMember } from "@/lib/server/guildFame";
import { upsertSave, type DbExecutor } from "@/lib/server/savesKv";
import {
  ON_COMPLETE_DATA,
  ON_ALL_COMPLETE_DATA,
} from "@/adventure/quests/questCompletionSideEffectsData";

const QUEST_PROGRESS_KEY = "quest-progress.v2";
const ADVENTURE_LOG_KEY = "adventure-log.v2";
const PARAGON_KEY = "paragon.v1";
const CRAFTING_KEY = "crafting.v2";

const REWARD_SAVES_KEYS = [
  "character.v2",
  "inventory.v2",
  STORY_FLAGS_STORAGE_KEY,
  ADVENTURE_LOG_KEY,
  QUEST_PROGRESS_KEY,
  CRAFTING_KEY,
  PARAGON_KEY,
] as const;

export type QuestRewardSavesSnapshot = Partial<
  Record<(typeof REWARD_SAVES_KEYS)[number], unknown>
>;

export type QuestRewardOutcome = {
  /** 이번 호출이 실제 보상을 적용했는지. false 면 state!=='ready' 인 idempotent retry. */
  applied: boolean;
  /** 의뢰 제목 — 클라가 토스트 prefix 로 사용 (questId 만으론 lookup 추가 필요). */
  questTitle: string;
  /** 적용된 보상 정의 (UI 가 추가 표시할 때 참고). 미적용 시에도 quest.reward 그대로. */
  reward: QuestReward;
  /** 메인 보상 토큰 — 클라가 콤마로 합쳐 quest_complete 토스트 한 줄. 칭호는 별도. */
  tokens: string[];
  /**
   * 이번 호출로 신규 획득한 칭호 ID. 클라가 grantTitle 로 milestone 토스트 + 잔영 컬렉션
   * 체인 처리. 서버는 이미 saves 에 박아뒀지만, grantTitle 의 토스트/체인 효과를 위해 별도.
   */
  grantedTitleIds: string[];
  /** 신규 saves 통째 — 클라는 각 hook 의 replaceFromSaved 로 적용. */
  saves: QuestRewardSavesSnapshot;
};

export class QuestRewardError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "QuestRewardError";
  }
}

type QuestState = "available" | "active" | "ready" | "completed";
type QuestProgressEntry = {
  state: QuestState;
  progress: number;
  completedCount: number;
  lastCompletedAt?: number;
};
type QuestProgressMap = Record<string, QuestProgressEntry>;

async function readSavesForUpdate(
  tx: DbExecutor,
  userId: string,
): Promise<QuestRewardSavesSnapshot> {
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
  return out as QuestRewardSavesSnapshot;
}

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

function plural(name: string, count: number): string {
  return count > 1 ? `${name} ×${count}` : name;
}

function recipeName(id: string): string {
  return RECIPES.find((r) => r.id === id)?.name ?? id;
}

// 메인 보상 적용 — 클라 applyQuestReward 와 동일한 math. character/inventory/crafting/
// paragon 객체를 변경된 사본으로 반환 + 토큰 배열 기록. 사이드이펙트(titles, flags) 는
// 별도 함수.
function applyMainReward(
  reward: QuestReward,
  charPrev: Record<string, unknown>,
  invPrev: Record<string, unknown>,
  craftingPrev: Record<string, unknown>,
  paragonPrev: Record<string, unknown>,
  ctx: {
    playerLevel: number;
    guildBuffs: GuildBuffSlot[];
    paragonRewardMult: number;
  },
): {
  charNext: Record<string, unknown>;
  invNext: Record<string, unknown>;
  craftingNext: Record<string, unknown>;
  paragonNext: Record<string, unknown>;
  tokens: string[];
  /** 적용된 character.fame delta (post-multiplier). 길드 fame piggyback 용. */
  fameDelta: number;
} {
  const tokens: string[] = [];
  let charChanged = false;
  let invChanged = false;
  let craftingChanged = false;
  let paragonChanged = false;
  const char: Record<string, unknown> = { ...charPrev };
  const inv: Record<string, unknown> = { ...invPrev };
  const crafting: Record<string, unknown> = { ...craftingPrev };
  const paragon: Record<string, unknown> = { ...paragonPrev };

  const fameMult = resolveBuffMultiplier(ctx.guildBuffs, "fame_mult");
  const expMult = resolveBuffMultiplier(ctx.guildBuffs, "exp_mult");

  // gold/fame (paragon 풍요 트랙 × · 길드 fame_mult ×).
  const gold = Math.floor((reward.gold ?? 0) * ctx.paragonRewardMult);
  const fame = Math.floor((reward.fame ?? 0) * fameMult);
  if (gold > 0 || fame > 0) {
    const curGold = typeof char.gold === "number" ? char.gold : 0;
    const curFame = typeof char.fame === "number" ? char.fame : 0;
    if (gold > 0) {
      char.gold = curGold + gold;
      tokens.push(`골드 +${gold}`);
      charChanged = true;
    }
    if (fame > 0) {
      char.fame = curFame + fame;
      tokens.push(`명성 +${fame}`);
      charChanged = true;
    }
  }
  const fameDelta = fame > 0 ? fame : 0;

  // EXP — 신참 ×2 + 길드 ×expMult + 전역 ×XP_RATE_MULT + 파라곤 풍요 ×.
  // 레벨 transition 은 클라 readInitial 이 자동 적용하지 않으므로 서버가 applyExpGain 으로
  // 직접 처리: levelsGained > 0 이면 hp/mp 풀회복 + 새 level, overflow 는 paragon.paragonExp 로.
  // 이전 버그(#399): char.exp 만 raw 로 더해 레벨업/만렙 라우팅이 영영 안 됨.
  const baseExp = reward.exp ?? 0;
  if (baseExp > 0) {
    const expBonus = applyNewbieBonus(baseExp, ctx.playerLevel);
    const boosted = Math.floor(
      expBonus.gained *
        expMult *
        XP_RATE_MULT *
        ctx.paragonRewardMult *
        levelBandExpMultiplier(ctx.playerLevel),
    );
    if (boosted > 0) {
      const atMax = ctx.playerLevel >= MAX_LEVEL;
      if (atMax) {
        // 만렙 — 전액 파라곤 EXP 로 적립.
        const curParagon =
          typeof paragon.paragonExp === "number" ? paragon.paragonExp : 0;
        paragon.paragonExp = curParagon + boosted;
        paragonChanged = true;
        tokens.push(`EXP +${boosted} (파라곤)`);
      } else {
        const curExp = typeof char.exp === "number" ? char.exp : 0;
        const next = applyExpGain(ctx.playerLevel, curExp, boosted);
        char.exp = next.exp;
        if (next.levelsGained > 0) {
          char.level = next.level;
          // 레벨업 풀회복 — vit 보너스는 서버가 합성 stats 를 모르므로 base maxHp 만.
          // 클라가 다음 tick 에 vit 반영해 max 만 올리고 hp 는 그대로 유지(자연 회복).
          char.hp = maxHpForLevel(next.level);
          char.mp = maxMpForLevel(next.level);
        }
        charChanged = true;
        if (next.overflowExp > 0) {
          const curParagon =
            typeof paragon.paragonExp === "number" ? paragon.paragonExp : 0;
          paragon.paragonExp = curParagon + next.overflowExp;
          paragonChanged = true;
        }
        tokens.push(
          `EXP +${boosted}${expBonus.bonusApplied ? " (신참 ×2)" : ""}`,
        );
      }
    }
  }

  // 포션 — cap 초과는 silently 잘림 (토큰엔 폐기 표시).
  if (reward.potions && reward.potions.length > 0) {
    const curPotions =
      (inv.potions as Record<string, number> | undefined) ?? {};
    const capBonus =
      typeof inv.potionCapacityBonus === "number" ? inv.potionCapacityBonus : 0;
    const cap = potionMax(capBonus);
    const np: Record<string, number> = { ...curPotions };
    for (const p of reward.potions) {
      const have = np[p.id] ?? 0;
      const room = Math.max(0, cap - have);
      const added = Math.min(p.count, room);
      const name = POTIONS[p.id]?.name ?? p.id;
      if (added > 0) {
        np[p.id as PotionId] = have + added;
        invChanged = true;
      }
      if (added < p.count) {
        const lost = p.count - added;
        if (added > 0) tokens.push(`${plural(name, added)} (${lost}개는 가방 가득 차 폐기)`);
        else tokens.push(`${plural(name, p.count)} (가방 가득 차 폐기)`);
      } else {
        tokens.push(plural(name, p.count));
      }
    }
    if (invChanged) inv.potions = np;
  }

  // 재료.
  if (reward.materials && reward.materials.length > 0) {
    const cur = (inv.materials as Record<string, number> | undefined) ?? {};
    const nm = { ...cur };
    for (const m of reward.materials) {
      nm[m.id] = (nm[m.id] ?? 0) + m.count;
      tokens.push(plural(MATERIALS[m.id]?.name ?? m.id, m.count));
      invChanged = true;
    }
    inv.materials = nm;
  }

  // 장비 — count 만큼 추가. equipment 는 { [itemId]: count } 형태.
  if (reward.items && reward.items.length > 0) {
    const cur = (inv.equipment as Record<string, number> | undefined) ?? {};
    const ne = { ...cur };
    for (const it of reward.items) {
      ne[it.id] = (ne[it.id] ?? 0) + it.count;
      tokens.push(plural(ITEMS[it.id]?.name ?? it.id, it.count));
      invChanged = true;
    }
    inv.equipment = ne;
  }

  // 제작서 — 클라 useCrafting.learnRecipe 정책 그대로: crafting.v2 의 known + shareable
  // 양쪽에 추가. 이전 버그(#399): inv.knownRecipes 라는 존재하지 않는 키에 써서 보상이
  // silently 손실됨. useCrafting 은 crafting.v2 에서 known/shareable 을 읽는다.
  if (reward.recipes && reward.recipes.length > 0) {
    const curKnown = Array.isArray(crafting.known)
      ? (crafting.known as string[])
      : [];
    const curShareable = Array.isArray(crafting.shareable)
      ? (crafting.shareable as string[])
      : [];
    const knownSet = new Set(curKnown);
    const shareableSet = new Set(curShareable);
    const nextKnown = [...curKnown];
    const nextShareable = [...curShareable];
    for (const id of reward.recipes) {
      tokens.push(recipeName(id));
      if (!knownSet.has(id)) {
        knownSet.add(id);
        nextKnown.push(id);
        craftingChanged = true;
      }
      if (!shareableSet.has(id)) {
        shareableSet.add(id);
        nextShareable.push(id);
        craftingChanged = true;
      }
    }
    if (craftingChanged) {
      crafting.known = nextKnown;
      crafting.shareable = nextShareable;
    }
  }

  // 포션 최대 보유량 +.
  if (reward.potionCapacityBonus && reward.potionCapacityBonus > 0) {
    const cur =
      typeof inv.potionCapacityBonus === "number" ? inv.potionCapacityBonus : 0;
    inv.potionCapacityBonus = cur + reward.potionCapacityBonus;
    tokens.push(`포션 최대 보유량 +${reward.potionCapacityBonus}`);
    invChanged = true;
  }

  // 스킬북 — { [bookId]: count } 형태.
  if (reward.skillBooks && reward.skillBooks.length > 0) {
    const cur = (inv.skillBooks as Record<string, number> | undefined) ?? {};
    const nb = { ...cur };
    for (const id of reward.skillBooks) {
      nb[id] = (nb[id] ?? 0) + 1;
      tokens.push(SKILL_BOOKS[id as SkillBookId]?.name ?? id);
      invChanged = true;
    }
    inv.skillBooks = nb;
  }

  return {
    charNext: charChanged ? char : charPrev,
    invNext: invChanged ? inv : invPrev,
    craftingNext: craftingChanged ? crafting : craftingPrev,
    paragonNext: paragonChanged ? paragon : paragonPrev,
    tokens,
    fameDelta,
  };
}

// 5막 잔영 셋 — 마지막 깨고 들어오는 시점에 컬렉션 칭호(starlit_quietener)도 함께 부여
// (클라 useTitleGrant 의 동일 패턴). saves 에 박아두면 클라 replaceFromSaved 가 반영.
const STARLIT_BREAKER_TITLES = [
  "starlit_giant_breaker",
  "starlit_depth_breaker",
  "starlit_gate_breaker",
] as const;

function grantTitleInLog(
  log: Record<string, unknown>,
  titleId: string,
): { logNext: Record<string, unknown>; granted: boolean } {
  const titles =
    (log.titles as Record<string, { obtainedAt: number }> | undefined) ?? {};
  if (titles[titleId]) return { logNext: log, granted: false };
  const next = { ...log, titles: { ...titles, [titleId]: { obtainedAt: Date.now() } } };
  return { logNext: next, granted: true };
}

function setStoryFlag(
  flags: Record<string, unknown>,
  flagId: string,
): { flagsNext: Record<string, unknown>; set: boolean } {
  const arr = Array.isArray(flags.flags) ? (flags.flags as string[]) : [];
  if (arr.includes(flagId)) return { flagsNext: flags, set: false };
  return { flagsNext: { ...flags, flags: [...arr, flagId] }, set: true };
}

// 사이드이펙트 (ON_COMPLETE + ON_ALL_COMPLETE). ON_ALL_COMPLETE 는 멤버 의뢰들이 모두
// completed 인지 검사 (방금 완료 처리한 questId 포함). saves 에 직접 mutate + 신규로
// 부여된 칭호 ID 들을 모아 반환 — 클라 grantTitle 호출로 토스트만 따로 처리.
function applySideEffects(
  questId: string,
  progress: QuestProgressMap,
  logPrev: Record<string, unknown>,
  flagsPrev: Record<string, unknown>,
): {
  logNext: Record<string, unknown>;
  flagsNext: Record<string, unknown>;
  grantedTitleIds: string[];
} {
  let log = logPrev;
  let flags = flagsPrev;
  const grantedTitleIds: string[] = [];

  const grant = (titleId: string) => {
    const r = grantTitleInLog(log, titleId);
    log = r.logNext;
    if (!r.granted) return;
    grantedTitleIds.push(titleId);
    // 잔영 컬렉션 — 셋 다 보유 시 starlit_quietener 도 같이 박는다.
    // 클라 grantTitle 도 같은 체인을 도니 saves 와 토스트가 양쪽에서 부합.
    if (
      (STARLIT_BREAKER_TITLES as readonly string[]).includes(titleId) &&
      STARLIT_BREAKER_TITLES.every(
        (id) =>
          (log.titles as Record<string, unknown> | undefined)?.[id] != null,
      )
    ) {
      const r2 = grantTitleInLog(log, "starlit_quietener");
      log = r2.logNext;
      if (r2.granted) grantedTitleIds.push("starlit_quietener");
    }
  };

  const direct = ON_COMPLETE_DATA[questId];
  if (direct) {
    for (const e of direct) {
      if (e.kind === "grantTitle") grant(e.titleId);
      else {
        const r = setStoryFlag(flags, e.flag);
        flags = r.flagsNext;
      }
    }
  }

  for (const group of ON_ALL_COMPLETE_DATA) {
    if (!group.members.includes(questId)) continue;
    const others = group.members.filter((m) => m !== questId);
    const allCompleted = others.every(
      (m) => progress[m]?.state === "completed",
    );
    if (!allCompleted) continue;
    for (const e of group.effects) {
      if (e.kind === "grantTitle") grant(e.titleId);
      else {
        const r = setStoryFlag(flags, e.flag);
        flags = r.flagsNext;
      }
    }
  }

  return { logNext: log, flagsNext: flags, grantedTitleIds };
}

function transitionQuestState(
  progress: QuestProgressMap,
  quest: Quest,
): QuestProgressMap {
  const cur = progress[quest.id];
  if (!cur || cur.state !== "ready") return progress;
  const next: QuestProgressEntry = {
    ...cur,
    state: quest.repeatable ? "available" : "completed",
    progress: 0,
    completedCount: cur.completedCount + 1,
    lastCompletedAt: Date.now(),
  };
  return { ...progress, [quest.id]: next };
}

export async function applyQuestRewardServer(
  tx: DbExecutor,
  userId: string,
  questId: string,
): Promise<QuestRewardOutcome> {
  const quest = getQuestById(questId);
  if (!quest) throw new QuestRewardError("unknown_quest");

  const saves = await readSavesForUpdate(tx, userId);
  const progressPrev =
    (saves[QUEST_PROGRESS_KEY] as QuestProgressMap | undefined) ?? {};
  const entry = progressPrev[questId];

  // state!=='ready' → idempotent. 현재 saves 그대로 반환 (replaceFromSaved 호출도 안전한 no-op).
  if (!entry || entry.state !== "ready") {
    return {
      applied: false,
      questTitle: quest.title,
      reward: quest.reward,
      tokens: [],
      grantedTitleIds: [],
      saves: {
        "character.v2": saves["character.v2"],
        "inventory.v2": saves["inventory.v2"],
        [STORY_FLAGS_STORAGE_KEY]: saves[STORY_FLAGS_STORAGE_KEY],
        [ADVENTURE_LOG_KEY]: saves[ADVENTURE_LOG_KEY],
        [QUEST_PROGRESS_KEY]: saves[QUEST_PROGRESS_KEY],
        [CRAFTING_KEY]: saves[CRAFTING_KEY],
        [PARAGON_KEY]: saves[PARAGON_KEY],
      },
    };
  }

  const charPrev =
    (saves["character.v2"] as Record<string, unknown> | undefined) ?? {};
  const invPrev =
    (saves["inventory.v2"] as Record<string, unknown> | undefined) ?? {};
  const flagsPrev =
    (saves[STORY_FLAGS_STORAGE_KEY] as Record<string, unknown> | undefined) ??
    {};
  const logPrev =
    (saves[ADVENTURE_LOG_KEY] as Record<string, unknown> | undefined) ??
    { titles: {} };
  const craftingPrev =
    (saves[CRAFTING_KEY] as Record<string, unknown> | undefined) ?? {};
  const paragonPrev =
    (saves[PARAGON_KEY] as Record<string, unknown> | undefined) ?? {};
  // 풍요 트랙 % 는 readInitialParagon 으로 정규화한 allocations 에서 — paragonExp 덧셈만
  // 별도 (paragonNext) 로 적립한다.
  const paragonNormalized = readInitialParagon(saves[PARAGON_KEY]);
  const paragonBonus = computeParagonBonus(paragonNormalized.allocations);
  const paragonRewardMult = 1 + (paragonBonus.pctGoldExp ?? 0) / 100;
  const playerLevel =
    typeof charPrev.level === "number" ? charPrev.level : 1;
  const guildBuffs = await readGuildBuffs(tx, userId);

  // 1) 메인 보상.
  const main = applyMainReward(
    quest.reward,
    charPrev,
    invPrev,
    craftingPrev,
    paragonPrev,
    {
      playerLevel,
      guildBuffs,
      paragonRewardMult,
    },
  );

  // 2) 퀘스트 상태 전환 (먼저 적용해야 ON_ALL_COMPLETE 가 본인 completed 를 본다).
  const progressNext = transitionQuestState(progressPrev, quest);

  // 3) 사이드이펙트 (칭호/플래그).
  const side = applySideEffects(quest.id, progressNext, logPrev, flagsPrev);

  // 4) 저장.
  const charChanged = main.charNext !== charPrev;
  const invChanged = main.invNext !== invPrev;
  const craftingChanged = main.craftingNext !== craftingPrev;
  const paragonChanged = main.paragonNext !== paragonPrev;
  const flagsChanged = side.flagsNext !== flagsPrev;
  const logChanged = side.logNext !== logPrev;
  const progressChanged = progressNext !== progressPrev;

  if (charChanged)
    await upsertSave(tx, userId, "character.v2", main.charNext);
  if (invChanged)
    await upsertSave(tx, userId, "inventory.v2", main.invNext);
  if (craftingChanged)
    await upsertSave(tx, userId, CRAFTING_KEY, main.craftingNext);
  if (paragonChanged)
    await upsertSave(tx, userId, PARAGON_KEY, main.paragonNext);
  if (flagsChanged)
    await upsertSave(tx, userId, STORY_FLAGS_STORAGE_KEY, side.flagsNext);
  if (logChanged)
    await upsertSave(tx, userId, ADVENTURE_LOG_KEY, side.logNext);
  if (progressChanged)
    await upsertSave(tx, userId, QUEST_PROGRESS_KEY, progressNext);

  // 5) 길드 fame piggyback — EPIC #3-4. 같은 tx 안에서 동일 delta 를 길드 fame 에도.
  await bumpGuildFameFromMember(tx, userId, main.fameDelta);

  return {
    applied: true,
    questTitle: quest.title,
    reward: quest.reward,
    tokens: main.tokens,
    grantedTitleIds: side.grantedTitleIds,
    saves: {
      "character.v2": main.charNext,
      "inventory.v2": main.invNext,
      [STORY_FLAGS_STORAGE_KEY]: side.flagsNext,
      [ADVENTURE_LOG_KEY]: side.logNext,
      [QUEST_PROGRESS_KEY]: progressNext,
      [CRAFTING_KEY]: main.craftingNext,
      [PARAGON_KEY]: main.paragonNext,
    },
  };
}

