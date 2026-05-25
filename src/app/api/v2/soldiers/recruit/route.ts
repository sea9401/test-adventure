import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { ensureSoloGuild } from "@/lib/server/v2EnsureSoloGuild";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import {
  SOLDIER_COST_STONE,
  SOLDIER_MAX_TOTAL,
} from "@/adventure/data/v2/soldiers";

// POST /api/v2/soldiers/recruit — 길드 공용 자원 stone 으로 병사 모집.
//
// body: { count: number } — 모집할 병사 수 (1~상한 N)
// 비용: count × SOLDIER_COST_STONE
// 자원 부족 / 누적 한도 → 409.
//
// 라이브 PR-vi-b 부터 길드 자원 풀로 통일. 호출자의 길드 자원에서 차감.
// 다인 길드면 길드원 누구나 모집 호출 가능 (공동 자원).

const MAX_PER_REQUEST = 1000;

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { count?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (
    typeof body.count !== "number" ||
    !Number.isFinite(body.count) ||
    !Number.isInteger(body.count) ||
    body.count <= 0 ||
    body.count > MAX_PER_REQUEST
  ) {
    return Response.json(
      { ok: false, error: "bad_count", max: MAX_PER_REQUEST },
      { status: 400 },
    );
  }
  const count = body.count;
  const cost = count * SOLDIER_COST_STONE;

  const result = await db.transaction(async (tx) => {
    const guildId = await ensureSoloGuild(tx, userId);
    const resources = await lockGuildResources(tx, guildId);
    if (resources.stone < cost) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "not_enough_stone" as const,
          have: resources.stone,
          need: cost,
        },
      };
    }
    if (resources.soldiers + count > SOLDIER_MAX_TOTAL) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "soldier_cap" as const,
          have: resources.soldiers,
          max: SOLDIER_MAX_TOTAL,
        },
      };
    }
    const next = {
      stone: resources.stone - cost,
      soldiers: resources.soldiers + count,
    };
    await upsertGuildResources(tx, guildId, next);
    return {
      status: 200,
      body: { ok: true as const, recruited: count, cost, resources: next },
    };
  });

  return Response.json(result.body, { status: result.status });
}
