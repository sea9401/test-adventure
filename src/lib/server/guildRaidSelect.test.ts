import { describe, expect, it } from "vitest";
import { resolveGuildRaidSelection } from "./guildRaidSelect";

const now = new Date("2026-08-19T03:00:00.000Z");
const event = {
  status: "active",
  endsAt: new Date("2026-08-21T15:00:00.000Z"),
};

describe("길드 토벌전 보스 선택 판정", () => {
  it("길드장이나 관리자가 아니면 선택할 수 없다", () => {
    expect(
      resolveGuildRaidSelection({
        now,
        event,
        canManage: false,
        bossId: "canyon_predator_raid",
        existing: null,
      }),
    ).toEqual({ ok: false, error: "forbidden" });
  });

  it("전투 기간이 끝나면 선택할 수 없다", () => {
    expect(
      resolveGuildRaidSelection({
        now: event.endsAt,
        event,
        canManage: true,
        bossId: "canyon_predator_raid",
        existing: null,
      }),
    ).toEqual({ ok: false, error: "event_ended" });
  });

  it("알 수 없는 보스는 거부한다", () => {
    expect(
      resolveGuildRaidSelection({
        now,
        event,
        canManage: true,
        bossId: null,
        existing: null,
      }),
    ).toEqual({ ok: false, error: "bad_boss" });
  });

  it("이미 고른 길드는 같은 보스든 다른 보스든 다시 고를 수 없다", () => {
    for (const bossId of ["canyon_predator_raid", "mountain_chief_hard"] as const) {
      expect(
        resolveGuildRaidSelection({
          now,
          event,
          canManage: true,
          bossId,
          existing: { bossKind: "mountain_chief_hard" },
        }),
      ).toEqual({
        ok: false,
        error: "already_selected",
        selected: "mountain_chief_hard",
      });
    }
  });

  it("전투 기간에 권한자가 처음 고르면 허용한다", () => {
    expect(
      resolveGuildRaidSelection({
        now,
        event,
        canManage: true,
        bossId: "canyon_predator_raid",
        existing: null,
      }),
    ).toEqual({ ok: true });
  });
});
