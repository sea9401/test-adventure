"use client";

import type { FormEvent } from "react";
import { Sword } from "@phosphor-icons/react";
import type { Gender } from "@/adventure/profile/avatars";
import type { BattleStats } from "@/adventure/battle/BattleScene";
import { CosmeticAvatar } from "@/components/ui/CosmeticAvatar";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import { useFriendlySparring } from "@/adventure/v2/useFriendlySparring";

const OUTCOME_LABEL = {
  win: "승리",
  loss: "패배",
  draw: "무승부",
} as const;

export function FriendlySparringPanel({
  initialTargetName,
  playerName,
  gender,
  playerSubtitle,
  playerCombat,
}: {
  initialTargetName?: string;
  playerName: string;
  gender: Gender;
  playerSubtitle?: string;
  playerCombat?: BattleStats;
}) {
  const friendly = useFriendlySparring(initialTargetName);
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void friendly.search();
  };
  const onCooldown = friendly.cooldownLeftSec > 0;

  return (
    <div className="space-y-3">
      <section className={`${SURFACE_CARD} p-4`}>
        <form onSubmit={submitSearch} className="space-y-2">
          <label className="block text-sm font-semibold" htmlFor="friendly-target">
            상대 닉네임
          </label>
          <div className="flex gap-2">
            <input
              id="friendly-target"
              value={friendly.query}
              onChange={(event) => friendly.setQuery(event.target.value)}
              disabled={friendly.searching || friendly.busy}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-950"
              placeholder="닉네임 입력"
            />
            <button
              type="submit"
              disabled={friendly.searching || friendly.busy}
              className="rounded-md border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {friendly.searching ? "찾는 중…" : "상대 찾기"}
            </button>
          </div>
        </form>
      </section>

      {friendly.error && (
        <p className={`${SURFACE_INSET} p-3 text-sm text-rose-600 dark:text-rose-400`}>
          {friendly.error}
        </p>
      )}

      {friendly.target && (
        <section className={`${SURFACE_CARD} p-4`}>
          <div className="flex items-center gap-3">
            <CosmeticAvatar
              avatar={friendly.target.avatar}
              name={friendly.target.name}
              profileBorder={friendly.target.profileBorder}
              width={52}
              height={52}
              sizes="52px"
              className="h-13 w-13 rounded-xl"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{friendly.target.name}</div>
              <div className="text-sm text-zinc-500 dark:text-zinc-400">
                Lv.{friendly.target.level}
              </div>
            </div>
            <Sword size={26} weight="duotone" className="text-sky-500" />
          </div>
          <button
            type="button"
            onClick={() => void friendly.fight()}
            disabled={friendly.busy || onCooldown}
            className="mt-3 w-full rounded-md border border-sky-600 bg-sky-600 px-4 py-3 font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {friendly.busy
              ? "친선전 진행 중…"
              : onCooldown
                ? `다시 대련까지 ${friendly.cooldownLeftSec}초`
                : friendly.result
                  ? "다시 친선전"
                  : "친선전 시작"}
          </button>
        </section>
      )}

      {friendly.result && (
        <p className={`${SURFACE_INSET} p-3 text-center text-sm`}>
          <strong>{OUTCOME_LABEL[friendly.result.outcome]}</strong>
          {` · ${friendly.result.opponent.name} · ${friendly.result.turns}행동`}
        </p>
      )}

      {friendly.result?.replay && (
        <ReplayBattleScene
          payload={friendly.result.replay}
          startPlayerHp={friendly.result.startPlayerHp}
          playerName={playerName}
          gender={gender}
          exp={0}
          maxExp={1}
          playerSubtitle={playerSubtitle}
          playerCombat={playerCombat}
          logTitle="친선전 전체 전투 로그"
        />
      )}
    </div>
  );
}
