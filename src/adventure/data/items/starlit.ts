import type { EquipItem } from "./types";

export const STARLIT_ITEMS = {
  // ── 5막 별빛 무구 — 4 별빛 사냥터 (Ch 26 이후) 진입 컨텐츠.
  // 무기 25종 = 5무기(대검/창/방패/쌍검/단검) × 5부스탯 변형. atk +28 / 메인 +14 / 부스탯 +5.
  // 메인스탯 매핑: 대검=str, 창=dex, 방패=vit, 쌍검=spd, 단검=luk.
  // 부스탯이 메인과 일치하는 변형(예: 힘의 별빛 대검) 은 같은 스탯에 자연 합산 → 메인 +19.
  // 방어구 5종 = 메인스탯 5종 각 1자루. def +24 / 메인 +14. 부스탯 없음.
  // 입수: 4 사냥터 일반 몹 제작서 드랍 → 별빛 조각으로 제작 / 사냥터 일반 몹 완제품 드랍.
  // craftTier 적용 + 강화 +7 + 마법부여 3슬 (강화 단계별 해금).

  // 대검 (메인 = 힘)
  starlit_greatsword_str: {
    name: "힘의 별빛 대검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "힘", value: "+19" },
    ],
    bonus: { atk: 28, str: 19 },
    description: "별빛 한 결을 한 자루로 두껍게 두른 한손 대검. 들면 어깨에 별바다의 무게가 가지런히 얹힌다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_greatsword_dex: {
    name: "민첩의 별빛 대검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "힘", value: "+14" },
      { label: "민첩", value: "+5" },
    ],
    bonus: { atk: 28, str: 14, dex: 5 },
    description: "별빛 한 결을 가늘게 흘려 단조한 한손 대검. 결을 따라 손끝까지 가지런히 흐른다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_greatsword_vit: {
    name: "활력의 별빛 대검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "힘", value: "+14" },
      { label: "활력", value: "+5" },
    ],
    bonus: { atk: 28, str: 14, vit: 5 },
    description: "별빛 한 결이 가장 안쪽에 두텁게 가라앉아 있는 한손 대검. 한 호흡이 어긋나도 결이 자세를 잡아 준다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_greatsword_spd: {
    name: "속도의 별빛 대검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "힘", value: "+14" },
      { label: "속도", value: "+5" },
    ],
    bonus: { atk: 28, str: 14, spd: 5 },
    description: "별빛 한 결을 결대로 얇게 펴 단조한 한손 대검. 그림자가 가볍게 떨어진다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_greatsword_luk: {
    name: "행운의 별빛 대검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "힘", value: "+14" },
      { label: "행운", value: "+5" },
    ],
    bonus: { atk: 28, str: 14, luk: 5 },
    description: "별빛 한 점이 한 칼에 옅게 떨려 있는 한손 대검. 자루 끝에서 가끔 빛이 한 번 깜박인다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,

  // 창 (메인 = 민첩)
  starlit_lance_str: {
    name: "힘의 별빛 창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "민첩", value: "+14" },
      { label: "힘", value: "+5" },
    ],
    bonus: { atk: 28, dex: 14, str: 5 },
    description: "별빛 한 결을 묵직하게 박아 단조한 긴 창. 한 번 박으면 결이 손까지 같이 박힌다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_lance_dex: {
    name: "민첩의 별빛 창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "민첩", value: "+19" },
    ],
    bonus: { atk: 28, dex: 19 },
    description: "별빛 한 결을 가장 가지런히 흘려 단조한 긴 창. 결이 손끝까지 한 번에 미끄러진다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_lance_vit: {
    name: "활력의 별빛 창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "민첩", value: "+14" },
      { label: "활력", value: "+5" },
    ],
    bonus: { atk: 28, dex: 14, vit: 5 },
    description: "별빛 한 결이 자루 안쪽에 가장 두텁게 가라앉아 있는 긴 창. 호흡이 끊겨도 자루가 자세를 잡아 준다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_lance_spd: {
    name: "속도의 별빛 창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "민첩", value: "+14" },
      { label: "속도", value: "+5" },
    ],
    bonus: { atk: 28, dex: 14, spd: 5 },
    description: "별빛 한 결을 가장 얇게 펴 단조한 긴 창. 휘두를 때마다 그림자가 한 박자 늦게 따라온다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_lance_luk: {
    name: "행운의 별빛 창",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "민첩", value: "+14" },
      { label: "행운", value: "+5" },
    ],
    bonus: { atk: 28, dex: 14, luk: 5 },
    description: "별빛 한 점이 창끝에 옅게 떨려 있는 긴 창. 결정적인 한 자세에 빛이 한 번 깜박인다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,

  // 방패 (메인 = 활력)
  starlit_shield_str: {
    name: "힘의 별빛 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "활력", value: "+14" },
      { label: "힘", value: "+5" },
    ],
    bonus: { atk: 28, vit: 14, str: 5 },
    description: "별빛 한 결을 가장 두텁게 박아 단조한 방패형 무기. 받아 내는 한 번에 별바다의 무게가 같이 얹힌다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_shield_dex: {
    name: "민첩의 별빛 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "활력", value: "+14" },
      { label: "민첩", value: "+5" },
    ],
    bonus: { atk: 28, vit: 14, dex: 5 },
    description: "별빛 한 결을 가장 가지런히 흘려 단조한 방패형 무기. 결이 손끝까지 한 번에 미끄러진다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_shield_vit: {
    name: "활력의 별빛 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "활력", value: "+19" },
    ],
    bonus: { atk: 28, vit: 19 },
    description: "별빛 한 결이 안쪽까지 가장 깊이 가라앉아 있는 방패형 무기. 어떤 결도 안으로 닿지 못한다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_shield_spd: {
    name: "속도의 별빛 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "활력", value: "+14" },
      { label: "속도", value: "+5" },
    ],
    bonus: { atk: 28, vit: 14, spd: 5 },
    description: "별빛 한 결을 얇게 펴 단조한 방패형 무기. 받아 낼 때마다 그림자가 한 박자 늦게 따라온다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_shield_luk: {
    name: "행운의 별빛 방패",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "활력", value: "+14" },
      { label: "행운", value: "+5" },
    ],
    bonus: { atk: 28, vit: 14, luk: 5 },
    description: "별빛 한 점이 방패 한가운데에 옅게 떨려 있는 방패형 무기. 막아 낸 한 번에 빛이 한 번 깜박인다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,

  // 쌍검 (메인 = 속도)
  starlit_twinblades_str: {
    name: "힘의 별빛 쌍검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "속도", value: "+14" },
      { label: "힘", value: "+5" },
    ],
    bonus: { atk: 28, spd: 14, str: 5 },
    description: "별빛 한 결을 두껍게 두른 한 손에 한 자루씩의 쌍검. 한 번에 두 결이 같이 박힌다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_twinblades_dex: {
    name: "민첩의 별빛 쌍검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "속도", value: "+14" },
      { label: "민첩", value: "+5" },
    ],
    bonus: { atk: 28, spd: 14, dex: 5 },
    description: "별빛 한 결을 가지런히 흘려 단조한 쌍검. 두 결이 한 손끝까지 같이 미끄러진다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_twinblades_vit: {
    name: "활력의 별빛 쌍검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "속도", value: "+14" },
      { label: "활력", value: "+5" },
    ],
    bonus: { atk: 28, spd: 14, vit: 5 },
    description: "별빛 한 결이 두 자루 안쪽에 두텁게 가라앉아 있는 쌍검. 두 호흡이 끊겨도 결이 자세를 잡아 준다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_twinblades_spd: {
    name: "속도의 별빛 쌍검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "속도", value: "+19" },
    ],
    bonus: { atk: 28, spd: 19 },
    description: "별빛 한 결을 가장 얇게 펴 단조한 쌍검. 두 그림자가 한 박자 늦게 같이 따라온다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_twinblades_luk: {
    name: "행운의 별빛 쌍검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "속도", value: "+14" },
      { label: "행운", value: "+5" },
    ],
    bonus: { atk: 28, spd: 14, luk: 5 },
    description: "별빛 한 점이 두 자루 끝에 옅게 떨려 있는 쌍검. 결정적인 두 결에 빛이 한 번 깜박인다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,

  // 단검 (메인 = 행운)
  starlit_dagger_str: {
    name: "힘의 별빛 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "행운", value: "+14" },
      { label: "힘", value: "+5" },
    ],
    bonus: { atk: 28, luk: 14, str: 5 },
    description: "별빛 한 결을 두껍게 두른 짧고 가는 단검. 한 번 박으면 별바다의 무게가 같이 박힌다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_dagger_dex: {
    name: "민첩의 별빛 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "행운", value: "+14" },
      { label: "민첩", value: "+5" },
    ],
    bonus: { atk: 28, luk: 14, dex: 5 },
    description: "별빛 한 결을 가지런히 흘려 단조한 짧고 가는 단검. 결이 손끝까지 한 번에 미끄러진다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_dagger_vit: {
    name: "활력의 별빛 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "행운", value: "+14" },
      { label: "활력", value: "+5" },
    ],
    bonus: { atk: 28, luk: 14, vit: 5 },
    description: "별빛 한 결이 자루 안쪽에 두텁게 가라앉아 있는 짧고 가는 단검. 호흡이 끊겨도 자루가 자세를 잡아 준다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_dagger_spd: {
    name: "속도의 별빛 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "행운", value: "+14" },
      { label: "속도", value: "+5" },
    ],
    bonus: { atk: 28, luk: 14, spd: 5 },
    description: "별빛 한 결을 가장 얇게 펴 단조한 짧고 가는 단검. 그림자가 칼끝보다 한 박자 늦게 따라온다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_dagger_luk: {
    name: "행운의 별빛 단검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "행운", value: "+19" },
    ],
    bonus: { atk: 28, luk: 19 },
    description: "별빛 한 점이 칼끝에 가장 가지런히 떨려 있는 짧고 가는 단검. 결정적인 한 박자에 빛이 한 번 깜박인다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,

  // 별빛 갑옷 5종 (메인스탯만, 부스탯 없음)
  starlit_armor_str: {
    name: "힘의 별빛 갑옷",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+24" },
      { label: "힘", value: "+14" },
    ],
    bonus: { def: 24, str: 14 },
    description: "별빛 한 결을 가장 두껍게 두른 갑주. 한 발 디딜 때마다 별바다의 무게가 가지런히 얹힌다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_armor_dex: {
    name: "민첩의 별빛 갑옷",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+24" },
      { label: "민첩", value: "+14" },
    ],
    bonus: { def: 24, dex: 14 },
    description: "별빛 한 결을 가지런히 흘려 단조한 가벼운 갑주. 몸의 결이 한 번에 미끄러진다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_armor_vit: {
    name: "활력의 별빛 갑옷",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+24" },
      { label: "활력", value: "+14" },
    ],
    bonus: { def: 24, vit: 14 },
    description: "별빛 한 결이 안쪽까지 가장 깊이 가라앉아 있는 두꺼운 갑주. 어떤 결도 안으로 닿지 못한다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_armor_spd: {
    name: "속도의 별빛 갑옷",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+24" },
      { label: "속도", value: "+14" },
    ],
    bonus: { def: 24, spd: 14 },
    description: "별빛 한 결을 가장 얇게 펴 단조한 갑주. 그림자가 한 박자 늦게 따라온다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,
  starlit_armor_luk: {
    name: "행운의 별빛 갑옷",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+24" },
      { label: "행운", value: "+14" },
    ],
    bonus: { def: 24, luk: 14 },
    description: "별빛 한 점이 가슴 위에 옅게 떨려 있는 갑주. 결정적인 한 발에 빛이 한 번 깜박인다.",
    rarity: "legendary",
    tier: 6,
  } satisfies EquipItem,

  // ── 5막 잔영 협동 legend 1% unique 액세서리 3종 (별빛 변종 협동 보스 보상) ──
  // 별빛 거인 잔영 / 수심의 메아리 / 성문지기 잔영 각각 legend 도달자 한정 0.01 굴림.
  // peak_relic / star_robe / apex_regalia 와 같은 결의 물욕 unique 라인. 한 자루씩.
  giant_yoke: {
    name: "거인의 멍에",
    slot: "accessory",
    stats: [
      { label: "활력", value: "+18" },
      { label: "힘", value: "+12" },
    ],
    bonus: { vit: 18, str: 12 },
    description: "거인의 어깨에 얹혔던 멍에. 별빛 잔영이 그 무게를 자기 결로 옮겨 온 자리. 두르면 어깨가 가라앉지 않는다. 마지막에 자기 발로 선 자만 허락된 결.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  deep_orb: {
    name: "수심의 메아리 보주",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+15" },
      { label: "속도", value: "+15" },
    ],
    bonus: { dex: 15, spd: 15 },
    description: "수심의 것이 가장 깊은 곳에서 한 점씩 모아 두었던 결. 손에 쥐면 발 끝의 결이 흐르듯 가벼워진다. 마지막 한 음절을 끊은 자에게만 허락된 결.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  gate_bar: {
    name: "성문의 빗장",
    slot: "accessory",
    stats: [
      { label: "공격력", value: "+15" },
      { label: "행운", value: "+18" },
    ],
    bonus: { atk: 15, luk: 18 },
    description: "성문지기 자동인형이 마지막으로 들었다가 떨군 빗장. 한 손에 쥐면 한 번에 두 박자를 끊을 수 있다. 빗장을 마지막으로 내린 자에게만 허락된 결.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,

  // 창공의 옥새 — 창공의 주재 협동 legend 티어 1% 드랍 (만렙 정점 물욕템).
  // accessory 슬롯, 천공인의 관 위의 전스탯 + 양면 분포.
  apex_regalia: {
    name: "창공의 옥새",
    slot: "accessory",
    stats: [
      { label: "공격력", value: "+10" },
      { label: "방어력", value: "+10" },
      { label: "힘", value: "+5" },
      { label: "민첩", value: "+5" },
      { label: "활력", value: "+5" },
      { label: "속도", value: "+5" },
      { label: "행운", value: "+5" },
    ],
    bonus: { atk: 10, def: 10, str: 5, dex: 5, vit: 5, spd: 5, luk: 5 },
    description: "창공의 주재가 옥좌에 두고 떠난 옥새. 한 손에 별 한 자루의 무게가 그대로 실린다. 마지막에 닿은 자에게만 허락된 결.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,

  // ── 태고의 노룡 (월드 보스) 보상 — 용의 둥지에서 모든 모험가가 깎아 잡는 어미의 결. ──
  // gold/epic 티어 도달자에게 equipRolls 로 직접 떨어지는 무구 4종 (no debuff, BiS급).
  // legend 티어 도달자에게는 그 위 액세서리 한 자루(태고의 비늘관) — 운빨.
  primordial_blade: {
    name: "태고의 결검",
    slot: "weapon",
    stats: [
      { label: "공격력", value: "+28" },
      { label: "힘", value: "+14" },
      { label: "속도", value: "+5" },
    ],
    bonus: { atk: 28, str: 14, spd: 5 },
    description: "태고의 노룡의 가장 안쪽 비늘을 깎아 결을 잡은 한손 대검. 들면 어깨에 옛 시대의 무게가 그대로 얹히면서, 그 결이 칼날 끝까지 흐른다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  primordial_aegis: {
    name: "태고의 결갑",
    slot: "armor",
    stats: [
      { label: "방어력", value: "+24" },
      { label: "활력", value: "+14" },
      { label: "힘", value: "+6" },
    ],
    bonus: { def: 24, vit: 14, str: 6 },
    description: "태고의 노룡의 가슴 비늘을 그대로 뜯어 두른 두꺼운 갑주. 어떤 결도 안으로 닿지 못한다. 어미의 무게가 가슴에 그대로 얹혀 있다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  primordial_helm: {
    name: "태고의 결관",
    slot: "accessory",
    stats: [
      { label: "방어력", value: "+11" },
      { label: "활력", value: "+9" },
      { label: "힘", value: "+6" },
    ],
    bonus: { def: 11, vit: 9, str: 6 },
    description: "태고의 노룡의 머리뼈 결을 그대로 깎아 두른 투구. 한 번 쓰면 어미가 잠시 자네의 어깨에 한 결을 얹는다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  primordial_cloak: {
    name: "태고의 잿빛 망토",
    slot: "accessory",
    stats: [
      { label: "민첩", value: "+10" },
      { label: "속도", value: "+10" },
      { label: "활력", value: "+8" },
      { label: "방어력", value: "+5" },
    ],
    bonus: { dex: 10, spd: 10, vit: 8, def: 5 },
    description: "태고의 노룡의 등에서 흘러내린 잿빛 비늘을 가는 가닥으로 풀어 짠 망토. 두르면 어깨가 가벼워지고, 동시에 어디로도 흔들리지 않는다.",
    rarity: "unique",
    tier: 5,
  } satisfies EquipItem,
  // 태고의 비늘관 — legend 티어 5% 드랍 (월드 보스 정점 물욕템).
  // accessory 슬롯, 창공의 옥새 위의 전스탯 — 운빨로 한 자루.
  primordial_regalia: {
    name: "태고의 비늘관",
    slot: "accessory",
    stats: [
      { label: "공격력", value: "+12" },
      { label: "방어력", value: "+12" },
      { label: "힘", value: "+6" },
      { label: "민첩", value: "+6" },
      { label: "활력", value: "+6" },
      { label: "속도", value: "+6" },
      { label: "행운", value: "+6" },
    ],
    bonus: { atk: 12, def: 12, str: 6, dex: 6, vit: 6, spd: 6, luk: 6 },
    description: "태고의 노룡이 마지막에 떨군 가장 안쪽 비늘 한 장을 그대로 둘러 만든 관. 한 자루로는 닿을 수 없는 결. 모든 모험가의 누적 데미지로 어미를 쓰러뜨려야만 자네의 손에 들린다.",
    rarity: "legendary",
    tier: 5,
  } satisfies EquipItem,

  // 6막 「별을 잊은 것」 — 잊힌 봉인 legend 랜덤 롤 장신구. base 는 옵션 없음(bonus 생략):
  // 실제 옵션(힘·활력·민첩·속도·행운 중 2개 × 1~20)은 드랍 시 인스턴스마다 롤되어 박힌다
  // (starlitRing.ts / EquipmentInstance.rolledBonus). 거래 가능 — 거래소가 인스턴스(롤 포함)
  // 거래를 지원하면서 좋은 롤을 사고팔 수 있다(거래소 instance_payload).
  starlit_ring: {
    name: "별빛 고리",
    slot: "accessory",
    stats: [{ label: "랜덤 옵션", value: "2종 · 각 +1~20" }],
    // base 는 옵션 없음 — 실제 bonus 는 인스턴스 rolledBonus 가 채운다(resolveStarlitRing).
    // 빈 객체라도 둬야 ITEMS 유니온 전 항목이 bonus 키를 가져 타입이 일관된다.
    bonus: {},
    description:
      "잊힌 봉인이 흘린 결을 고리로 엮은 것. 손가락에 둘러질 때마다 다른 결이 깃들어, 같은 고리는 둘도 없다.",
    rarity: "legendary",
    tier: 6,
    tradable: true,
  } satisfies EquipItem,
} as const;
