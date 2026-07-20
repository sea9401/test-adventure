import { ensureUser } from "@/lib/server/ensureUser";
import { readSave } from "@/lib/server/savesKv";
import { db } from "@/db";
import { parseRareMaps } from "@/adventure/data/v2/rareMaps";
import { parseMuseunCashItems } from "@/adventure/data/v2/museunCashItems";

// GET /api/v2/me/rare-maps — 보유 레어맵/테스트용 utility 목록.
// 사냥터 목록 "열린 레어맵" 섹션 + 인벤토리 테스트 소모품 탭이 읽는 스냅샷
// (만료/완료 purge 는 파싱 단계 lazy — 영속 정리는 hunt 가 기록할 때).

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const save = await readSave<
    { rareMaps?: unknown; cashItems?: unknown } | null
  >(
    db,
    userId,
    "character.v2",
    null,
  );
  return Response.json({
    ok: true,
    rareMaps: parseRareMaps(save?.rareMaps, Date.now()),
    cashItems: parseMuseunCashItems(save?.cashItems),
  });
}
