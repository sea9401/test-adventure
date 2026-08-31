import { requireCronAuth } from "@/lib/server/cronAuth";
import { collectOpsDailyReport } from "@/lib/server/opsDailyReport";
import { sendOpsAlert } from "@/lib/server/opsAlert";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const since = new Date(Date.now() - DAY_MS);
  const report = await collectOpsDailyReport(since);

  await sendOpsAlert("[ops] daily report", report);

  return Response.json({ ok: true, report });
}
