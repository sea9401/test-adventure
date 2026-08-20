import type { CodexMasteryCatalog } from "@/adventure/data/v2/codexMasteryCatalog";
import type {
  CodexResearchSeasonTrophyHistory,
  CodexResearchSeasonTrophyMetadata,
} from "@/adventure/data/v2/codexResearchRanking";
import type { ProfileMasteryTrophyDisplay } from "@/adventure/profile/profileShowcase";
import type { CodexMasteryProgress } from "@/adventure/data/v2/codexMasteryTypes";
import {
  codexMasteryTrophyDefinition,
  evaluateCodexMasteryTrophies,
  type CodexMasteryTrophyHistory,
  type CodexMasteryTrophyTier,
} from "@/adventure/data/v2/codexMasteryTrophies";

const TIER_LABELS: Record<CodexMasteryTrophyTier, string> = {
  bronze: "동",
  silver: "은",
  gold: "금",
  platinum: "백금",
  diamond: "다이아",
  legendary: "전설",
};

export type CodexMasteryTrophyOption = {
  id: string;
  kind: "mastery";
  category: "equipment" | "fish" | "monster" | "cooking" | "life" | "job" | "overall";
  title: string;
  desc: string;
  points: 0;
  badgeTier: CodexMasteryTrophyTier;
  unlocked: boolean;
  currentTier: CodexMasteryTrophyTier | null;
  nextTier: CodexMasteryTrophyTier | null;
  progress: { current: number; required: number } | null;
  tierAchievedAt: Partial<Record<CodexMasteryTrophyTier, string>>;
};

export type CodexResearchTrophyOption = {
  id: string;
  kind: "research";
  category: "research";
  title: string;
  desc: string;
  points: 0;
  badgeTier: CodexMasteryTrophyTier;
  unlocked: true;
  currentTier: CodexMasteryTrophyTier;
  nextTier: null;
  progress: null;
  tierAchievedAt: Partial<Record<CodexMasteryTrophyTier, string>>;
  season: CodexResearchSeasonTrophyMetadata;
};

export type CodexTrophyOption =
  | CodexMasteryTrophyOption
  | CodexResearchTrophyOption;

export function buildCodexResearchTrophyOptions(
  history: readonly CodexResearchSeasonTrophyHistory[],
): CodexResearchTrophyOption[] {
  return history.map((item) => ({
    id: item.trophyId,
    kind: "research",
    category: "research",
    title: item.seasonMetadata.themeName,
    desc: `${item.seasonMetadata.seasonId} · 최종 ${item.seasonMetadata.finalRank}위 · ${item.seasonMetadata.score.toLocaleString("ko-KR")}점`,
    points: 0,
    badgeTier: item.currentTier,
    unlocked: true,
    currentTier: item.currentTier,
    nextTier: null,
    progress: null,
    tierAchievedAt: { ...item.tierAchievedAt },
    season: structuredClone(item.seasonMetadata),
  }));
}

export function buildCodexMasteryTrophyOptions({
  catalog,
  progressRows,
  history,
  now,
  catalogVersion,
}: {
  catalog: CodexMasteryCatalog;
  progressRows: readonly CodexMasteryProgress[];
  history: readonly CodexMasteryTrophyHistory[];
  now: Date;
  catalogVersion: number;
}): CodexMasteryTrophyOption[] {
  const evaluated = evaluateCodexMasteryTrophies({
    catalog,
    progressRows,
    history,
    now,
    catalogVersion,
  });
  return evaluated.trophies.map((trophy) => {
    const nextTier = trophy.nextProgress?.tier ?? null;
    const badgeTier = trophy.currentTier ?? nextTier ?? "legendary";
    const progress = trophy.nextProgress
      ? {
        current: trophy.nextProgress.current,
        required: trophy.nextProgress.required,
      }
      : null;
    const desc = nextTier && progress
      ? `다음 ${TIER_LABELS[nextTier]} 승급까지 ${progress.current} / ${progress.required}`
      : "모든 도감 숙련 트로피 단계를 달성했습니다.";
    return {
      id: trophy.trophyId,
      kind: "mastery",
      category: trophy.category,
      title: trophy.title,
      desc,
      points: 0,
      badgeTier,
      unlocked: trophy.currentTier !== null,
      currentTier: trophy.currentTier,
      nextTier,
      progress,
      tierAchievedAt: { ...trophy.tierAchievedAt },
    };
  });
}

export function profileMasteryTrophyDisplays(
  history: readonly CodexMasteryTrophyHistory[],
  selectedTrophyIds: ReadonlySet<string>,
): ProfileMasteryTrophyDisplay[] {
  return history.flatMap((item) => {
    if (!selectedTrophyIds.has(item.trophyId)) return [];
    const definition = codexMasteryTrophyDefinition(item.trophyId);
    return definition
      ? [{
        trophyId: item.trophyId,
        title: definition.title,
        currentTier: item.currentTier,
      }]
      : [];
  });
}

export function profileCodexTrophyDisplays(
  masteryHistory: readonly CodexMasteryTrophyHistory[],
  researchHistory: readonly CodexResearchSeasonTrophyHistory[],
  selectedTrophyIds: ReadonlySet<string>,
): ProfileMasteryTrophyDisplay[] {
  return [
    ...profileMasteryTrophyDisplays(masteryHistory, selectedTrophyIds).map(
      (item) => ({ ...item, kind: "mastery" as const }),
    ),
    ...researchHistory.flatMap((item) =>
      selectedTrophyIds.has(item.trophyId)
        ? [{
            trophyId: item.trophyId,
            title: item.seasonMetadata.themeName,
            currentTier: item.currentTier,
            kind: "research" as const,
          }]
        : []
    ),
  ];
}
