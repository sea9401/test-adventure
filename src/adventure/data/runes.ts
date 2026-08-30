// 과거 inventory.v2 세이브에 남을 수 있는 룬 키와 등급.
// 현재 런타임에는 룬 카탈로그, 장착, 합성, 효과 적용 동작이 없다.

export type RuneGrade = 1 | 2 | 3 | 4 | 5 | 6;

export type RuneId =
  | "rune_attack"
  | "rune_guard"
  | "rune_life"
  | "rune_crit"
  | "rune_training"
  | "rune_fortune"
  | "rune_alchemy"
  | "rune_counter"
  | "rune_lifesteal"
  | "rune_regen";
