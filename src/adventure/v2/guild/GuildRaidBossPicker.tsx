"use client";

import Image from "next/image";
import { Clock, Sword } from "@phosphor-icons/react";
import type { GuildRaidBossId } from "@/adventure/data/v2/guildRaidBosses";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { confirmGameAction } from "@/components/ui/gameDialog";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import type { GuildRaidBossSummary } from "./guildRaidTypes";

function formatNumber(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString("ko-KR");
}

export function guildRaidBossRewardText(boss: GuildRaidBossSummary): string {
  if (boss.bonusMinGuildDamage == null) return "순위별 기본 보상";
  return `보상 ${boss.rewardMultiplier}배 · 길드 누적 피해 ${formatNumber(boss.bonusMinGuildDamage)} 미만이면 순위와 관계없이 50만 골드와 숙련의 증표 50개`;
}

// 이번 주 보스를 고르기 전 화면. 선택 권한이 없는 길드원도 두 보스 정보를 보고 연습할 수 있다.
export function GuildRaidBossPicker({
  bosses,
  canSelect,
  selecting,
  practicing,
  attacking,
  endsAtText,
  onSelect,
  onPractice,
}: {
  bosses: GuildRaidBossSummary[];
  canSelect: boolean;
  selecting: boolean;
  practicing: boolean;
  attacking: boolean;
  endsAtText: string;
  onSelect: (bossId: GuildRaidBossId) => void;
  onPractice: (bossId: GuildRaidBossId) => void;
}) {
  const busy = selecting || practicing || attacking;

  async function confirmSelect(boss: GuildRaidBossSummary) {
    const confirmed = await confirmGameAction({
      title: `${boss.name}을 이번 주 보스로 선택할까요?`,
      message: "선택하면 이번 주에는 바꿀 수 없습니다.",
      confirmLabel: "선택",
    });
    if (confirmed) onSelect(boss.id);
  }

  return (
    <Card padding="md" className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-black">이번 주 토벌 보스</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {canSelect
            ? "보스를 선택하기 전에는 길드원이 공격할 수 없습니다."
            : "길드장 또는 관리자가 이번 주 보스를 선택하면 공격할 수 있습니다."}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <Clock size={15} className="shrink-0" /> {endsAtText} (KST)
        </p>
      </div>
      <ul className="space-y-2">
        {bosses.map((boss) => (
          <li
            key={boss.id}
            className={`${SURFACE_INSET} grid gap-3 p-3 sm:grid-cols-[6rem_1fr]`}
          >
            <div className="relative mx-auto h-24 w-24 shrink-0">
              <Image
                src={boss.image}
                alt={boss.name}
                fill
                sizes="96px"
                className="object-contain"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <div>
                <h3 className="text-base font-bold">{boss.name}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">{boss.desc}</p>
              </div>
              <ul className="list-inside list-disc text-xs text-zinc-500 dark:text-zinc-400">
                {boss.traits.map((trait) => (
                  <li key={trait}>{trait}</li>
                ))}
              </ul>
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                {guildRaidBossRewardText(boss)}
              </p>
              <div className="flex flex-wrap gap-2">
                {canSelect && (
                  <Button
                    variant="primary"
                    size="sm"
                    loading={selecting}
                    disabled={busy}
                    onClick={() => void confirmSelect(boss)}
                  >
                    이번 주 보스로 선택
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => onPractice(boss.id)}
                >
                  <Sword size={16} /> 연습 전투
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
