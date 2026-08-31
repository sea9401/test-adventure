import { parseAdminChatRoomsQuery } from "@/lib/admin-chat-monitor";
import { readAdminChatTargets } from "@/lib/server/adminChatMonitor";
import { requireAdminRole } from "@/lib/server/isAdmin";

export async function GET(req: Request) {
  const gate = await requireAdminRole("super");
  if (gate) return gate;

  const parsed = parseAdminChatRoomsQuery(new URL(req.url).searchParams);
  if (!parsed.ok) return new Response(parsed.error, { status: 400 });

  return Response.json(await readAdminChatTargets(parsed.value));
}
