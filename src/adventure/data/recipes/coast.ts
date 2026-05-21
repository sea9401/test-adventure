import { ITEMS } from "../items";
import type { Recipe } from "./types";

export const COAST_RECIPES: Recipe[] = [
  // ── 해안 지선 (조수 갯벌 / 산호초 섬 / 수심의 것) ─────────────────────────
  // 갯벌 입문 2종은 갯벌 잡몹 drop, 산호초 섬 3종 + 업그레이드 3종은 섬 잡몹 drop,
  // 심연 무구 4종은 수심의 것 보스 recipe_one_of, 수심의 핵은 보스 0.15.
  {
    id: "crab_shell_buckler",
    name: "게딱지 손방패 제작법",
    description: `${ITEMS.crab_shell_buckler.name}을(를) 만든다. 집게발 게의 등딱지를 깎아 손잡이를 댄다.`,
    ingredients: [{ kind: "material", materialId: "crab_shell", count: 6 }],
    result: { kind: "equipment", itemId: "crab_shell_buckler", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "tideflats_waders",
    name: "갯벌 각반 제작법",
    description: `${ITEMS.tideflats_waders.name}을(를) 만든다. 게딱지 조각을 정강이에 누벼 감싼다.`,
    ingredients: [{ kind: "material", materialId: "crab_shell", count: 8 }],
    result: { kind: "equipment", itemId: "tideflats_waders", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "coral_spine_dagger",
    name: "산호 가시 단검 제작서",
    description: `${ITEMS.coral_spine_dagger.name}을(를) 만든다. 부러진 산호 가시를 갈아 자루에 박는다.`,
    ingredients: [{ kind: "material", materialId: "coral_spine", count: 6 }],
    result: { kind: "equipment", itemId: "coral_spine_dagger", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "siren_scale_robe",
    name: "사이렌 비늘 로브 직조서",
    description: `${ITEMS.siren_scale_robe.name}을(를) 만든다. 산호초 사이렌의 비늘을 이어 짠다.`,
    ingredients: [{ kind: "material", materialId: "deep_scale", count: 6 }],
    result: { kind: "equipment", itemId: "siren_scale_robe", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "tideglass_charm",
    name: "조수유리 부적 세공서",
    description: `${ITEMS.tideglass_charm.name}을(를) 만든다. 심해 비늘과 산호 조각을 가는 끈에 엮는다.`,
    ingredients: [
      { kind: "material", materialId: "deep_scale", count: 3 },
      { kind: "material", materialId: "coral_spine", count: 3 },
    ],
    result: { kind: "equipment", itemId: "tideglass_charm", slot: "accessory" },
    variance: { vit: 1 },
  },
  {
    id: "crustacean_bulwark",
    name: "갑각 보루방패 제작서",
    description: `${ITEMS.crustacean_bulwark.name}을(를) 만든다. ${ITEMS.crab_shell_buckler.name}에 더 큰 갑각판과 산호 가시를 덧대 보루처럼 키운다.`,
    ingredients: [
      { kind: "equip", itemId: "crab_shell_buckler", count: 1 },
      { kind: "material", materialId: "crab_shell", count: 10 },
      { kind: "material", materialId: "coral_spine", count: 4 },
    ],
    result: { kind: "equipment", itemId: "crustacean_bulwark", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "barbed_coral_dagger",
    name: "가시 산호 단검 제작서",
    description: `${ITEMS.barbed_coral_dagger.name}을(를) 만든다. ${ITEMS.coral_spine_dagger.name}에 잔가시를 더 박아 넣는다.`,
    ingredients: [
      { kind: "equip", itemId: "coral_spine_dagger", count: 1 },
      { kind: "material", materialId: "coral_spine", count: 12 },
    ],
    result: { kind: "equipment", itemId: "barbed_coral_dagger", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "siren_song_mantle",
    name: "사이렌 노래 망토 직조서",
    description: `${ITEMS.siren_song_mantle.name}을(를) 만든다. ${ITEMS.siren_scale_robe.name}에 심해 비늘을 더 이어 짠다.`,
    ingredients: [
      { kind: "equip", itemId: "siren_scale_robe", count: 1 },
      { kind: "material", materialId: "deep_scale", count: 14 },
    ],
    result: { kind: "equipment", itemId: "siren_song_mantle", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "abyssal_edge",
    name: "심연 칼날 단조서",
    description: `${ITEMS.abyssal_edge.name}을(를) 만든다. 수심의 것의 비늘을 산호 가시와 함께 벼린다.`,
    ingredients: [
      { kind: "material", materialId: "deep_scale", count: 8 },
      { kind: "material", materialId: "coral_spine", count: 6 },
    ],
    result: { kind: "equipment", itemId: "abyssal_edge", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "abyssal_ward",
    name: "심연 방벽 단조서",
    description: `${ITEMS.abyssal_ward.name}을(를) 만든다. 수심의 것의 등딱지를 산호 가시로 받쳐 둘러친다.`,
    ingredients: [
      { kind: "material", materialId: "deep_scale", count: 8 },
      { kind: "material", materialId: "coral_spine", count: 6 },
    ],
    result: { kind: "equipment", itemId: "abyssal_ward", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "abyssal_pike",
    name: "심연 장창 단조서",
    description: `${ITEMS.abyssal_pike.name}을(를) 만든다. 수심의 것의 가시뼈를 깎아 긴 창대에 박는다.`,
    ingredients: [
      { kind: "material", materialId: "deep_scale", count: 8 },
      { kind: "material", materialId: "coral_spine", count: 6 },
    ],
    result: { kind: "equipment", itemId: "abyssal_pike", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "abyssal_clasp",
    name: "심연 손아귀 단조서",
    description: `${ITEMS.abyssal_clasp.name}을(를) 만든다. 수심의 것의 발톱뼈를 손등에 박아 너클로 엮는다.`,
    ingredients: [
      { kind: "material", materialId: "deep_scale", count: 8 },
      { kind: "material", materialId: "coral_spine", count: 6 },
    ],
    result: { kind: "equipment", itemId: "abyssal_clasp", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "abyssal_heart",
    name: "수심의 핵 세공서",
    description: `${ITEMS.abyssal_heart.name}을(를) 만든다. 수심의 것의 가슴에서 꺼낸 차가운 핵을 심해 비늘로 감싼다.`,
    ingredients: [
      { kind: "material", materialId: "deep_scale", count: 6 },
      { kind: "material", materialId: "coral_spine", count: 4 },
    ],
    result: { kind: "equipment", itemId: "abyssal_heart", slot: "accessory" },
    variance: { vit: 1 },
  },
  {
    id: "tidelord_signet_engraving",
    name: "조수군주의 인장 새김서",
    description: `${ITEMS.tidelord_signet.name}을(를) 만든다. ${ITEMS.drowned_signet.name}에 심해 비늘을 녹여 새 문장을 새겨 넣는다.`,
    ingredients: [
      { kind: "equip", itemId: "drowned_signet", count: 1 },
      { kind: "material", materialId: "deep_scale", count: 6 },
    ],
    result: { kind: "equipment", itemId: "tidelord_signet", slot: "accessory" },
    variance: { luk: 1 },
    tradable: false,
  },

];
