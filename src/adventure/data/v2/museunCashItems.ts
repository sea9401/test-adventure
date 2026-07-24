import { ADVENTURE_SUPPORT_PASS } from "./adventureSupport";

export const MUSEUN_COIN_WALLET_KEY = "museun-coin-wallet.v1";
export const MUSEUN_COIN_SHOP_MAX_PURCHASE_QUANTITY = 99;

export const MUSEUN_CASH_ITEMS = {
  profile_image_permit: {
    id: "profile_image_permit",
    name: "프로필 이미지 변경권",
    description:
      "JPG·PNG·WebP 이미지를 직접 등록해 프로필 이미지를 한 번 변경할 수 있습니다. 구매 후 가방에 보관되며 사용 전에는 거래소에서 거래할 수 있습니다.",
    coinPrice: 500,
    delivery: "inventory",
    tradeable: true,
    effect: { kind: "profile_image" },
  },
  rename_permit: {
    id: "rename_permit",
    name: "개명 허가증",
    description:
      "캐릭터 이름을 한 번 변경할 수 있습니다. 구매 후 가방에 보관되며 거래소에서 거래할 수 있습니다.",
    coinPrice: 400,
    delivery: "inventory",
    tradeable: true,
    effect: { kind: "rename" },
  },
  adventure_support_30d: {
    id: "adventure_support_30d",
    name: "월간 모험 지원권 (30일)",
    description:
      "사용한 시점부터 월간 모험 지원 혜택이 30일 연장됩니다. 구매 후 가방에 보관되며 거래소에서 거래할 수 있습니다.",
    coinPrice: ADVENTURE_SUPPORT_PASS.coinPrice,
    delivery: "inventory",
    tradeable: true,
    effect: {
      kind: "adventure_support",
      days: ADVENTURE_SUPPORT_PASS.durationDays,
    },
  },
  prismatic_profile_border: {
    id: "prismatic_profile_border",
    name: "프리즘 프로필 꾸미기",
    description:
      "캐릭터 프로필 카드 바깥에 흐르는 프리즘 테두리와 상단 배경에 오팔빛 광휘를 적용합니다. 해금 후 30일간 사용할 수 있으며 계정에 귀속됩니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "prismatic" },
  },
  infernal_profile_border: {
    id: "infernal_profile_border",
    name: "업화 프로필 꾸미기",
    description:
      "캐릭터 프로필 카드 바깥에 붉은 불꽃 테두리를, 상단 배경에 피어오르는 불씨를 적용합니다. 해금 후 30일간 사용할 수 있으며 계정에 귀속됩니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "infernal" },
  },
  oceanic_profile_border: {
    id: "oceanic_profile_border",
    name: "심해 프로필 꾸미기",
    description:
      "캐릭터 프로필 카드 바깥에 푸른 물결 테두리를, 상단 배경에 움직이는 물빛·기포를 적용합니다. 해금 후 30일간 사용할 수 있으며 계정에 귀속됩니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "oceanic" },
  },
  verdant_profile_border: {
    id: "verdant_profile_border",
    name: "세계수 프로필 꾸미기",
    description:
      "캐릭터 프로필 카드 바깥에 생명의 테두리를, 상단 배경에 덩굴·잎사귀를 적용합니다. 해금 후 30일간 사용할 수 있으며 계정에 귀속됩니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "verdant" },
  },
  celestial_profile_border: {
    id: "celestial_profile_border",
    name: "천상 프로필 꾸미기",
    description:
      "캐릭터 프로필 카드 바깥에 금빛 테두리를, 상단 배경에 성운·별자리 전용 연출을 적용합니다. 해금 후 30일간 사용할 수 있으며 계정에 귀속됩니다.",
    coinPrice: 500,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "celestial" },
  },
  obsidian_profile_border: {
    id: "obsidian_profile_border",
    name: "흑요석 프로필 꾸미기",
    description:
      "캐릭터 프로필 카드 바깥에 검붉은 테두리를, 상단 배경에 빛나는 용암 균열을 적용합니다. 해금 후 30일간 사용할 수 있으며 계정에 귀속됩니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "obsidian" },
  },
  frozen_profile_border: {
    id: "frozen_profile_border",
    name: "빙결 프로필 꾸미기",
    description:
      "캐릭터 프로필 카드 바깥에 얼음 테두리를, 상단 배경에 흩날리는 서리·눈 결정을 적용합니다. 해금 후 30일간 사용할 수 있으며 계정에 귀속됩니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "frozen" },
  },
  storm_profile_border: {
    id: "storm_profile_border",
    name: "폭풍 프로필 꾸미기",
    description:
      "캐릭터 프로필 카드 바깥에 폭풍 테두리를, 상단 배경에 먹구름·번개 섬광을 적용합니다. 해금 후 30일간 사용할 수 있으며 계정에 귀속됩니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "storm" },
  },
  rose_profile_border: {
    id: "rose_profile_border",
    name: "장미 프로필 꾸미기",
    description:
      "캐릭터 프로필 카드 바깥에 장미빛 테두리를, 상단 배경에 흩날리는 꽃잎을 적용합니다. 해금 후 30일간 사용할 수 있으며 계정에 귀속됩니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "rose" },
  },
  royal_profile_border: {
    id: "royal_profile_border",
    name: "황실 프로필 꾸미기",
    description:
      "캐릭터 프로필 카드 바깥에 황금·자색 테두리를, 상단 배경에 움직이는 황실 문양을 적용합니다. 해금 후 30일간 사용할 수 있으며 계정에 귀속됩니다.",
    coinPrice: 500,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "royal" },
  },
  iron_profile_border: {
    id: "iron_profile_border",
    name: "철제 프로필 꾸미기",
    description:
      "캐릭터 프로필 카드에 무광 철제 단색 테두리를 적용하는 기본형 꾸미기입니다. 해금 후 30일간 사용할 수 있으며 계정에 귀속됩니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "iron" },
  },
  bronze_profile_border: {
    id: "bronze_profile_border",
    name: "청동 프로필 꾸미기",
    description:
      "캐릭터 프로필 카드에 무광 청동 단색 테두리를 적용하는 기본형 꾸미기입니다. 해금 후 30일간 사용할 수 있으며 계정에 귀속됩니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "bronze" },
  },
  sapphire_profile_border: {
    id: "sapphire_profile_border",
    name: "사파이어 프로필 꾸미기",
    description:
      "캐릭터 프로필 카드에 사파이어 단색 테두리를 적용하는 기본형 꾸미기입니다. 해금 후 30일간 사용할 수 있으며 계정에 귀속됩니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "sapphire" },
  },
  amethyst_profile_border: {
    id: "amethyst_profile_border",
    name: "자수정 프로필 꾸미기",
    description:
      "캐릭터 프로필 카드에 자수정 단색 테두리를 적용하는 기본형 꾸미기입니다. 해금 후 30일간 사용할 수 있으며 계정에 귀속됩니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "amethyst" },
  },
  jade_profile_border: {
    id: "jade_profile_border",
    name: "비취 프로필 꾸미기",
    description:
      "캐릭터 프로필 카드에 비취 단색 테두리를 적용하는 기본형 꾸미기입니다. 해금 후 30일간 사용할 수 있으며 계정에 귀속됩니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "jade" },
  },
  starlight_chat_badge: {
    id: "starlight_chat_badge",
    name: "별빛 채팅 배지",
    description:
      "전체·길드 채팅의 닉네임 앞에 별빛 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "starlight" },
  },
  crown_chat_badge: {
    id: "crown_chat_badge",
    name: "왕관 채팅 배지",
    description:
      "채팅의 닉네임 앞에 왕관 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "crown" },
  },
  flame_chat_badge: {
    id: "flame_chat_badge",
    name: "불꽃 채팅 배지",
    description:
      "채팅의 닉네임 앞에 불꽃 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "flame" },
  },
  crystal_chat_badge: {
    id: "crystal_chat_badge",
    name: "수정 채팅 배지",
    description:
      "채팅의 닉네임 앞에 수정 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "crystal" },
  },
  leaf_chat_badge: {
    id: "leaf_chat_badge",
    name: "새싹 채팅 배지",
    description:
      "채팅의 닉네임 앞에 새싹 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "leaf" },
  },
  sword_chat_badge: {
    id: "sword_chat_badge",
    name: "검 채팅 배지",
    description:
      "채팅의 닉네임 앞에 검 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "sword" },
  },
  shield_chat_badge: {
    id: "shield_chat_badge",
    name: "방패 채팅 배지",
    description:
      "채팅의 닉네임 앞에 방패 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "shield" },
  },
  trophy_chat_badge: {
    id: "trophy_chat_badge",
    name: "트로피 채팅 배지",
    description:
      "채팅의 닉네임 앞에 트로피 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "trophy" },
  },
  moon_chat_badge: {
    id: "moon_chat_badge",
    name: "달빛 채팅 배지",
    description:
      "채팅의 닉네임 앞에 달빛 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "moon" },
  },
  sun_chat_badge: {
    id: "sun_chat_badge",
    name: "태양 채팅 배지",
    description:
      "채팅의 닉네임 앞에 태양 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "sun" },
  },
  heart_chat_badge: {
    id: "heart_chat_badge",
    name: "하트 채팅 배지",
    description:
      "채팅의 닉네임 앞에 하트 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "heart" },
  },
  skull_chat_badge: {
    id: "skull_chat_badge",
    name: "해골 채팅 배지",
    description:
      "채팅의 닉네임 앞에 해골 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "skull" },
  },
  lightning_chat_badge: {
    id: "lightning_chat_badge",
    name: "번개 채팅 배지",
    description:
      "채팅의 닉네임 앞에 번개 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "lightning" },
  },
  snowflake_chat_badge: {
    id: "snowflake_chat_badge",
    name: "눈꽃 채팅 배지",
    description:
      "채팅의 닉네임 앞에 눈꽃 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "snowflake" },
  },
  paw_chat_badge: {
    id: "paw_chat_badge",
    name: "발자국 채팅 배지",
    description:
      "채팅의 닉네임 앞에 발자국 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "paw" },
  },
  feather_chat_badge: {
    id: "feather_chat_badge",
    name: "깃털 채팅 배지",
    description:
      "채팅의 닉네임 앞에 깃털 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "feather" },
  },
  anchor_chat_badge: {
    id: "anchor_chat_badge",
    name: "닻 채팅 배지",
    description:
      "채팅의 닉네임 앞에 닻 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "anchor" },
  },
  music_chat_badge: {
    id: "music_chat_badge",
    name: "음표 채팅 배지",
    description:
      "채팅의 닉네임 앞에 음표 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "music" },
  },
  clover_chat_badge: {
    id: "clover_chat_badge",
    name: "네잎클로버 채팅 배지",
    description:
      "채팅의 닉네임 앞에 네잎클로버 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "clover" },
  },
  star_chat_badge: {
    id: "star_chat_badge",
    name: "별 채팅 배지",
    description:
      "채팅의 닉네임 앞에 별 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "star" },
  },
  vein_chat_badge: {
    id: "vein_chat_badge",
    name: "광맥 채팅 배지",
    description:
      "채팅의 닉네임 앞에 광맥 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "vein" },
  },
  fish_chat_badge: {
    id: "fish_chat_badge",
    name: "물고기 채팅 배지",
    description:
      "채팅의 닉네임 앞에 물고기 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "fish" },
  },
  axe_chat_badge: {
    id: "axe_chat_badge",
    name: "도끼 채팅 배지",
    description:
      "채팅의 닉네임 앞에 도끼 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "axe" },
  },
  hammer_chat_badge: {
    id: "hammer_chat_badge",
    name: "망치 채팅 배지",
    description:
      "채팅의 닉네임 앞에 망치 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "hammer" },
  },
  alchemy_chat_badge: {
    id: "alchemy_chat_badge",
    name: "연금술 채팅 배지",
    description:
      "채팅의 닉네임 앞에 연금술 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "alchemy" },
  },
  compass_chat_badge: {
    id: "compass_chat_badge",
    name: "나침반 채팅 배지",
    description:
      "채팅의 닉네임 앞에 나침반 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "compass" },
  },
  dragon_eye_chat_badge: {
    id: "dragon_eye_chat_badge",
    name: "용안 채팅 배지",
    description:
      "채팅의 닉네임 앞에 용안 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "dragon_eye" },
  },
  five_elements_chat_badge: {
    id: "five_elements_chat_badge",
    name: "오원소 문장 채팅 배지",
    description:
      "채팅의 닉네임 앞에 오원소 문장 배지를 해금하고 30일간 사용할 수 있습니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "five_elements" },
  },
  cosmetic_extension_30d: {
    id: "cosmetic_extension_30d",
    name: "꾸미기 30일 연장권",
    description:
      "도감에 해금된 닉네임 꾸미기, 프로필 꾸미기 또는 채팅 배지 한 종류의 사용 기간을 30일 연장합니다. 사용 전에는 거래소에 등록할 수 있습니다.",
    coinPrice: 400,
    delivery: "inventory",
    tradeable: true,
    effect: { kind: "cosmetic_extension", days: 30 },
  },
  profile_border_box: {
    id: "profile_border_box",
    name: "프로필 꾸미기 상자",
    description:
      "미보유 프로필 꾸미기 한 종류를 등급별 확률로 해금하고 30일 사용 기간을 받습니다. 일반 등급은 테두리형이며 높은 등급일수록 상단 배경 연출이 풍부해집니다.",
    coinPrice: 300,
    delivery: "inventory",
    tradeable: true,
    effect: { kind: "profile_border_box" },
  },
  chat_badge_box: {
    id: "chat_badge_box",
    name: "채팅 배지 상자",
    description:
      "미보유 채팅 배지 한 종류를 등급별 확률로 해금하고 30일 사용 기간을 받습니다. 중복은 나오지 않으며, 사용 전에는 거래소에 등록할 수 있습니다.",
    coinPrice: 200,
    delivery: "inventory",
    tradeable: true,
    effect: { kind: "chat_badge_box" },
  },
  chroma_name_box: {
    id: "chroma_name_box",
    name: "닉네임 꾸미기 상자",
    description:
      "미보유 닉네임 색상 또는 특수 효과 한 종류를 등급별 확률로 해금하고 30일 사용 기간을 받습니다. 중복은 나오지 않으며, 사용 전에는 거래소에 등록할 수 있습니다.",
    coinPrice: 200,
    delivery: "inventory",
    tradeable: true,
    effect: { kind: "chroma_name_box" },
  },
} as const;

