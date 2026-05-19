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
import { MAX_LEVEL, XP_RATE_MULT, applyNewbieBonus } from "@/lib/leveling";
import { computeParagonBonus, readInitialParagon } from "@/lib/paragon";
import { STORY_FLAGS_STORAGE_KEY } from "@/adventure/storyFlags/storage";
import { upsertSave, type DbExecutor } from "@/lib/server/savesKv";
import {
  ON_COMPLETE_DATA,
  ON_ALL_COMPLETE_DATA,
} from "@/adventure/quests/questCompletionSideEffectsData";

const QUEST_PROGRESS_KEY = "quest-progress.v2";
const ADVENTURE_LOG_KEY = "adventure-log.v2";
const PARAGON_KEY = "paragon.v1";

const REWARD_SAVES_KEYS = [
  "character.v2",
  "inventory.v2",
  STORY_FLAGS_STORAGE_KEY,
  ADVENTURE_LOG_KEY,
  QUEST_PROGRESS_KEY,
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
): Promise<QuestRewardSavesSnapshot & { [PARAGON_KEY]?: unknown }> {
  const allKeys = [...REWARD_SAVES_KEYS, PARAGON_KEY];
  const rows = await tx
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.userId, userId),
        inArray(savesKv.key, allKeys as unknown as string[]),
      ),
    )
    .for("update");
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return out as QuestRewardSavesSnapshot & { [PARAGON_KEY]?: unknown };
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

// 메인 보상 적용 — 클라 applyQuestReward 와 동일한 math. character/inventory 객체를
// 변경된 사본으로 반환 + 토큰 배열 기록. 사이드이펙트(titles, flags) 는 별도 함수.
function applyMainReward(
  reward: QuestReward,
  charPrev: Record<string, unknown>,
  invPrev: Record<string, unknown>,
  ctx: {
    playerLevel: number;
    guildBuffs: GuildBuffSlot[];
    paragonRewardMult: number;
  },
): {
  charNext: Record<string, unknown>;
  invNext: Record<string, unknown>;
  tokens: string[];
} {
  const tokens: string[] = [];
  let charChanged = false;
  let invChanged = false;
  const char: Record<string, unknown> = { ...charPrev };
  const inv: Record<string, unknown> = { ...invPrev };

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

  // EXP — 신참 ×2 + 길드 ×expMult + 전역 ×XP_RATE_MULT + 파라곤 풍요 ×.
  // 만렙 도달 시 잉여는 파라곤 EXP 로 적립되어야 하나 클라 useCharacterState 가 처리.
  // 서버는 단순히 character.exp += boosted 로 누적; 클라 readInitial/applyExpGain 이
  // saves replace 후 다음 tick 에서 정리한다.
  const baseExp = reward.exp ?? 0;
  if (baseExp > 0) {
    const expBonus = applyNewbieBonus(baseExp, ctx.playerLevel);
    const boosted = Math.floor(
      expBonus.gained * expMult * XP_RATE_MULT * ctx.paragonRewardMult,
    );
    if (boosted > 0) {
      const curExp = typeof char.exp === "number" ? char.exp : 0;
      char.exp = curExp + boosted;
      charChanged = true;
      const atMax = ctx.playerLevel >= MAX_LEVEL;
      tokens.push(
        atMax
          ? `EXP +${boosted} (파라곤)`
          : `EXP +${boosted}${expBonus.bonusApplied ? " (신참 ×2)" : ""}`,
      );
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

  // 제작서 — 이미 알고 있는 건 추가 안 함. 인벤의 knownRecipes 배열 가정.
  if (reward.recipes && reward.recipes.length > 0) {
    const cur = Array.isArray(inv.knownRecipes)
      ? (inv.knownRecipes as string[])
      : [];
    const set = new Set(cur);
    const next = [...cur];
    for (const id of reward.recipes) {
      tokens.push(recipeName(id));
      if (set.has(id)) continue;
      set.add(id);
      next.push(id);
      invChanged = true;
    }
    if (next.length !== cur.length) inv.knownRecipes = next;
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
    tokens,
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
  const paragon = readInitialParagon(saves[PARAGON_KEY]);
  const paragonBonus = computeParagonBonus(paragon.allocations);
  const paragonRewardMult = 1 + (paragonBonus.pctGoldExp ?? 0) / 100;
  const playerLevel =
    typeof charPrev.level === "number" ? charPrev.level : 1;
  const guildBuffs = await readGuildBuffs(tx, userId);

  // 1) 메인 보상.
  const main = applyMainReward(quest.reward, charPrev, invPrev, {
    playerLevel,
    guildBuffs,
    paragonRewardMult,
  });

  // 2) 퀘스트 상태 전환 (먼저 적용해야 ON_ALL_COMPLETE 가 본인 completed 를 본다).
  const progressNext = transitionQuestState(progressPrev, quest);

  // 3) 사이드이펙트 (칭호/플래그).
  const side = applySideEffects(quest.id, progressNext, logPrev, flagsPrev);

  // 4) 저장.
  const charChanged = main.charNext !== charPrev;
  const invChanged = main.invNext !== invPrev;
  const flagsChanged = side.flagsNext !== flagsPrev;
  const logChanged = side.logNext !== logPrev;
  const progressChanged = progressNext !== progressPrev;

  if (charChanged)
    await upsertSave(tx, userId, "character.v2", main.charNext);
  if (invChanged)
    await upsertSave(tx, userId, "inventory.v2", main.invNext);
  if (flagsChanged)
    await upsertSave(tx, userId, STORY_FLAGS_STORAGE_KEY, side.flagsNext);
  if (logChanged)
    await upsertSave(tx, userId, ADVENTURE_LOG_KEY, side.logNext);
  if (progressChanged)
    await upsertSave(tx, userId, QUEST_PROGRESS_KEY, progressNext);

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
    },
  };
}

