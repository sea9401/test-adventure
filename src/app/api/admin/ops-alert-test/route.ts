import { logAdminAction } from "@/lib/server/adminAudit";
import { currentAdminEmail, requireAdmin } from "@/lib/server/isAdmin";
import { sendOpsAlert } from "@/lib/server/opsAlert";

type AlertChannel = "default" | "reward" | "abuse" | "economy" | "deploy";

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const body = (await req.json().catch(() => null)) as { channel?: unknown } | null;
  const channel = parseChannel(body?.channel);
  const envName = channelEnvName(channel);
  if (!process.env[envName] && !process.env.OPS_ALERT_WEBHOOK_URL) {
    return Response.json(
      { ok: false, error: "webhook_not_configured", channel, envName },
      { status: 400 },
    );
  }

  const adminEmail = await currentAdminEmail();
  await sendOpsAlert(`[ops] webhook test · ${channel}`, {
    adminEmail,
    channel,
    at: new Date().toISOString(),
  });
  await logAdminAction({
    adminEmail,
    action: "ops-alert.test",
    detail: { channel, envName },
  });

  return Response.json({ ok: true, channel, envName });
}

function parseChannel(raw: unknown): AlertChannel {
  return raw === "reward" || raw === "abuse" || raw === "economy" || raw === "deploy"
    ? raw
    : "default";
}

function channelEnvName(channel: AlertChannel) {
  if (channel === "reward") return "OPS_ALERT_REWARD_WEBHOOK_URL";
  if (channel === "abuse") return "OPS_ALERT_ABUSE_WEBHOOK_URL";
  if (channel === "economy") return "OPS_ALERT_ECONOMY_WEBHOOK_URL";
  if (channel === "deploy") return "OPS_ALERT_DEPLOY_WEBHOOK_URL";
  return "OPS_ALERT_WEBHOOK_URL";
}