export type MuseunCashItemId = keyof typeof MUSEUN_CASH_ITEMS;
export type MuseunCashItemCounts = Partial<Record<MuseunCashItemId, number>>;

export const MUSEUN_CASH_ITEM_IDS = Object.keys(
  MUSEUN_CASH_ITEMS,
) as MuseunCashItemId[];

export type MuseunInventoryItemId = {
  [K in MuseunCashItemId]: (typeof MUSEUN_CASH_ITEMS)[K]["delivery"] extends "inventory"
    ? K
    : never;
}[MuseunCashItemId];

export const MUSEUN_INVENTORY_ITEM_IDS = MUSEUN_CASH_ITEM_IDS.filter(
  (id): id is MuseunInventoryItemId =>
    MUSEUN_CASH_ITEMS[id].delivery === "inventory",
);

export const MUSEUN_COSMETIC_BOX_ITEM_IDS = [
  "chroma_name_box",
  "profile_border_box",
  "chat_badge_box",
] as const satisfies readonly MuseunInventoryItemId[];

export type MuseunCosmeticBoxItemId =
  (typeof MUSEUN_COSMETIC_BOX_ITEM_IDS)[number];

export const MUSEUN_COSMETIC_INVENTORY_ITEM_IDS = [
  "cosmetic_extension_30d",
  ...MUSEUN_COSMETIC_BOX_ITEM_IDS,
] as const satisfies readonly MuseunInventoryItemId[];

