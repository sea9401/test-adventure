import type { EquipItem } from "./types";

export const SKY_ITEMS = {
  // ── 별의 첨탑 무구 5종 — 별을 지키는 자 협동 처치 보상으로 풀리는 엔드 라인. ──
  // 봉황·화산 라인의 한 단계 위. 용비늘 보스 무구(Lv75)와 같은 두께의 stat 곡선 — 천공 라인 시작점.
  // 무기 atk +16(검/방패) / +18(창/너클) 공통(제작 `일반` 기준) + 보조 stat.
  star_blade: {
    name: "별검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+16" },
      { label: "힘", value: "+7" },
    ],
    bonus: { atk: 16, str: 7 },
    description: "천공 합금을 별먼지에 담갔다가 단조한 한손 대검. 칼날에 별빛이 옅게 머문다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  star_aegis: {
    name: "별의 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+16" },
      { label: "활력", value: "+8" },
    ],
    bonus: { atk: 16, vit: 8 },
    description: "천공 합금을 겹쳐 별먼지로 무늬를 새긴 방패형 무기. 막아낼 때마다 별빛이 일렁인다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  star_lance: {
    name: "별창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+18" },
      { label: "민첩", value: "+9" },
    ],
    bonus: { atk: 18, dex: 9 },
    description: "별먼지로 균형을 잡고 천공 합금 창끝을 깎아 박은 긴 창. 끝에서 별빛이 가늘게 떨린다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  star_grip: {
    name: "별의 너클",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+18" },
      { label: "행운", value: "+9" },
    ],
    bonus: { atk: 18, luk: 9 },
    description: "천공 합금을 깎아 손등에 채운 너클. 한 방 한 방이 별빛을 따라 떨어진다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  star_mantle: {
    name: "별의 망토",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+7" },
      { label: "속도", value: "+7" },
      { label: "활력", value: "+1" },
    ],
    bonus: { dex: 7, spd: 7, vit: 1 },
    description: "별먼지를 짜낸 가느다란 실로 짠 가벼운 망토. 두르면 발걸음에 별빛이 따라 붙는다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  // 별빛 두루마기 — 별을 지키는 자 협동 legend 티어 확정 드랍 (물욕템).
  // armor 슬롯을 채우는 전스탯 균형형 — 자랑용.
  star_robe: {
    name: "별빛 두루마기",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+17" },
      { label: "힘", value: "+5" },
      { label: "민첩", value: "+5" },
      { label: "활력", value: "+7" },
      { label: "속도", value: "+5" },
    ],
    bonus: { def: 17, str: 5, dex: 5, vit: 7, spd: 5 },
    description: "별을 지키는 자가 두르고 있던 망토가 그 잠을 깨운 자의 손에 닿자 별빛으로 결정화된 두루마기. 어느 스탯에도 치우치지 않은 옛 천공인의 유물.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,

  // ── 별빛 회랑 무구 5종 (Lv75) — star 와 aether 사이 중간 tier. ──
  // 무기 atk +17(검/방패) / +19(창/너클). 별 무구 한 자루를 잡아 회랑의 별빛 + 합금으로 보강.
  // 용비늘 묘지 보스(뼈왕의 대검 atk17+str9, 영광방패 atk13+vit12+def5) 와 같은 stat 두께.
  corridor_blade: {
    name: "회랑검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+17" },
      { label: "힘", value: "+9" },
    ],
    bonus: { atk: 17, str: 9 },
    description: "별빛 회랑에 떨어진 떠도는 시녀의 잔재를 별검 위에 한 결 더 입힌 칼. 별빛의 결이 손잡이까지 따라 흐른다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  corridor_aegis: {
    name: "회랑 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+17" },
      { label: "활력", value: "+10" },
    ],
    bonus: { atk: 17, vit: 10 },
    description: "별의 방패에 회랑의 별빛 합금을 한 겹 더 두른 방패형 무기. 회랑의 결이 충격을 가른다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  corridor_lance: {
    name: "회랑창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+19" },
      { label: "민첩", value: "+10" },
    ],
    bonus: { atk: 19, dex: 10 },
    description: "별창 끝에 회랑의 별빛을 압축해 박은 긴 창. 끝에서 회랑의 결이 가늘게 떨린다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  corridor_grip: {
    name: "회랑 너클",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+19" },
      { label: "행운", value: "+10" },
    ],
    bonus: { atk: 19, luk: 10 },
    description: "별의 너클을 한 번 풀어 회랑의 별빛 결로 다시 새긴 너클. 한 방 한 방이 회랑을 닮은 결을 낸다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  corridor_mantle: {
    name: "회랑 망토",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+8" },
      { label: "속도", value: "+8" },
      { label: "활력", value: "+4" },
    ],
    bonus: { dex: 8, spd: 8, vit: 4 },
    description: "별의 망토에 회랑의 별빛 실을 한 결 더 짜낸 가벼운 망토. 두르면 발걸음에 회랑의 결이 따라 붙는다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,

  // ── 선인의 폐도 무구 5종 — 천공인의 왕 협동 처치 보상 (별 라인의 한 단계 위). ──
  // 무기 atk +19(검/방패) / +21(창/너클) 공통(제작 `일반` 기준) + 보조 스탯.
  aether_blade: {
    name: "에테르검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+19" },
      { label: "힘", value: "+10" },
    ],
    bonus: { atk: 19, str: 10 },
    description: "에테르 합금을 별의 정수에 담갔다 단조한 한손 대검. 칼날을 휘두를 때마다 옛 별빛이 결을 따라 흐른다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  aether_aegis: {
    name: "에테르 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+19" },
      { label: "활력", value: "+12" },
    ],
    bonus: { atk: 19, vit: 12 },
    description: "에테르 합금을 겹쳐 별의 정수로 결을 잡은 방패형 무기. 막아낼 때마다 별빛의 결이 적의 충격을 흩는다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  aether_lance: {
    name: "에테르창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+21" },
      { label: "민첩", value: "+12" },
    ],
    bonus: { atk: 21, dex: 12 },
    description: "별의 정수로 균형을 잡고 에테르 합금 창끝을 깎아 박은 긴 창. 끝에서 별빛이 옛 천공인의 마지막 노래처럼 떨린다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  aether_grip: {
    name: "에테르 너클",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+21" },
      { label: "행운", value: "+12" },
    ],
    bonus: { atk: 21, luk: 12 },
    description: "에테르 합금을 깎아 손등에 채운 너클. 한 방 한 방이 옛 천공인이 별을 떨궜다는 어느 순간을 닮았다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  aether_mantle: {
    name: "에테르 망토",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+9" },
      { label: "속도", value: "+9" },
      { label: "활력", value: "+4" },
    ],
    bonus: { dex: 9, spd: 9, vit: 4 },
    description: "별의 정수를 짜낸 실로 짠 망토. 두르면 발걸음이 가벼워지고 어깨가 든든해진다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  // 천공인의 관 — 천공인의 왕 협동 legend 티어 1% 드랍 (물욕템).
  // accessory 슬롯, 운봉령/별빛 두루마기 위의 분포.
  skyfolk_crown: {
    name: "천공인의 관",
    slot: "accessory",
    stats: [
      { label: "공격력", value: "+7" },
      { label: "방어력", value: "+7" },
      { label: "힘", value: "+4" },
      { label: "민첩", value: "+4" },
      { label: "활력", value: "+4" },
      { label: "속도", value: "+4" },
      { label: "행운", value: "+4" },
    ],
    bonus: { atk: 7, def: 7, str: 4, dex: 4, vit: 4, spd: 4, luk: 4 },
    description: "옛 천공인의 마지막 왕이 별빛에 두고 떠난 관. 닿은 자는 어느 결로도 꺾이지 않는다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,

  // ── 옥좌의 길 무구 5종 (Lv85) — aether 와 empyrean 사이 중간 tier. ──
  // 무기 atk +22(검/방패) / +24(창/너클). 에테르 무구를 잡아 황성 합금 + 별의 결로 다시 단조.
  road_blade: {
    name: "황성검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+22" },
      { label: "힘", value: "+11" },
    ],
    bonus: { atk: 22, str: 11 },
    description: "옥좌의 길에서 무너진 황성 호위병의 칼을 에테르검 위에 한 겹 더 입힌 한손 대검. 휘두를 때마다 황성의 결이 칼날을 따라 흐른다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  road_aegis: {
    name: "황성 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+22" },
      { label: "활력", value: "+13" },
    ],
    bonus: { atk: 22, vit: 13 },
    description: "에테르 방패에 황성 호위병이 두르고 있던 보호의 결을 한 겹 더 두른 방패형 무기. 막아낼 때마다 황성의 결이 충격을 흩는다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  road_lance: {
    name: "황성창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+24" },
      { label: "민첩", value: "+13" },
    ],
    bonus: { atk: 24, dex: 13 },
    description: "에테르창 끝에 황성의 결을 압축해 박은 긴 창. 끝에서 옥좌가 빛을 떨군다는 그 결이 가늘게 떨린다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  road_grip: {
    name: "황성 너클",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+24" },
      { label: "행운", value: "+13" },
    ],
    bonus: { atk: 24, luk: 13 },
    description: "에테르 너클에 황성 호위병의 한 결을 더 새긴 너클. 한 방 한 방이 옥좌로 가는 길을 닮은 결을 낸다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  road_mantle: {
    name: "황성 망토",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+10" },
      { label: "속도", value: "+10" },
      { label: "활력", value: "+5" },
    ],
    bonus: { dex: 10, spd: 10, vit: 5 },
    description: "에테르 망토에 황성의 결을 한 줄 더 짜낸 가벼운 망토. 두르면 어깨에 옥좌로 가는 길의 결이 얹힌다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,

  // ── 창공의 옥좌 무구 5종 — 창공의 주재 협동 처치 보상 (에테르 라인의 한 단계 위, 만렙 정점). ──
  // 무기 atk +25(검/방패) / +27(창/너클) 공통(제작 `일반` 기준) + 보조 스탯.
  empyrean_blade: {
    name: "창공검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+25" },
      { label: "힘", value: "+12" },
    ],
    bonus: { atk: 25, str: 12 },
    description: "창공 조각을 태초의 정수에 담갔다 단조한 한손 대검. 휘두를 때마다 별 그 자체의 결이 칼날을 따라 흐른다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  empyrean_aegis: {
    name: "창공 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+25" },
      { label: "활력", value: "+14" },
    ],
    bonus: { atk: 25, vit: 14 },
    description: "창공 조각을 겹쳐 태초의 정수로 결을 잡은 방패형 무기. 막아낼 때마다 별이 일렁이며 충격을 흩는다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  empyrean_lance: {
    name: "창공창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+27" },
      { label: "민첩", value: "+14" },
    ],
    bonus: { atk: 27, dex: 14 },
    description: "태초의 정수로 균형을 잡고 창공 조각 끝을 깎아 박은 긴 창. 끝에서 별이 떨어지는 듯한 결이 인다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  empyrean_grip: {
    name: "창공 너클",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+27" },
      { label: "행운", value: "+14" },
    ],
    bonus: { atk: 27, luk: 14 },
    description: "창공 조각을 깎아 손등에 채운 너클. 한 방 한 방이 옥좌가 별을 떨어뜨렸다는 그 순간을 닮았다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
  empyrean_mantle: {
    name: "창공 망토",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+11" },
      { label: "속도", value: "+11" },
      { label: "활력", value: "+6" },
    ],
    bonus: { dex: 11, spd: 11, vit: 6 },
    description: "태초의 정수를 짜낸 실로 짠 가장 가벼우면서 가장 단단한 망토. 두르면 어깨에 별 한 자루의 결이 얹힌다.",
    rarity: "uncommon",
    tier: 5,
  } satisfies EquipItem,
} as const;
