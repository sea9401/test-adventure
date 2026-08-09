import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readMasteryCertificateStatus } from "@/lib/server/masteryCertificateStatus";

// GET /api/v2/me/mastery-certificates — 인벤토리와 숙련의 탑의 공용 증서 사용 모달.
// 탑 상태를 읽거나 롤오버하지 않고 캐릭터·숙련도·인벤토리만 조회한다.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const status = await readMasteryCertificateStatus(db, userId);
  return Response.json({ ok: true, ...status });
}
