import type { EquipItem } from "./types";

export const COASTAL_ITEMS = {
  // ── 해안 지선 장비 (조수 갯벌 / 산호초 섬 / 수심의 것) ─────────────────────
  // 폐허~산기슭 구간과 나란히 놓이는 바닷길 라인. 갯벌 입문 2종(게딱지) → 산호초 섬 잡몹산 3종
  // (산호 가시·심해 비늘) → 업그레이드 3종 → 수심의 것 보스 보상(심연 무구 4 + 수심의 핵).
  // 제작산은 표시값=평균, 보스 드랍산은 표시값=하한. 모두 제작 품질 변동(`품질 변동: …`)이 굴려진다.
  crab_shell_buckler: {
    name: "게딱지 손방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+3" },
      { label: "방어력", value: "+2" },
    ],
    bonus: { atk: 3, def: 2 },
    description: "집게발 게의 등딱지를 깎아 댄 작은 손방패. 가볍고, 보기보다 단단하다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  tideflats_waders: {
    name: "갯벌 각반",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+4" },
      { label: "속도", value: "+1" },
    ],
    bonus: { def: 4, spd: 1 },
    description: "게딱지 조각을 정강이에 누벼 감싼 각반. 진흙에 발이 빠져도 미끄러지지 않는다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  coral_spine_dagger: {
    name: "산호 가시 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+5" },
      { label: "민첩", value: "+2" },
    ],
    bonus: { atk: 5, dex: 2 },
    description: "암초에서 부러진 산호 가시를 갈아 자루에 박은 단검. 끝이 송곳처럼 예리하다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  siren_scale_robe: {
    name: "사이렌 비늘 로브",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+5" },
      { label: "속도", value: "+2" },
    ],
    bonus: { def: 5, spd: 2 },
    description: "산호초 사이렌의 비늘을 이어 짠 로브. 물기를 머금어 서늘하고, 걸치면 발이 매끄럽게 미끄러진다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  tideglass_charm: {
    name: "조수유리 부적",
    slot: "accessory",
    stats: [
      { label: "활력", value: "+3" },
      { label: "행운", value: "+2" },
    ],
    bonus: { vit: 3, luk: 2 },
    description: "심해 비늘과 산호 조각을 가는 끈에 엮어 만든 부적. 파도가 드나드는 소리가 은은하게 난다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  // 업그레이드 결과 3종 — 베이스를 'equip' 재료로 소비 (recipes.ts).
  crustacean_bulwark: {
    name: "갑각 보루방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+5" },
      { label: "방어력", value: "+4" },
      { label: "속도", value: "-1" },
    ],
    bonus: { atk: 5, def: 4, spd: -1 },
    description: "게딱지 손방패에 더 큰 갑각판과 산호 가시를 덧대 보루처럼 키운 방패. 묵직한 만큼 발이 조금 무겁다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  barbed_coral_dagger: {
    name: "가시 산호 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+7" },
      { label: "민첩", value: "+3" },
    ],
    bonus: { atk: 7, dex: 3 },
    description: "산호 가시 단검에 잔가시를 더 박아 넣은 것. 스칠 때마다 살갗을 긁는다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  siren_song_mantle: {
    name: "사이렌 노래 망토",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+7" },
      { label: "민첩", value: "+2" },
      { label: "속도", value: "+3" },
    ],
    bonus: { def: 7, dex: 2, spd: 3 },
    description: "사이렌 비늘 로브에 심해 비늘을 더 이어 짠 망토. 두르면 물살을 가르듯 움직임이 부드러워진다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  // 수심의 것 보스 보상 — 심연 무구 4종(무기, atk +7 공통 + 보조 stat) + 수심의 핵(액세서리).
  // recipe_one_of 로 무기 1종 확정 학습, 0.15 로 수심의 핵 제작서. 마정석 라인의 한 단계 위.
  abyssal_edge: {
    name: "심연 칼날",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+7" },
      { label: "힘", value: "+4" },
    ],
    bonus: { atk: 7, str: 4 },
    description: "수심의 것의 비늘을 벼려 만든 칼날. 휘두를 때마다 깊은 물의 무게가 손에 실린다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  abyssal_ward: {
    name: "심연 방벽",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+7" },
      { label: "활력", value: "+4" },
    ],
    bonus: { atk: 7, vit: 4 },
    description: "수심의 것의 등딱지를 그대로 두른 방패형 무구. 막아내면 차가운 물살이 손끝까지 전해진다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  abyssal_pike: {
    name: "심연 장창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+7" },
      { label: "민첩", value: "+5" },
    ],
    bonus: { atk: 7, dex: 5 },
    description: "수심의 것의 가시뼈를 깎아 박은 긴 창. 멀리서도 물살을 가르듯 곧게 뻗는다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  abyssal_clasp: {
    name: "심연 손아귀",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+7" },
      { label: "행운", value: "+5" },
    ],
    bonus: { atk: 7, luk: 5 },
    description: "수심의 것의 발톱뼈를 손등에 박은 너클. 한 방 한 방이 깊은 물처럼 어디로 향할지 알 수 없다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  abyssal_heart: {
    name: "수심의 핵",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+3" },
      { label: "활력", value: "+3" },
    ],
    bonus: { dex: 3, vit: 3 },
    description: "수심의 것의 가슴 깊은 곳에서 꺼낸 차가운 핵. 손에 쥐면 숨이 길어지고 손끝이 또렷해진다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  // 유실된 명품 — 진흙 미꾸라지가 아주 드물게 떨군다. tidelord_signet 은 가시 산호 골렘/수심의 것이
  // 떨구는 새김서로 끌어올린 결과(결과도 unique) — "손에 맞춰진 보물".
  drowned_signet: {
    name: "물에 잠긴 인장반지",
    slot: "accessory",
    stats: [
      { label: "행운", value: "+4" },
      { label: "속도", value: "+1" },
    ],
    bonus: { luk: 4, spd: 1 },
    description: "어느 진흙 미꾸라지가 진창 속에 끌고 다니던 낡은 인장반지. 문장이 닳아 누구 것이었는지는 알 수 없지만, 끼고 있으면 묘하게 운이 따른다.",
    rarity: "unique",
    tier: 2,
  } satisfies EquipItem,
  tidelord_signet: {
    name: "조수군주의 인장",
    slot: "accessory",
    stats: [
      { label: "행운", value: "+6" },
      { label: "속도", value: "+2" },
      { label: "민첩", value: "+1" },
    ],
    bonus: { luk: 6, spd: 2, dex: 1 },
    description: "닳은 인장반지에 심해 비늘을 녹여 새 문장을 새겨 넣은 것. 무슨 문장인지는 아무도 모르지만, 끼고 있으면 파도가 제 편인 듯하다.",
    rarity: "unique",
    tier: 3,
  } satisfies EquipItem,
} as const;
