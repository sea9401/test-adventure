import { describe, expect, it } from "vitest";
import {
  BUNDLE_GOAL,
  BUNDLE_POTIONS,
  deriveRepeatBundle,
  deriveRepeatViews,
  kstDailyKey,
  kstWeeklyKey,
  nextDailyResetAt,
  nextWeeklyResetAt,
  parseRepeatSave,
  periodStartMs,
  REPEAT_QUESTS,
  repeatQuestById,
  rolloverRepeatSave,
  snapshotOf,
  type RepeatSave,
  type RepeatSignals,
} from "./v2RepeatQuests";

const SIG = (over?: Partial<RepeatSignals>): RepeatSignals => ({
  battleCount: 1000,
  siegeAttempts: 10,
  siegeWins: 5,
  warTreasuryGold: 20000,
  fishCaught: 50,
  enhanceAttempts: 7,
  arenaTimes: [],
  ...over,
});

describe("KST 주기 키", () => {
  it("일일 — KST 자정 경계 (UTC 15:00 = KST 00:00)", () => {
    // UTC 2026-06-11 14:59 = KST 23:59 → 키 06-11 / UTC 15:00 = KST 06-12 00:00 → 키 06-12
    expect(kstDailyKey(new Date("2026-06-11T14:59:00Z"))).toBe("2026-06-11");
    expect(kstDailyKey(new Date("2026-06-11T15:00:00Z"))).toBe("2026-06-12");
  });
  it("주간 — 월요일 00:00 KST 경계 (일 15:00 UTC)", () => {
    // 2026-06-08 = 월요일. 일요일 KST 23:59 → 이전 주(06-01), 월요일 KST 00:00 → 06-08.
    expect(kstWeeklyKey(new Date("2026-06-07T14:59:00Z"))).toBe("2026-06-01");
    expect(kstWeeklyKey(new Date("2026-06-07T15:00:00Z"))).toBe("2026-06-08");
    // 주 중반도 같은 키.
    expect(kstWeeklyKey(new Date("2026-06-11T03:00:00Z"))).toBe("2026-06-08");
  });
  it("리셋 시각 = 주기 시작 + 1일/7일", () => {
    const now = new Date("2026-06-11T15:00:00Z"); // KST 06-12 00:00
    expect(nextDailyResetAt(now)).toBe(
      periodStartMs("2026-06-12") + 24 * 3600_000,
    );
    expect(nextWeeklyResetAt(now)).toBe(
      periodStartMs("2026-06-08") + 7 * 24 * 3600_000,
    );
  });
});

describe("롤오버", () => {
  const now = new Date("2026-06-11T15:00:00Z"); // KST 06-12(금), 주 시작 06-08
  it("빈 세이브 → 두 주기 스냅샷 생성", () => {
    const { save, changed } = rolloverRepeatSave({}, now, SIG());
    expect(changed).toBe(true);
    expect(save.daily!.key).toBe("2026-06-12");
    expect(save.weekly!.key).toBe("2026-06-08");
    expect(save.daily!.baseline.battleCount).toBe(1000);
    expect(save.daily!.claimed).toEqual([]);
  });
  it("일일만 만료 — 주간 baseline·claimed 보존", () => {
    const prev = {
      daily: { key: "2026-06-11", baseline: snapshotOf(SIG()), claimed: ["d_battles"] },
      weekly: { key: "2026-06-08", baseline: snapshotOf(SIG({ battleCount: 900 })), claimed: ["w_fish"] },
    };
    const { save, changed } = rolloverRepeatSave(prev, now, SIG({ battleCount: 1100 }));
    expect(changed).toBe(true);
    expect(save.daily!.key).toBe("2026-06-12");
    expect(save.daily!.claimed).toEqual([]); // 일일 리셋
    expect(save.daily!.baseline.battleCount).toBe(1100); // 재스냅샷
    expect(save.weekly!.claimed).toEqual(["w_fish"]); // 주간 보존
    expect(save.weekly!.baseline.battleCount).toBe(900);
  });
  it("같은 주기면 무변경", () => {
    const first = rolloverRepeatSave({}, now, SIG()).save;
    const { changed } = rolloverRepeatSave(first, now, SIG({ battleCount: 9999 }));
    expect(changed).toBe(false);
  });
});

describe("차분 판정", () => {
  const now = new Date("2026-06-11T15:00:00Z");
  it("전투 30회 — baseline 대비 차분·클램프·수령 가능", () => {
    const base = rolloverRepeatSave({}, now, SIG({ battleCount: 1000 })).save;
    const views = deriveRepeatViews(base, SIG({ battleCount: 1029 }));
    const d = views.find((v) => v.id === "d_battles")!;
    expect(d.progress).toBe(29);
    expect(d.claimable).toBe(false);
    const views2 = deriveRepeatViews(base, SIG({ battleCount: 1500 }));
    const d2 = views2.find((v) => v.id === "d_battles")!;
    expect(d2.progress).toBe(30); // goal 클램프
    expect(d2.claimable).toBe(true);
  });
  it("아레나 — 주기 시작 이후 기록 존재 판정", () => {
    const base = rolloverRepeatSave({}, now, SIG()).save;
    const start = periodStartMs("2026-06-12");
    const before = deriveRepeatViews(base, SIG({ arenaTimes: [start - 1000] }));
    expect(before.find((v) => v.id === "d_arena")!.progress).toBe(0);
    const after = deriveRepeatViews(base, SIG({ arenaTimes: [start + 1000] }));
    expect(after.find((v) => v.id === "d_arena")!.progress).toBe(1);
  });
  it("claimed 면 claimable=false", () => {
    const rolled = rolloverRepeatSave({}, now, SIG()).save;
    rolled.daily!.claimed.push("d_enhance");
    const views = deriveRepeatViews(rolled, SIG({ enhanceAttempts: 99 }));
    const d = views.find((v) => v.id === "d_enhance")!;
    expect(d.claimed).toBe(true);
    expect(d.claimable).toBe(false);
  });
});

