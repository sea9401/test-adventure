import { isStoredAvatarId, type Avatar } from "@/adventure/profile/avatars";
import {
  CHROMA_NAME_IDS,
  PROFILE_BORDER_VARIANTS,
  type ChromaNameId,
  type ProfileBorderId,
} from "./museunCosmetics";
import {
  CODEX_MASTERY_TROPHY_TIERS,
  type CodexMasteryTrophyTier,
} from "./codexMasteryTrophies";

export type CodexResearchArchiveSeason = {
  seasonId: string;
  themeId: string;
  themeName: string;
  startAt: string;
  endAt: string;
  settledAt: string;
  publishedAt: string;
  participantCount: number;
  trophyCount: number;
};

export type CodexResearchArchiveRow = {
  rank: number;
  name: string;
  avatar: Avatar;
  score: number;
  objectiveCompletedCount: number;
  objectiveScore: number;
  diversityScore: number;
  recordScore: number;
  finalTier: CodexMasteryTrophyTier | null;
  mine: boolean;
  profileBorder: ProfileBorderId | null;
  chatNameEffect: ChromaNameId | null;
  firstPlaceEngraving: boolean;
};

export type CodexResearchArchiveResponse =
  | { ok: true; enabled: false }
  | {
      ok: true;
      enabled: true;
      status: "no_season";
      seasons: CodexResearchArchiveSeason[];
    }
  | {
      ok: true;
      enabled: true;
      status: "ready";
      seasons: CodexResearchArchiveSeason[];
      selectedSeasonId: string;
      list: CodexResearchArchiveRow[];
      nearby: CodexResearchArchiveRow[];
      me: CodexResearchArchiveRow | null;
    }
  | { ok: false; error: string };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function dateText(value: unknown): value is string {
  if (!text(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

function season(value: unknown): value is CodexResearchArchiveSeason {
  return object(value) &&
    text(value.seasonId) && text(value.themeId) && text(value.themeName) &&
    dateText(value.startAt) && dateText(value.endAt) &&
    dateText(value.settledAt) && dateText(value.publishedAt) &&
    integer(value.participantCount) && integer(value.trophyCount);
}

function tier(value: unknown): value is CodexMasteryTrophyTier | null {
  return value === null ||
    typeof value === "string" &&
      (CODEX_MASTERY_TROPHY_TIERS as readonly string[]).includes(value);
}

function border(value: unknown): value is ProfileBorderId | null {
  return value === null ||
    typeof value === "string" && PROFILE_BORDER_VARIANTS.some(({ id }) => id === value);
}

function chroma(value: unknown): value is ChromaNameId | null {
  return value === null ||
    typeof value === "string" && (CHROMA_NAME_IDS as readonly string[]).includes(value);
}

function row(value: unknown): value is CodexResearchArchiveRow {
  if (!object(value)) return false;
  const objectiveScore = Number(value.score) - Number(value.diversityScore) -
    Number(value.recordScore);
  return integer(value.rank, 1) && text(value.name) &&
    isStoredAvatarId(value.avatar) && integer(value.score, 0, 20_000) &&
    integer(value.objectiveCompletedCount, 0, 18) &&
    integer(value.objectiveScore, 0, 12_000) &&
    integer(value.diversityScore, 0, 5_000) &&
    integer(value.recordScore, 0, 3_000) &&
    value.objectiveScore === objectiveScore && tier(value.finalTier) &&
    typeof value.mine === "boolean" && border(value.profileBorder) &&
    chroma(value.chatNameEffect) && typeof value.firstPlaceEngraving === "boolean" &&
    value.firstPlaceEngraving === (value.rank === 1);
}

export function parseCodexResearchArchiveResponse(
  value: unknown,
): CodexResearchArchiveResponse {
  if (!object(value) || typeof value.ok !== "boolean") {
    throw new Error("codex research archive response is malformed");
  }
  if (value.ok === false) {
    if (!text(value.error)) throw new Error("codex research archive response is malformed");
    return { ok: false, error: value.error };
  }
  if (value.enabled === false) return { ok: true, enabled: false };
  if (value.enabled !== true || !Array.isArray(value.seasons) || !value.seasons.every(season)) {
    throw new Error("codex research archive response is malformed");
  }
  const seasons = structuredClone(value.seasons) as CodexResearchArchiveSeason[];
  if (value.status === "no_season") {
    return { ok: true, enabled: true, status: "no_season", seasons };
  }
  if (
    value.status !== "ready" || !text(value.selectedSeasonId) ||
    !seasons.some(({ seasonId }) => seasonId === value.selectedSeasonId) ||
    !Array.isArray(value.list) || !value.list.every(row) ||
    !Array.isArray(value.nearby) || !value.nearby.every(row) ||
    value.me !== null && !row(value.me)
  ) {
    throw new Error("codex research archive response is malformed");
  }
  return {
    ok: true,
    enabled: true,
    status: "ready",
    seasons,
    selectedSeasonId: value.selectedSeasonId,
    list: structuredClone(value.list) as CodexResearchArchiveRow[],
    nearby: structuredClone(value.nearby) as CodexResearchArchiveRow[],
    me: value.me ? structuredClone(value.me) as CodexResearchArchiveRow : null,
  };
}
