import type { CoopVisibility } from "@/adventure/data/v2/coopBosses";
import type { CoopSessionSummary } from "@/adventure/v2/coop/useCoopBossState";

export const COOP_LIST_VISIBILITY_LABEL: Record<CoopVisibility, string> = {
  summoner_only: "나만",
  guild_only: "길드 공개",
  public: "전체 공개",
};

export type CoopSessionListSection = {
  id: "mine" | "participated" | "guild" | "public";
  title: string;
  description: string;
  emptyLabel: string;
  sessions: CoopSessionSummary[];
};

/** 본인 소환을 최우선으로 두고, 다른 사람의 세션은 실제 공개 범위별로 나눈다. */
export function coopSessionListSections(
  sessions: readonly CoopSessionSummary[],
): CoopSessionListSection[] {
  return [
    {
      id: "mine",
      title: "내가 소환한 보스",
      description: "공개 범위를 바꿀 수 있는 내 소환 목록",
      emptyLabel: "내가 소환한 진행 중 보스가 없습니다.",
      sessions: sessions.filter((session) => session.isOwner),
    },
    {
      id: "participated",
      title: "참여 중인 보스",
      description: "공개 범위 변경 전부터 피해를 기록해 참여 권한이 유지된 목록",
      emptyLabel: "공개 범위가 변경된 참여 중 보스가 없습니다.",
      sessions: sessions.filter(
        (session) =>
          !session.isOwner &&
          session.visibility !== "public" &&
          session.myDamage > 0,
      ),
    },
    {
      id: "guild",
      title: "길드 공개 보스",
      description: "다른 길드원이 길드에 공개한 목록",
      emptyLabel: "다른 길드원이 길드에 공개한 보스가 없습니다.",
      sessions: sessions.filter(
        (session) =>
          !session.isOwner &&
          session.visibility === "guild_only" &&
          session.myDamage <= 0,
      ),
    },
    {
      id: "public",
      title: "전체 공개 보스",
      description: "모든 모험가에게 공개된 목록",
      emptyLabel: "현재 전체 공개된 보스가 없습니다.",
      sessions: sessions.filter(
        (session) => !session.isOwner && session.visibility === "public",
      ),
    },
  ];
}
