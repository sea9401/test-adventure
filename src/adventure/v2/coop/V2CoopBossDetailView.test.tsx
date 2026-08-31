import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/v2/coop/useCoopBossState", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/adventure/v2/coop/useCoopBossState")
  >();
  return {
    ...actual,
    useCoopSessionState: () => ({
      detail: {
        session: {
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
});
