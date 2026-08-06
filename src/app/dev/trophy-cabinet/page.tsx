"use client";

import { V2TrophyCabinetView } from "@/adventure/v2/V2TrophyCabinetView";

const TROPHIES = [
  { id: "combat_1", title: "첫 승리", desc: "처음으로 몬스터를 쓰러뜨리세요.", points: 5, badgeTier: "bronze" as const, unlocked: true },
  { id: "combat_100", title: "백전", desc: "누적 전투 100회를 달성하세요.", points: 10, badgeTier: "bronze" as const, unlocked: true },
  { id: "boss_10", title: "거인 사냥꾼", desc: "협동 보스를 10회 처치하세요.", points: 30, badgeTier: "gold" as const, unlocked: true },
  { id: "codex_50", title: "기록 수집가", desc: "모험의 서 항목 50개를 발견하세요.", points: 20, badgeTier: "silver" as const, unlocked: true },
  { id: "arena_20", title: "투기장의 별", desc: "아레나에서 20승을 달성하세요.", points: 40, badgeTier: "gold" as const, unlocked: false },
  { id: "frontier_100", title: "미지의 개척자", desc: "가장 깊은 사냥터의 끝에 도달하세요.", points: 70, badgeTier: "legendary" as const, unlocked: false },
  { id: "farm_100", title: "풍년", desc: "농작물을 100회 수확하세요.", points: 15, badgeTier: "silver" as const, unlocked: false },
  { id: "enhance_15", title: "불꽃의 장인", desc: "장비 강화 +15에 성공하세요.", points: 60, badgeTier: "legendary" as const, unlocked: false },
];

export default function TrophyCabinetDevPage() {
  return (
    <V2TrophyCabinetView
      previewData={{
        ok: true,
        standOwned: true,
        visible: true,
        slots: [
          { kind: "achievement", achievementId: "combat_100" },
          { kind: "achievement", achievementId: "boss_10" },
          { kind: "achievement", achievementId: "codex_50" },
        ],
        trophyOptions: TROPHIES,
      }}
    />
  );
}
