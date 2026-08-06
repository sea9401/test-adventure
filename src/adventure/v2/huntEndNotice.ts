import { AUTO_HUNT_LEVEL_TARGET } from "@/adventure/v2/autoHuntStopPolicy";

export type HuntEndReason =
  | "stamina"
  | "death"
  | "defeat"
  | "recovery"
  | "error"
  | "potion"
  | "rare_map"
  | "rare_map_exhausted"
  | "level_100"
  | "request_failed";

export function huntEndReasonText(
  reason: HuntEndReason,
  potionThreshold: number,
): string {
  switch (reason) {
    case "stamina":
      return "스태미너가 부족합니다.";
    case "death":
      return "캐릭터가 쓰러졌습니다.";
    case "defeat":
      return "전투에서 패배했습니다.";
    case "recovery":
      return "체력이 부족해 회복이 필요합니다.";
    case "potion":
      return `HP/MP 충전약 중 하나가 ${potionThreshold.toLocaleString()} 이하입니다.`;
    case "rare_map":
      return "희귀 탐사맵을 발견했습니다.";
    case "rare_map_exhausted":
      return "희귀 탐사의 남은 전투 횟수를 모두 사용했습니다.";
    case "level_100":
      return `레벨 ${AUTO_HUNT_LEVEL_TARGET}에 도달했습니다.`;
    case "error":
    case "request_failed":
      return "전투 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
}
