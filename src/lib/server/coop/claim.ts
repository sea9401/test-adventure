import "server-only";

// 협동 토벌 보스 — claim 액션 처리.
//
// 모든 적용을 단일 트랜잭션 안에서 처리 (audit #9 — claim race full fix):
//   1. coop_boss_contributors row FOR UPDATE 잠금.
//   2. 이미 claim 된 경우 → 저장된 claimedRewardSnapshot + 최신 saves_kv 반환.
//      클라가 이미 적용 후 retry 한 경우 saves 가 일치해 no-op replace, 응답 손실 후
//      적용 못 한 경우라도 saves replace 로 보상이 살아남는다.
//   3. 새 claim: deterministic seed RNG → 보상 결정 → saves_kv 3 키
//      (inventory.v2 / crafting.v2 / adventure-log.v2) 직접 mutate → snapshot + mark.
//   4. 응답: { tier, ratio, applied, reward, saves }.

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { coopBossContributors, coopBossSessions, savesKv } from "@/db/schema";
import { COOP_BOSSES, coopTierForRatio } from "@/adventure/coop/data";
import {
  computeCoopReward,
  coopRewardSeed,
  resolveCoopReward,
  type ResolvedCoopReward,
} from "@/adventure/coop/rewards";
import type { RegionId } from "@/adventure/data/world";
import { upsertSave, type DbExecutor } from "@/lib/server/savesKv";

const REWARD_SAVES_KEYS = [
  "inventory.v2",
  "crafting.v2",
  "adventure-log.v2",
] as const;

type SavesSnapshot = Partial<
  Record<(typeof REWARD_SAVES_KEYS)[number], unknown>
>;

async function readSavesForUpdate(
  tx: DbExecutor,
  userId: string,
): Promise<SavesSnapshot> {
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
  const out: SavesSnapshot = {};
  for (const r of rows) {
    if ((REWARD_SAVES_KEYS as readonly string[]).includes(r.key)) {
      out[r.key as keyof SavesSnapshot] = r.value;
    }
  }
  return out;
}

// reward.materials → inventory.materials[id] += n
function applyMaterials(
  inv: Record<string, unknown>,
  materials: ResolvedCoopReward["materials"],
): Record<string, unknown> {
  const cur = (inv.materials as Record<string, number> | undefined) ?? {};
  const next: Record<string, number> = { ...cur };
  let changed = false;
  for (const [id, n] of Object.entries(materials)) {
    if (!n) continue;
    next[id] = (next[id] ?? 0) + n;
    changed = true;
  }
  return changed ? { ...inv, materials: next } : inv;
}

// reward.equipment → inventory.equipment[id] += 1
function applyEquipment(
  inv: Record<string, unknown>,
  equipment: ResolvedCoopReward["equipment"],
): Record<string, unknown> {
  if (equipment.length === 0) return inv;
  const cur = (inv.equipment as Record<string, number> | undefined) ?? {};
  const next: Record<string, number> = { ...cur };
  for (const id of equipment) next[id] = (next[id] ?? 0) + 1;
  return { ...inv, equipment: next };
}

// reward.equipmentInstances → inventory.equipmentInstances 에 push (별빛 고리 롤 인스턴스).
// instanceId dedup — resolveCoopReward 가 seed 결정적 id 를 주므로 retry 시 중복 지급 안 됨.
function applyEquipmentInstances(
  inv: Record<string, unknown>,
  instances: ResolvedCoopReward["equipmentInstances"],
): Record<string, unknown> {
  if (instances.length === 0) return inv;
  const cur = Array.isArray(inv.equipmentInstances)
    ? (inv.equipmentInstances as { instanceId?: string }[])
    : [];
  const ids = new Set(cur.map((i) => i?.instanceId));
  const add = instances.filter((i) => !ids.has(i.instanceId));
  if (add.length === 0) return inv;
  return { ...inv, equipmentInstances: [...cur, ...add] };
}

// reward.recipes → crafting.known 추가 (미보유만). shareable 도 같이 — learnRecipe
// 정책 그대로 (NPC 보상 결).
function applyRecipes(
  crafting: Record<string, unknown>,
  recipes: ResolvedCoopReward["recipes"],
): Record<string, unknown> {
  if (recipes.length === 0) return crafting;
  const known = Array.isArray(crafting.known)
    ? (crafting.known as string[])
    : [];
  const shareable = Array.isArray(crafting.shareable)
    ? (crafting.shareable as string[])
    : [];
  let changed = false;
  const nextKnown = [...known];
  const nextShareable = [...shareable];
  for (const id of recipes) {
    if (!nextKnown.includes(id)) {
      nextKnown.push(id);
      changed = true;
    }
    if (!nextShareable.includes(id)) {
      nextShareable.push(id);
      changed = true;
    }
  }
  return changed
    ? { ...crafting, known: nextKnown, shareable: nextShareable }
    : crafting;
}

