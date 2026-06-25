import { ensureUser } from "@/lib/server/ensureUser";
import { V2_TILE_PRODUCTION } from "@/adventure/data/v2/settlementWarfareConfig";
import { isTileOutpostId } from "@/adventure/data/v2/tileWarfare";
import { tileDonate } from "@/lib/server/tileVillageRoutes";

// POST /api/v2/outpost/village/donate — body { outpostId, donations: { v2_timber?, v2_iron_ore? } }
// 개인 인벤의 통나무/철광석을 정착지 재화 풀(crop/ore)에 기부한다. 길드원 전원 가능(관리권 불요).
//   라이브 = 타일 정착지 경로(tileDonate). 카탈로그 거점(옛 경로)은 미지원.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { outpostId?: unknown; donations?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const outpostId = typeof body.outpostId === "string" ? body.outpostId : "";
  if (!outpostId) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const donations =
    body.donations && typeof body.donations === "object"
      ? (body.donations as Record<string, number>)
      : {};

  if (V2_TILE_PRODUCTION && isTileOutpostId(outpostId)) {
    return tileDonate(userId, outpostId, donations);
  }
  return Response.json({ ok: false, error: "unsupported" }, { status: 400 });
}
