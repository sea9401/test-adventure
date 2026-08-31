// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCoopListState, useCoopSessionState } from "./useCoopBossState";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useCoopListState 개인 보스 보상", () => {
  it("기여도 티어가 없는 개인 보상 응답을 그대로 보존한다", async () => {
    const personalReward = {
      rewardMode: "unexplored_personal" as const,
      bossCore: 1 as const,
      bossCoreMaterialId: "v2_unexplored_boss_core",
      poolMaterialId: "v2_unexplored_runaway_machine_part",
      poolMaterialCount: 1 as const,
      uniqueIds: ["v2_unexplored_tracking_blade_dagger"],
      uniqueNames: ["추적 절단 단검"],
      titleId: "v2_unexplored_tracking_weapon",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/v2/coop/claim" && init?.method === "POST") {
          return new Response(JSON.stringify({ ok: true, reward: personalReward }));
        }
        return new Response(
          JSON.stringify({ ok: true, scrolls: 0, sessions: [], claimables: [] }),
        );
      }),
    );

    const { result } = renderHook(() => useCoopListState());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.claim("personal-session");
    });

    expect(result.current.lastReward).toEqual(personalReward);
  });
});

describe("useCoopSessionState 추적 위협", () => {
  it("공격 응답의 최신 게이지를 상세 상태에 즉시 반영한다", async () => {
    let detailReads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/v2/coop/attack" && init?.method === "POST") {
          return new Response(JSON.stringify({
            ok: true,
            stamina: { current: 80, lastUpdatedAt: 1 },
            result: {
              attackId: 7,
              kind: "tracking_weapon",
              damageDealt: 20,
              damageTaken: 50,
              diedEarly: true,
              turns: 3,
              bossHp: 80,
              bossMaxHp: 100,
              bossMp: 0,
              bossMaxMp: 0,
              bossMpDamage: 0,
              bossMpDepleted: false,
              trackingThreat: 64,
              trackingThreatMax: 100,
              trackingReady: false,
              trackingCounterCount: 1,
              trackingCounterDamage: 35,
              defeated: false,
              myDamage: 20,
              myTier: null,
              killingBlowReward: null,
            },
          }));
        }
        detailReads += 1;
        const trackingThreat = detailReads === 1 ? 10 : 64;
        return new Response(JSON.stringify({
          ok: true,
          session: {
            id: "personal-1",
            kind: "tracking_weapon",
            hp: detailReads === 1 ? 100 : 80,
            maxHp: 100,
            bossMp: 0,
            bossMaxMp: 0,
            trackingThreat,
            trackingThreatMax: 100,
            trackingReady: false,
            expiresAt: Date.now() + 60_000,
            defeatedAt: null,
            defeated: false,
            expired: false,
            summonedByName: "추적자",
            visibility: "summoner_only",
            isOwner: true,
          },
          my: {
            damage: 0,
            attackCount: 0,
            lastAttackAt: null,
            tier: null,
            claimed: false,
          },
          combatPreview: null,
          participantCount: 1,
          top: [],
          recentAttacks: [],
        }));
      }),
    );
    const setStamina = vi.fn();
    const { result } = renderHook(() =>
      useCoopSessionState({ sessionId: "personal-1", setStamina }),
    );
    await waitFor(() =>
      expect(result.current.detail?.session.trackingThreat).toBe(10),
    );

    await act(async () => {
      await result.current.attack();
    });

    expect(result.current.detail?.session).toMatchObject({
      hp: 80,
      trackingThreat: 64,
      trackingThreatMax: 100,
      trackingReady: false,
    });
    expect(setStamina).toHaveBeenCalledWith({ current: 80, lastUpdatedAt: 1 });
  });
});
