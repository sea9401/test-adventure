import { describe, expect, it } from "vitest";
import {
  WINTER_BATTLE_COIN_TIERS,
  WINTER_BATTLE_COINS_DAILY_MAX,
  WINTER_LAP_COINS,
  WINTER_MILESTONES,
  WINTER_QUEST_DICE_DAILY_CAP,
  WINTER_ROLL_ALL_MAX,
  WINTER_ROLLING_ENDS_AT,
  WINTER_SHOP_ENDS_AT,
  WINTER_SHOP_ITEMS,
  WINTER_TILES,
  buyWinterShopItem,
  claimWinterMilestone,
  parseWinterBoardState,
  resolveWinterMove,
  rollWinterDice,
  syncWinterBattleCoins,
  syncWinterDaily,
  syncWinterDice,
  winterBattleCoinsFor,
  winterPendingCount,
  winterPhase,
  winterTileCell,
  type WinterBoardState,
  type WinterTile,
} from "./winterBoard";

const EMPTY = parseWinterBoardState(undefined);

/** 원하는 주사위 눈을 차례로 내는 난수. 다 쓰면 1을 낸다. */
function dice(...faces: number[]): () => number {
  let index = 0;
  return () => {
    const face = faces[index] ?? 1;
    index += 1;
    return (face - 1) / 6 + 0.01;
  };
}

function withState(patch: Partial<WinterBoardState>): WinterBoardState {
  return { ...EMPTY, ...patch };
}

function mustRoll(
  state: WinterBoardState,
  rng: () => number,
  all = false,
) {
  const rolled = rollWinterDice(state, { all, rng });
  if ("error" in rolled) throw new Error(rolled.error);
  return rolled;
}

describe("겨울 말판 구성", () => {
  it("24칸이고 칸 종류별 개수가 설계와 같다", () => {
    expect(WINTER_TILES).toHaveLength(24);
    expect(WINTER_TILES[0]).toEqual({ kind: "start" });
    const coins = (n: number) =>
      WINTER_TILES.filter((t) => t.kind === "coins" && t.coins === n).length;
    expect(coins(4)).toBe(10);
    expect(coins(10)).toBe(5);
    expect(coins(20)).toBe(2);
    expect(WINTER_LAP_COINS).toBe(20);
    expect(WINTER_TILES.filter((t) => t.kind === "potion")).toHaveLength(2);
    expect(WINTER_TILES.filter((t) => t.kind === "again")).toHaveLength(2);
    expect(WINTER_TILES.filter((t) => t.kind === "forward")).toHaveLength(2);
  });

  it("앞으로 3칸은 주화 20 칸으로 이어진다", () => {
    WINTER_TILES.forEach((tile, index) => {
      if (tile.kind !== "forward") return;
      expect(WINTER_TILES[index + tile.steps]).toEqual({ kind: "coins", coins: 20 });
    });
  });

  it("한도가 있는 교환소 품목을 전부 사는 데 주화 1,210개가 든다", () => {
    expect(
      WINTER_SHOP_ITEMS.reduce((sum, item) => sum + item.cost * (item.limit ?? 0), 0),
    ).toBe(1_210);
    expect(WINTER_MILESTONES.map((m) => m.laps)).toEqual([3, 6, 9, 12, 15]);
  });
});

describe("겨울 이벤트 기간", () => {
  it("12월 10일 23:59까지 굴릴 수 있고 12월 14일 23:59까지 교환할 수 있다", () => {
    expect(winterPhase(Date.parse("2026-11-20T12:00:00+09:00"))).toBe("active");
    expect(winterPhase(WINTER_ROLLING_ENDS_AT - 1)).toBe("active");
    expect(winterPhase(WINTER_ROLLING_ENDS_AT)).toBe("shop_only");
    expect(winterPhase(Date.parse("2026-12-14T23:59:59+09:00"))).toBe("shop_only");
    expect(winterPhase(WINTER_SHOP_ENDS_AT)).toBe("ended");
    expect(new Date(WINTER_ROLLING_ENDS_AT).toISOString()).toBe("2026-12-10T15:00:00.000Z");
    expect(new Date(WINTER_SHOP_ENDS_AT).toISOString()).toBe("2026-12-14T15:00:00.000Z");
  });
});

