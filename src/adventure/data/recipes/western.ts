import { ITEMS } from "../items";
import type { Recipe } from "./types";

export const WESTERN_RECIPES: Recipe[] = [
  // ── 서편 옛길 (서편 옛길 / 옛 변경 성채 / 옛 성문지기) ─────────────────────
  // 옛길 입문 2종은 옛길 잡몹 drop, 옛 변경 성채 3종 + 업그레이드 3종은 성채 잡몹 drop,
  // 수비대 무구 4종은 옛 성문지기 보스 recipe_one_of, 성문지기의 핵은 보스 0.15.
  {
    id: "crow_feather_cap",
    name: "까마귀깃 두건 제작법",
    description: `${ITEMS.crow_feather_cap.name}을(를) 만든다. 들까마귀 깃을 이어 두건 모양으로 짓는다.`,
    ingredients: [{ kind: "material", materialId: "raven_feather", count: 5 }],
    result: { kind: "equipment", itemId: "crow_feather_cap", slot: "armor" },
    variance: { spd: 1 },
  },
  {
    id: "roadbandit_shortsword",
    name: "노상강도의 단검 제작서",
    description: `${ITEMS.roadbandit_shortsword.name}을(를) 만든다. 들고양이 송곳니로 손잡이를 감고 짧은 날을 댄다.`,
    ingredients: [
      { kind: "material", materialId: "wilddog_fang", count: 4 },
      { kind: "material", materialId: "raven_feather", count: 3 },
    ],
    result: { kind: "equipment", itemId: "roadbandit_shortsword", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "garrison_hauberk",
    name: "수비대 사슬갑옷 제작서",
    description: `${ITEMS.garrison_hauberk.name}을(를) 만든다. 녹슨 쇳조각을 다시 엮어 사슬을 짠다.`,
    ingredients: [{ kind: "material", materialId: "scrap_iron", count: 6 }],
    result: { kind: "equipment", itemId: "garrison_hauberk", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "geared_warpick",
    name: "톱니 전곡괭이 단조서",
    description: `${ITEMS.geared_warpick.name}을(를) 만든다. 자동인형의 톱니와 강철판으로 곡괭이 머리를 벼린다.`,
    ingredients: [{ kind: "material", materialId: "scrap_iron", count: 6 }],
    result: { kind: "equipment", itemId: "geared_warpick", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "tattered_standard_cloak",
    name: "낡은 군기 망토 직조서",
    description: `${ITEMS.tattered_standard_cloak.name}을(를) 만든다. 옛 군기 조각을 기워 망토로 두른다.`,
    ingredients: [{ kind: "material", materialId: "war_banner_scrap", count: 5 }],
    result: { kind: "equipment", itemId: "tattered_standard_cloak", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "roadbandit_falchion",
    name: "노상강도의 활검 제작서",
    description: `${ITEMS.roadbandit_falchion.name}을(를) 만든다. ${ITEMS.roadbandit_shortsword.name}에 녹슨 쇳조각을 덧대 날을 길게 늘이고 굽힌다.`,
    ingredients: [
      { kind: "equip", itemId: "roadbandit_shortsword", count: 1 },
      { kind: "material", materialId: "wilddog_fang", count: 10 },
      { kind: "material", materialId: "scrap_iron", count: 4 },
    ],
    result: { kind: "equipment", itemId: "roadbandit_falchion", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "reinforced_garrison_hauberk",
    name: "보강한 수비대 사슬갑옷 제작서",
    description: `${ITEMS.reinforced_garrison_hauberk.name}을(를) 만든다. ${ITEMS.garrison_hauberk.name}에 녹슨 쇳조각으로 가슴판을 덧대고 옛 군기 조각으로 안감을 받친다.`,
    ingredients: [
      { kind: "equip", itemId: "garrison_hauberk", count: 1 },
      { kind: "material", materialId: "scrap_iron", count: 12 },
      { kind: "material", materialId: "war_banner_scrap", count: 4 },
    ],
    result: { kind: "equipment", itemId: "reinforced_garrison_hauberk", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "frontier_standard_cloak",
    name: "변경 군기 망토 직조서",
    description: `${ITEMS.frontier_standard_cloak.name}을(를) 만든다. ${ITEMS.tattered_standard_cloak.name}에 또 다른 군기 조각을 겹쳐 기운다.`,
    ingredients: [
      { kind: "equip", itemId: "tattered_standard_cloak", count: 1 },
      { kind: "material", materialId: "war_banner_scrap", count: 14 },
    ],
    result: { kind: "equipment", itemId: "frontier_standard_cloak", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "garrison_blade",
    name: "수비대 도검 단조서",
    description: `${ITEMS.garrison_blade.name}을(를) 만든다. 옛 성문지기의 강철판을 옛 군기 조각으로 손잡이를 감아 벼린다.`,
    ingredients: [
      { kind: "material", materialId: "scrap_iron", count: 8 },
      { kind: "material", materialId: "war_banner_scrap", count: 6 },
    ],
    result: { kind: "equipment", itemId: "garrison_blade", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "garrison_bulwark",
    name: "수비대 방패 단조서",
    description: `${ITEMS.garrison_bulwark.name}을(를) 만든다. 옛 성문지기의 빗장을 옛 군기 조각으로 손잡이를 받쳐 두른다.`,
    ingredients: [
      { kind: "material", materialId: "scrap_iron", count: 8 },
      { kind: "material", materialId: "war_banner_scrap", count: 6 },
    ],
    result: { kind: "equipment", itemId: "garrison_bulwark", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "garrison_glaive",
    name: "수비대 미늘창 단조서",
    description: `${ITEMS.garrison_glaive.name}을(를) 만든다. 옛 성문지기의 톱니를 깎아 긴 창대에 미늘로 박는다.`,
    ingredients: [
      { kind: "material", materialId: "scrap_iron", count: 8 },
      { kind: "material", materialId: "war_banner_scrap", count: 6 },
    ],
    result: { kind: "equipment", itemId: "garrison_glaive", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "garrison_cudgel",
    name: "수비대 철퇴 단조서",
    description: `${ITEMS.garrison_cudgel.name}을(를) 만든다. 옛 성문지기의 강철판을 뭉쳐 머리를 달고 자루를 박는다.`,
    ingredients: [
      { kind: "material", materialId: "scrap_iron", count: 8 },
      { kind: "material", materialId: "war_banner_scrap", count: 6 },
    ],
    result: { kind: "equipment", itemId: "garrison_cudgel", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "gatekeeper_core",
    name: "성문지기의 핵 세공서",
    description: `${ITEMS.gatekeeper_core.name}을(를) 만든다. 옛 성문지기의 가슴에서 꺼낸 강철 핵을 녹슨 쇳조각으로 감싸 다듬는다.`,
    ingredients: [
      { kind: "material", materialId: "scrap_iron", count: 6 },
      { kind: "material", materialId: "war_banner_scrap", count: 4 },
    ],
    result: { kind: "equipment", itemId: "gatekeeper_core", slot: "accessory" },
    variance: { vit: 1 },
  },
  {
    id: "crows_hoard_engraving",
    name: "까마귀 둥지 부적 새김서",
    description: `${ITEMS.corvid_fortune_charm.name}을(를) 만든다. ${ITEMS.crows_hoard_charm.name}에 녹슨 동전과 톱니를 더 엮어 무겁게 한다.`,
    ingredients: [
      { kind: "equip", itemId: "crows_hoard_charm", count: 1 },
      { kind: "material", materialId: "scrap_iron", count: 6 },
    ],
    result: { kind: "equipment", itemId: "corvid_fortune_charm", slot: "accessory" },
    variance: { luk: 1 },
    tradable: false,
  },

];
