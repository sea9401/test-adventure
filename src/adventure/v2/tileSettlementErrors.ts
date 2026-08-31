export type TileSettlementAction = "found" | "promote" | "demolish";

export type TileSettlementErrorPayload = {
  error?: string;
  requiredGold?: number;
  gold?: number;
};

export function tileSettlementErrorMessage(
  action: TileSettlementAction,
  res: TileSettlementErrorPayload,
): string {
  const label =
    action === "found" ? "개척" : action === "promote" ? "승격" : "철거";
  const req = res.requiredGold ?? 0;
  const have = res.gold ?? 0;
  switch (res.error) {
    case "out_of_guild_gold":
      return `길드 골드 부족 — ${label} 비용 ${req.toLocaleString()} G 필요 (현재 길드 골드 ${have.toLocaleString()} G). 거점 금고를 회수해 길드 자금을 채우세요.`;
    case "out_of_gold":
      return `골드 부족 — ${label} 비용 ${req.toLocaleString()} G 필요.`;
    case "not_guild_admin":
      return "개척마을 건설은 길드 마스터·관리자만 가능합니다.";
    case "need_guild":
      return "개척마을은 길드 전용입니다 — 길드를 만들거나 가입하세요.";
    case "not_at_tile":
      return "개척하려면 먼저 이 칸으로 이동하세요.";
    case "not_adjacent_to_guild_tile":
      return "이미 보유한 거점이 있는 길드는 자기 길드 거점에 인접한 빈 땅에만 개척할 수 있습니다.";
    case "already_settled":
      return "이미 정착지가 있는 칸입니다.";
    case "tile_is_outpost":
      return "거점 칸에는 개척할 수 없습니다.";
    case "invalid_name":
      return "마을 이름이 올바르지 않습니다.";
    case "not_owner":
      return "본인 정착지가 아닙니다.";
    case "not_found":
      return "정착지를 찾을 수 없습니다.";
    case "max_tier":
      return "이미 최고 단계입니다.";
    case "use_production_management":
      return "승격은 거점 관리 화면(생산 시스템)에서 진행하세요.";
    case "network":
      return "네트워크 오류 — 잠시 후 다시 시도하세요.";
    default:
      return `${label}에 실패했습니다 (${res.error ?? "알 수 없는 오류"}).`;
  }
}