describe("겨울 말판 저장 상태", () => {
  it("비었거나 깨진 값은 기본 상태로 읽는다", () => {
    for (const raw of [undefined, null, "x", [], { position: -3, dice: "many", laps: NaN }]) {
      const state = parseWinterBoardState(raw);
      expect(state).toMatchObject({
        version: 1,
        position: 0,
        laps: 0,
        dice: 0,
        coins: 0,
        visitGranted: false,
        questDiceGranted: 0,
        purchases: {},
        claimedMilestones: [],
        recentRolls: [],
        lastRoll: null,
        battleDayKey: "",
        battleCoinsGranted: 0,
        boostTopUp: 0,
      });
    }
  });

  it("저장한 값을 그대로 읽고 범위를 벗어난 위치는 판 안으로 고친다", () => {
    const state = parseWinterBoardState({
      version: 1,
      position: 29,
      laps: 4,
      dice: 3,
      coins: 77,
      coinsEarnedTotal: 120,
      dayKey: "2026-11-20",
      visitGranted: true,
      questDiceGranted: 9,
      purchases: { stamina_potion: 2, mastery_certificate: 45, enchant_scroll: 9, bogus: 4 },
      claimedMilestones: [3, 3, 99],
      battleDayKey: "2026-11-20",
      battleCoinsGranted: 99,
      boostTopUp: 30,
    });
    expect(state.position).toBe(5);
    expect(state.laps).toBe(4);
    expect(state.dice).toBe(3);
    expect(state.coins).toBe(77);
    expect(state.questDiceGranted).toBe(WINTER_QUEST_DICE_DAILY_CAP);
    expect(state.coinsEarnedTotal).toBe(120);
    expect(state.boostTopUp).toBe(30);
    // 한도가 없는 품목은 산 만큼, 한도가 있는 품목은 한도까지만 읽는다.
    expect(state.purchases).toEqual({ stamina_potion: 2, mastery_certificate: 45, enchant_scroll: 3 });
    expect(state.claimedMilestones).toEqual([3]);
    expect(state.battleDayKey).toBe("2026-11-20");
    expect(state.battleCoinsGranted).toBe(WINTER_BATTLE_COINS_DAILY_MAX);
  });
});

