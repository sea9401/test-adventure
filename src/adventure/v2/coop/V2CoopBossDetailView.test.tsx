import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ session: {} as Record<string, unknown> }));

vi.mock("@/adventure/v2/coop/useCoopBossState", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/adventure/v2/coop/useCoopBossState")
  >();
  return {
    ...actual,
    useCoopSessionState: () => ({
      detail: {
        session: state.session,
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
      },
      missing: false,
      busy: false,
      notice: null,
      lastReward: null,
      attack: vi.fn(async () => null),
      claim: vi.fn(async () => undefined),
      setVisibility: vi.fn(async () => undefined),
    }),
  };
});

import { V2CoopBossDetailView } from "./V2CoopBossDetailView";

beforeEach(() => {
  state.session = {
          id: "personal-1",
          kind: "tracking_weapon",
          hp: 10_000_000,
          maxHp: 10_800_000,
          bossMp: 0,
          bossMaxMp: 0,
          trackingThreat: 100,
          trackingThreatMax: 100,
          trackingReady: true,
          expiresAt: Date.now() + 60_000,
          defeatedAt: null,
          defeated: false,
          expired: false,
          summonedByName: "개척자",
          visibility: "summoner_only",
          isOwner: true,
  };
});

describe("V2CoopBossDetailView 추적 병기", () => {
  it("상세 헤더에 서버 추적 게이지와 준비 상태를 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2CoopBossDetailView
        sessionId="personal-1"
        stamina={{ current: 100, lastUpdatedAt: Date.now() }}
        staminaMax={100}
        staminaRegenBonusPct={0}
        setStamina={() => {}}
        onBack={() => {}}
        onOpenAttackLog={() => {}}
      />,
    );

    expect(html).toContain("추적 위협");
    expect(html).toContain("100 / 100");
    expect(html).toContain("추적 섬멸 준비");
  });

  it("불괴의 성채 상세에 현재 구간 방벽 상태를 표시한다", () => {
    state.session = {
      ...state.session,
      id: "fortress-1",
      kind: "invincible_fortress",
      hp: 8_100_000,
      fortressBarrierActive: true,
      fortressBarrierTicksRemaining: 160,
      fortressBarrierDamage: 18_200,
      fortressBarrierTarget: 32_400,
      fortressEnrageTier: 2,
      fortressProjectedEnrageTier: 1,
      fortressCompletedBarrierCount: 1,
      fortressNextBarrierHpFraction: 0.5,
      fortressLastResultTier: 2,
    };
    const html = renderToStaticMarkup(
      <V2CoopBossDetailView
        sessionId="fortress-1"
        stamina={{ current: 100, lastUpdatedAt: Date.now() }}
        staminaMax={100}
        staminaRegenBonusPct={0}
        setStamina={() => {}}
        onBack={() => {}}
        onOpenAttackLog={() => {}}
      />,
    );

    expect(html).toContain("방벽 시험 240 / 400틱");
    expect(html).toContain("누적 피해 18,200 / 32,400");
    expect(html).not.toContain("발악 0/");
  });
});
