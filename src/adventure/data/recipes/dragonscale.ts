import { ITEMS } from "../items";
import type { Recipe } from "./types";

export const DRAGONSCALE_RECIPES: Recipe[] = [
  // ── 용비늘 라인 (뼈무덤 황야 / 용비늘 묘지 / 뼈비늘 노룡) ─────────────────
  // 황야 입문 2종(잡몹 드랍 제작서) → 묘지 잡몹산 3종(잡몹 드랍 제작서) → 뼈비늘 노룡 보스 보상
  // (잡몹산 3종 업그레이드 + 뼈왕의 대검 + 용지기의 망토). 별·회랑 라인과 같은 tier 5 영역이지만
  // 방어/활력 비중이 훨씬 높다. 업그레이드 라인은 베이스를 'equip' 재료로 소비.
  {
    id: "bonescale_buckler",
    name: "뼈비늘 손방패 제작서",
    description: `${ITEMS.bonescale_buckler.name}을(를) 만든다. 황야의 뼛조각과 용비늘 가루를 짜 가볍게 두른다.`,
    ingredients: [
      { kind: "material", materialId: "scale_dust", count: 6 },
      { kind: "material", materialId: "scrap_iron", count: 4 },
    ],
    result: { kind: "equipment", itemId: "bonescale_buckler", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "barrow_traveler_armor",
    name: "황야 행자 갑옷 제작법",
    description: `${ITEMS.barrow_traveler_armor.name}을(를) 만든다. 두꺼운 가죽 안감에 용비늘 가루를 다져 넣는다.`,
    ingredients: [
      { kind: "material", materialId: "tough_hide", count: 4 },
      { kind: "material", materialId: "scale_dust", count: 8 },
    ],
    result: { kind: "equipment", itemId: "barrow_traveler_armor", slot: "armor" },
    variance: { def: 1 },
  },
  // 묘지 잡몹산 3종 — Lv75 사냥터 드랍.
  {
    id: "dragonbone_kite_shield",
    name: "용골 카이트 방패 제작서",
    description: `${ITEMS.dragonbone_kite_shield.name}을(를) 만든다. 묘지에서 거둔 용골을 잘라 길쭉한 방패 형태로 두른다.`,
    ingredients: [
      { kind: "material", materialId: "dragonscale_shard", count: 4 },
      { kind: "material", materialId: "scale_dust", count: 10 },
      { kind: "material", materialId: "scrap_iron", count: 6 },
    ],
    result: { kind: "equipment", itemId: "dragonbone_kite_shield", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "scaleguard_plate",
    name: "비늘 보호갑 제작법",
    description: `${ITEMS.scaleguard_plate.name}을(를) 만든다. 용비늘 조각을 비늘 모양 그대로 강철 안감에 누벼 댄다.`,
    ingredients: [
      { kind: "material", materialId: "dragonscale_shard", count: 5 },
      { kind: "material", materialId: "scrap_iron", count: 8 },
      { kind: "material", materialId: "scale_dust", count: 6 },
    ],
    result: { kind: "equipment", itemId: "scaleguard_plate", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "bonerune_helm",
    name: "뼈각인 투구 제작서",
    description: `${ITEMS.bonerune_helm.name}을(를) 만든다. 용골을 갈아 옛 보호의 결을 한 줄 새기고 강철 투구로 굳힌다.`,
    ingredients: [
      { kind: "material", materialId: "bone_rune_steel", count: 2 },
      { kind: "material", materialId: "dragonscale_shard", count: 3 },
      { kind: "material", materialId: "scrap_iron", count: 4 },
    ],
    result: { kind: "equipment", itemId: "bonerune_helm", slot: "accessory" },
    variance: { def: 1 },
  },
  // 뼈비늘 노룡 보스 보상 — 업그레이드 3종 + 뼈왕의 대검 + 용지기의 망토.
  {
    id: "dragonscale_aegis",
    name: "용비늘 영광 방패 제작서",
    description: `${ITEMS.dragonscale_aegis.name}을(를) 만든다. ${ITEMS.dragonbone_kite_shield.name}의 골격에 노룡의 비늘을 한 겹 더 얹고 뼈각인 강철로 결을 다시 잡는다.`,
    ingredients: [
      { kind: "equip", itemId: "dragonbone_kite_shield", count: 1 },
      { kind: "material", materialId: "dragonscale_shard", count: 5 },
      { kind: "material", materialId: "bone_rune_steel", count: 3 },
    ],
    result: { kind: "equipment", itemId: "dragonscale_aegis", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "dragonscale_plate",
    name: "용비늘 흉갑 제작법",
    description: `${ITEMS.dragonscale_plate.name}을(를) 만든다. ${ITEMS.scaleguard_plate.name} 위에 노룡의 가슴 비늘을 가공해 한 겹 더 덧댄다.`,
    ingredients: [
      { kind: "equip", itemId: "scaleguard_plate", count: 1 },
      { kind: "material", materialId: "dragonscale_shard", count: 6 },
      { kind: "material", materialId: "bone_rune_steel", count: 3 },
    ],
    result: { kind: "equipment", itemId: "dragonscale_plate", slot: "armor" },
    variance: { def: 1 },
  },
  {
    id: "dragonscale_helm",
    name: "용비늘 투구 제작서",
    description: `${ITEMS.dragonscale_helm.name}을(를) 만든다. ${ITEMS.bonerune_helm.name} 위로 노룡의 두골 비늘을 한 겹 더 두른다.`,
    ingredients: [
      { kind: "equip", itemId: "bonerune_helm", count: 1 },
      { kind: "material", materialId: "dragonscale_shard", count: 4 },
      { kind: "material", materialId: "bone_rune_steel", count: 2 },
    ],
    result: { kind: "equipment", itemId: "dragonscale_helm", slot: "accessory" },
    variance: { def: 1 },
  },
  {
    id: "boneking_greatsword",
    name: "뼈왕의 대검 제작서",
    description: `${ITEMS.boneking_greatsword.name}을(를) 만든다. 노룡의 등뼈를 통째로 깎아 손잡이를 박고 뼈각인 강철로 칼날을 단조한다.`,
    ingredients: [
      { kind: "material", materialId: "bone_rune_steel", count: 4 },
      { kind: "material", materialId: "dragonscale_shard", count: 4 },
      { kind: "material", materialId: "scrap_iron", count: 10 },
    ],
    result: { kind: "equipment", itemId: "boneking_greatsword", slot: "weapon" },
    variance: { atk: 1 },
  },
  {
    id: "wyrm_warden_cloak",
    name: "용지기의 망토 제작법",
    description: `${ITEMS.wyrm_warden_cloak.name}을(를) 만든다. 노룡의 잿빛 비늘을 가는 가닥으로 풀어 짠다.`,
    ingredients: [
      { kind: "material", materialId: "dragonscale_shard", count: 4 },
      { kind: "material", materialId: "scale_dust", count: 8 },
      { kind: "material", materialId: "bone_rune_steel", count: 2 },
    ],
    result: { kind: "equipment", itemId: "wyrm_warden_cloak", slot: "armor" },
    variance: { def: 1 },
  },
];
