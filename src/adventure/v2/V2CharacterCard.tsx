"use client";

import { useState } from "react";
import { User as UserIcon } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { StatBar } from "@/components/ui/StatBar";
import { avatarImageSrc, type Gender } from "@/adventure/profile/avatars";

// v2 캐릭터 간략 카드 — 라이브 CharacterMini 패턴 차용.
// 모험·캐릭터 탭 둘 다에서 재활용. dumb component — character/guild prop.

export type V2CharacterCardData = {
  name: string;
  gender?: string;
  level: number;
  exp: number;
  expToNext: number | null;
  hp: number;
  maxHp: number;
  // v2 마법 풀 — INT 0 이면 0 (라이브 캐릭). 0 일 때는 MP 바 비표시.
  // PR-potion-auto-restore 부터 단판 풀충전 모델 폐기 — 현재 mp 도 prop 으로.
  mp?: number;
  maxMp?: number;
  gold: number;
};

function CharacterPortrait({ gender }: { gender: Gender }) {
  const [errored, setErrored] = useState(false);
  return (
    <div
      aria-label="캐릭터 이미지"
      className="flex aspect-square w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-300 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-600"
    >
      {errored ? (
        <UserIcon size={56} weight="duotone" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarImageSrc(gender)}
          alt=""
          onError={() => setErrored(true)}
          className="h-full w-full object-contain"
        />
      )}
    </div>
  );
}

export function V2CharacterCard({
  character,
  guild,
  // 칭호 — v2 시스템 없음. 있을 때만 노출 (미래에 me/state 에 titleName 추가하면 prop 으로).
  titleName = null,
  // 카드 하단에 골드 한 줄 노출 여부.
  showGold = true,
}: {
  character: V2CharacterCardData;
  guild?: { name: string } | null;
  titleName?: string | null;
  showGold?: boolean;
}) {
  // v2 마법 풀 — 현재 mp 사용. PR-potion-auto-restore: 단판 풀충전 모델 폐기 후 mp 가
  // 사냥 사이 보존. me/state 가 mp 동봉 — undefined fallback 은 maxMp (옛 캐릭).
  const maxMp = character.maxMp ?? 0;
  const mp = Math.min(maxMp, Math.max(0, character.mp ?? maxMp));

  return (
    <Card padding="md">
      <div className="flex items-stretch gap-4">
        <CharacterPortrait gender={(character.gender ?? "male1") as Gender} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline gap-2">
            {titleName && (
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                {titleName}
              </span>
            )}
            <span className="text-base font-semibold">{character.name}</span>
            <span className="text-sm text-zinc-400 dark:text-zinc-500">
              Lv.{character.level}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              · {guild ? guild.name : "무소속"}
            </span>
          </div>
          <div className="space-y-1.5">
            <StatBar
              label="HP"
              value={character.hp}
              max={character.maxHp}
              color="bg-red-500"
            />
            <StatBar label="MP" value={mp} max={maxMp} color="bg-blue-500" />
            {character.expToNext != null && (
              <StatBar
                label="EXP"
                value={character.exp}
                max={character.expToNext}
                color="bg-amber-400"
              />
            )}
          </div>
        </div>
      </div>
      {showGold && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">골드</span>
          <span className="font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
            {character.gold.toLocaleString()}
          </span>
        </div>
      )}
    </Card>
  );
}
