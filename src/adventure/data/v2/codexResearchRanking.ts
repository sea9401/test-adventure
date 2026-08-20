import type { Avatar } from "@/adventure/profile/avatars";
import type {
  ChromaNameId,
  ProfileBorderId,
} from "./museunCosmetics";
import type { CodexResearchRepresentativeRecord } from "./codexResearch";
import type {
  CodexMasteryTrophyTier,
  CodexResearchTrophyId,
} from "./codexMasteryTrophies";

export type CodexResearchTier = CodexMasteryTrophyTier | null;

export function codexResearchTierFor(
  score: number,
  rank: number | null,
): CodexResearchTier {
  if (
    !Number.isSafeInteger(score) ||
    score < 0 ||
    score > 20_000 ||
    (rank !== null && (!Number.isSafeInteger(rank) || rank < 1))
  ) {
    throw new Error("monthly codex rank input is invalid");
  }
  if (score >= 18_000 && rank !== null && rank <= 3) return "legendary";
  if (score >= 16_000 && rank !== null && rank <= 10) return "diamond";
  if (score >= 16_000) return "platinum";
  if (score >= 12_000) return "gold";
  if (score >= 8_000) return "silver";
  if (score >= 4_000) return "bronze";
  return null;
}

export type CodexResearchRankingRow = {
  rank: number;
  name: string;
  avatar: Avatar;
  score: number;
  objectiveCompletedCount: number;
  objectiveScore: number;
  diversityScore: number;
  recordScore: number;
  provisionalTier: CodexResearchTier;
  mine: boolean;
  profileBorder: ProfileBorderId | null;
  chatNameEffect: ChromaNameId | null;
};

export type CodexResearchRankingResponse =
  | { ok: true; enabled: false }
  | { ok: true; enabled: true; status: "no_season" }
  | {
      ok: true;
      enabled: true;
      status: "active";
      seasonId: string;
      themeId: string;
      themeName: string;
      startAt: string;
      endAt: string;
      list: CodexResearchRankingRow[];
      nearby: CodexResearchRankingRow[];
      me: CodexResearchRankingRow | null;
    }
  | { ok: false; error: string };

export type CodexResearchSeasonTrophyMetadata = {
  seasonId: string;
  themeId: string;
  themeName: string;
  finalRank: number;
  score: number;
  objectiveCompletedCount: number;
  objectiveScore: number;
  diversityScore: number;
  recordScore: number;
  representativeRecord: CodexResearchRepresentativeRecord | null;
  settledAt: string;
  firstPlaceEngraving: boolean;
};

export type CodexResearchSeasonTrophyHistory = {
  trophyId: CodexResearchTrophyId;
  kind: "research_season";
  currentTier: CodexMasteryTrophyTier;
  tierAchievedAt: Partial<Record<CodexMasteryTrophyTier, string>>;
  catalogVersion: number;
  seasonMetadata: CodexResearchSeasonTrophyMetadata;
};
