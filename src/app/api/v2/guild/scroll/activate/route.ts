import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import {
  lockGuildResources,
  upsertGuildResources,
  isScrollActive,
  SCROLL_DURATION_MS,
} from "@/lib/server/v2GuildResources";

// POST /api/v2/guild/scroll/activate (PR-6)
//
// 길드 마스터만 — 공용 풀 scrolls 1 소비, 1시간 동안 길드원 모두의 토너먼트/
// 본 병사 전쟁에 atk +SCROLL_ATK_BONUS_PCT% buff.
// 이미 활성 중이면 거부 (재활성 시 갱신 정책은 후속 PR — 일단 단순).
// 본문: 없음.

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await db.transaction(async (tx) => {
    const guildId = await getGuildId(tx, userId);
    if (guildId == null) {
      return {
        status: 400,
        body: { ok: false as const, error: "no_guild" as const },
      };
    }

    // 마스터 권한 확인.
    const memberRow = (
      await tx
        .select({ role: guildMembers.role })
        .from(guildMembers)
        .where(
          and(
            eq(guildMembers.guildId, guildId),
            eq(guildMembers.userId, userId),
          ),
        )
        .limit(1)
    )[0];
    if (!memberRow || memberRow.role !== "master") {
      return {
        status: 403,
        body: { ok: false as const, error: "not_master" as const },
      };
    }

    const resources = await lockGuildResources(tx, guildId);
    const now = Date.now();
    if (isScrollActive(resources.activeScrollExpiresAt, now)) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "already_active" as const,
          expiresAt: resources.activeScrollExpiresAt,
        },
      };
    }
    if (resources.scrolls < 1) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "insufficient_scrolls" as const,
          have: resources.scrolls,
        },
      };
    }
    const expiresAt = now + SCROLL_DURATION_MS;
    await upsertGuildResources(tx, guildId, {
      ...resources,
      scrolls: resources.scrolls - 1,
      activeScrollExpiresAt: expiresAt,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        expiresAt,
        scrolls: resources.scrolls - 1,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