// reward.titleId → adventure-log.titles[id] = { obtainedAt }
function applyTitle(
  log: Record<string, unknown>,
  titleId: string | undefined,
  nowMs: number,
): Record<string, unknown> {
  if (!titleId) return log;
  const titles = (log.titles as Record<string, unknown> | undefined) ?? {};
  if (titles[titleId]) return log;
  return {
    ...log,
    titles: { ...titles, [titleId]: { obtainedAt: nowMs } },
  };
}

export type CoopClaimSuccess = {
  tier: ReturnType<typeof coopTierForRatio>;
  ratio: number;
  /** 이번 호출이 실제로 적용한 경우 true, retry 로 snapshot 반환한 경우 false. */
  applied: boolean;
  reward: ResolvedCoopReward;
  /** 최신 saves_kv — 클라가 replaceFromSaved 로 통째 교체. */
  saves: SavesSnapshot;
};

export async function handleCoopClaim(
  userId: string,
  region: string,
): Promise<Response> {
  const def = COOP_BOSSES[region as RegionId];
  if (!def) return new Response("region has no coop boss", { status: 400 });

  // 가장 최근 처치된 세션 (tx 외부 — 권한·tier 결정용).
  const recent = await db
    .select()
    .from(coopBossSessions)
    .where(eq(coopBossSessions.regionId, region))
    .orderBy(sql`${coopBossSessions.spawnedAt} DESC`)
    .limit(1);
  const session = recent[0];
  if (!session || !session.defeatedAt) {
    return new Response("no defeated boss", { status: 404 });
  }

  const myRows = await db
    .select()
    .from(coopBossContributors)
    .where(
      and(
        eq(coopBossContributors.sessionId, session.id),
        eq(coopBossContributors.userId, userId),
      ),
    )
    .limit(1);
  const my = myRows[0];
  if (!my) return new Response("no contribution", { status: 403 });

  const ratio = my.damage / Math.max(1, session.maxHp);
  const tier = coopTierForRatio(ratio);
  if (!tier) return new Response("below bronze threshold", { status: 403 });

  return db.transaction(async (tx) => {
    // contributor row 잠금 — 동시 두 건 중 한 건만 새 mutation.
    const lockedRows = await tx
      .select()
      .from(coopBossContributors)
      .where(
        and(
          eq(coopBossContributors.sessionId, session.id),
          eq(coopBossContributors.userId, userId),
        ),
      )
      .for("update");
    const locked = lockedRows[0];
    if (!locked) return new Response("no contribution", { status: 403 });

    // 이미 claim 됨 → snapshot + 최신 saves 그대로 (retry idempotent).
    if (locked.claimedAt && locked.claimedRewardSnapshot) {
      const saves = await readSavesForUpdate(tx, userId);
      const success: CoopClaimSuccess = {
        tier:
          (locked.claimedTier as ReturnType<typeof coopTierForRatio>) ?? tier,
        ratio,
        applied: false,
        reward: locked.claimedRewardSnapshot as ResolvedCoopReward,
        saves,
      };
      return Response.json(success);
    }

    // 새 claim. RNG resolve.
    const baseReward = computeCoopReward(session.bossName, tier);
    const resolved = resolveCoopReward(
      baseReward,
      coopRewardSeed(session.id, userId),
    );

    // saves_kv 3 키 잠금 후 적용.
    const saves = await readSavesForUpdate(tx, userId);
    const nowMs = Date.now();
    const invPrev =
      (saves["inventory.v2"] as Record<string, unknown> | undefined) ?? {};
    let invNext = applyMaterials(invPrev, resolved.materials);
    invNext = applyEquipment(invNext, resolved.equipment);
    invNext = applyEquipmentInstances(invNext, resolved.equipmentInstances);
    const craftingNext = applyRecipes(
      (saves["crafting.v2"] as Record<string, unknown> | undefined) ?? {},
      resolved.recipes,
    );
    const logNext = applyTitle(
      (saves["adventure-log.v2"] as Record<string, unknown> | undefined) ?? {},
      resolved.titleId,
      nowMs,
    );

    if (invNext !== invPrev) {
      await upsertSave(tx, userId, "inventory.v2", invNext);
    }
    if (craftingNext !== (saves["crafting.v2"] ?? {})) {
      await upsertSave(tx, userId, "crafting.v2", craftingNext);
    }
    if (logNext !== (saves["adventure-log.v2"] ?? {})) {
      await upsertSave(tx, userId, "adventure-log.v2", logNext);
    }

    // contributor mark + snapshot.
    await tx
      .update(coopBossContributors)
      .set({
        claimedAt: new Date(nowMs),
        claimedTier: tier,
        claimedRewardSnapshot: resolved,
      })
      .where(
        and(
          eq(coopBossContributors.sessionId, session.id),
          eq(coopBossContributors.userId, userId),
          isNull(coopBossContributors.claimedAt),
        ),
      );

    const success: CoopClaimSuccess = {
      tier,
      ratio,
      applied: true,
      reward: resolved,
      saves: {
        "inventory.v2": invNext,
        "crafting.v2": craftingNext,
        "adventure-log.v2": logNext,
      },
    };
    return Response.json(success);
  });
}
