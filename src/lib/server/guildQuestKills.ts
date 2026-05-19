import "server-only";

// 길드 의뢰의 kill 계열 task 진행을 일괄 가산. 한 트랜잭션 안에서 호출.
//   - active 의뢰 잠금 + 매칭(task.monsterName 일치, kind 일치)
//   - progress += min(delta, target-progress)
//   - target 도달 시 status=completed + guild fame 가산 + 멤버 인박스 보상 multi-row insert
//
// 호출처:
//   - `/api/guilds/quests/progress` — 라이브 솔로 전투 onBattleEnd 가 1킬 단위로 보고 (chunk B 이후 사라질 예정)
//   - `applyResultToSaves` (autoHunt) — 위탁 사냥 sim 의 killsByName 을 한 번에 보고
//
// 진행이 일어난 의뢰 인스턴스 + 신규 완료한 의뢰 + 가산된 길드 fame 합계를 돌려준다.

import { and, eq, sql } from "drizzle-orm";
import {
  guildMembers,
  guildQuestInstances,
  guilds,
  marketplaceInbox,
} from "@/db/schema";
import {
  getGuildQuestById,
  type GuildQuestDef,
} from "@/adventure/data/guildQuests";
import { inboxValues } from "@/lib/server/inboxPayload";
import type { DbExecutor } from "@/lib/server/savesKv";

/** 멤버가 한 번에 보고하는 kill 묶음. count 는 모두 양의 정수 가정 (호출자가 검증). */
export type GuildQuestKill = {
  kind: "kill_monster" | "kill_boss";
  name: string;
  count: number;
};

export type GuildQuestKillsOutcome = {
  /** 진행이 일어난 의뢰 수. */
  matchedQuests: number;
  /** 이번 호출에서 신규로 완료된 의뢰 수. */
  completedQuests: number;
  /** 가산된 길드 fame 누계 (완료된 의뢰 reward.fame 합). */
  fameAdded: number;
};

export async function applyGuildQuestKills(
  tx: DbExecutor,
  userId: string,
  kills: readonly GuildQuestKill[],
): Promise<GuildQuestKillsOutcome> {
  const empty: GuildQuestKillsOutcome = {
    matchedQuests: 0,
    completedQuests: 0,
    fameAdded: 0,
  };
  if (kills.length === 0) return empty;

  const myRows = await tx
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (myRows.length === 0) return empty;
  const guildId = myRows[0].guildId;

  // 활성 의뢰 전체 잠금. 멤버 한 명이 한 사이클 안에 여러 의뢰를 동시에 진행할 수 있으므로
  // 전체 활성 의뢰를 한 번만 읽고 메모리에서 매칭.
  const activeRows = await tx
    .select()
    .from(guildQuestInstances)
    .where(
      and(
        eq(guildQuestInstances.guildId, guildId),
        eq(guildQuestInstances.status, "active"),
      ),
    )
    .for("update");
  if (activeRows.length === 0) return empty;

  let matchedQuests = 0;
  let completedQuests = 0;
  let totalFameAdded = 0;
  // 완료된 의뢰 — 멤버 인박스 보상은 마지막에 한 번에 multi-row insert.
  const completedDefs: GuildQuestDef[] = [];

  for (const inst of activeRows) {
    const def = getGuildQuestById(inst.questDefId);
    if (!def) continue;
    const t = def.task;
    if (t.kind !== "kill_monster" && t.kind !== "kill_boss") continue;

    // 멤버가 보고한 kill 중 task 와 같은 kind + 같은 이름 만 매칭 후 합산.
    let delta = 0;
    for (const k of kills) {
      if (k.kind !== t.kind) continue;
      if (k.name !== t.monsterName) continue;
      delta += k.count;
    }
    if (delta <= 0) continue;

    const before = inst.progress;
    const target = inst.target;
    const next = Math.min(before + delta, target);
    if (next === before) continue; // 이미 cap (불가능에 가깝지만 방어).
    const reachedTarget = next >= target;
    const now = new Date();

    await tx
      .update(guildQuestInstances)
      .set({
        progress: next,
        status: reachedTarget ? "completed" : "active",
        completedAt: reachedTarget ? now : null,
      })
      .where(eq(guildQuestInstances.id, inst.id));

    matchedQuests += 1;
    if (reachedTarget) {
      completedQuests += 1;
      totalFameAdded += def.reward.fame;
      completedDefs.push(def);
    }
  }

  if (completedDefs.length > 0) {
    // 1) 길드 fame 가산 — 완료된 의뢰들의 reward.fame 합산.
    await tx
      .update(guilds)
      .set({
        fameTotal: sql`${guilds.fameTotal} + ${totalFameAdded}`,
        fameAvailable: sql`${guilds.fameAvailable} + ${totalFameAdded}`,
      })
      .where(eq(guilds.id, guildId));

    // 2) 멤버 인박스 — 의뢰별 reward 를 모든 멤버에게. 길드원 N 명·완료 M 건이면 N×M 행.
    const memberRows = await tx
      .select({ userId: guildMembers.userId })
      .from(guildMembers)
      .where(eq(guildMembers.guildId, guildId));
    if (memberRows.length > 0) {
      const inboxRows = completedDefs.flatMap((def) =>
        memberRows.map((m) =>
          inboxValues({
            userId: m.userId,
            payload: {
              kind: "guild_quest_reward" as const,
              quest_id: def.id,
              quest_name: def.name,
              gold: def.reward.goldPerMember,
              materials: def.reward.materialsPerMember ?? [],
              items: def.reward.itemsPerMember ?? [],
            },
            message: `${def.name} 완료 보상`,
          }),
        ),
      );
      await tx.insert(marketplaceInbox).values(inboxRows);
    }
  }

  return {
    matchedQuests,
    completedQuests,
    fameAdded: totalFameAdded,
  };
}
