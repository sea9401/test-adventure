"use client";

import Image from "next/image";
import { MONSTERS } from "@/adventure/data/monsters";
import { V2_ELEMENT_LABEL, type V2Element } from "@/adventure/data/v2/elements";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import type { Avatar } from "@/adventure/profile/avatars";
import { CosmeticAvatar } from "@/components/ui/CosmeticAvatar";
import { SURFACE_INSET } from "@/components/ui/surfaces";

// 방금 전투 — 사냥 결과 카드 머리에서 "누구와 싸워 어떻게 됐는지"를 그림으로 보여 준다.
//   턴별 진행은 전투 기록 화면이 맡고, 여기는 상대와 승패만 다룬다.

export type HuntEncounterEnemy = {
  name: string;
  image: string | undefined;
  element: V2Element | undefined;
  /** 전투가 끝났을 때의 HP. 기록이 없어 알 수 없으면 null. */
  hp: number | null;
  maxHp: number | null;
};

/** 사냥 응답에서 상대의 그림·속성·남은 HP를 꺼낸다. 이기면 남은 HP는 0이다. */
export function huntEncounterEnemy(
  enemyName: string,
  won: boolean,
  replay: ReplayPayload | undefined,
): HuntEncounterEnemy {
  if (!replay) {
    return {
      name: enemyName,
      image: undefined,
      element: undefined,
      hp: null,
      maxHp: null,
    };
  }
  let lastEnemyHp: number | null = null;
  for (let i = replay.log.length - 1; i >= 0; i -= 1) {
    const entry = replay.log[i];
    if (entry.kind === "hp_bar" && typeof entry.enemyHp === "number") {
      lastEnemyHp = entry.enemyHp;
      break;
    }
  }
  return {
    name: enemyName,
    image: replay.enemy.image,
    element: replay.enemy.element,
    hp: won ? 0 : lastEnemyHp,
    maxHp: replay.enemy.hp,
  };
}

function HpLine({ hp, maxHp }: { hp: number | null; maxHp: number | null }) {
  if (hp == null || maxHp == null || maxHp <= 0) return null;
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  return (
    <div className="w-full">
      <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div className="h-full bg-rose-600" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-0.5 text-center text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
        {hp.toLocaleString()} / {maxHp.toLocaleString()}
      </div>
    </div>
  );
}

const PORTRAIT_CLASS = "size-20 shrink-0 rounded-xl";

export function HuntEncounter({
  label,
  won,
  player,
  enemy,
}: {
  /** "방금 전투"처럼 이 전투가 무엇인지 알려 주는 짧은 말. */
  label: string;
  won: boolean;
  player: {
    name: string;
    subtitle?: string;
    gender: Avatar;
    hp: number;
    maxHp: number;
  };
  enemy: HuntEncounterEnemy;
}) {
  const enemyImage = enemy.image ?? MONSTERS[enemy.name]?.image;
  const elementLabel =
    enemy.element && enemy.element !== "neutral"
      ? `${V2_ELEMENT_LABEL[enemy.element]} 속성`
      : null;

  return (
    <div data-hunt-encounter className="space-y-3">
      <div className="flex items-baseline justify-center gap-2">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
        <strong
          className={`text-lg font-extrabold ${
            won
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-rose-700 dark:text-rose-400"
          }`}
        >
          {won ? "승리" : "패배"}
        </strong>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
        <div className="flex min-w-0 flex-col items-center gap-1.5">
          <CosmeticAvatar
            avatar={player.gender}
            name={player.name}
            width={80}
            sizes="80px"
            className={PORTRAIT_CLASS}
          />
          <div className="w-full min-w-0 text-center">
            <div className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {player.name}
            </div>
            {player.subtitle ? (
              <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {player.subtitle}
              </div>
            ) : null}
          </div>
          <HpLine hp={player.hp} maxHp={player.maxHp} />
        </div>
        <span
          aria-hidden
          className="pt-8 text-xs font-extrabold text-zinc-400 dark:text-zinc-500"
        >
          VS
        </span>
        <div className="flex min-w-0 flex-col items-center gap-1.5">
          {enemyImage ? (
            <span
              className={`${SURFACE_INSET} ${PORTRAIT_CLASS} relative overflow-hidden`}
            >
              <Image
                src={enemyImage}
                alt=""
                fill
                sizes="80px"
                className="object-contain"
              />
            </span>
          ) : (
            <span
              aria-hidden
              className={`${SURFACE_INSET} ${PORTRAIT_CLASS} flex items-center justify-center text-xl text-zinc-400 dark:text-zinc-500`}
            >
              ?
            </span>
          )}
          <div className="w-full min-w-0 text-center">
            <div className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {enemy.name}
            </div>
            {elementLabel ? (
              <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {elementLabel}
              </div>
            ) : null}
          </div>
          <HpLine hp={enemy.hp} maxHp={enemy.maxHp} />
        </div>
      </div>
    </div>
  );
}

/** 아직 사냥하지 않았을 때 전투 카드 자리에 두는 안내. */
export function HuntEncounterPlaceholder() {
  return (
    <p
      className={`${SURFACE_INSET} px-4 py-3 text-center text-sm text-zinc-500 dark:text-zinc-400`}
    >
      사냥하면 여기에 싸운 몬스터와 결과가 나옵니다
    </p>
  );
}
