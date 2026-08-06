import { requireCronAuth } from "@/lib/server/cronAuth";
import { retireLottery } from "@/lib/server/lotteryService";
import { refundRetiredArenaTournamentBets } from "@/lib/server/pvp/arenaTournamentService";

// 기능 종료 뒤 남은 미추첨 결제액을 환불한다. 회차 row 잠금과 refunded 상태
// 전환으로 중복 호출되어도 한 번만 지급한다. 기존 운영 크론 경로는 환불 완료까지 유지한다.
export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;
  const now = new Date();
  const [lottery, arena] = await Promise.all([
    retireLottery(now),
    refundRetiredArenaTournamentBets(now),
  ]);
  return Response.json({ ok: true, lottery, arena });
}
