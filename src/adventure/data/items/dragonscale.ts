import type { EquipItem } from "./types";

export const DRAGONSCALE_ITEMS = {
  // ── 용비늘 라인 장비 (뼈무덤 황야 / 용비늘 묘지 / 뼈비늘 노룡) ─────────────
  // 바람골 역참 남쪽의 막다른 라인. 서양 판타지 톤의 고룡 묘지 — 방어 중심 무구가 떨어진다.
  // 황야 입문 2종(뼈비늘 손방패·황야 행자 갑옷) → 묘지 잡몹산 3종(용골 카이트 방패·비늘 보호갑·
  // 뼈각인 투구) → 뼈비늘 노룡 보스 보상(용비늘 무구 3종 업그레이드 + 뼈왕의 대검 + 용지기의 망토).
  // 별·회랑 라인(Lv70~75)과 같은 tier 5 영역이지만 방어/활력 비중이 훨씬 높다.
  bonescale_buckler: {
    name: "뼈비늘 손방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+8" },
      { label: "활력", value: "+5" },
      { label: "방어력", value: "+2" },
    ],
    bonus: { atk: 8, vit: 5, def: 2 },
    description: "황야의 도굴꾼이 뼛조각과 용비늘 가루로 덧대 짠 작은 손방패. 가볍지만, 보기보다 단단하다.",
    rarity: "uncommon",
    tier: 4,
  } satisfies EquipItem,
  barrow_traveler_armor: {
    name: "황야 행자 갑옷",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+9" },
      { label: "활력", value: "+4" },
    ],
    bonus: { def: 9, vit: 4 },
    description: "뼈무덤 황야를 떠도는 자들이 두르는 두꺼운 가죽 갑옷. 안감에 용비늘 가루를 다져 넣어 모래바람도 막아낸다.",
    rarity: "uncommon",
    tier: 4,
  } satisfies EquipItem,
  // 용비늘 묘지 잡몹산 3종 — Lv75 사냥터 드랍 제작서로 풀린다.
  dragonbone_kite_shield: {
    name: "용골 카이트 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+11" },
      { label: "활력", value: "+9" },
      { label: "방어력", value: "+3" },
    ],
    bonus: { atk: 11, vit: 9, def: 3 },
    description: "묘지에서 거둔 용골을 잘라 두른 길쭉한 카이트 방패. 한 번 들면 어깨가 묵직해지지만, 그만큼 어디로 들이쳐도 받아낸다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  scaleguard_plate: {
    name: "비늘 보호갑",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+11" },
      { label: "활력", value: "+6" },
    ],
    bonus: { def: 11, vit: 6 },
    description: "용비늘 조각을 비늘 모양 그대로 강철 안감에 누벼 댄 갑주. 잿빛 비늘이 어깨부터 허리까지 한 줄로 흐른다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  bonerune_helm: {
    name: "뼈각인 투구",
    slot: "accessory",
    stats: [
      { label: "방어력", value: "+5" },
      { label: "활력", value: "+4" },
    ],
    bonus: { def: 5, vit: 4 },
    description: "용골을 갈아 옛 보호의 결을 새겨 넣은 강철 투구. 머리에 쓰면 옛 룬이 가늘게 떨리며 머리뼈를 감싸 보호한다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  // 뼈비늘 노룡 보스 보상 — 잡몹산 3종 업그레이드(영광 방패·흉갑·투구) + 뼈왕의 대검 + 용지기의 망토.
  // recipe_one_of 로 4종 중 1종 확정 학습, 0.15 로 망토 제작서. 별·회랑 라인 위, 에테르 아래.
  dragonscale_aegis: {
    name: "용비늘 영광 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+13" },
      { label: "활력", value: "+12" },
      { label: "방어력", value: "+5" },
    ],
    bonus: { atk: 13, vit: 12, def: 5 },
    description: "용골 카이트 방패의 골격에 노룡의 비늘을 한 겹 더 얹고 뼈각인 강철로 결을 다시 잡은 방패. 막아내면 옛 룬이 결을 따라 떨린다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  dragonscale_plate: {
    name: "용비늘 흉갑",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+15" },
      { label: "활력", value: "+9" },
    ],
    bonus: { def: 15, vit: 9 },
    description: "비늘 보호갑에 노룡의 가슴 비늘을 가공해 덧댄 흉갑. 한 번 두르면 정면에서 들이치는 어떤 결도 비늘 위로 미끄러져 나간다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  dragonscale_helm: {
    name: "용비늘 투구",
    slot: "accessory",
    stats: [
      { label: "방어력", value: "+8" },
      { label: "활력", value: "+6" },
      { label: "힘", value: "+3" },
    ],
    bonus: { def: 8, vit: 6, str: 3 },
    description: "뼈각인 투구의 위로 노룡의 두골 비늘을 한 겹 더 두른 투구. 쓰면 어깨에 노룡의 무게가 그대로 얹힌다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  boneking_greatsword: {
    name: "뼈왕의 대검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+17" },
      { label: "힘", value: "+9" },
    ],
    bonus: { atk: 17, str: 9 },
    description: "노룡의 등뼈를 통째로 깎아 손잡이를 박은 거대한 양손검. 휘두를 때마다 묘지 깊은 곳에서 노룡이 한 번 더 일어서듯 무겁다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  wyrm_warden_cloak: {
    name: "용지기의 망토",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+10" },
      { label: "활력", value: "+3" },
      { label: "속도", value: "+5" },
    ],
    bonus: { def: 10, vit: 3, spd: 5 },
    description: "노룡의 잿빛 비늘을 가는 가닥으로 풀어 짠 가벼운 망토. 두르면 발이 묘하게 가벼워지면서도 등이 든든하다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
} as const;
