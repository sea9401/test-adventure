"use client";

import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2GuildHome } from "@/adventure/v2/V2GuildHome";

// /guild — 길드 탭 home. 길드 정보/창단/점령 거점 목록.
export default function GuildPage() {
  const {
    viewerGuildId,
    viewerUserId,
    occupations,
    refreshGuildId,
    refreshOccupations,
  } = useGameState();
  return (
    <V2GuildHome
      viewerGuildId={viewerGuildId}
      viewerUserId={viewerUserId}
      occupations={occupations}
      onGuildChanged={refreshGuildId}
      onOccupationsChanged={refreshOccupations}
    />
  );
}