describe("카탈로그 무결성", () => {
  it("id 유일 + 가이드 퀘 id 와 충돌 없음 + 일일5·주간4", () => {
    const ids = REPEAT_QUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(REPEAT_QUESTS.filter((q) => q.scope === "daily")).toHaveLength(5);
    expect(REPEAT_QUESTS.filter((q) => q.scope === "weekly")).toHaveLength(4);
    expect(repeatQuestById("d_battles")).toBeDefined();
    expect(repeatQuestById("nope")).toBeUndefined();
  });
  it("parseRepeatSave — 쓰레기 방어", () => {
    expect(parseRepeatSave(null)).toEqual({});
    expect(parseRepeatSave({ daily: "x" })).toEqual({ daily: undefined, weekly: undefined });
    const ok = parseRepeatSave({
      daily: { key: "2026-06-12", baseline: { battleCount: "5" }, claimed: ["a", 3] },
    });
    expect(ok.daily!.baseline.battleCount).toBe(5);
    expect(ok.daily!.claimed).toEqual(["a"]);
  });
});

describe("마일스톤 번들", () => {
  const now = new Date("2026-06-11T15:00:00Z"); // KST 06-12
  // baseline 전부 0 — 현재 신호가 그대로 진행도가 되게.
  const baseZero = (): RepeatSave =>
    rolloverRepeatSave(
      {},
      now,
      SIG({
        battleCount: 0,
        siegeAttempts: 0,
        siegeWins: 0,
        warTreasuryGold: 0,
        fishCaught: 0,
        enhanceAttempts: 0,
      }),
    ).save;

  it("상수 — 일일 4개→2포션 / 주간 3개→5포션", () => {
    expect(BUNDLE_GOAL).toEqual({ daily: 4, weekly: 3 });
    expect(BUNDLE_POTIONS).toEqual({ daily: 2, weekly: 5 });
  });

  it("일일 4개 완료(아레나 제외) → claimable", () => {
    const b = deriveRepeatBundle(baseZero(), SIG(), "daily");
    expect(b.completed).toBe(4); // battles·claim·fish·enhance (arena ✗: arenaTimes 빈)
    expect(b.total).toBe(5);
    expect(b.goal).toBe(4);
    expect(b.potions).toBe(2);
    expect(b.claimed).toBe(false);
    expect(b.claimable).toBe(true);
  });

  it("완료 수 부족 → claimable=false", () => {
    const b = deriveRepeatBundle(
      baseZero(),
      SIG({ battleCount: 5, fishCaught: 0 }), // d_battles·d_fish 미달
      "daily",
    );
    expect(b.completed).toBe(2); // claim·enhance만
    expect(b.claimable).toBe(false);
  });

  it("주간 3개 이상 완료 → claimable·5포션", () => {
    const start = periodStartMs("2026-06-08");
    const b = deriveRepeatBundle(
      baseZero(),
      SIG({
        arenaTimes: [
          start + 1000,
          start + 2000,
          start + 3000,
          start + 4000,
          start + 5000,
        ],
      }),
      "weekly",
    );
    expect(b.completed).toBe(4); // battles·enhance·arena·fish
    expect(b.potions).toBe(5);
    expect(b.claimable).toBe(true);
  });

  it("이미 수령(bundleClaimed) → claimed=true·claimable=false", () => {
    const save = baseZero();
    save.daily!.bundleClaimed = true;
    const b = deriveRepeatBundle(save, SIG(), "daily");
    expect(b.claimed).toBe(true);
    expect(b.claimable).toBe(false);
  });

  it("롤오버 시 bundleClaimed false 리셋", () => {
    const stale: RepeatSave = {
      daily: {
        key: "2000-01-01",
        baseline: snapshotOf(SIG()),
        claimed: [],
        bundleClaimed: true,
      },
    };
    const rolled = rolloverRepeatSave(stale, now, SIG());
    expect(rolled.changed).toBe(true);
    expect(rolled.save.daily?.bundleClaimed).toBe(false);
  });

  it("parse — bundleClaimed 보존/기본값 false", () => {
    const p = parseRepeatSave({
      daily: { key: "k", baseline: {}, claimed: [], bundleClaimed: true },
      weekly: { key: "w", baseline: {}, claimed: [] },
    });
    expect(p.daily?.bundleClaimed).toBe(true);
    expect(p.weekly?.bundleClaimed).toBe(false);
  });
});