export function isMuseunCosmeticBoxItemId(
  value: unknown,
): value is MuseunCosmeticBoxItemId {
  return (
    typeof value === "string" &&
    (MUSEUN_COSMETIC_BOX_ITEM_IDS as readonly string[]).includes(value)
  );
}

// 인벤토리 소모품 화면에는 실제 소비성 편의 아이템만 남긴다. 꾸미기 상자와
// 연장권은 설정 > 꾸미기에서 사용하고, 거래소에서는 기존처럼 판매할 수 있다.
export const MUSEUN_UTILITY_ITEM_IDS = MUSEUN_INVENTORY_ITEM_IDS.filter(
  (id) =>
    !(MUSEUN_COSMETIC_INVENTORY_ITEM_IDS as readonly string[]).includes(id),
);

// 상점에서는 사용 가능한 아이템만 직접 판매한다. 꾸미기는 각 전용 상자에서 해금되고
// 통합 연장권으로 사용 기간을 늘린다.
export const MUSEUN_SHOP_ITEM_IDS = MUSEUN_INVENTORY_ITEM_IDS;
export type MuseunShopItemId = MuseunInventoryItemId;

export function isMuseunShopItemId(value: unknown): value is MuseunShopItemId {
  return (
    typeof value === "string" &&
    (MUSEUN_SHOP_ITEM_IDS as readonly string[]).includes(value)
  );
}

