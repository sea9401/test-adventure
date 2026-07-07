import { describe, expect, it } from "vitest";
import {
  ARENA_ELO_K,
  ARENA_INITIAL_RATING,
  ARENA_MATCH_COOLDOWN_MS,
  RECENT_OPPONENT_TRACK,
  arenaCooldownRemainingMs,
  applyScoreDelta,
  computeGoldReward,
  computeScoreDelta,
  defaultArenaState,
  oppositeArenaOutcome,
  parseArenaState,
  pushRecentOpponent,
  settleArenaElo,
  weightForCandidate,
  weightedPick,
  ARENA_HISTORY_MAX,
  parseArenaHistory,
  pushArenaHistory,
  type ArenaCandidate,
  type ArenaHistoryEntry,
} from "./arena";

const histEntry = (id: string): ArenaHistoryEntry => ({
  id,
  at: "2026-06-08T00:00:00.000Z",
  outcome: "win",
  opponent: { name: "상대", level: 30 },
  scoreBefore: 100,
  scoreAfter: 120,
  scoreDelta: 20,
  goldGained: 1500,
  turns: 12,
  replay: { enemy: { name: "상대", hp: 450 }, playerMaxHp: 600, playerMaxMp: 100, log: [] },
});

describe("전투 기록 — parseArenaHistory / pushArenaHistory", () => {
  it("배열 아님/필수필드 누락 엔트리는 버린다", () => {
    expect(parseArenaHistory(null)).toEqual([]);
    expect(parseArenaHistory("nope")).toEqual([]);
    const mixed = [
      histEntry("a"),
      { outcome: "win" }, // opponent/replay 없음 → 제거
      { outcome: "bogus", opponent: {}, replay: { log: [] } }, // outcome 무효 → 제거
      { outcome: "loss", opponent: { name: "x", level: 1 }, replay: { log: "nope" } }, // log 배열 아님 → 제거
    ];
    expect(parseArenaHistory(mixed)).toHaveLength(1);
  });

  it("pushArenaHistory — 최근순 prepend + MAX 로 cap", () => {
    let list: ArenaHistoryEntry[] = [];
    for (let i = 0; i < ARENA_HISTORY_MAX + 5; i++) {
      list = pushArenaHistory(list, histEntry(`m${i}`));
    }
    expect(list).toHaveLength(ARENA_HISTORY_MAX);
    expect(list[0]!.id).toBe(`m${ARENA_HISTORY_MAX + 4}`); // 최신이 맨 앞
    expect(list.at(-1)!.id).toBe(`m5`); // 오래된 5판은 밀려남
  });

  it("parseArenaHistory 도 MAX 로 자른다(오염 세이브 방어)", () => {
    const big = Array.from({ length: ARENA_HISTORY_MAX + 10 }, (_, i) => histEntry(`x${i}`));
    expect(parseArenaHistory(big)).toHaveLength(ARENA_HISTORY_MAX);
  });
});

describe("parseArenaState", () => {
  it("null/undefined 면 기본값", () => {
    const s = parseArenaState(null);
    expect(s.score).toBe(ARENA_INITIAL_RATING);
    expect(s.ratingVersion).toBe(2);
    expect(s.recentOpponents).toEqual([]);
    expect(s.milestonesReached).toEqual([]);
    // 기본 lastMatchAt = 에폭 → 쿨타임 없음(즉시 도전 가능).
    expect(new Date(s.lastMatchAt).getTime()).toBe(0);
  });

  it("부분 필드만 있어도 안전 처리", () => {
    const s = parseArenaState({ score: 1042, ratingVersion: 2 });
    expect(s.score).toBe(1042);
  });

  it("버전 없는 옛 누적 점수는 Elo 기본값으로 정규화", () => {
    const s = parseArenaState({ score: 4200 });
    expect(s.score).toBe(ARENA_INITIAL_RATING);
  });

  it("현재 버전 점수는 보존", () => {
    const s = parseArenaState({ score: 42, ratingVersion: 2 });
    expect(s.score).toBe(42);
  });

  it("음수 점수는 0 으로 클램프", () => {
    const s = parseArenaState({ score: -50, ratingVersion: 2 });
    expect(s.score).toBe(0);
  });

  it("lastMatchAt 문자열 보존, 빈/비문자열은 기본값(에폭)", () => {
    const iso = "2026-06-08T00:00:00.000Z";
    expect(parseArenaState({ lastMatchAt: iso }).lastMatchAt).toBe(iso);
    expect(
      new Date(parseArenaState({ lastMatchAt: "" }).lastMatchAt).getTime(),
    ).toBe(0);
    expect(
      new Date(parseArenaState({ lastMatchAt: 123 }).lastMatchAt).getTime(),
    ).toBe(0);
  });

  it("recentOpponents 알 수 없는 항목 제거 + cap", () => {
    const opps = [
      { userId: "u1", at: "x" },
      { botId: "b1", at: "y" },
      { junk: 1 }, // userId/botId 둘 다 없음 → 제거
      { userId: "u2", at: "z" },
      { userId: "u3", at: "a" },
      { userId: "u4", at: "b" },
      { userId: "u5", at: "c" },
    ];
    const s = parseArenaState({ recentOpponents: opps });
    expect(s.recentOpponents.length).toBeLessThanOrEqual(RECENT_OPPONENT_TRACK);
    expect(s.recentOpponents.map((o) => o.userId ?? o.botId)).toEqual([
      "b1",
      "u2",
      "u3",
      "u4",
      "u5",
    ]);
  });

  it("기타 모르는 필드는 무시", () => {
    const s = parseArenaState({ extraStuff: 1, score: 10, ratingVersion: 2 });
    expect(s.score).toBe(10);
  });
});

