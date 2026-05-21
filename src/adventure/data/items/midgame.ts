import type { EquipItem } from "./types";

export const MIDGAME_ITEMS = {
  // ── 중간 단계 제작 장비 ───────────────────────────────────────────────────
  // 그동안 퀘스트 deliver/판매 외엔 쓸 데가 없던 재료(영혼 결정·산초꽃·바람 마석·늑대왕의 송곳니·
  // 초원 매 깃털)에 제작 destination 을 붙인 라인. 각자 그 재료가 나오는 구간에서 다음 보스 보상 전까지
  // 한 칸 메우는 정도 — 곡선 위로 살짝 비집고 들어간다. 제작서는 해당 재료를 이미 소비하던 의뢰의
  // 보상으로 풀린다(바람 마석만 돌풍 정령 recipe 드롭).
  soul_blade: {
    name: "혼백검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+5" },
      { label: "활력", value: "+1" },
    ],
    bonus: { atk: 5, vit: 1 },
    description: "떠도는 망령에게서 거둔 영혼 결정을 칼날 안에 박아 벼린 검. 결정에서 새어 나오는 한기가 칼날을 좀처럼 식지 않게 한다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  sancho_vest: {
    name: "산초 누비 조끼",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+5" },
      { label: "활력", value: "+3" },
    ],
    bonus: { def: 5, vit: 3 },
    description: "말린 산초꽃을 천 사이에 누벼 넣은 조끼. 두르면 몸이 은근히 따뜻하고, 베인 자리가 더디 곪는다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  windmana_charm: {
    name: "바람 마석 부적",
    slot: "accessory",
    stats: [
      { label: "속도", value: "+3" },
      { label: "민첩", value: "+1" },
    ],
    bonus: { spd: 3, dex: 1 },
    description: "협곡 정령이 흩뿌린 바람 마석을 가는 끈에 꿰어 만든 부적. 손목에 두르면 발끝이 바람을 머금은 듯 가볍다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  wolfking_fang_dagger: {
    name: "늑대왕 송곳니 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+7" },
      { label: "민첩", value: "+3" },
    ],
    bonus: { atk: 7, dex: 3 },
    description: "무리를 이끄는 늑대만이 갖는 길고 굵은 송곳니를 그대로 자루에 박아 만든 단검. 휘두를 때마다 짐승의 무게가 손에 실린다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  hawkfeather_cloak: {
    name: "매깃 망토",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+3" },
      { label: "속도", value: "+4" },
    ],
    bonus: { def: 3, spd: 4 },
    description: "초원 매의 길고 가벼운 깃털을 이어 짠 망토. 바람을 잘 타 두르면 발걸음이 한결 빨라진다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,

  // ── 기존 장비를 재료(equip)로 한 단계 끌어올린 결과물 ──
  // 베이스가 'equip' 재료로 소비된다 (recipes.ts). 명품(unique) 업그레이드는 결과도 unique ("손에 맞춰진 보물").
  reinforced_leather_armor: {
    name: "덧댄 가죽갑옷",
    slot: "armor",
    stats: [{ label: "방어력", value: "+5" }],
    bonus: { def: 5 },
    description: "낡은 가죽갑옷에 들개 가죽을 덧대고 두텁게 누벼 받친 것. 같은 한 벌인데 한층 든든하다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  bandit_chief_dagger: {
    name: "두목의 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+6" },
      { label: "민첩", value: "+3" },
    ],
    bonus: { atk: 6, dex: 3 },
    description: "산적의 단검에 단단한 수정을 박아 날을 다시 세운 것. 두목쯤은 들고 다녔을 법한 무게가 손에 감긴다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  nymph_blessing: {
    name: "호수 님프의 가호",
    slot: "accessory",
    stats: [
      { label: "속도", value: "+4" },
      { label: "민첩", value: "+1" },
    ],
    bonus: { spd: 4, dex: 1 },
    description: "님프의 반지에 요정가루를 입혀 가호를 깊게 한 것. 끼고 있으면 발끝이 호숫물처럼 가볍다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  reforged_golem_hammer: {
    name: "재단조한 골렘 망치",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+8" },
      { label: "힘", value: "+3" },
      { label: "속도", value: "-2" },
    ],
    bonus: { atk: 8, str: 3, spd: -2 },
    description: "골렘의 망치를 마정석으로 다시 벼리고 폐허 잔해로 자루를 보강한 것. 여전히 둔하지만, 한 번 내리치면 무게가 다르다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  wraithking_cloak: {
    name: "망령왕의 망토",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+4" },
      { label: "민첩", value: "+2" },
      { label: "속도", value: "+3" },
    ],
    bonus: { def: 4, dex: 2, spd: 3 },
    description: "망령의 망토에 영혼 결정을 엮어 넣어 한기를 깊게 한 것. 두르면 발소리가 사라지고, 베인 자리가 시리다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  lava_core_greatmaul: {
    name: "용암핵 대망치",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+14" },
      { label: "속도", value: "-2" },
    ],
    bonus: { atk: 14, spd: -2 },
    description: "굳은 용암핵 망치에 용암 핵을 더 녹여 붓고 화염 비늘로 자루를 감싼 것. 더 둔해진 만큼, 한 번 내리치면 땅이 갈라진다.",
    rarity: "unique",
    tier: 4,
  } satisfies EquipItem,
  azure_talon: {
    name: "창천의 발톱",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+13" },
      { label: "민첩", value: "+6" },
    ],
    bonus: { atk: 13, dex: 6 },
    description: "하늘가르개에 초원 매 깃털을 겹겹이 둘러 균형을 잡은 것. 휘두르면 허공이 한 줄 더 깊게 갈라진다.",
    rarity: "unique",
    tier: 4,
  } satisfies EquipItem,
  spider_queen_silk_plate: {
    name: "거미여왕의 비단 정갑",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+5" },
      { label: "행운", value: "+9" },
    ],
    bonus: { def: 5, luk: 9 },
    description: "거미여왕의 비단갑을 거미줄로 더 곱게 짜 올린 정갑. 결이 비단 위의 비단이고, 운이 더 끈질기게 따라붙는다.",
    rarity: "unique",
    tier: 3,
  } satisfies EquipItem,
  bat_swarm_guide: {
    name: "박쥐떼의 인도자",
    slot: "accessory",
    stats: [
      { label: "속도", value: "+6" },
      { label: "민첩", value: "+3" },
    ],
    bonus: { spd: 6, dex: 3 },
    description: "박쥐떼의 길잡이에 박쥐 눈알을 박아 어둠을 더 멀리 읽게 한 것. 지니면 한 발 앞이 늘 환하고, 그만큼 발이 앞선다.",
    rarity: "unique",
    tier: 3,
  } satisfies EquipItem,
  phoenix_flight_cape: {
    name: "봉황 비행깃 망토",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+6" },
      { label: "민첩", value: "+3" },
      { label: "속도", value: "+6" },
    ],
    bonus: { def: 6, dex: 3, spd: 6 },
    description: "봉황 망토에 봉황 깃털을 더 이어 짜 비행깃을 살린 것. 두르면 발이 불꽃처럼 가벼워지고, 방향을 트는 게 한결 빠르다.",
    rarity: "uncommon",
    tier: 4,
  } satisfies EquipItem,
  mole_king_borer: {
    name: "두더지왕의 굴착드릴",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+8" },
      { label: "속도", value: "+3" },
    ],
    bonus: { atk: 8, spd: 3 },
    description: "두더지왕의 드릴에 단단한 수정 날과 마정석 동력부를 단 것. 회전이 묵직해지고, 파고드는 손맛이 한 단계 위다.",
    rarity: "unique",
    tier: 2,
  } satisfies EquipItem,
} as const;