describe("보상 2배 조정 전에 번 주화", () => {
  const event = {
    die: 3, from: 0, landed: 3, to: 3, tile: "coins", coins: 5, potions: 0, diceRefund: 0, lapsGained: 0,
  };
  const before = {
    version: 1,
    coins: 12,
    coinsEarnedTotal: 40,
    recentRolls: [event],
    lastRoll: { requestId: "r", result: { events: [event], coins: 5, potions: 0, lapsGained: 0 } },
  };

  it("조정 전 저장분은 그동안 번 만큼 한 번 더 받는다", () => {
    const state = parseWinterBoardState(before);
    expect(state.coins).toBe(52);
    expect(state.coinsEarnedTotal).toBe(80);
    expect(state.boostTopUp).toBe(40);
    expect(state.recentRolls[0]!.coins).toBe(10);
    expect(state.lastRoll!.result.coins).toBe(10);
    expect(state.lastRoll!.result.events[0]!.coins).toBe(10);
  });

  it("한 번 반영해 저장한 뒤에는 다시 더하지 않는다", () => {
    const once = parseWinterBoardState(before);
    const twice = parseWinterBoardState(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });
});

describe("주사위 적립", () => {
  it("그날 첫 조회에 접속 주사위 1개와 완료한 일일 퀘스트 수만큼 적립한다", () => {
    const first = syncWinterDice(EMPTY, "2026-11-20", 0);
    expect(first.granted).toBe(1);
    expect(first.state.dice).toBe(1);

    const afterQuests = syncWinterDice(first.state, "2026-11-20", 3);
    expect(afterQuests.granted).toBe(3);
    expect(afterQuests.state.dice).toBe(4);

    const again = syncWinterDice(afterQuests.state, "2026-11-20", 3);
    expect(again.granted).toBe(0);
    expect(again.state).toBe(afterQuests.state);
  });

  it("퀘스트 주사위는 하루 4개까지다", () => {
    const synced = syncWinterDice(EMPTY, "2026-11-20", 7);
    expect(synced.granted).toBe(1 + WINTER_QUEST_DICE_DAILY_CAP);
    expect(syncWinterDice(synced.state, "2026-11-20", 7).granted).toBe(0);
  });

  it("날짜가 바뀌면 남은 주사위는 유지하고 그날 몫을 새로 적립한다", () => {
    const day1 = syncWinterDice(EMPTY, "2026-11-20", 4).state;
    expect(day1.dice).toBe(5);
    const day2 = syncWinterDice(day1, "2026-11-21", 1);
    expect(day2.granted).toBe(2);
    expect(day2.state.dice).toBe(7);
    expect(day2.state.dayKey).toBe("2026-11-21");
  });

  it("완료 수가 줄어 보여도 이미 적립한 주사위를 빼지 않는다", () => {
    const synced = syncWinterDice(EMPTY, "2026-11-20", 3).state;
    const lower = syncWinterDice(synced, "2026-11-20", 1);
    expect(lower.granted).toBe(0);
    expect(lower.state.dice).toBe(4);
  });
});

describe("전투 주화", () => {
  it("하루 전투 30·300·3,000회에 주화 5·5·10개를 준다", () => {
    expect(WINTER_BATTLE_COIN_TIERS).toEqual([
      { battles: 30, coins: 5 },
      { battles: 300, coins: 5 },
      { battles: 3_000, coins: 10 },
    ]);
    expect(WINTER_BATTLE_COINS_DAILY_MAX).toBe(20);
    expect([0, 29, 30, 299, 300, 2_999, 3_000, 99_999].map(winterBattleCoinsFor)).toEqual([
      0, 0, 5, 5, 10, 10, 20, 20,
    ]);
  });

  it("넘은 단계의 주화만 더 주고 같은 날 다시 주지 않는다", () => {
    const first = syncWinterBattleCoins(EMPTY, "2026-11-20", 45);
    expect(first.granted).toBe(5);
    expect(first.state).toMatchObject({
      coins: 5,
      coinsEarnedTotal: 5,
      battleDayKey: "2026-11-20",
      battleCoinsGranted: 5,
    });

    const same = syncWinterBattleCoins(first.state, "2026-11-20", 200);
    expect(same.granted).toBe(0);
    expect(same.state).toBe(first.state);

    const more = syncWinterBattleCoins(first.state, "2026-11-20", 3_500);
    expect(more.granted).toBe(15);
    expect(more.state.coins).toBe(20);
    expect(syncWinterBattleCoins(more.state, "2026-11-20", 9_000).granted).toBe(0);
  });

  it("전투 횟수가 줄어 보여도 받은 주화를 빼지 않는다", () => {
    const granted = syncWinterBattleCoins(EMPTY, "2026-11-20", 400).state;
    const lower = syncWinterBattleCoins(granted, "2026-11-20", 10);
    expect(lower.granted).toBe(0);
    expect(lower.state.coins).toBe(10);
  });

  it("날짜가 바뀌면 그날 몫을 새로 준다", () => {
    const day1 = syncWinterBattleCoins(EMPTY, "2026-11-20", 3_000).state;
    const day2 = syncWinterBattleCoins(day1, "2026-11-21", 30);
    expect(day2.granted).toBe(5);
    expect(day2.state).toMatchObject({
      coins: 25,
      battleDayKey: "2026-11-21",
      battleCoinsGranted: 5,
    });
  });

  it("하루치 적립은 주사위와 전투 주화를 함께 반영한다", () => {
    const synced = syncWinterDaily(EMPTY, "2026-11-20", {
      completedDailyQuests: 2,
      battlesToday: 300,
    });
    expect(synced).toMatchObject({ dice: 3, coins: 10 });
    expect(synced.state).toMatchObject({ dice: 3, coins: 10, questDiceGranted: 2 });

    const again = syncWinterDaily(synced.state, "2026-11-20", {
      completedDailyQuests: 2,
      battlesToday: 300,
    });
    expect(again).toEqual({ state: synced.state, dice: 0, coins: 0 });
    expect(again.state).toBe(synced.state);
  });
});

describe("주사위 굴리기", () => {
  it("주사위가 없으면 굴릴 수 없다", () => {
    expect(rollWinterDice(EMPTY, { all: false, rng: dice(3) })).toEqual({ error: "no_dice" });
  });

  it("주화 칸에 서면 그만큼 주화를 받고 주사위 1개를 쓴다", () => {
    const { state, result } = mustRoll(withState({ dice: 2 }), dice(3));
    expect(state.position).toBe(3);
    expect(state.coins).toBe(10);
    expect(state.coinsEarnedTotal).toBe(10);
    expect(state.dice).toBe(1);
    expect(result.events).toEqual([
      { die: 3, from: 0, landed: 3, to: 3, tile: "coins", coins: 10, potions: 0, diceRefund: 0, lapsGained: 0 },
    ]);
    expect(result).toMatchObject({ coins: 10, potions: 0, lapsGained: 0 });
  });

  it("회복약 칸은 회복약 1개를 결과에 담는다", () => {
    const { state, result } = mustRoll(withState({ dice: 1 }), dice(6));
    expect(state.position).toBe(6);
    expect(result.potions).toBe(1);
    expect(result.events[0]).toMatchObject({ tile: "potion", potions: 1, coins: 0 });
  });

  it("한 번 더 칸은 주사위 1개를 돌려준다", () => {
    const { state, result } = mustRoll(withState({ dice: 1 }), dice(4));
    expect(state.position).toBe(4);
    expect(state.dice).toBe(1);
    expect(result.events[0]).toMatchObject({ tile: "again", diceRefund: 1 });
  });

  it("앞으로 3칸은 도착한 칸의 보상을 한 번만 준다", () => {
    const { state, result } = mustRoll(withState({ dice: 1, position: 6 }), dice(2));
    expect(result.events[0]).toMatchObject({
      landed: 8,
      to: 11,
      tile: "forward",
      coins: 20,
    });
    expect(state.position).toBe(11);
    expect(state.coins).toBe(20);
  });

  it("출발 칸을 지나가면 한 바퀴로 세고 완주 주화를 준다", () => {
    const { state, result } = mustRoll(withState({ dice: 1, position: 22 }), dice(3));
    expect(state.position).toBe(1);
    expect(state.laps).toBe(1);
    expect(state.coins).toBe(WINTER_LAP_COINS + 4);
    expect(result.lapsGained).toBe(1);
    expect(result.events[0]).toMatchObject({ lapsGained: 1, coins: WINTER_LAP_COINS + 4 });
  });

  it("출발 칸에 정확히 서도 한 바퀴다", () => {
    const { state } = mustRoll(withState({ dice: 1, position: 20 }), dice(4));
    expect(state.position).toBe(0);
    expect(state.laps).toBe(1);
    expect(state.coins).toBe(WINTER_LAP_COINS);
  });

  it("앞으로 가다 출발 칸을 넘어도 한 바퀴만 센다", () => {
    const tiles: WinterTile[] = WINTER_TILES.map((tile, index) =>
      index === 22 ? { kind: "forward", steps: 3 } : tile,
    );
    const move = resolveWinterMove(20, 2, tiles);
    expect(move).toMatchObject({ landed: 22, to: 1, lapsGained: 1, tile: "forward" });
    expect(move.coins).toBe(WINTER_LAP_COINS + 4);

    const chained: WinterTile[] = WINTER_TILES.map((tile, index) =>
      index === 8 || index === 11 ? { kind: "forward", steps: 3 } : tile,
    );
    // 8번에서 11번으로 간 뒤 다시 앞으로 가지 않는다.
    expect(resolveWinterMove(6, 2, chained)).toMatchObject({ landed: 8, to: 11, coins: 0 });
  });

  it("모두 굴리기는 돌려받은 주사위까지 이어서 굴린다", () => {
    // 0 → 4(한 번 더, 환급) → 5(주화 4) → 주사위 소진
    const { state, result } = mustRoll(withState({ dice: 2 }), dice(4, 1, 1), true);
    expect(result.events.map((e) => e.to)).toEqual([4, 5, 6]);
    expect(state.dice).toBe(0);
    expect(result.coins).toBe(4);
    expect(result.potions).toBe(1);
  });

  it("한 요청에서 굴리는 횟수에는 상한이 있다", () => {
    const { state, result } = mustRoll(
      withState({ dice: WINTER_ROLL_ALL_MAX + 15 }),
      dice(),
      true,
    );
    expect(result.events).toHaveLength(WINTER_ROLL_ALL_MAX);
    expect(state.dice).toBeGreaterThanOrEqual(15);
  });

  it("최근 기록은 20개만 남긴다", () => {
    const { state } = mustRoll(withState({ dice: 30 }), dice(), true);
    expect(state.recentRolls).toHaveLength(20);
    expect(state.recentRolls.at(-1)).toEqual(
      mustRoll(withState({ dice: 30 }), dice(), true).result.events.at(-1),
    );
  });

  it("굴리기는 요청 식별 기록을 건드리지 않는다", () => {
    const lastRoll = { requestId: "r", result: { events: [], coins: 0, potions: 0, lapsGained: 0 } };
    expect(mustRoll(withState({ dice: 1, lastRoll }), dice(1)).state.lastRoll).toBe(lastRoll);
  });
});

describe("누적 바퀴 보상", () => {
  it("바퀴 수가 모자라면 받을 수 없다", () => {
    expect(claimWinterMilestone(withState({ laps: 2 }), 3)).toEqual({ error: "milestone_locked" });
    expect(claimWinterMilestone(withState({ laps: 99 }), 4)).toEqual({ error: "unknown_milestone" });
  });

  it("조건을 채우면 한 번만 받는다", () => {
    const claimed = claimWinterMilestone(withState({ laps: 6 }), 6);
    if ("error" in claimed) throw new Error(claimed.error);
    expect(claimed.reward).toEqual({ kind: "mastery_certificate", count: 30 });
    expect(claimed.state.claimedMilestones).toEqual([6]);
    expect(claimWinterMilestone(claimed.state, 6)).toEqual({ error: "already_claimed" });
  });

  it("보상 구성이 설계와 같다", () => {
    expect(WINTER_MILESTONES.map((m) => m.reward)).toEqual([
      { kind: "stamina_potion", count: 3 },
      { kind: "mastery_certificate", count: 30 },
      { kind: "cash_item", itemId: "enchant_scroll", count: 1 },
      { kind: "cash_item", itemId: "emblem_box", count: 1 },
      { kind: "title", titleId: "winter_finisher" },
    ]);
  });
});

describe("겨울 교환소", () => {
  it("주화가 모자라거나 없는 품목은 살 수 없다", () => {
    expect(buyWinterShopItem(withState({ coins: 14 }), "mastery_certificate")).toEqual({
      error: "not_enough_coins",
    });
    expect(buyWinterShopItem(withState({ coins: 999 }), "nope")).toEqual({ error: "unknown_item" });
  });

  it("사면 주화가 줄고 구매 횟수가 는다", () => {
    const bought = buyWinterShopItem(withState({ coins: 20 }), "mastery_certificate");
    if ("error" in bought) throw new Error(bought.error);
    expect(bought.state.coins).toBe(5);
    expect(bought.state.purchases).toEqual({ mastery_certificate: 1 });
    expect(bought.item.reward).toEqual({ kind: "mastery_certificate", count: 10 });
  });

  it("한도에 닿으면 더 살 수 없다", () => {
    const state = withState({ coins: 999, purchases: { title_wanderer: 1 } });
    expect(buyWinterShopItem(state, "title_wanderer")).toEqual({ error: "limit_reached" });
  });

  it("한도가 없는 품목은 주화가 남아 있는 한 계속 살 수 있다", () => {
    let state = withState({ coins: 95, purchases: { stamina_potion_extra: 40 } });
    for (const left of [65, 35, 5]) {
      const bought = buyWinterShopItem(state, "stamina_potion_extra");
      if ("error" in bought) throw new Error(bought.error);
      expect(bought.item.reward).toEqual({ kind: "stamina_potion", count: 1 });
      state = bought.state;
      expect(state.coins).toBe(left);
    }
    expect(state.purchases).toEqual({ stamina_potion_extra: 43 });
    expect(buyWinterShopItem(state, "stamina_potion_extra")).toEqual({ error: "not_enough_coins" });
  });

  it("품목과 가격이 설계와 같다", () => {
    expect(WINTER_SHOP_ITEMS.map((i) => [i.id, i.cost, i.limit])).toEqual([
      ["stamina_potion", 20, 15],
      ["enchant_scroll", 60, 3],
      ["emblem_box", 60, 3],
      ["title_wanderer", 150, 1],
      ["title_trailblazer", 400, 1],
      ["mastery_certificate", 15, null],
      ["stamina_potion_extra", 30, null],
    ]);
  });

  it("한도가 없는 회복약은 한도가 있는 회복약보다 비싸다", () => {
    const cost = (id: string) => WINTER_SHOP_ITEMS.find((item) => item.id === id)!.cost;
    expect(cost("stamina_potion_extra")).toBeGreaterThan(cost("stamina_potion"));
  });
});

describe("받을 것 알림", () => {
  it("주사위 수와 받을 수 있는 바퀴 보상 수를 더한다", () => {
    expect(winterPendingCount(EMPTY)).toBe(0);
    expect(
      winterPendingCount(withState({ dice: 2, laps: 7, claimedMilestones: [3] })),
    ).toBe(3);
  });
});

describe("예상 획득량 모의 계산", () => {
  function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 21일 동안 매일 dicePerDay 개를 받아 그날 모두 굴린 평균. */
  function simulate(dicePerDay: number, runs = 2_000) {
    const rng = mulberry32(20261112);
    let coins = 0;
    let laps = 0;
    for (let run = 0; run < runs; run += 1) {
      let state = EMPTY;
      for (let day = 0; day < 21; day += 1) {
        state = { ...state, dice: state.dice + dicePerDay };
        const rolled = rollWinterDice(state, { all: true, rng });
        if (!("error" in rolled)) state = rolled.state;
      }
      coins += state.coinsEarnedTotal;
      laps += state.laps;
    }
    return { coins: coins / runs, laps: laps / runs };
  }

  it("매일 5개를 굴리면 3주에 17바퀴 안팎, 주화 1,140개 안팎이다", () => {
    const average = simulate(5);
    expect(average.laps).toBeGreaterThan(16);
    expect(average.laps).toBeLessThan(19);
    expect(average.coins).toBeGreaterThan(1_000);
    expect(average.coins).toBeLessThan(1_280);
  });

  it("매일 2개만 굴리면 3주에 주화 460개 안팎이다", () => {
    const average = simulate(2);
    expect(average.coins).toBeGreaterThan(390);
    expect(average.coins).toBeLessThan(510);
  });
});

describe("말판 배치", () => {
  it("24칸이 5×9 테두리를 한 칸씩 이어서 한 바퀴 돈다", () => {
    const cells = WINTER_TILES.map((_, index) => winterTileCell(index));
    expect(new Set(cells.map((cell) => `${cell.col},${cell.row}`)).size).toBe(24);
    for (const cell of cells) {
      expect(cell.col >= 1 && cell.col <= 5 && cell.row >= 1 && cell.row <= 9).toBe(true);
      expect(cell.col === 1 || cell.col === 5 || cell.row === 1 || cell.row === 9).toBe(true);
    }
    cells.forEach((cell, index) => {
      const next = cells[(index + 1) % cells.length]!;
      expect(Math.abs(cell.col - next.col) + Math.abs(cell.row - next.row)).toBe(1);
    });
    expect(cells[0]).toEqual({ col: 1, row: 1 });
  });
});
