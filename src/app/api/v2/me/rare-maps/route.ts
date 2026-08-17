import { ensureUser } from "@/lib/server/ensureUser";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { db } from "@/db";
import { parseRareMaps } from "@/adventure/data/v2/rareMaps";
import { parseMuseunCashItems } from "@/adventure/data/v2/museunCashItems";
import { parseMuseunCosmetics } from "@/adventure/data/v2/museunCosmetics";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

// GET /api/v2/me/rare-maps — 보유 레어맵/테스트용 utility 목록.
// 사냥터 목록 "열린 레어맵" 섹션 + 인벤토리 테스트 소모품 탭이 읽는 스냅샷
// (만료/완료 purge 는 파싱 단계 lazy — 영속 정리는 hunt 가 기록할 때).

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const save = await readSave<
    { rareMaps?: unknown; cashItems?: unknown; museunCosmetics?: unknown } | null
  >(
    db,
    userId,
    "character.v2",
    null,
  );
  const now = Date.now();
  return Response.json({
    ok: true,
    serverNow: now,
    rareMaps: parseRareMaps(save?.rareMaps, now),
    cashItems: parseMuseunCashItems(save?.cashItems),
    cosmetics: parseMuseunCosmetics(save?.museunCosmetics),
  });
}

type CharSave = {
  rareMaps?: unknown;
  [key: string]: unknown;
};

// DELETE /api/v2/me/rare-maps — 보유 희귀 지도 한 장을 복구 없이 폐기한다.
// body: { iid }. character.v2 row lock 안에서 소유권을 다시 확인해 사용/판매와의 경합을 막는다.
export async function DELETE(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:me:rare-map:discard",
    userLimit: 60,
    ipLimit: 360,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    iid?: unknown;
  } | null;
  const iid = typeof body?.iid === "string" ? body.iid.trim() : "";
  if (!iid) {
    return Response.json({ ok: false, error: "invalid_iid" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const charSave = await lockSaveForUpdate<CharSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const maps = parseRareMaps(charSave.rareMaps, Date.now());
      if (!maps.some((map) => map.iid === iid)) {
        return {
          status: 404,
          body: { ok: false as const, error: "not_owned" as const },
        };
      }

      const rareMaps = maps.filter((map) => map.iid !== iid);
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        rareMaps,
      });
      return {
        status: 200,
        body: { ok: true as const, rareMaps },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch {
    return Response.json(
      { ok: false, error: "server_error" },
      { status: 500 },
    );
  }
}