export const MUSEUN_TRADEABLE_ITEM_IDS = MUSEUN_INVENTORY_ITEM_IDS.filter(
  (id) => MUSEUN_CASH_ITEMS[id].tradeable === true,
);

export function isMuseunCashItemId(value: unknown): value is MuseunCashItemId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(MUSEUN_CASH_ITEMS, value)
  );
}

export function isTradeableMuseunCashItemId(
  value: unknown,
): value is MuseunInventoryItemId {
  return (
    isMuseunCashItemId(value) && MUSEUN_CASH_ITEMS[value].tradeable === true
  );
}

export function isMuseunInventoryItemId(
  value: unknown,
): value is MuseunInventoryItemId {
  return (
    isMuseunCashItemId(value) &&
    MUSEUN_CASH_ITEMS[value].delivery === "inventory"
  );
}

export function parseMuseunCashItems(value: unknown): MuseunCashItemCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const out: MuseunCashItemCounts = {};
  for (const id of MUSEUN_INVENTORY_ITEM_IDS) {
    const count = Math.floor(Number(raw[id]));
    if (Number.isFinite(count) && count > 0) out[id] = count;
  }
  return out;
}

export function addMuseunCashItem(
  value: unknown,
  itemId: MuseunCashItemId,
  quantity: number,
): MuseunCashItemCounts {
  const items = parseMuseunCashItems(value);
  if (!isMuseunInventoryItemId(itemId)) return items;
  const add = Math.max(0, Math.floor(Number(quantity) || 0));
  if (add > 0) items[itemId] = (items[itemId] ?? 0) + add;
  return items;
}

