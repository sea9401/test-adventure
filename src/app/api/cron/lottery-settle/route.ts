import { requireCronAuth } from "@/lib/server/cronAuth";
import { settleLotteryRounds } from "@/lib/server/lotteryService";

// 4시간마다 정각(한국시간 0·4·8·12·16·20시). 중복 호출돼도 회차 row FOR UPDATE +
// status 검사로 한 번만 지급한다.
export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  const result = await settleLotteryRounds(new Date());
  return Response.json({ ok: true, ...result });
}
