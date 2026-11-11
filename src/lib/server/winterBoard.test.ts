import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  locked: [] as string[],
  completedDaily: 0,
  onboarded: true,
  grantTitleIfMissingInTx: vi.fn(async () => true),
  recordEconomyEventSoon: vi.fn(),
}));

vi.mock("@/db", () => {
  const tx = {
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
  };
  return {
    db: { transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx)) },
  };
});
vi.mock("@/db/schema", () => ({ savesKv: {} }));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) => {
    mocks.locked.push(key);
    return mocks.store.has(key) ? structuredClone(mocks.store.get(key)) : fallback;
  }),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    mocks.store.has(key) ? structuredClone(mocks.store.get(key)) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    mocks.store.set(key, structuredClone(value));
  }),
}));
vi.mock("@/lib/server/profile", () => ({
  hasCompletedOnboarding: vi.fn(async () => mocks.onboarded),
}));
vi.mock("@/lib/server/winterBoardQuestDice", () => ({
  countCompletedDailyQuests: vi.fn(async () => mocks.completedDaily),
}));
vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx: mocks.grantTitleIfMissingInTx,
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: mocks.recordEconomyEventSoon,
}));

import {
  WINTER_BOARD_SAVE_KEY,
  WINTER_ROLLING_ENDS_AT,
  WINTER_SHOP_ENDS_AT,
  parseWinterBoardState,
  type WinterBoardState,
} from "@/adventure/data/v2/winterBoard";
import { MASTERY_CERTIFICATE_KEY } from "@/adventure/data/v2/masteryTower";
import { STAMINA_POTIONS_KEY } from "@/adventure/v2/staminaPotions";
import {
  buyWinterBoardItem,
  claimWinterBoardMilestone,
  readWinterBoard,
  rollWinterBoard,
  validWinterRequestId,
} from "./winterBoard";

const USER = "u-winter";
const ACTIVE = new Date("2026-11-20T12:00:00+09:00");
const SHOP_ONLY = new Date(WINTER_ROLLING_ENDS_AT + 60_000);
const ENDED = new Date(WINTER_SHOP_ENDS_AT + 60_000);
const REQUEST_A = "11111111-1111-4111-8111-111111111111";
const REQUEST_B = "22222222-2222-4222-8222-222222222222";

/** 원하는 주사위 눈을 차례로 내는 난수. */
function dice(...faces: number[]): () => number {
  let index = 0;
  return () => {
    const face = faces[index] ?? 1;
    index += 1;
    return (face - 1) / 6 + 0.01;
  };
}

function saved(): WinterBoardState {
  return parseWinterBoardState(mocks.store.get(WINTER_BOARD_SAVE_KEY));
}

function seed(patch: Partial<WinterBoardState>) {
  mocks.store.set(WINTER_BOARD_SAVE_KEY, {
    ...parseWinterBoardState(undefined),
    dayKey: "2026-11-20",
    visitGranted: true,
    ...patch,
  });
}

function ok<T extends { ok: boolean }>(value: T): Extract<T, { ok: true }> {
  if (!value.ok) throw new Error(JSON.stringify(value));
  return value as Extract<T, { ok: true }>;
}

beforeEach(() => {
  mocks.completedDaily = 0;
  mocks.onboarded = true;
});

afterEach(() => {
  mocks.store.clear();
  mocks.locked.length = 0;
  mocks.grantTitleIfMissingInTx.mockClear();
  mocks.recordEconomyEventSoon.mockClear();
});

