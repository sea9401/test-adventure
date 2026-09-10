import { readChromeStatus } from "@/lib/server/chromeStatus";
import { ensureUser } from "@/lib/server/ensureUser";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const status = await readChromeStatus(userId);
  return Response.json(
    { ok: true, ...status },
    { headers: { "cache-control": "private, no-store" } },
  );
}
