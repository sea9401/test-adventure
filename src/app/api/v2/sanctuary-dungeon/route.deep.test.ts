import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 태초의 성소 심층 단계 — 단계 선택, 적 강화, 완주 보상(증표·최고 단계·칭호).

const f = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  battle: vi.fn(),
  prepare: vi.fn(),
  grantTitle: vi.fn(async () => true),
}));
vi.mock("@/db", () => ({ db: { transaction: async (fn: (tx: object) => Promise<unknown>) => fn({}) } }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: async () => "user" }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: () => null }));
vi.mock("@/adventure/data/v2/coreLoopConfig", async (original) => ({ ...await original<object>(), V2_UNEXPLORED: true }));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: async (_tx: unknown, _user: string, key: string, fallback: unknown) => f.store.get(key) ?? fallback,
  lockSaveForUpdate: async (_tx: unknown, _user: string, key: string, fallback: unknown) => f.store.get(key) ?? fallback,
  upsertSave: async (_tx: unknown, _user: string, key: string, value: unknown) => { f.store.set(key, value); },
}));
vi.mock("@/lib/server/v2BattlePrep", () => ({ prepareV2BattleActor: f.prepare }));
vi.mock("@/adventure/v2/combat/engine", () => ({ resolveBattle: f.battle }));
vi.mock("@/adventure/data/v2/replayPayload", () => ({ toReplayPayload: () => ({ log: [] }) }));
vi.mock("@/lib/server/grantTitle", () => ({ grantTitleIfMissingInTx: f.grantTitle }));