describe("arenaCooldownRemainingMs", () => {
  const now = new Date("2026-06-08T12:00:00.000Z");

  it("최근 매치가 쿨타임 이내면 남은 ms (>0)", () => {
    const state = {
      ...defaultArenaState(),
      lastMatchAt: new Date(now.getTime() - 3000).toISOString(),
    };
    expect(arenaCooldownRemainingMs(state, now)).toBe(
      ARENA_MATCH_COOLDOWN_MS - 3000,
    );
  });

  it("쿨타임 경과 후엔 0", () => {
    const state = {
      ...defaultArenaState(),
      lastMatchAt: new Date(
        now.getTime() - ARENA_MATCH_COOLDOWN_MS - 1,
      ).toISOString(),
    };
    expect(arenaCooldownRemainingMs(state, now)).toBe(0);
  });

  it("기본 상태(lastMatchAt 에폭)는 쿨타임 0 — 즉시 도전 가능", () => {
    expect(arenaCooldownRemainingMs(defaultArenaState(), now)).toBe(0);
  });

  it("lastMatchAt 파싱 불능이면 0", () => {
    const state = { ...defaultArenaState(), lastMatchAt: "garbage" };
    expect(arenaCooldownRemainingMs(state, now)).toBe(0);
  });
});

describe("computeScoreDelta", () => {
  it("동점 Elo 승리는 K/2 만큼 상승", () => {
    expect(computeScoreDelta(1000, 1000, "win")).toBe(ARENA_ELO_K / 2);
  });

  it("높은 레이팅 상대를 이기면 더 많이 오른다", () => {
    expect(computeScoreDelta(1000, 1200, "win")).toBeGreaterThan(
      computeScoreDelta(1000, 1000, "win"),
    );
  });

  it("낮은 레이팅 상대를 이기면 덜 오른다", () => {
    expect(computeScoreDelta(1200, 1000, "win")).toBeLessThan(
      computeScoreDelta(1000, 1000, "win"),
    );
  });

  it("동점 Elo 패배는 -K/2 만큼 하락", () => {
    expect(computeScoreDelta(1000, 1000, "loss")).toBe(-(ARENA_ELO_K / 2));
  });

  it("무승부는 동점이면 0, 레이팅 차이가 있으면 낮은 쪽이 소폭 오른다", () => {
    expect(computeScoreDelta(1000, 1000, "draw")).toBe(0);
    expect(computeScoreDelta(1000, 1200, "draw")).toBeGreaterThan(0);
    expect(computeScoreDelta(1200, 1000, "draw")).toBeLessThan(0);
  });
});

describe("settleArenaElo", () => {
  it("공격자 승리 시 양쪽 delta 는 제로섬", () => {
    const settled = settleArenaElo(1000, 1000, "win");
    expect(settled.attackerDelta).toBe(16);
    expect(settled.defenderDelta).toBe(-16);
    expect(settled.attackerScoreAfter).toBe(1016);
    expect(settled.defenderScoreAfter).toBe(984);
  });

  it("공격자 패배 시 방어자가 점수를 얻는다", () => {
    const settled = settleArenaElo(1000, 1000, "loss");
    expect(settled.attackerDelta).toBe(-16);
    expect(settled.defenderDelta).toBe(16);
    expect(settled.attackerScoreAfter).toBe(984);
    expect(settled.defenderScoreAfter).toBe(1016);
  });

  it("oppositeArenaOutcome 은 방어자 전적 저장에 쓰는 반대 결과를 만든다", () => {
    expect(oppositeArenaOutcome("win")).toBe("loss");
    expect(oppositeArenaOutcome("loss")).toBe("win");
    expect(oppositeArenaOutcome("draw")).toBe("draw");
  });
});

