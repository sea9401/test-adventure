import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseGuildExplorationWeeklyState,
  type GuildExplorationWeeklyState,
} from "@/adventure/data/v2/guildExploration";

const m = vi.hoisted(() => ({
  level: 6,
  state: null as unknown as GuildExplorationWeeklyState,
  saved: [] as GuildExplorationWeeklyState[],
  grants: [] as Array<{ userId: string; output: unknown }>,
  gold: 100_000_000,
  order: [] as string[],
}));

vi.mock("@/db", () => ({ db: { transaction: async (fn: (tx: unknown) => unknown) => fn({}) } }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: async () => "admin" }));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({ getGuildIdByUser: async () => 7 }));
vi.mock("@/lib/server/guildAdmin", () => ({ isGuildAdmin: async () => true }));
vi.mock("@/lib/server/v2GuildResources", () => ({
  lockGuildResources: async () => {
    m.order.push("lockGuildResources");
    return { gold: m.gold };
  },
  upsertGuildResources: async () => undefined,
}));
vi.mock("@/lib/server/v2GuildFame", () => ({ addGuildFame: async () => undefined }));
vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: async (_tx: unknown, entry: { type: string }) => {
    m.order.push(`log:${entry.type}`);
  },
}));
vi.mock("@/lib/server/guildMemberGrant", () => ({
  guildMemberIds: async () => ["admin", "u2", "u3"],
  lockGuildMemberGrant: async (_tx: unknown, userId: string, output: unknown) => {
    m.grants.push({ userId, output });
    return async () => undefined;
  },
}));
vi.mock("@/lib/server/guildExplorationWeekly", () => ({
  currentGuildExplorationWeek: () => ({ key: "2026-10-12", endsAt: new Date("2026-10-19T00:00:00+09:00") }),
  explorationHqLevelForGuild: async () => m.level,
  lockGuildExplorationWeeklyState: async () => m.state,
  readGuildExplorationWeeklyState: async () => m.state,
  saveGuildExplorationWeeklyState: async (_tx: unknown, _g: number, s: GuildExplorationWeeklyState) => {
    m.saved.push(s);
  },
}));

import { POST } from "./route";

function post(body: unknown) {
  return POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
}

function withActive(ids: string[], endsAt: string) {
  const base = parseGuildExplorationWeeklyState(null, "2026-10-12");
  return {
    ...base,
    content: {
      ...base.content,
      activeExpeditions: ids.map((expeditionId) => ({
        expeditionId,
        startedAt: "2026-10-12T00:00:00.000Z",
        endsAt,
      })),
    },
  } as GuildExplorationWeeklyState;
}

describe("탐사 본부 원정", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T00:00:00.000Z"));
    m.level = 6;
    m.saved = [];
    m.grants = [];
    m.order = [];
    m.state = withActive([], "2026-10-12T00:00:00.000Z");
  });

  it("운영 실적 적립(활동 로그)을 길드 금고 잠금보다 먼저 한다", async () => {
    m.state = withActive(["frozen_peak"], "2026-10-12T15:00:00.000Z");
    expect((await post({ action: "claim_expedition", expeditionId: "frozen_peak" })).status).toBe(200);
    expect(m.order.indexOf("log:exploration_expedition_claim")).toBeLessThan(
      m.order.indexOf("lockGuildResources"),
    );
  });

  it("귀환한 원정의 길드원 보상을 회수 시점 길드원 전원에게 준다", async () => {
    m.state = withActive(["frozen_peak"], "2026-10-12T15:00:00.000Z");
    const res = await post({ action: "claim_expedition", expeditionId: "frozen_peak" });
    expect(res.status).toBe(200);
    expect(m.grants).toEqual([
      { userId: "admin", output: { kind: "stamina_potion", count: 1 } },
      { userId: "u2", output: { kind: "stamina_potion", count: 1 } },
      { userId: "u3", output: { kind: "stamina_potion", count: 1 } },
    ]);
    expect(await res.json()).toMatchObject({ memberRewardRecipients: 3 });
  });

  it("길드원 보상이 없는 원정은 지급하지 않는다", async () => {
    m.state = withActive(["ancient_ruins"], "2026-10-12T02:00:00.000Z");
    const res = await post({ action: "claim_expedition" });
    expect(res.status).toBe(200);
    expect(m.grants).toEqual([]);
  });

  it("Lv.7은 진행 중 원정이 있으면 더 보낼 수 없고 Lv.8은 하나 더 보낼 수 있다", async () => {
    m.level = 7;
    m.state = withActive(["ancient_ruins"], "2026-10-20T00:00:00.000Z");
    expect((await post({ action: "dispatch", expeditionId: "mist_forest" })).status).toBe(409);
    m.level = 8;
    const res = await post({ action: "dispatch", expeditionId: "mist_forest" });
    expect(res.status).toBe(200);
    expect(m.saved.at(-1)?.content.activeExpeditions).toHaveLength(2);
    expect(await res.json()).toMatchObject({ concurrentLimit: 2 });
  });
});
