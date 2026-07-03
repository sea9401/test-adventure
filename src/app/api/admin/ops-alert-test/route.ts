import { logAdminAction } from "@/lib/server/adminAudit";
import { currentAdminEmail, requireAdmin } from "@/lib/server/isAdmin";
import { sendOpsAlert } from "@/lib/server/opsAlert";

export async function POST() {
  const gate = await requireAdmin();
  if (gate) return gate;

  if (!process.env.OPS_ALERT_WEBHOOK_URL) {
    return Response.json(
      { ok: false, error: "webhook_not_configured" },
      { status: 400 },
    );
  }

  const adminEmail = await currentAdminEmail();
  await sendOpsAlert("[ops] webhook test", {
    adminEmail,
    at: new Date().toISOString(),
  });
  await logAdminAction({
    adminEmail,
    action: "ops-alert.test",
  });

  return Response.json({ ok: true });
}