export function removeMuseunCashItem(
  value: unknown,
  itemId: MuseunCashItemId,
  quantity: number,
): MuseunCashItemCounts | null {
  const items = parseMuseunCashItems(value);
  if (!isMuseunInventoryItemId(itemId)) return null;
  const remove = Math.max(0, Math.floor(Number(quantity) || 0));
  const held = items[itemId] ?? 0;
  if (remove <= 0 || held < remove) return null;
  const left = held - remove;
  if (left > 0) items[itemId] = left;
  else delete items[itemId];
  return items;
}

export function parseMuseunCoinBalance(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const coins = Math.floor(Number((value as { coins?: unknown }).coins));
  return Number.isFinite(coins) ? Math.max(0, coins) : 0;
}

export function parseMuseunCoinShopPurchaseQuantity(
  value: unknown,
): number | null {
  const quantity = Number(value);
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MUSEUN_COIN_SHOP_MAX_PURCHASE_QUANTITY
  ) {
    return null;
  }
  return quantity;
}

export function maxMuseunCoinShopPurchaseQuantity(
  coins: number,
  unitPrice: number,
): number {
  const safeCoins = Math.max(0, Math.floor(Number(coins) || 0));
  const safePrice = Math.floor(Number(unitPrice) || 0);
  if (safePrice <= 0) return 0;
  return Math.min(
    MUSEUN_COIN_SHOP_MAX_PURCHASE_QUANTITY,
    Math.floor(safeCoins / safePrice),
  );
}
