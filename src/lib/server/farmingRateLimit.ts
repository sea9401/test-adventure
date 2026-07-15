import { enforceUserAndIpRateLimit } from "./userRateLimit";

// 농사는 활동 위험도 점수와 사람 확인 대상에서 제외한다. 이 제한은 서비스
// 안정성을 위한 일반적인 요청 폭주 방어이며 이용자 위험도에는 영향을 주지 않는다.
export function enforceFarmingRateLimit(
  req: Request,
  userId: string,
): Response | null {
  return enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:farming:mutation",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
}