describe("겨울 말판 조회", () => {
  it("그날 첫 조회에 접속 주사위와 완료한 일일 퀘스트만큼 적립한다", async () => {
    mocks.completedDaily = 2;
    const view = ok(await readWinterBoard(USER, ACTIVE));

    expect(view.phase).toBe("active");
    expect(view.dice).toBe(3);
    expect(view.today).toEqual({ visitGranted: true, questDiceGranted: 2, questDiceCap: 4 });
    expect(view.pending).toBe(3);
    expect(saved().dice).toBe(3);

    const again = ok(await readWinterBoard(USER, ACTIVE));
    expect(again.dice).toBe(3);
  });

  it("적립할 것이 없으면 세이브를 잠그지 않는다", async () => {
    seed({ dice: 2, questDiceGranted: 4 });
    ok(await readWinterBoard(USER, ACTIVE));
    expect(mocks.locked).toEqual([]);
  });

  it("굴리기가 끝난 뒤에는 적립하지 않고 교환 기간으로 보여 준다", async () => {
    mocks.completedDaily = 4;
    const view = ok(await readWinterBoard(USER, SHOP_ONLY));
    expect(view.phase).toBe("shop_only");
    expect(view.dice).toBe(0);
  });

  it("이벤트가 끝나면 410, 캐릭터가 없으면 409다", async () => {
    expect(await readWinterBoard(USER, ENDED)).toEqual({
      ok: false,
      error: "event_ended",
      status: 410,
    });
    mocks.onboarded = false;
    expect(await readWinterBoard(USER, ACTIVE)).toEqual({
      ok: false,
      error: "no_character",
      status: 409,
    });
  });

  it("바퀴 보상과 교환소 상태를 함께 돌려준다", async () => {
    seed({ laps: 4, claimedMilestones: [], purchases: { stamina_potion: 2 }, questDiceGranted: 4 });
    const view = ok(await readWinterBoard(USER, ACTIVE));
    expect(view.milestones[0]).toMatchObject({ laps: 3, claimed: false, claimable: true });
    expect(view.milestones[1]).toMatchObject({ laps: 6, claimed: false, claimable: false });
    expect(view.shop.find((item) => item.id === "stamina_potion")).toMatchObject({
      cost: 20,
      limit: 15,
      purchased: 2,
    });
  });
});

describe("겨울 말판 굴리기", () => {
  it("주사위를 굴려 주화를 받고 결과를 돌려준다", async () => {
    seed({ dice: 1, questDiceGranted: 4 });
    const rolled = ok(
      await rollWinterBoard(USER, { requestId: REQUEST_A, all: false }, ACTIVE, dice(3)),
    );
    expect(rolled.result.events).toHaveLength(1);
    expect(rolled.position).toBe(3);
    expect(rolled.coins).toBe(5);
    expect(rolled.dice).toBe(0);
    expect(mocks.locked).toEqual([WINTER_BOARD_SAVE_KEY]);
  });

  it("같은 요청이 다시 오면 한 번만 반영하고 같은 결과를 돌려준다", async () => {
    seed({ dice: 3, questDiceGranted: 4 });
    const first = ok(
      await rollWinterBoard(USER, { requestId: REQUEST_A, all: false }, ACTIVE, dice(3)),
    );
    const before = structuredClone(mocks.store.get(WINTER_BOARD_SAVE_KEY));
    const replay = ok(
      await rollWinterBoard(USER, { requestId: REQUEST_A, all: false }, ACTIVE, dice(6)),
    );
    expect(replay.result).toEqual(first.result);
    expect(mocks.store.get(WINTER_BOARD_SAVE_KEY)).toEqual(before);
    expect(replay.dice).toBe(2);

    const next = ok(
      await rollWinterBoard(USER, { requestId: REQUEST_B, all: false }, ACTIVE, dice(2)),
    );
    expect(next.dice).toBe(1);
  });

  it("회복약 칸을 밟았을 때만 회복약 세이브를 잠가 귀속 회복약을 준다", async () => {
    seed({ dice: 1, questDiceGranted: 4 });
    ok(await rollWinterBoard(USER, { requestId: REQUEST_A, all: false }, ACTIVE, dice(6)));
    expect(mocks.locked).toEqual([WINTER_BOARD_SAVE_KEY, STAMINA_POTIONS_KEY]);
    expect(mocks.store.get(STAMINA_POTIONS_KEY)).toEqual({ count: 1, boundCount: 1 });
    expect(mocks.recordEconomyEventSoon).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        eventType: "reward.winter_board.roll",
        quantity: 1,
      }),
    );
  });

  it("굴리기 직전에 그날 적립분을 반영한다", async () => {
    mocks.completedDaily = 1;
    const rolled = ok(
      await rollWinterBoard(USER, { requestId: REQUEST_A, all: true }, ACTIVE, dice(1, 1)),
    );
    expect(rolled.result.events).toHaveLength(2);
    expect(rolled.dice).toBe(0);
  });

  it("주사위가 없으면 409, 굴리기 기간이 끝났으면 409, 종료 뒤에는 410이다", async () => {
    seed({ dice: 0, questDiceGranted: 4 });
    expect(
      await rollWinterBoard(USER, { requestId: REQUEST_A, all: false }, ACTIVE, dice(1)),
    ).toEqual({ ok: false, error: "no_dice", status: 409 });
    seed({ dice: 5 });
    expect(
      await rollWinterBoard(USER, { requestId: REQUEST_A, all: false }, SHOP_ONLY, dice(1)),
    ).toEqual({ ok: false, error: "rolling_closed", status: 409 });
    expect(
      await rollWinterBoard(USER, { requestId: REQUEST_A, all: false }, ENDED, dice(1)),
    ).toEqual({ ok: false, error: "event_ended", status: 410 });
  });
});

