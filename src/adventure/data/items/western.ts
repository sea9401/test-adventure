import type { EquipItem } from "./types";

export const WESTERN_ITEMS = {
  // ── 서편 옛길 장비 (서편 옛길 / 옛 변경 성채 / 옛 성문지기) ─────────────────
  // 시작 마을 서쪽의 막다른 라인. 옛길 입문 2종(까마귀 깃) → 옛 변경 성채 잡몹산 3종
  // (녹슨 쇳조각·옛 군기 조각) → 업그레이드 3종 → 옛 성문지기 보스 보상(수비대 무구 4 + 성문지기의 핵).
  // 수비대 무구는 마정석 라인과 운봉 라인 사이(atk +6 + 보조 +4), 옛 변경 성채(Lv13) tier.
  crow_feather_cap: {
    name: "까마귀깃 두건",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+1" },
      { label: "속도", value: "+2" },
    ],
    bonus: { def: 1, spd: 2 },
    description: "들까마귀 깃을 이어 댄 가벼운 두건. 머리에 쓰면 발걸음이 묘하게 가벼워진다.",
    rarity: "uncommon",
    tier: 1,
  } satisfies EquipItem,
  roadbandit_shortsword: {
    name: "노상강도의 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+3" },
      { label: "민첩", value: "+1" },
    ],
    bonus: { atk: 3, dex: 1 },
    description: "옛길에 눌러앉은 노상강도가 품에 차고 다니던 짧은 검. 들고양이 송곳니로 손잡이를 감았다.",
    rarity: "uncommon",
    tier: 1,
  } satisfies EquipItem,
  garrison_hauberk: {
    name: "수비대 사슬갑옷",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+6" },
      { label: "활력", value: "+1" },
    ],
    bonus: { def: 6, vit: 1 },
    description: "녹슨 쇳조각을 다시 엮어 짠 사슬갑옷. 한 세대 전 변경 수비대가 입던 것과 같은 짜임이다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  geared_warpick: {
    name: "톱니 전곡괭이",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+5" },
      { label: "힘", value: "+2" },
    ],
    bonus: { atk: 5, str: 2 },
    description: "녹슨 자동인형의 톱니와 강철판으로 머리를 벼린 전쟁용 곡괭이. 한 번 내리찍으면 묵직하게 박힌다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  tattered_standard_cloak: {
    name: "낡은 군기 망토",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+4" },
      { label: "속도", value: "+2" },
      { label: "행운", value: "+1" },
    ],
    bonus: { def: 4, spd: 2, luk: 1 },
    description: "옛 변경 수비대의 군기를 기워 두른 망토. 빛바랜 문장이 등에 희미하게 남아 있다.",
    rarity: "uncommon",
    tier: 2,
  } satisfies EquipItem,
  // 업그레이드 결과 3종, 베이스를 'equip' 재료로 소비 (recipes.ts).
  roadbandit_falchion: {
    name: "노상강도의 활검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+5" },
      { label: "민첩", value: "+3" },
    ],
    bonus: { atk: 5, dex: 3 },
    description: "노상강도의 단검에 녹슨 쇳조각을 덧대 날을 길게 늘이고 굽힌 것. 휘둘러 베는 맛이 한결 매섭다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  reinforced_garrison_hauberk: {
    name: "보강한 수비대 사슬갑옷",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+8" },
      { label: "활력", value: "+3" },
      { label: "속도", value: "-1" },
    ],
    bonus: { def: 8, vit: 3, spd: -1 },
    description: "수비대 사슬갑옷에 녹슨 쇳조각으로 가슴판을 덧대고 옛 군기 조각으로 안감을 받친 것. 두터워진 만큼 발이 조금 무겁다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  frontier_standard_cloak: {
    name: "변경 군기 망토",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+6" },
      { label: "속도", value: "+3" },
      { label: "행운", value: "+2" },
    ],
    bonus: { def: 6, spd: 3, luk: 2 },
    description: "낡은 군기 망토에 또 다른 군기 조각을 겹쳐 기워 결을 두텁게 한 것. 등의 문장이 한결 또렷해졌다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  // 옛 성문지기 보스 보상, 수비대 무구 4종(무기, atk +6 공통 + 보조 +4) + 성문지기의 핵(액세서리).
  // recipe_one_of 로 무기 1종 확정 학습, 0.15 로 성문지기의 핵. 마정석 라인과 운봉 라인 사이 tier.
  garrison_blade: {
    name: "수비대 도검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+6" },
      { label: "힘", value: "+4" },
    ],
    bonus: { atk: 6, str: 4 },
    description: "옛 성문지기의 강철판을 다시 벼려 만든 한손 도검. 휘두를 때마다 옛 수비대의 무게가 손에 실린다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  garrison_bulwark: {
    name: "수비대 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+6" },
      { label: "활력", value: "+4" },
    ],
    bonus: { atk: 6, vit: 4 },
    description: "옛 성문지기의 빗장을 그대로 두른 방패형 무구. 막아내면 묵직한 강철의 무게가 손목에 전해진다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  garrison_glaive: {
    name: "수비대 미늘창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+6" },
      { label: "민첩", value: "+4" },
    ],
    bonus: { atk: 6, dex: 4 },
    description: "옛 성문지기의 톱니 끝을 깎아 미늘로 박은 긴 창. 멀리서도 정확하게 찔러 건다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  garrison_cudgel: {
    name: "수비대 철퇴",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+6" },
      { label: "행운", value: "+4" },
    ],
    bonus: { atk: 6, luk: 4 },
    description: "옛 성문지기의 강철판을 뭉쳐 머리를 단 철퇴. 한 방 한 방이 어디로 떨어질지 휘두르는 자도 모른다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  gatekeeper_core: {
    name: "성문지기의 핵",
    slot: "accessory",
    stats: [
      { label: "활력", value: "+4" },
      { label: "힘", value: "+2" },
    ],
    bonus: { vit: 4, str: 2 },
    description: "옛 성문지기의 가슴 깊은 곳에서 멈춰 있던 강철 핵. 손에 쥐면 어깨가 묵직해지고 버티는 힘이 단단해진다.",
    rarity: "uncommon",
    tier: 3,
  } satisfies EquipItem,
  // 유실된 명품, 들까마귀 떼가 아주 드물게 떨군다. corvid_fortune_charm 은 녹슨 자동인형/옛
  // 성문지기가 떨구는 새김서로 끌어올린 결과(결과도 unique), "손에 맞춰진 보물".
  crows_hoard_charm: {
    name: "까마귀 둥지의 부적",
    slot: "accessory",
    stats: [
      { label: "행운", value: "+3" },
      { label: "속도", value: "+2" },
    ],
    bonus: { luk: 3, spd: 2 },
    description: "들까마귀 떼가 둥지에 그러모은 잡동사니. 닳은 동전, 깨진 거울 조각, 가는 사슬을 엮어 만든 듯한 장신구. 누가 만든 건지 아무도 모르지만, 지니면 묘하게 운이 따른다.",
    rarity: "unique",
    tier: 2,
  } satisfies EquipItem,
  corvid_fortune_charm: {
    name: "까마귀 보물의 부적",
    slot: "accessory",
    stats: [
      { label: "행운", value: "+5" },
      { label: "속도", value: "+3" },
      { label: "민첩", value: "+1" },
    ],
    bonus: { luk: 5, spd: 3, dex: 1 },
    description: "까마귀 둥지의 부적에 녹슨 동전과 톱니를 더 엮어 무겁게 한 것. 누가 손본 건지 모르지만, 지니면 운이 한층 끈질기게 따라붙는다.",
    rarity: "unique",
    tier: 3,
  } satisfies EquipItem,
} as const;
