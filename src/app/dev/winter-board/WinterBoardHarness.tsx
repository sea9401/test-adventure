"use client";

import { useState } from "react";
import {
  WINTER_MILESTONES,
  WINTER_QUEST_DICE_DAILY_CAP,
  WINTER_ROLLING_ENDS_AT,
  WINTER_SHOP_ENDS_AT,
  WINTER_SHOP_ITEMS,
  parseWinterBoardState,
  rollWinterDice,
  type WinterBoardState,
  type WinterBoardView,
  type WinterRollResult,
} from "@/adventure/data/v2/winterBoard";
import { WinterBoardContent } from "@/adventure/v2/V2WinterBoardView";
import { PageShell } from "@/components/ui/PageShell";

function toView(state: WinterBoardState): WinterBoardView {
  return {
    ok: true,
    phase: "active",
    rollingEndsAt: WINTER_ROLLING_ENDS_AT,
    shopEndsAt: WINTER_SHOP_ENDS_AT,
    serverNow: 0,
    position: state.position,
    laps: state.laps,
    dice: state.dice,
    coins: state.coins,
    today: {
      visitGranted: true,
      questDiceGranted: 2,
      questDiceCap: WINTER_QUEST_DICE_DAILY_CAP,
    },
    milestones: WINTER_MILESTONES.map((m) => ({
      laps: m.laps,
      label: m.label,
      claimed: false,
      claimable: state.laps >= m.laps,
    })),
    shop: WINTER_SHOP_ITEMS.map((item) => ({
      id: item.id,
      name: item.name,
      cost: item.cost,
      limit: item.limit,
      purchased: 0,
    })),
    recentRolls: state.recentRolls,
    pending: state.dice,
  };
}

// /dev/winter-board — 로그인·DB 없이 겨울 말판 화면을 mock 상태로 확인한다.
export function WinterBoardHarness() {
  const [state, setState] = useState(() =>
    parseWinterBoardState({ position: 8, laps: 4, dice: 12, coins: 70 }),
  );
  const [lastResult, setLastResult] = useState<WinterRollResult | null>(null);

  const roll = (all: boolean) => {
    const rolled = rollWinterDice(state, { all, rng: Math.random });
    if ("error" in rolled) return;
    setState(rolled.state);
    setLastResult(rolled.result);
  };

  return (
    <PageShell>
      <WinterBoardContent
        view={toView(state)}
        busy={null}
        lastResult={lastResult}
        onRoll={() => roll(false)}
        onRollAll={() => roll(true)}
        onClaim={() => {}}
        onBuy={() => {}}
      />
    </PageShell>
  );
}
