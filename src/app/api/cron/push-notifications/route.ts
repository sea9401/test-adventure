import { requireCronAuth } from "@/lib/server/cronAuth";
import { sendDueTimedPushNotifications } from "@/lib/server/timedPushNotifications";

// 매분 완료 시각을 지난 농장·자동 벌목·자동 채광 작업을 찾아 한 번만 푸시한다.
export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  const result = await sendDueTimedPushNotifications();
  return Response.json({ ok: true, ...result });
}
