import { webPushPublicKey } from "@/lib/server/webPush";

// VAPID 키는 빌드 환경이 아니라 EC2 런타임 SSM 환경에서 읽는다.
export const dynamic = "force-dynamic";

export async function GET() {
  const publicKey = webPushPublicKey();
  return Response.json(
    publicKey
      ? { ok: true, enabled: true, publicKey }
      : { ok: true, enabled: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
