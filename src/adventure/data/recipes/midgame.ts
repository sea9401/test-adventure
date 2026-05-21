import { ITEMS } from "../items";
import type { Recipe } from "./types";

export const MIDGAME_RECIPES: Recipe[] = [
  // ── 중간 단계 제작 라인 — 그동안 퀘스트/판매 외엔 안 쓰이던 재료에 제작 destination 부여 ──
  {
    id: "soul_blade",
    name: "혼백검 제작서",
    description: `${ITEMS.soul_blade.name}을(를) 만든다. 영혼 결정을 칼날 안에 가두고 폐허 잔해로 자루를 다진다.`,
    ingredients: [
      { kind: "material", materialId: "soul_crystal", count: 2 },
      { kind: "material", materialId: "ruin_fragment", count: 3 },
      { kind: "material", materialId: "hard_crystal", count: 3 },
    ],
    result: { kind: "equipment", itemId: "soul_blade", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "sancho_vest",
    name: "산초 누비 조끼 제작법",
    description: `${ITEMS.sancho_vest.name}을(를) 만든다. 말린 산초꽃을 천 사이에 누벼 넣고 단단한 가죽으로 테를 두른다.`,
    ingredients: [
      { kind: "material", materialId: "sancho_blossom", count: 4 },
      { kind: "material", materialId: "tough_hide", count: 3 },
      { kind: "material", materialId: "slime_chunk", count: 8 },
    ],
    result: { kind: "equipment", itemId: "sancho_vest", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "windmana_charm",
    name: "바람 마석 부적 세공법",
    description: `${ITEMS.windmana_charm.name}을(를) 만든다. 바람 마석을 가는 끈에 꿰고 요정가루로 봉한다.`,
    ingredients: [
      { kind: "material", materialId: "wind_mana_stone", count: 3 },
      { kind: "material", materialId: "fairy_dust", count: 3 },
      { kind: "material", materialId: "spider_silk", count: 4 },
    ],
    result: { kind: "equipment", itemId: "windmana_charm", slot: "accessory" },
    variance: { spd: 1 },
  },
  {
    id: "wolfking_fang_dagger",
    name: "늑대왕 송곳니 단검 제작서",
    description: `${ITEMS.wolfking_fang_dagger.name}을(를) 만든다. 무리장의 송곳니를 자루에 박고 들개 송곳니로 날을 세운다.`,
    ingredients: [
      { kind: "material", materialId: "wolf_king_fang", count: 1 },
      { kind: "material", materialId: "wilddog_fang", count: 6 },
      { kind: "material", materialId: "tough_hide", count: 4 },
    ],
    result: { kind: "equipment", itemId: "wolfking_fang_dagger", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "hawkfeather_cloak",
    name: "매깃 망토 직조법",
    description: `${ITEMS.hawkfeather_cloak.name}을(를) 만든다. 초원 매 깃털을 들소 가죽 테에 한 장씩 이어 짠다.`,
    ingredients: [
      { kind: "material", materialId: "hawk_feather", count: 5 },
      { kind: "material", materialId: "bison_hide", count: 3 },
      { kind: "material", materialId: "spider_silk", count: 6 },
    ],
    result: { kind: "equipment", itemId: "hawkfeather_cloak", slot: "armor" },
    variance: { spd: 1 },
  },

  // ── 기존 장비 → 한 단계 위 장비 업그레이드 라인 (베이스를 'equip' 재료로 소비) ──
  // 베이스 1개 + 같은 구간 재료를 들여 같은 한 자루를 끌어올린다. nailed_baseball_bat / fairy_blessing 와 같은 방식.
  // 명품(unique) 업그레이드는 결과도 unique·비거래 — "손에 맞춰진 보물".
  {
    id: "reinforced_leather_armor",
    name: "덧댄 가죽갑옷 제작법",
    description: `${ITEMS.reinforced_leather_armor.name}을(를) 만든다. ${ITEMS.old_leather_armor.name}에 들개 가죽을 덧대 두텁게 누빈다.`,
    ingredients: [
      { kind: "equip", itemId: "old_leather_armor", count: 1 },
      { kind: "material", materialId: "wilddog_hide", count: 5 },
    ],
    result: { kind: "equipment", itemId: "reinforced_leather_armor", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "bandit_chief_dagger",
    name: "두목의 단검 제작서",
    description: `${ITEMS.bandit_chief_dagger.name}을(를) 만든다. ${ITEMS.bandit_dagger.name}에 단단한 수정을 박아 날을 다시 세운다.`,
    ingredients: [
      { kind: "equip", itemId: "bandit_dagger", count: 1 },
      { kind: "material", materialId: "hard_crystal", count: 4 },
    ],
    result: { kind: "equipment", itemId: "bandit_chief_dagger", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "nymph_blessing",
    name: "호수 님프의 가호 제작서",
    description: `${ITEMS.nymph_blessing.name}을(를) 만든다. ${ITEMS.nymph_ring.name}에 요정가루를 입혀 가호를 깊게 한다.`,
    ingredients: [
      { kind: "equip", itemId: "nymph_ring", count: 1 },
      { kind: "material", materialId: "fairy_dust", count: 5 },
    ],
    result: { kind: "equipment", itemId: "nymph_blessing", slot: "accessory" },
    variance: { spd: 1 },
  },
  {
    id: "reforged_golem_hammer",
    name: "재단조한 골렘 망치 제작서",
    description: `${ITEMS.reforged_golem_hammer.name}을(를) 만든다. ${ITEMS.golem_hammer.name}을(를) 마정석으로 다시 벼리고 폐허 잔해로 자루를 보강한다.`,
    ingredients: [
      { kind: "equip", itemId: "golem_hammer", count: 1 },
      { kind: "material", materialId: "mana_crystal", count: 8 },
      { kind: "material", materialId: "ruin_fragment", count: 8 },
    ],
    result: { kind: "equipment", itemId: "reforged_golem_hammer", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "wraithking_cloak",
    name: "망령왕의 망토 제작서",
    description: `${ITEMS.wraithking_cloak.name}을(를) 만든다. ${ITEMS.wraith_cloak.name}에 영혼 결정을 엮어 넣어 한기를 깊게 한다.`,
    ingredients: [
      { kind: "equip", itemId: "wraith_cloak", count: 1 },
      { kind: "material", materialId: "soul_crystal", count: 10 },
    ],
    result: { kind: "equipment", itemId: "wraithking_cloak", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "lava_core_greatmaul",
    name: "용암핵 대망치 단조서",
    description: `${ITEMS.lava_core_greatmaul.name}을(를) 만든다. ${ITEMS.lava_core_maul.name}에 용암 핵을 더 녹여 붓고 화염 비늘로 자루를 감싼다.`,
    ingredients: [
      { kind: "equip", itemId: "lava_core_maul", count: 1 },
      { kind: "material", materialId: "lava_core", count: 12 },
      { kind: "material", materialId: "flame_scale", count: 8 },
    ],
    result: { kind: "equipment", itemId: "lava_core_greatmaul", slot: "weapon" },
    variance: { atk: 1 },
    tradable: false,
  },
  {
    id: "azure_talon",
    name: "창천의 발톱 세공서",
    description: `${ITEMS.azure_talon.name}을(를) 만든다. ${ITEMS.sky_render_talon.name}에 초원 매 깃털을 겹겹이 둘러 균형을 잡는다.`,
    ingredients: [
      { kind: "equip", itemId: "sky_render_talon", count: 1 },
      { kind: "material", materialId: "hawk_feather", count: 8 },
    ],
    result: { kind: "equipment", itemId: "azure_talon", slot: "weapon" },
    variance: { atk: 1 },
    tradable: false,
  },
  {
    id: "spider_queen_silk_plate",
    name: "거미여왕의 비단 정갑 직조서",
    description: `${ITEMS.spider_queen_silk_plate.name}을(를) 만든다. ${ITEMS.spider_queen_silk_robe.name}을(를) 거미줄로 더 곱게 짜 올린다.`,
    ingredients: [
      { kind: "equip", itemId: "spider_queen_silk_robe", count: 1 },
      { kind: "material", materialId: "spider_silk", count: 24 },
    ],
    result: { kind: "equipment", itemId: "spider_queen_silk_plate", slot: "armor" },
    variance: { luk: 1 },
    tradable: false,
  },
  {
    id: "bat_swarm_guide",
    name: "박쥐떼의 인도자 세공서",
    description: `${ITEMS.bat_swarm_guide.name}을(를) 만든다. ${ITEMS.bat_swarm_charm.name}에 박쥐 눈알을 박아 어둠을 더 멀리 읽게 한다.`,
    ingredients: [
      { kind: "equip", itemId: "bat_swarm_charm", count: 1 },
      { kind: "material", materialId: "bat_eye", count: 16 },
    ],
    result: { kind: "equipment", itemId: "bat_swarm_guide", slot: "accessory" },
    variance: { spd: 1 },
    tradable: false,
  },
  {
    id: "phoenix_flight_cape",
    name: "봉황 비행깃 망토 직조서",
    description: `${ITEMS.phoenix_flight_cape.name}을(를) 만든다. ${ITEMS.flame_eagle_cape.name}에 봉황 깃털을 더 이어 짜 비행깃을 살린다.`,
    ingredients: [
      { kind: "equip", itemId: "flame_eagle_cape", count: 1 },
      { kind: "material", materialId: "phoenix_feather", count: 10 },
    ],
    result: { kind: "equipment", itemId: "phoenix_flight_cape", slot: "armor" },
    variance: { spd: 1 },
  },
  {
    id: "mole_king_borer",
    name: "두더지왕의 굴착드릴 개조서",
    description: `${ITEMS.mole_king_borer.name}을(를) 만든다. ${ITEMS.mole_king_drill.name}에 단단한 수정 날과 마정석 동력부를 단다.`,
    // hard_crystal 20→12: 이 라인 외에 마나 시리즈 4종이 같은 재료 ×8 씩 쓰는데, 거기에 더해
    // 20개는 ~500킬. 12 로 줄여 ~300킬 — 유실된 명품 업그레이드라 적당히 노력 보존.
    ingredients: [
      { kind: "equip", itemId: "mole_king_drill", count: 1 },
      { kind: "material", materialId: "hard_crystal", count: 12 },
      { kind: "material", materialId: "mana_crystal", count: 10 },
    ],
    result: { kind: "equipment", itemId: "mole_king_borer", slot: "weapon" },
    variance: { atk: 1 },
    tradable: false,
  },

];
