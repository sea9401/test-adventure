import { describe, expect, it } from "vitest";
import {
  GUILD_WORKSHOP_RECIPES,
  guildWorkshopRecipeMaterialCost,
} from "@/adventure/data/v2/guildWorkshop";
import {
  GUILD_WORKSHOP_MATERIAL_ID,
  rollGuildWorkshopMaterialDrops,
} from "@/adventure/data/v2/guildWorkshopMaterials";
import {
  MONSTER_CRAFT_MATERIAL_ID,
  rollMonsterCraftMaterialDrops,
} from "@/adventure/data/v2/monsterCraftMaterials";
import { enemiesForDepth, isHuntStageDepth } from "@/adventure/data/v2/dungeon";
import { COOP_BOSS_MATERIAL_ID } from "@/adventure/data/v2/coopRewards";
import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import { STORM_EXPEDITION_ROUTE_MATERIAL_ID } from "@/adventure/data/v2/stormExpeditionRewards";
import { WOODCUTTING_MATERIAL_ID } from "@/adventure/data/v2/woodcuttingSpots";
import { workshopMaterialSource } from "./workshopMaterialSources";

describe("제작소 재료 입수처", () => {
  it("벌목과 채광 재료를 실제 채집 지점으로 안내한다", () => {
    expect(workshopMaterialSource(WOODCUTTING_MATERIAL_ID.pine)).toEqual({
      known: true,
      label: "벌목 · 솔바람 소나무숲",
      href: "/character/life",
    });
    expect(workshopMaterialSource(MINING_MATERIAL_ID.iron)).toEqual({
      known: true,
      label: "채광 · 회색바위 철 채석장",
      href: "/character/life",
    });
  });

  it("공용·몬스터·협동 보스·폭풍 원정 재료를 실제 콘텐츠로 안내한다", () => {
    expect(
      workshopMaterialSource(GUILD_WORKSHOP_MATERIAL_ID.refinedIron),
    ).toEqual({
      known: true,
      label: "필드 사냥 · 마른 협곡~얼음 호수",
      href: "/battle/dungeon/8",
    });
    expect(
      workshopMaterialSource(
        MONSTER_CRAFT_MATERIAL_ID.caveSpiderVenomGland,
      ),
    ).toEqual({
      known: true,
      label: "심층 동굴 · 동굴 거미",
      href: "/battle/dungeon/20",
    });
    expect(
      workshopMaterialSource(COOP_BOSS_MATERIAL_ID.canyon_predator),
    ).toEqual({
      known: true,
      label: "협동 보스 · 스콜피온 킹",
      href: "/battle/coop",
    });
    expect(
      workshopMaterialSource(STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale),
    ).toEqual({
      known: true,
      label: "폭풍 원정 · 칼바람 항로",
      href: "/battle/storm-expedition",
    });
  });

  it.each([
    [GUILD_WORKSHOP_MATERIAL_ID.refinedIron, 8],
    [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard, 20],
    [GUILD_WORKSHOP_MATERIAL_ID.sunstone, 32],
    [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal, 44],
    [GUILD_WORKSHOP_MATERIAL_ID.abyssalStarsteel, 66],
    [MONSTER_CRAFT_MATERIAL_ID.sparkScorpionConductiveSac, 8],
    [MONSTER_CRAFT_MATERIAL_ID.caveSpiderVenomGland, 20],
    [MONSTER_CRAFT_MATERIAL_ID.rockGolemResonantCore, 20],
    [MONSTER_CRAFT_MATERIAL_ID.abyssWormBurrowingJaw, 20],
    [MONSTER_CRAFT_MATERIAL_ID.starlightGatekeeperLuminousCore, 26],
    [MONSTER_CRAFT_MATERIAL_ID.poisonMistSpiritToxicCore, 32],
    [MONSTER_CRAFT_MATERIAL_ID.voidBeastShadowClaw, 38],
    [MONSTER_CRAFT_MATERIAL_ID.plateauSlayerSerratedBone, 56],
    [MONSTER_CRAFT_MATERIAL_ID.lightningOracleThunderRunestone, 62],
    [MONSTER_CRAFT_MATERIAL_ID.trenchApostlePrayerCore, 68],
  ])(
    "%s 입수처는 재료가 실제 드랍되는 사냥 단계 %i로 바로 연결한다",
    (materialId, depth) => {
      const source = workshopMaterialSource(materialId);
      expect(source.href).toBe(`/battle/dungeon/${depth}`);
      expect(isHuntStageDepth(depth)).toBe(true);
      const dropTables = [
        rollGuildWorkshopMaterialDrops(depth, () => 0),
        ...enemiesForDepth(depth).map((enemy) =>
          rollMonsterCraftMaterialDrops(enemy.key, () => 0),
        ),
      ];
      expect(dropTables.some((drops) => drops[materialId] > 0)).toBe(true);
    },
  );

  it("등록되지 않은 재료는 잘못된 입수처 대신 거래소 확인을 안내한다", () => {
    expect(workshopMaterialSource("unknown-material")).toEqual({
      known: false,
      label: "거래소 또는 관련 콘텐츠 보상 확인",
      href: "/plaza/market",
    });
    expect(workshopMaterialSource("toString")).toEqual({
      known: false,
      label: "거래소 또는 관련 콘텐츠 보상 확인",
      href: "/plaza/market",
    });
  });

  it("현재 모든 제작 레시피 재료에 실제 입수처가 등록돼 있다", () => {
    for (const recipe of Object.values(GUILD_WORKSHOP_RECIPES)) {
      for (const materialId of Object.keys(
        guildWorkshopRecipeMaterialCost(recipe),
      )) {
        expect(
          workshopMaterialSource(materialId),
          `${recipe.id}: ${materialId}`,
        ).toMatchObject({ known: true });
      }
    }
  });
});
