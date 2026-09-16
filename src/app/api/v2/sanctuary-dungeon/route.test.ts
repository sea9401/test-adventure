import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ store: new Map<string, unknown>(), battle: vi.fn(), prepare: vi.fn(), user: "user" as string | null, limited: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: async (fn: (tx: object) => Promise<unknown>) => fn({}) } }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: async () => f.user }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: f.limited }));
vi.mock("@/adventure/data/v2/coreLoopConfig", async (original) => ({ ...await original<object>(), V2_UNEXPLORED: true }));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: async (_tx: unknown, _user: string, key: string, fallback: unknown) => f.store.get(key) ?? fallback,
  lockSaveForUpdate: async (_tx: unknown, _user: string, key: string, fallback: unknown) => f.store.get(key) ?? fallback,
  upsertSave: async (_tx: unknown, _user: string, key: string, value: unknown) => { f.store.set(key, value); },
}));
vi.mock("@/lib/server/v2BattlePrep", () => ({ prepareV2BattleActor: f.prepare }));
vi.mock("@/adventure/v2/combat/engine", () => ({ resolveBattle: f.battle }));
vi.mock("@/adventure/data/v2/replayPayload", () => ({ toReplayPayload: () => ({ log: [] }) }));
import { LIMITED_RECOVERY_SKILL_IDS } from "@/adventure/data/v2/v2Skills";
import { GET, POST } from "./route";
import { SANCTUARY_SAVE_KEY, createSanctuaryActive, parseSanctuaryState, sanctuaryNode, type SanctuaryState } from "@/adventure/data/v2/sanctuaryDungeon";
import { stormExpeditionDateKey } from "@/adventure/data/v2/stormExpedition";
import { parseEmblemState } from "@/adventure/data/v2/emblems";
const post = (body: unknown) => POST(new Request("http://test/api/v2/sanctuary-dungeon", { method: "POST", body: JSON.stringify(body) }));
const current = () => parseSanctuaryState(f.store.get(SANCTUARY_SAVE_KEY));
const action = (name: string, extra = {}) => post({ action: name, expectedRevision: current().revision, ...extra });