describe("computeGoldReward", () => {
  it("승리 = level × GOLD_WIN_PER_LEVEL", () => {
    expect(computeGoldReward(10, "win")).toBe(500);
  });
  it("패배 = level × GOLD_LOSS_PER_LEVEL", () => {
    expect(computeGoldReward(10, "loss")).toBe(100);
  });
  it("무승부도 패배 수준 (디자인 doc 9.1 무승부 default)", () => {
    expect(computeGoldReward(10, "draw")).toBe(computeGoldReward(10, "loss"));
  });
  it("level 0/음수 는 1 로 클램프", () => {
    expect(computeGoldReward(0, "win")).toBe(computeGoldReward(1, "win"));
    expect(computeGoldReward(-5, "win")).toBe(computeGoldReward(1, "win"));
  });
});

describe("weightForCandidate", () => {
  const baseCand: ArenaCandidate = {
    userId: "u1",
    name: "x",
    level: 50,
    score: 100,
  };

  it("점수·레벨 모두 동일하면 1.0 근처 (페널티 없음)", () => {
    const w = weightForCandidate(100, 50, baseCand, []);
    expect(w).toBeCloseTo(1.0, 5);
  });

  it("점수 차 크면 가중치 감소하지만 0.3 floor", () => {
    const w = weightForCandidate(100, 50, { ...baseCand, score: 500 }, []);
    // 점수 차 400 > SCORE_WEIGHT_SPAN(200) → 점수 가중치는 floor 0.3
    // 레벨 동일 → 레벨 가중치 1.0 → 결과 0.3
    expect(w).toBeCloseTo(0.3, 5);
  });

  it("최근 매치 상대는 가중치 ×0.2", () => {
    const recent = [{ userId: "u1", at: "x" }];
    const wPenalized = weightForCandidate(100, 50, baseCand, recent);
    const wFresh = weightForCandidate(100, 50, baseCand, []);
    expect(wPenalized).toBeCloseTo(wFresh * 0.2, 5);
  });

  it("0 이하 가중치는 최소 0.0001 로 클램프", () => {
    // 직접 0 이 나오는 경우는 없지만 안전망 확인
    const w = weightForCandidate(100, 50, baseCand, []);
    expect(w).toBeGreaterThan(0);
  });
});

describe("weightedPick", () => {
  it("결정적 rng 로 가중치 비례 픽업", () => {
    const items = [
      { item: "A", weight: 1 },
      { item: "B", weight: 9 },
    ];
    // rng=0.05 → 0.05 × 10 = 0.5 → A (weight 1) 안에서 픽 (1 - 0.5 = 0.5 ≤ 0)
    expect(weightedPick(items, () => 0.05)).toBe("A");
    // rng=0.5 → 5 → A 차감 후 4 남음, B 픽 (9 - 4 = 5 > 0 → 첫 패스 이후 픽)
    expect(weightedPick(items, () => 0.5)).toBe("B");
    // rng=0.95 → 9.5 → B
    expect(weightedPick(items, () => 0.95)).toBe("B");
  });

  it("빈 배열 → null", () => {
    expect(weightedPick([], () => 0.5)).toBeNull();
  });

  it("총합 0 → null", () => {
    expect(weightedPick([{ item: "X", weight: 0 }], () => 0.5)).toBeNull();
  });
});

describe("pushRecentOpponent", () => {
  it("RECENT_OPPONENT_TRACK 초과 시 가장 오래된 것 제거", () => {
    const initial = Array.from({ length: RECENT_OPPONENT_TRACK }, (_, i) => ({
      userId: `u${i}`,
      at: `t${i}`,
    }));
    const next = pushRecentOpponent(initial, { userId: "u_new", at: "t_new" });
    expect(next.length).toBe(RECENT_OPPONENT_TRACK);
    expect(next[next.length - 1].userId).toBe("u_new");
    expect(next[0].userId).toBe("u1"); // u0 가 빠지고 시작점이 u1
  });
});

describe("applyScoreDelta", () => {
  it("정상 가산", () => {
    expect(applyScoreDelta(50, 20)).toBe(70);
  });
  it("음수 결과는 0 으로 클램프 — 점수 0 인 신규가 첫 매치 패배 시", () => {
    expect(applyScoreDelta(0, -16)).toBe(0);
  });
  it("점수 5 + 패 -10 = -5 → 0 클램프", () => {
    expect(applyScoreDelta(5, -10)).toBe(0);
  });
  it("점수 100 + 패 -10 = 90 (클램프 안 됨)", () => {
    expect(applyScoreDelta(100, -10)).toBe(90);
  });
});

describe("Cooldown 다이얼 sanity", () => {
  it("ARENA_MATCH_COOLDOWN_MS = 10초", () => {
    expect(ARENA_MATCH_COOLDOWN_MS).toBe(10_000);
  });
});
