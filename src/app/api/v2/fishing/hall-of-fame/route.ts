import { ensureUser } from "@/lib/server/ensureUser";
import { getAllTimeFishingRecords } from "@/lib/server/fishing/records";

// GET /api/v2/fishing/hall-of-fame — 역대 최대어 명예의 전당.
//   전 시즌 통틀어 종별 최대어 top-N + 내 기록. 주간 리더보드와 달리 시즌 리셋과 무관.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const byFish = await getAllTimeFishingRecords(userId, 10);
  return Response.json({ ok: true, byFish });
}
