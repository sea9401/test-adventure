import { parseAdminChatMessagesQuery } from "@/lib/admin-chat-monitor";
import { logAdminAction } from "@/lib/server/adminAudit";
import { readAdminChatMessages } from "@/lib/server/adminChatMonitor";
import {
  currentAdminEmail,
  requireAdminRole,
} from "@/lib/server/isAdmin";

export async function GET(req: Request) {
  const gate = await requireAdminRole("super");
  if (gate) return gate;

  const parsed = parseAdminChatMessagesQuery(new URL(req.url).searchParams);
  if (!parsed.ok) return new Response(parsed.error, { status: 400 });

  const result = await readAdminChatMessages(parsed.value);
  if (!result) return new Response("not found", { status: 404 });

  await logAdminAction({
    adminEmail: await currentAdminEmail(),
    action: "chat_monitor.read",
    detail: {
      kind: parsed.value.kind,
      scopeId: parsed.value.scopeId,
      beforeId: parsed.value.beforeId,
      messageCount: result.messages.length,
    },
  });
  return Response.json(result);
}
