import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const COLORED_DARK_FILL =
  /dark:bg-(amber|orange|yellow|red|rose|violet|purple|indigo|blue|sky|cyan|teal|emerald|green|lime)-(900|950)(?:\/\d+)?/;
const BROAD_CONTAINER_PADDING =
  /(?:\bp-(?:2\.5|[3-8])\b|\bpx-[2-8]\b.*\bpy-(?:1\.5|2\.5|[2-8])\b)/;

function broadColoredDarkSurfaceFindings(paths: readonly string[]): string[] {
  return paths.flatMap((path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");
    const lines = source.split("\n");
    return lines.flatMap((line, index) => {
      const precedingLines = lines.slice(Math.max(0, index - 12), index + 1);
      const nearestClassNameIndex = precedingLines.findLastIndex((candidate) =>
        candidate.includes("className"),
      );
      const classContext = line.includes("className")
        ? line
        : precedingLines.slice(Math.max(0, nearestClassNameIndex)).join(" ");
      const isBroadColoredSurface =
        COLORED_DARK_FILL.test(line) &&
        BROAD_CONTAINER_PADDING.test(classContext) &&
        !classContext.includes("ui-game-button") &&
        !classContext.includes("ui-reward-flash") &&
        !classContext.includes("ui-semantic-fill");
      return isBroadColoredSurface
        ? [`${path}:${index + 1}: ${line.trim()}`]
        : [];
    });
  });
}

function expectNoBroadColoredDarkSurface(paths: readonly string[]) {
  expect(broadColoredDarkSurfaceFindings(paths)).toEqual([]);
}

const NON_GAME_COMPONENTS = new Set([
  "src/components/AdminImpersonationBanner.tsx",
  "src/components/AppLaunchSplash.tsx",
  "src/components/CreateCharacterForm.tsx",
  "src/components/DeleteAccountModal.tsx",
  "src/components/PolicyDocument.tsx",
  "src/components/ServiceWorkerRegistrar.tsx",
  "src/components/StaleBuildAutoReload.tsx",
  "src/components/VersionCheck.tsx",
]);

function tsxFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return tsxFilesUnder(path);
    if (!entry.isFile() || !entry.name.endsWith(".tsx")) return [];
    return [relative(process.cwd(), path)];
  });
}

function gameplaySurfacePaths(): string[] {
  return [
    ...tsxFilesUnder(resolve(process.cwd(), "src/adventure")),
    ...tsxFilesUnder(resolve(process.cwd(), "src/components")),
  ].filter(
    (path) =>
      !path.endsWith(".test.tsx") &&
      !path.endsWith(".stories.tsx") &&
      !NON_GAME_COMPONENTS.has(path),
  );
}

describe("dark gameplay surface audit", () => {
  it("캐릭터·장비·전투·성장 화면의 큰 표면은 중립색이다", () => {
    expectNoBroadColoredDarkSurface([
      "src/components/ui/LoadErrorBanner.tsx",
      "src/components/ChatPanel.tsx",
      "src/components/chat/ChatRoomManager.tsx",
      "src/adventure/character/GrowthShrineView.tsx",
      "src/adventure/v2/StormExpeditionAutoPlanDialog.tsx",
      "src/adventure/v2/MasteryCertificateUseModal.tsx",
      "src/adventure/v2/V2EnhanceView.tsx",
      "src/adventure/v2/V2LoadoutPresetsPanel.tsx",
      "src/adventure/v2/V2LoadoutPanel.tsx",
      "src/adventure/v2/V2DungeonList.tsx",
      "src/adventure/v2/V2CombatPatternView.tsx",
      "src/adventure/v2/V2SkillLearnView.tsx",
      "src/adventure/v2/EquipmentCodexBulkDialog.tsx",
      "src/adventure/v2/V2CharacterScreen.tsx",
      "src/adventure/v2/V2QuestView.tsx",
      "src/adventure/v2/V2ArenaView.tsx",
      "src/adventure/v2/ActivityVerificationGate.tsx",
      "src/adventure/v2/V2DungeonFloorView.tsx",
      "src/adventure/v2/V2MasteryTowerView.tsx",
      "src/adventure/v2/inventory/RareMapsTab.tsx",
      "src/adventure/v2/item-card/V2ItemCompareCard.tsx",
      "src/adventure/v2/item-card/V2ItemCardPopover.tsx",
      "src/adventure/v2/PlayerSanctionGate.tsx",
      "src/adventure/v2/CodexEquipmentPanel.tsx",
    ]);
  });

  it("생활·경제·보상·시장 화면의 큰 표면은 중립색이다", () => {
    expectNoBroadColoredDarkSurface([
      "src/adventure/v2/LifeWorkshopView.tsx",
      "src/adventure/v2/V2MarketplaceView.tsx",
      "src/adventure/v2/marketplace/EquipmentBuyOrderDialog.tsx",
      "src/adventure/v2/AdventurerFarmPanel.tsx",
      "src/adventure/v2/LifeRequestBoard.tsx",
      "src/adventure/v2/FishingView.tsx",
      "src/adventure/v2/LifeFieldPanels.tsx",
      "src/adventure/v2/WoodcuttingView.tsx",
      "src/adventure/v2/MiningView.tsx",
      "src/adventure/v2/coop/V2CoopBossListView.tsx",
      "src/adventure/v2/coop/V2CoopBossDetailView.tsx",
      "src/adventure/v2/cooking/CookingResearchPanel.tsx",
    ]);
  });

  it("길드·소셜 화면의 큰 표면은 중립색이다", () => {
    expectNoBroadColoredDarkSurface([
      "src/adventure/v2/guild/GuildExplorationPanel.tsx",
      "src/adventure/v2/guild/WorkshopDismantlePanel.tsx",
      "src/adventure/v2/guild/WorkshopGrowthPanel.tsx",
      "src/adventure/v2/guild/GuildTrainingGroundPanel.tsx",
      "src/adventure/v2/guild/GuildDiningHallPanel.tsx",
      "src/adventure/v2/guild/GuildTradePostPanel.tsx",
      "src/adventure/v2/guild/GuildMembersPanel.tsx",
      "src/adventure/v2/guild/ArtisanLeaderboardPanel.tsx",
      "src/adventure/v2/guild/WorkshopCraftPanel.tsx",
      "src/adventure/v2/guild/GuildManagePanel.tsx",
    ]);
  });

  it("게임 UI 전체에 검토되지 않은 큰 색상 표면이 없다", () => {
    expectNoBroadColoredDarkSurface(gameplaySurfacePaths());
  });
});
