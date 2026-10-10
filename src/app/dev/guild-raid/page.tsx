"use client";

import { notFound } from "next/navigation";
import { useState } from "react";
import {
  GUILD_RAID_BOSS_IDS,
  GUILD_RAID_BOSSES,
  type GuildRaidBossId,
} from "@/adventure/data/v2/guildRaidBosses";
import { GuildRaidPanelContent } from "@/adventure/v2/guild/GuildRaidPanel";
import type {
  GuildRaidBossSummary,
  GuildRaidState,
} from "@/adventure/v2/guild/guildRaidTypes";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

// /dev/guild-raid — 길드 토벌전 보스 선택 화면 시각 QA (로그인·DB 없이). staging/dev 전용, prod 404.

const BOSSES: GuildRaidBossSummary[] = GUILD_RAID_BOSS_IDS.map((id) => {
  const boss = GUILD_RAID_BOSSES[id];
  return {
    id,
    name: boss.definition.name,
    desc: boss.definition.desc,
    image: boss.definition.base.image ?? "/images/monster/v2/sangoon.webp",
    traits: boss.definition.traits,
    rewardMultiplier: boss.rewardMultiplier,
    bonusMinGuildDamage: boss.bonusMinGuildDamage,
  };
});

type Scenario = "leader" | "member" | "scorpion";

function previewState(scenario: Scenario, board: GuildRaidBossId): GuildRaidState {
  const selected = scenario === "scorpion";
  return {
    ok: true,
    event: {
      id: "guild-raid:2026-10-12",
      bossKind: selected ? "canyon_predator_raid" : null,
      status: "active",
      phase: "active",
      stage: selected ? 3 : null,
      hp: selected ? 412_500 : null,
      maxHp: selected ? 750_000 : null,
      startsAt: Date.UTC(2026, 9, 11, 15),
      endsAt: Date.UTC(2026, 9, 16, 15),
      settledAt: null,
    },
    selection: selected
      ? { bossId: "canyon_predator_raid", selectedAt: Date.UTC(2026, 9, 11, 16) }
      : null,
    canSelect: scenario === "leader",
    bosses: BOSSES,
    board,
    my: {
      lockedGuildId: selected ? 7 : null,
      damage: selected ? 1_234_567 : 0,
      attackCount: selected ? 4 : 0,
      dailyAttackCount: selected ? 1 : 0,
      dailyAttackLimit: 3,
      remainingAttacks: selected ? 2 : 3,
      eligible: selected,
      rewardClaimedAt: null,
      reward: selected ? { gold: 500_000, masteryCertificates: 50 } : null,
      bonusThresholdMet: selected ? false : null,
      canClaim: false,
    },
    guild: {
      id: 7,
      name: "검은바위",
      emblem: null,
      damage: selected ? 3_456_789 : 0,
      rank: selected ? 1 : null,
    },
    members: selected
      ? [
          { userId: "u1", name: "강철주먹", damage: 1_234_567, attackCount: 4, eligible: true },
          { userId: "u2", name: "그림자칼", damage: 2_222_222, attackCount: 6, eligible: true },
        ]
      : [],
    leaderboard:
      board === "canyon_predator_raid" && selected
        ? [{ guildId: 7, guildName: "검은바위", guildEmblem: null, damage: 3_456_789, rank: 1 }]
        : [
            { guildId: 3, guildName: "새벽빛", guildEmblem: null, damage: 98_765_432, rank: 1 },
            { guildId: 5, guildName: "몰락귀족", guildEmblem: null, damage: 12_345_678, rank: 2 },
          ],
    leaderboardPagination: { page: 1, pageSize: 8, totalPages: 1, total: 2 },
    recentAttacks: [],
    recentPagination: { page: 1, pageSize: 8, totalPages: 1, total: 0 },
  };
}

export default function GuildRaidPreviewPage() {
  const [scenario, setScenario] = useState<Scenario>("leader");
  const [board, setBoard] = useState<GuildRaidBossId>("mountain_chief_hard");
  if (
    process.env.NODE_ENV === "production" &&
    process.env.IS_STAGING !== "true"
  ) {
    notFound();
  }
  return (
    <main className="mx-auto max-w-[960px] space-y-4 px-4 py-5 sm:p-6">
      <SegmentedControl
        ariaLabel="미리보기 상황"
        options={[
          { key: "leader", label: "선택 전(관리자)" },
          { key: "member", label: "선택 전(길드원)" },
          { key: "scorpion", label: "스콜피온 선택 후" },
        ]}
        value={scenario}
        onChange={(next) => {
          setScenario(next);
          setBoard(next === "scorpion" ? "canyon_predator_raid" : "mountain_chief_hard");
        }}
      />
      <GuildRaidPanelContent
        state={previewState(scenario, board)}
        attacking={false}
        error={null}
        onAttack={() => undefined}
        onSelectBoss={(bossId) => {
          setScenario("scorpion");
          setBoard(bossId);
        }}
        onBoardChange={setBoard}
      />
    </main>
  );
}
