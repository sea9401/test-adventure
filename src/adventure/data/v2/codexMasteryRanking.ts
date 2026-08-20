import type { Avatar } from "@/adventure/profile/avatars";
import type {
  ChromaNameId,
  ProfileBorderId,
} from "./museunCosmetics";
import type {
  CodexMasteryCategory,
  CodexMasteryCountStage,
} from "./codexMasteryTypes";

export const CODEX_MASTERY_RANKING_SCOPES = [
  "overall",
  "equipment",
  "fish",
  "monster",
  "cooking",
  "life",
  "job",
] as const;

export type CodexMasteryRankingScope =
  (typeof CODEX_MASTERY_RANKING_SCOPES)[number];

export function isCodexMasteryRankingScope(
  value: unknown,
): value is CodexMasteryRankingScope {
  return typeof value === "string" &&
    (CODEX_MASTERY_RANKING_SCOPES as readonly string[]).includes(value);
}

export type CodexMasteryRankingRow = {
  rank: number;
  name: string;
  avatar: Avatar;
  score: number;
  totalScore: number;
  categoryScores: Record<CodexMasteryCategory, number>;
  stageCounts: Record<CodexMasteryCountStage, number>;
  goldOrHigherCount: number;
  sealCount: number;
  scoredCategoryCount: number;
  mine: boolean;
  profileBorder: ProfileBorderId | null;
  chatNameEffect: ChromaNameId | null;
};

export type CodexMasteryRankingResponse =
  | { ok: true; enabled: false }
  | {
      ok: true;
      enabled: true;
      scope: CodexMasteryRankingScope;
      list: CodexMasteryRankingRow[];
      nearby: CodexMasteryRankingRow[];
      me: CodexMasteryRankingRow | null;
    }
  | { ok: false; error: string };
