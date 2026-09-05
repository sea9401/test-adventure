import { handleHunt } from "@/app/api/v2/dungeon/hunt/huntRequest";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  enforceUserAndIpRateLimit,
} from "@/lib/server/userRateLimit";
export { runOneHunt, type RunOneHuntCtx } from "@/app/api/v2/dungeon/hunt/huntExecution";

// HTTP 경계: 인증·요청 제한·동시 요청 차단만 담당한다.
// 요청 검증과 단판/일괄 트랜잭션은 huntRequest, 한 판의 처리는 huntExecution에 둔다.

// 단일 무한 프론티어 — 깊이(depth) 1→∞. 조기 검증은 정수·≥1 만, 실제 게이트(최고도달+1)는
// character.v2 lock 후. 드랍 풀은 깊이를 DungeonFloorId(1~8)로 클램프해 조회(8 이상=8 풀).
// 온라인 자동 사냥은 1.5초 간격(분당 약 40회)으로 요청한다. 네트워크 지연 뒤 재시도나
// 수동 입력이 섞여도 정상 루프가 끊기지 않도록 전투 API 운영 권장 범위의 상한을 사용한다.
// IP 제한은 이동통신사 CGNAT·PC방처럼 다수가 한 공인 IP를 공유하는 환경을 고려해
// 사용자 제한의 30배로 두되, 계정별 제한과 아래 in-flight 게이트는 그대로 적용한다.
const HUNT_USER_RATE_LIMIT_PER_MINUTE = 180;

const HUNT_IP_RATE_LIMIT_PER_MINUTE =
  HUNT_USER_RATE_LIMIT_PER_MINUTE * 30;


// 같은 사용자의 사냥 요청이 이미 처리 중이면 DB 트랜잭션에 진입시키지 않는다. character.v2
// FOR UPDATE도 보상 중복은 막지만, 순간적인 병렬 요청은 커넥션/트랜잭션 대기열을 만들 수 있어
// 단일 프로세스인 현재 운영 환경에서는 이 가벼운 선행 게이트로 먼저 잘라낸다. 다중 인스턴스로
// 확장할 때는 같은 인터페이스를 Redis 기반 분산 잠금으로 교체해야 한다.
const huntInFlightUsers = new Set<string>();


function huntInFlightResponse() {
  return Response.json(
    { ok: false, error: "request_in_flight", retryAfterSec: 1 },
    { status: 429, headers: { "Retry-After": "1" } },
  );
}


// 통합 테스트 격리용. 실제 요청에서는 POST의 finally가 항상 해제한다.
export function resetHuntInFlightForTests() {
  huntInFlightUsers.clear();
}

export async function POST(req: Request) {
  const maybeUserId = await ensureUser();
  if (!maybeUserId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  // 명시적 string — runOneHunt(중첩 클로저)에서 narrowing 이 풀리지 않게.
  const userId: string = maybeUserId;
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:dungeon:hunt",
    userLimit: HUNT_USER_RATE_LIMIT_PER_MINUTE,
    ipLimit: HUNT_IP_RATE_LIMIT_PER_MINUTE,
    windowMs: 60_000,
  });
  if (limited) return limited;

  if (huntInFlightUsers.has(userId)) return huntInFlightResponse();
  huntInFlightUsers.add(userId);
  try {
    return await handleHunt(req, userId);
  } finally {
    huntInFlightUsers.delete(userId);
  }
}
