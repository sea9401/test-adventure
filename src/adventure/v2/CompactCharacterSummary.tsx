"use client";

import { CaretDown, UserCircle } from "@phosphor-icons/react";
import { avatarImageSrc, type Gender } from "@/adventure/profile/avatars";
import { parseV2Class, V2_CLASS_DEFS } from "@/adventure/data/v2/classes";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Inset } from "@/components/ui/Inset";
import type { V2CharacterCardData } from "./V2CharacterCard";

function ResourceLine({
  label,
  current,
  max,
  color,
}: {
  label: string;
  current: number;
  max: number;
  color: string;
}) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 text-[0.6875rem]">
      <span className="w-20 shrink-0 font-medium tabular-nums text-zinc-600 dark:text-zinc-300">
        {label} {current} / {max}
      </span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}

export function CompactCharacterSummary({
  character,
  guild,
  expanded,
  onExpandedChange,
  children,
}: {
  character: V2CharacterCardData;
  guild: { id: number; name: string } | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children: React.ReactNode;
}) {
  if (expanded) {
    return (
      <section className="space-y-2">
        <Button
          type="button"
          variant="secondary"
          size="md"
          fullWidth
          onClick={() => onExpandedChange(false)}
          aria-label="캐릭터 정보 접기"
        >
          <span className="flex w-full items-center justify-between">
            캐릭터 상세 정보 <CaretDown size={18} className="rotate-180" aria-hidden />
          </span>
        </Button>
        {children}
      </section>
    );
  }

  const jobName =
    character.classDisplayName ??
    V2_CLASS_DEFS[parseV2Class(character.class)].name;
  const gender = (character.gender ?? "male1") as Gender;
  const mp = Math.max(0, character.mp ?? 0);
  const maxMp = Math.max(0, character.maxMp ?? 0);
  return (
    <Card as="section" aria-label="캐릭터 요약">
      <div className="flex items-center gap-3">
        <Inset padding="none" className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden sm:h-16 sm:w-16">
          <UserCircle size={34} className="absolute z-0 text-zinc-400" aria-hidden />
          {/* 프로필 애니메이션/정적 경로 전환은 기존 캐릭터 카드와 같은 네이티브 picture 계약을 쓴다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarImageSrc(gender, "static")}
            alt=""
            className="relative z-10 h-full w-full object-contain"
            onError={(event) => { event.currentTarget.hidden = true; }}
          />
        </Inset>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-semibold text-zinc-900 dark:text-zinc-100">{character.name}</span>
            <span className="shrink-0 text-xs text-zinc-500">Lv.{character.level}</span>
          </div>
          <p className="truncate text-xs text-zinc-600 dark:text-zinc-300">
            {jobName} · {guild?.name ?? "무소속"}
          </p>
          <div className="mt-2 space-y-1">
            <ResourceLine label="HP" current={character.hp} max={character.maxHp} color="bg-rose-500" />
            <ResourceLine label="MP" current={mp} max={maxMp} color="bg-sky-500" />
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onExpandedChange(true)}
          aria-label="캐릭터 정보 펼치기"
        >
          <CaretDown size={20} aria-hidden />
        </Button>
      </div>
    </Card>
  );
}
