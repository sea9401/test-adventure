"use client";

import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2GuildHome } from "@/adventure/v2/V2GuildHome";

// /guild — 길드 탭 home. 길드 정보/창단/시설/길드원.
export default function GuildPage() {
  const {
    viewerGuildId,
    refreshGuildId,
  } = useGameState();
  return (
    <V2GuildHome
      viewerGuildId={viewerGuildId}
      onGuildChanged={refreshGuildId}
    />
  );
}
