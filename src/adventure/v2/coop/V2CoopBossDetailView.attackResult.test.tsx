// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  attack: vi.fn(),
}));

vi.mock("@/adventure/v2/coop/useCoopBossState", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/adventure/v2/coop/useCoopBossState")
  >();
  return {
    ...actual,
    useCoopSessionState: () => ({
      detail: {
        session: {
          id: "boss-1",
          kind: "mountain_chief",
          hp: 5_000_000,
          maxHp: 8_400_000,
          bossMp: 0,
          bossMaxMp: 0,
          trackingThreat: 0,
          trackingThreatMax: 0,
          trackingReady: false,
          expiresAt: Date.now() + 3_600_000,
          defeatedAt: null,
          defeated: false,
          expired: false,
          summonedByName: null,
          visibility: "public",
          allowFreeSupport: false,
          isOwner: false,
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
      attack: state.attack,
      claim: vi.fn(async () => undefined),
      setVisibility: vi.fn(async () => undefined),
      setFreeSupport: vi.fn(async () => undefined),
    }),
  };
});

import { V2CoopBossDetailView } from "./V2CoopBossDetailView";

afterEach(() => {
  cleanup();
  state.attack.mockReset();
});

describe("협동 보스 공격 직후 화면", () => {
  it("공격해도 전투 로그로 넘어가지 않고 결과 요약을 보여 준 뒤 눌러야 로그를 연다", async () => {
    state.attack.mockResolvedValue({
      attackId: 42,
      kind: "mountain_chief",
      damageDealt: 3_117_711,
      damageTaken: 964,
      diedEarly: false,
      defeated: false,
      killingBlowReward: null,
    });
    const onOpenAttackLog = vi.fn();
    render(
      <V2CoopBossDetailView
        sessionId="boss-1"
        stamina={{ current: 100, lastUpdatedAt: Date.now() }}
        staminaMax={100}
        staminaRegenBonusPct={0}
        setStamina={() => {}}
        onBack={() => {}}
        onOpenAttackLog={onOpenAttackLog}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /공격 \(스태미너/ }));
    });

    expect(onOpenAttackLog).not.toHaveBeenCalled();
    expect(screen.getByText("방금 공격")).toBeTruthy();
    expect(screen.getByText("3,117,711")).toBeTruthy();
    expect(screen.getByText("964")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "전투 기록 보기" }));
    expect(onOpenAttackLog).toHaveBeenCalledWith(42);
  });
});
