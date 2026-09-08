import type { V2StatKey } from "./v2StatKeys";

// 수행과 숙련 성장에서 공통으로 사용하는 직군별 성향.
export const V2_CULTIVATE_PROFILE: Record<
  string,
  Partial<Record<V2StatKey, number>>
> = {
  warrior: { str: 2, vit: 1, dex: 1 }, // 전사 — 광검(str)·철벽(vit)·혈풍(dex)
  martial: { vit: 2, str: 1, spi: 1 }, // 무도가 — 맷집(vit)·흡혈/기공
  mage: { int: 2, spi: 2 }, // 마법사 — 공격마법(int)·신성(spi)
  rogue: { dex: 2, luk: 2 }, // 도적 — 궁수(dex)·암살(luk)
  survivor: { vit: 2, spi: 1, str: 1 }, // 생존자 — 최대 HP·회복·버티기
  mutant: { vit: 2, str: 1, int: 1 }, // 변이자 — 신체 적응과 물리·마법 변이 기반
  // 모험가(none) — 전직 전에도 균형 수행 가능(STR/VIT/DEX/INT 각 1, SPI/LUK 제외). cap 은 전역이라
  //   전직 후에도 유지. 전직은 별개(advance-class)·none 은 직군 정복/도감엔 미포함(cumLevel 미적립).
  none: { str: 1, vit: 1, dex: 1, int: 1 },
};
