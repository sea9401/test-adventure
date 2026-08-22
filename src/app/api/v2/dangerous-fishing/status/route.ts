import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readDangerousFishingView } from "@/lib/server/dangerousFishingService";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return Response.json(
    await db.transaction((tx) =>
      readDangerousFishingView(tx, userId, Date.now()),
    ),
  );
}