describe("누적 바퀴 보상 받기", () => {
  it("숙련 증서는 가방에, 받은 기록은 말판 세이브에 남긴다", async () => {
    seed({ laps: 6, questDiceGranted: 4 });
    mocks.store.set("inventory.v2", { [MASTERY_CERTIFICATE_KEY]: 5, other: 1 });
    const claimed = ok(await claimWinterBoardMilestone(USER, 6, ACTIVE));
    expect(claimed.reward).toEqual({ kind: "mastery_certificate", count: 30 });
    expect(mocks.store.get("inventory.v2")).toEqual({ [MASTERY_CERTIFICATE_KEY]: 35, other: 1 });
    expect(saved().claimedMilestones).toEqual([6]);
    expect(mocks.locked).toEqual([WINTER_BOARD_SAVE_KEY, "inventory.v2"]);

    expect(await claimWinterBoardMilestone(USER, 6, ACTIVE)).toEqual({
      ok: false,
      error: "already_claimed",
      status: 409,
    });
  });

  it("마법부여서는 캐릭터의 소모품으로 들어간다", async () => {
    seed({ laps: 9, questDiceGranted: 4 });
    mocks.store.set("character.v2", { level: 100, cashItems: { enchant_scroll: 1 } });
    ok(await claimWinterBoardMilestone(USER, 9, ACTIVE));
    expect(mocks.store.get("character.v2")).toEqual({
      level: 100,
      cashItems: { enchant_scroll: 2 },
    });
  });

  it("굴리기가 끝난 뒤 교환 기간에도 받을 수 있다", async () => {
    seed({ laps: 15 });
    const claimed = ok(await claimWinterBoardMilestone(USER, 15, SHOP_ONLY));
    expect(claimed.reward).toEqual({ kind: "title", titleId: "winter_finisher" });
    expect(mocks.grantTitleIfMissingInTx).toHaveBeenCalledWith(
      expect.anything(),
      USER,
      "winter_finisher",
      SHOP_ONLY.getTime(),
    );
  });

  it("바퀴 수가 모자라면 409다", async () => {
    seed({ laps: 2, questDiceGranted: 4 });
    expect(await claimWinterBoardMilestone(USER, 3, ACTIVE)).toEqual({
      ok: false,
      error: "milestone_locked",
      status: 409,
    });
    expect(mocks.store.has(STAMINA_POTIONS_KEY)).toBe(false);
  });
});

describe("겨울 교환소", () => {
  it("주화를 쓰고 귀속 회복약을 받는다", async () => {
    seed({ coins: 50, questDiceGranted: 4 });
    const bought = ok(await buyWinterBoardItem(USER, "stamina_potion", ACTIVE));
    expect(bought.item).toEqual({ id: "stamina_potion", name: "스태미나 회복약 1개" });
    expect(bought.coins).toBe(30);
    expect(mocks.store.get(STAMINA_POTIONS_KEY)).toEqual({ count: 1, boundCount: 1 });
    expect(mocks.recordEconomyEventSoon).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "reward.winter_board.shop", itemId: "stamina_potion" }),
    );
  });

  it("교환 기간에도 살 수 있고, 주화가 모자라면 아무것도 주지 않는다", async () => {
    seed({ coins: 400 });
    ok(await buyWinterBoardItem(USER, "title_trailblazer", SHOP_ONLY));
    expect(mocks.grantTitleIfMissingInTx).toHaveBeenCalledTimes(1);
    expect(saved().coins).toBe(0);

    expect(await buyWinterBoardItem(USER, "emblem_box", SHOP_ONLY)).toEqual({
      ok: false,
      error: "not_enough_coins",
      status: 409,
    });
    expect(mocks.store.has("character.v2")).toBe(false);
  });

  it("없는 품목은 400, 한도에 닿으면 409다", async () => {
    seed({ coins: 999, purchases: { title_wanderer: 1 }, questDiceGranted: 4 });
    expect(await buyWinterBoardItem(USER, "nope", ACTIVE)).toEqual({
      ok: false,
      error: "unknown_item",
      status: 400,
    });
    expect(await buyWinterBoardItem(USER, "title_wanderer", ACTIVE)).toEqual({
      ok: false,
      error: "limit_reached",
      status: 409,
    });
  });
});

describe("요청 식별자", () => {
  it("UUID 형식만 받는다", () => {
    expect(validWinterRequestId(REQUEST_A)).toBe(true);
    expect(validWinterRequestId("abc")).toBe(false);
    expect(validWinterRequestId(undefined)).toBe(false);
  });
});