import { DEEP_STAGE_TITLE_IDS } from "@/adventure/data/v2/dungeonDeepStage";
import {
  SANCTUARY_HARD_DEPTH_BONUS,
  SANCTUARY_SAVE_KEY,
  parseSanctuaryState,
  sanctuaryChoices,
  sanctuaryNode,
} from "@/adventure/data/v2/sanctuaryDungeon";
import { stormExpeditionEnemy } from "@/adventure/data/v2/stormExpedition";
import { DEEP_SHOP_SAVE_KEY, parseDeepShopState } from "@/adventure/v2/deepShop";
import { GET, POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://test/api/v2/sanctuary-dungeon", { method: "POST", body: JSON.stringify(body) }));
const current = () => parseSanctuaryState(f.store.get(SANCTUARY_SAVE_KEY));
const action = (name: string, extra = {}) => post({ action: name, expectedRevision: current().revision, ...extra });
const tokens = () => parseDeepShopState(f.store.get(DEEP_SHOP_SAVE_KEY)).tokens;
const seed = (extra: Record<string, unknown>) =>
  f.store.set(SANCTUARY_SAVE_KEY, { ...parseSanctuaryState({}), ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  f.store.clear();
  f.store.set("character.v2", { level: 100, gold: 42 });
  f.prepare.mockResolvedValue({
    player: { player: { hp: 1000, maxHp: 1000, mp: 300, maxMp: 300, atk: 100, magicAtk: 100, spd: 30 } },
    skills: { equipped: [], learned: [] },
  });
  f.battle.mockReturnValue({ outcome: "win", turns: 3, finalState: { playerHp: 800, playerMp: 250, v2SkillCooldowns: {} } });
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => vi.restoreAllMocks());

describe("태초의 성소 심층 단계", () => {
  it("완주한 적이 없으면 심층이 잠겨 있고 입장 횟수를 쓰지 않는다", async () => {
    const status = await (await GET()).json();
    expect(status.deep).toEqual({ best: 0, maxSelectable: 0 });

    const response = await action("start", { difficulty: "hard", deepStage: 1 });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("deep_stage_locked");
    expect(current().attemptsUsed).toBe(0);
    expect(current().active).toBeNull();
  });

  it("하드가 아니거나 잘못된 단계 값은 거절한다", async () => {
    seed({ clears: 3 });

    for (const body of [
      { difficulty: "normal", deepStage: 1 },
      { deepStage: 1 },
      { difficulty: "hard", deepStage: -1 },
      { difficulty: "hard", deepStage: 1.5 },
      { difficulty: "hard", deepStage: "2" },
    ]) {
      const response = await action("start", body);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("invalid_deep_stage");
    }
    expect(current().attemptsUsed).toBe(0);
  });

  it("최고 완주 단계 다음 단계까지만 고를 수 있다", async () => {
    seed({ clears: 3, deepBest: 2 });
    expect((await (await GET()).json()).deep).toEqual({ best: 2, maxSelectable: 3 });

    expect((await action("start", { difficulty: "hard", deepStage: 4 })).status).toBe(409);
    expect((await action("start", { difficulty: "hard", deepStage: 3 })).status).toBe(200);
    expect(current().active?.deepStage).toBe(3);
    expect(current().difficulty).toBe("hard");
  });

  it("심층 단계의 적은 하드보다 단계마다 깊이 8만큼 강하다", async () => {
    seed({ clears: 1, deepBest: 4 });
    await action("start", { difficulty: "hard", deepStage: 5 });

    await action("fight");

    const enemy = f.battle.mock.calls[0][1] as { hp: number; atk: number };
    const expected = stormExpeditionEnemy("wreckage", "early_trash", 0, SANCTUARY_HARD_DEPTH_BONUS + 40);
    expect(enemy.hp).toBe(expected.hp);
    expect(enemy.atk).toBe(expected.atk);
  });

  it("심층을 완주하면 증표를 받고 최고 단계가 오른다", async () => {
    seed({ clears: 1, attemptsUsed: 2 });

    const json = await (await action("auto", { difficulty: "hard", deepStage: 1 })).json();

    expect(json.auto.runs).toHaveLength(1);
    expect(json.auto.runs[0]).toMatchObject({ cleared: true, deepStage: 1, deepTokens: 12 });
    expect(json.deep).toEqual({ best: 1, maxSelectable: 2 });
    expect(current()).toMatchObject({ clears: 2, deepBest: 1 });
    expect(current().deepBestAt).toBeGreaterThan(0);
    expect(tokens()).toBe(12);
    expect(f.grantTitle).not.toHaveBeenCalled();
  });

  it("한 번씩 자동 진행하면 같은 날 탐험마다 다음 심층 단계로 오른다", async () => {
    seed({ clears: 1 });

    for (const deepStage of [1, 2, 3]) {
      const json = await (await action("auto", { difficulty: "hard", deepStage, maxRuns: 1 })).json();
      expect(json.auto.runs).toHaveLength(1);
      expect(json.auto.runs[0]).toMatchObject({ cleared: true, deepStage });
      expect(json.deep).toEqual({ best: deepStage, maxSelectable: deepStage + 1 });
    }

    expect(current()).toMatchObject({ attemptsUsed: 3, deepBest: 3 });
  });

  it("한 번씩 싸워 완주해도 증표를 받고, 응답에 받은 수를 싣는다", async () => {
    seed({ clears: 1, deepBest: 2 });
    await action("start", { difficulty: "hard", deepStage: 3 });

    let last: Record<string, unknown> = {};
    for (let step = 0; step < 40 && current().active; step += 1) {
      const active = current().active!;
      if (sanctuaryNode(active).kind === "battle") {
        last = await (await action("fight")).json();
      } else {
        // 전투가 아닌 곳에서는 제시된 첫 선택지를 고른다.
        const chosen = await action("choose", { choiceId: sanctuaryChoices(active)[0].id });
        expect(chosen.status).toBe(200);
      }
    }

    expect(last.finalClear).toBe(true);
    expect(last.deepTokensGained).toBe(16);
    expect(current().deepBest).toBe(3);
    expect(tokens()).toBe(16);
  });

  it("이미 넘은 단계를 다시 완주하면 증표만 받고 기록은 그대로다", async () => {
    seed({ clears: 9, deepBest: 6, deepBestAt: 777, attemptsUsed: 2 });

    await action("auto", { difficulty: "hard", deepStage: 2 });

    expect(current()).toMatchObject({ deepBest: 6, deepBestAt: 777 });
    expect(tokens()).toBe(14);
  });

  it("패배하면 증표도 기록도 얻지 못한다", async () => {
    seed({ clears: 1, attemptsUsed: 2 });
    f.battle.mockReturnValueOnce({ outcome: "lose", turns: 3, finalState: { playerHp: 0, playerMp: 0, v2SkillCooldowns: {} } });

    const json = await (await action("auto", { difficulty: "hard", deepStage: 1 })).json();

    expect(json.auto.runs[0]).toMatchObject({ cleared: false });
    expect(current().deepBest).toBe(0);
    expect(tokens()).toBe(0);
  });

  it("심층이 아닌 완주는 증표를 주지 않고 응답 모양도 그대로다", async () => {
    seed({ attemptsUsed: 2 });

    const json = await (await action("auto", { difficulty: "hard" })).json();

    expect(json.auto.runs[0]).not.toHaveProperty("deepStage");
    expect(json.auto.runs[0]).not.toHaveProperty("deepTokens");
    expect(tokens()).toBe(0);
    expect(f.store.has(DEEP_SHOP_SAVE_KEY)).toBe(false);
  });

  it("10단계를 처음 완주하면 칭호를 받는다", async () => {
    seed({ clears: 20, deepBest: 9, attemptsUsed: 2 });

    await action("auto", { difficulty: "hard", deepStage: 10 });

    expect(current().deepBest).toBe(10);
    expect(f.grantTitle).toHaveBeenCalledOnce();
    expect(f.grantTitle.mock.calls[0].slice(1, 3)).toEqual(["user", DEEP_STAGE_TITLE_IDS.sanctuary[10]]);
  });
});