beforeEach(() => {
  vi.clearAllMocks(); f.store.clear(); f.user = "user"; f.limited.mockReturnValue(null);
  f.store.set("character.v2", { level: 100, gold: 42 });
  f.store.set("storm-expedition.v1", { attemptsUsed: 2, marker: "unchanged" });
  f.prepare.mockResolvedValue({ player: { player: { hp: 1000, maxHp: 1000, mp: 300, maxMp: 300, atk: 100, magicAtk: 100, spd: 30 } }, skills: { equipped: [], learned: [] } });
  f.battle.mockReturnValue({ outcome: "win", turns: 3, finalState: { playerHp: 800, playerMp: 250, v2SkillCooldowns: {} } });
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => vi.restoreAllMocks());

describe("sanctuary dungeon authority", () => {
  it("authenticates and enforces unlock server-side", async () => {
    f.user = null;
    expect((await GET()).status).toBe(401);
    expect((await action("start")).status).toBe(401);
    f.user = "user";
    f.store.set("character.v2", { level: 99 });
    expect((await action("start")).status).toBe(403);
    expect(f.prepare).not.toHaveBeenCalled();
  });
  it("consumes three independent attempts and does not reset them on retreat", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await action("start")).status).toBe(200);
      expect((await action("withdraw")).status).toBe(200);
    }
    expect((await action("start")).status).toBe(409);
    expect(current().attemptsUsed).toBe(3);
    expect(f.store.get("storm-expedition.v1")).toEqual({ attemptsUsed: 2, marker: "unchanged" });
  });
  it("rejects stale/replayed fights without progressing or awarding twice", async () => {
    await action("start");
    const revision = current().revision;
    expect((await post({ action: "fight", expectedRevision: revision })).status).toBe(200);
    expect(current().pendingEmblems).toHaveLength(1);
    expect((await post({ action: "fight", expectedRevision: revision })).status).toBe(409);
    expect(f.battle).toHaveBeenCalledTimes(1);
    expect(current().pendingEmblems).toHaveLength(1);
  });
  it("blocks skipped choices and arbitrary branch selection", async () => {
    await action("start"); await action("fight"); await action("fight");
    expect(current().active?.currentNodeId).toBe("supply");
    expect((await action("fight")).status).toBe(409);
    expect((await action("move", { targetNodeId: "storm_heart" })).status).toBe(400);
    expect((await action("choose", { choiceId: "scavenged_coffer" })).status).toBe(400);
    expect((await action("choose", { choiceId: "field_rations" })).status).toBe(200);
    expect(current().active?.currentNodeId).toBe("wreckage_middle");
    expect(current().active?.hp).toBe(950);
  });
  it("completes the entire linear run and grants pending emblems exactly once", async () => {
    await action("start");
    for (let step = 0; step < 11; step++) {
      const active = current().active!;
      const node = sanctuaryNode(active);
      const choiceId = node.kind === "supply" ? "field_rations" : node.kind === "camp" ? "deep_rest" : node.kind === "altar" ? active.altarOffers[0] : "repair_armor";
      const response = await action(node.kind === "battle" ? "fight" : "choose", { choiceId });
      expect(response.status).toBe(200);
    }
    expect(current().active).toBeNull();
    expect(current().clears).toBe(1);
    const character = f.store.get("character.v2") as Record<string, unknown>;
    expect(parseEmblemState(character.emblems).owned).toHaveLength(7);
    expect((await action("fight")).status).toBe(409);
    expect(parseEmblemState((f.store.get("character.v2") as Record<string, unknown>).emblems).owned).toHaveLength(7);
  });
  it("loses pending loot on defeat but grants it on withdrawal", async () => {
    await action("start"); await action("fight");
    await action("withdraw");
    expect(parseEmblemState((f.store.get("character.v2") as Record<string, unknown>).emblems).owned).toHaveLength(1);
    await action("start"); await action("fight");
    f.battle.mockReturnValueOnce({ outcome: "lose", turns: 3, finalState: { playerHp: 0, playerMp: 0, v2SkillCooldowns: {} } });
    await action("fight");
    expect(current().active).toBeNull();
    expect(current().pendingEmblems).toHaveLength(0);
    expect(parseEmblemState((f.store.get("character.v2") as Record<string, unknown>).emblems).owned).toHaveLength(1);
  });
  it("keeps a midnight run and resets only today's attempt counter", async () => {
    f.store.set(SANCTUARY_SAVE_KEY, { ...parseSanctuaryState({}), date: "2000-01-01", attemptsUsed: 3, active: createSanctuaryActive(1000, 300), revision: 12 });
    const status = await (await GET()).json();
    expect(status.state.active).not.toBeNull(); expect(status.attemptsLeft).toBe(3);
    expect((await action("start")).status).toBe(409);
    await action("withdraw"); await action("start");
    expect(current().attemptsUsed).toBe(1); expect(current().date).toBe(stormExpeditionDateKey());
  });
  it("does not replenish limited recovery skills between encounters", async () => {
    await action("start");
    const state: SanctuaryState = current();
    const recoveryId = LIMITED_RECOVERY_SKILL_IDS[0];
    f.prepare.mockResolvedValueOnce({ player: { player: { hp: 1000, maxHp: 1000, mp: 300, maxMp: 300, atk: 100, spd: 30 } }, skills: { equipped: [recoveryId, "attack"], learned: [] } });
    f.store.set(SANCTUARY_SAVE_KEY, { ...state, active: { ...state.active!, usedRecoverySkillIds: [recoveryId] } });
    expect((await action("fight")).status).toBe(200);
    expect(f.battle.mock.calls[0][3].v2Skills.equipped).toEqual(["attack"]);
    expect(current().active?.usedRecoverySkillIds).toContain(recoveryId);
  });
});
