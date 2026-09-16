import { describe, expect, it, vi } from "vitest";
vi.mock("@/adventure/data/v2/coreLoopConfig", async (original) => ({ ...await original<object>(), V2_UNEXPLORED: true }));
import { resolveAdventureActivities, ADVENTURE_DASHBOARD_SAVE_FALLBACKS } from "./adventureDashboard";
import { SANCTUARY_SAVE_KEY, createSanctuaryActive } from "@/adventure/data/v2/sanctuaryDungeon";
describe("sanctuary daily activity", () => {
  it("tracks its attempts independently and lets an exhausted active run continue", () => {
    const saves: Record<string, unknown> = { ...ADVENTURE_DASHBOARD_SAVE_FALLBACKS, "character.v2": { level: 1, unexplored: { xpPoints: 1 } }, [SANCTUARY_SAVE_KEY]: { date: "2026-09-16", attemptsUsed: 3, active: null } };
    const now = Date.UTC(2026, 8, 16, 3);
    const activity = resolveAdventureActivities(saves, now).find((entry) => entry.id === "sanctuary_daily");
    expect(activity).toMatchObject({ state: "completed", current: 3, target: 3, href: "/battle/sanctuary" });
    saves[SANCTUARY_SAVE_KEY] = { date: "2026-09-16", attemptsUsed: 3, active: createSanctuaryActive(1000, 300) };
    expect(resolveAdventureActivities(saves, now).find((entry) => entry.id === "sanctuary_daily")?.state).toBe("actionable");
  });
});
