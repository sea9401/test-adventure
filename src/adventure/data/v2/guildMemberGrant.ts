// 길드원 전원에게 즉시 지급하는 보상(교역소 길드원 상품·탐사 원정 귀환 보상).
export type GuildMemberGrantOutput =
  | { kind: "material"; materialId: string; count: number }
  | { kind: "stamina_potion"; count: number }
  | { kind: "mastery_certificate"; itemKey: string; count: number };
