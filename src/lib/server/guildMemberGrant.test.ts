import { beforeEach, describe, expect, it, vi } from "vitest";

const saves = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx: unknown, userId: string, key: string, fallback: unknown) =>
    saves.get(`${userId}:${key}`) ?? fallback,
  ),
  upsertSave: vi.fn(async (_tx: unknown, userId: string, key: string, value: unknown) => {
    saves.set(`${userId}:${key}`, value);
  }),
}));

import { isGuildMemberGrantOutput, lockGuildMemberGrant } from "./guildMemberGrant";

describe("길드원 지급", () => {
  beforeEach(() => saves.clear());

  it("재료를 더한다", async () => {
    saves.set("u1:character.v2", { level: 3, materials: { v2_boss_summon_scroll: 2 } });
    const apply = await lockGuildMemberGrant({} as never, "u1", {
      kind: "material",
      materialId: "v2_boss_summon_scroll",
      count: 1,
    });
    await apply();
    expect(saves.get("u1:character.v2")).toEqual({ level: 3, materials: { v2_boss_summon_scroll: 3 } });
  });

  it("숙련 증서를 더한다", async () => {
    const apply = await lockGuildMemberGrant({} as never, "u1", {
      kind: "mastery_certificate",
      itemKey: "masteryCertificates",
      count: 10,
    });
    await apply();
    expect(saves.get("u1:inventory.v2")).toEqual({ masteryCertificates: 10 });
  });

  it("길드 공용 출력은 길드원 지급이 아니다", () => {
    const stamina: { kind: string } = { kind: "stamina_potion" };
    const fame: { kind: string } = { kind: "guild_fame" };
    expect(isGuildMemberGrantOutput(stamina)).toBe(true);
    expect(isGuildMemberGrantOutput(fame)).toBe(false);
  });
});
