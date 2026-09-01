import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const COLORED_DARK_FILL =
  /dark:bg-(amber|orange|yellow|red|rose|violet|purple|indigo|blue|sky|cyan|teal|emerald|green|lime)-(900|950)(?:\/\d+)?/;
const BROAD_CONTAINER_PADDING =
  /(?:\bp-(?:2|2\.5|[3-8])\b|\bpx-[2-8]\b.*\bpy-(?:1|1\.5|2\.5|[2-8])\b)/;
const TRANSLUCENT_SURFACE_FILL =
  /(?:^|\s)(?:dark:)?(?:bg-white|bg-(?:zinc|amber|sky)-\d+)\/(?:[1-9]\d?)(?:\s|$)/;

const REVIEWED_SEMANTIC_FILL_EXEMPTIONS: ReadonlyArray<{
  path: string;
  fragment: string;
  reason: string;
}> = [
  {
    path: "src/adventure/battle/BattleLogList.tsx",
    fragment: "${sizes.banner}",
    reason: "전투 로그 안에서만 쓰는 한 줄 단계 발동 배너다.",
  },
  {
    path: "src/adventure/v2/RewardNotice.tsx",
    fragment: "ui-reward-flash",
    reason: "짧게 나타나는 단일 행 보상 알림이다.",
  },
  {
    path: "src/adventure/v2/BatchSummaryCard.tsx",
    fragment: "ui-reward-flash",
    reason: "일괄 처리 직후 잠깐 표시되는 압축 보상 결과다.",
  },
  {
    path: "src/adventure/v2/DiscoveryNotice.tsx",
    fragment: "ui-reward-flash",
    reason: "발견 직후 잠깐 표시되는 압축 상태 알림이다.",
  },
  {
    path: "src/adventure/v2/HuntResultCard.tsx",
    fragment: "ui-reward-flash",
    reason: "사냥 결과 카드 내부의 압축 보상 플래시다.",
  },
  {
    path: "src/adventure/v2/HpBar.tsx",
    fragment: "canHunt ?",
    reason: "카드 표면이 아니라 HP 진행 미터의 채움 색이다.",
  },
  {
    path: "src/adventure/v2/V2AttendanceView.tsx",
    fragment: "rounded-lg bg-emerald-100 p-2",
    reason: "출석 카드의 고정 크기 아이콘 타일이다.",
  },
  {
    path: "src/adventure/v2/V2CouponView.tsx",
    fragment: "rounded-lg bg-amber-100 p-2",
    reason: "쿠폰 카드의 고정 크기 아이콘 타일이다.",
  },
  {
    path: "src/adventure/v2/V2CharacterCard.tsx",
    fragment: "flex min-w-0 items-center gap-1.5",
    reason: "캐릭터 카드 안의 한 줄짜리 시간제 효과 배지다.",
  },
  {
    path: "src/adventure/v2/guild/GuildTradePostPanel.tsx",
    fragment: "border-cyan-700 bg-cyan-50",
    reason: "교역 카드 안의 단일 행 빠른 납품 액션 버튼이다.",
  },
];

function isReviewedSemanticFill(path: string, classContext: string): boolean {
  return REVIEWED_SEMANTIC_FILL_EXEMPTIONS.some(
    (exemption) =>
      exemption.path === path &&
      exemption.reason.length > 0 &&
      classContext.includes(exemption.fragment),
  );
}

function classOwnerTag(classContext: string): string | null {
  const classNameIndex = classContext.lastIndexOf("className");
  const prefix = classContext.slice(0, classNameIndex);
  const openingTag = prefix.slice(prefix.lastIndexOf("<"));
  return openingTag.match(/^<([A-Za-z][\w.]*)\b/)?.[1] ?? null;
}

function isCompactSemanticElement(classContext: string): boolean {
  const tag = classOwnerTag(classContext);
  return (
    tag === "span" ||
    tag === "button" ||
    tag === "Link" ||
    (tag != null && /^[A-Z]/.test(tag)) ||
    /\b(?:size-\d+|h-\d+\s+w-\d+)\b.*\b(?:place-items-center|items-center)\b/.test(
      classContext,
    ) ||
    /\bh-(?:1|1\.5|2)\b.*\boverflow-hidden\b.*\brounded-full\b/.test(
      classContext,
    )
  );
}

function broadColoredDarkSurfaceFindings(paths: readonly string[]): string[] {
  return paths.flatMap((path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");
    const lines = source.split("\n");
    return lines.flatMap((line, index) => {
      const precedingLines = lines.slice(Math.max(0, index - 12), index + 1);
      const classContext = precedingLines.join(" ");
      const isBroadColoredSurface =
        COLORED_DARK_FILL.test(line) &&
        BROAD_CONTAINER_PADDING.test(classContext) &&
        !isCompactSemanticElement(classContext) &&
        !isReviewedSemanticFill(path, classContext);
      return isBroadColoredSurface
        ? [`${path}:${index + 1}: ${line.trim()}`]
        : [];
    });
  });
}

function broadTranslucentSurfaceFindings(paths: readonly string[]): string[] {
  return paths.flatMap((path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");
    const lines = source.split("\n");
    return lines.flatMap((line, index) => {
      const precedingLines = lines.slice(Math.max(0, index - 12), index + 1);
      const classContext = precedingLines.join(" ");
      return TRANSLUCENT_SURFACE_FILL.test(line) &&
        BROAD_CONTAINER_PADDING.test(classContext) &&
        !isCompactSemanticElement(classContext)
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

  it("검토한 화면의 넓은 카드 표면은 라이트·다크 모두 불투명하다", () => {
    expect(
      broadTranslucentSurfaceFindings([
        "src/adventure/character/GrowthShrineView.tsx",
        "src/adventure/v2/FishingDailyChallengeView.tsx",
        "src/adventure/v2/FishingView.tsx",
        "src/adventure/rankings/RankingsView.tsx",
      ]),
    ).toEqual([]);
  });
});
