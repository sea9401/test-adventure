// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoopSessionDetail } from "./useCoopBossState";
const h = vi.hoisted(() => ({
  detail: null as CoopSessionDetail | null,
  attack: vi.fn(async () => null),
  setFreeSupport: vi.fn(),
  summon: vi.fn(async () => null),
}));
vi.mock("./useCoopBossState", async (original) => ({
  ...(await original<typeof import("./useCoopBossState")>()),
  useCoopSessionState: () => ({
    detail: h.detail,
    busy: false,
    missing: false,
    notice: null,
    attack: h.attack,
    setFreeSupport: h.setFreeSupport,
  }),
  useCoopListState: () => ({
    scrolls: 99,
    sessions: [],
    claimables: [],
    loaded: true,
    busy: false,
    summon: h.summon,
  }),
}));
import { V2CoopBossDetailView } from "./V2CoopBossDetailView";
import { V2CoopBossListView } from "./V2CoopBossListView";
function showDetail() {
  return render(
    <V2CoopBossDetailView
      sessionId="boss"
      stamina={{ current: 0, lastUpdatedAt: Date.now() }}
      staminaMax={2000}
      staminaRegenBonusPct={0}
      setStamina={() => {}}
      onBack={() => {}}
      onOpenAttackLog={() => {}}
    />,
  );
}
describe("무료 토벌 지원 UI", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    h.detail = {
      session: {
        id: "boss",
        kind: "mountain_chief",
        hp: 100,
        maxHp: 1000,
        bossMp: 0,
        trackingThreat: 0,
        trackingThreatMax: 100,
        trackingReady: false,
        bossMaxMp: 100,
        expiresAt: Date.now() + 60_000,
        defeatedAt: null,
        defeated: false,
        expired: false,
        summonedByName: "소환자",
        visibility: "public",
        isOwner: false,
        allowFreeSupport: true,
      },
      my: {
        damage: 500,
        attackCount: 2,
        lastAttackAt: null,
        tier: "legend",
        claimed: false,
      },
      combatPreview: null,
      participantCount: 1,
      top: [],
      recentAttacks: [],
    };
  });
  it("스태미나가 없어도 허용된 무료 지원을 선택할 수 있다", async () => {
    showDetail();
    const support = screen.getByRole("button", { name: "무료 지원" });
    expect((support as HTMLButtonElement).disabled).toBe(false);
    expect(
      (
        screen.getByRole("button", {
          name: /스태미너 부족/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(support);
    await waitFor(() => expect(h.attack).toHaveBeenCalledWith(true));
  });
  it("허용하지 않았으면 지원 버튼을 제공하지 않는다", () => {
    h.detail!.session.allowFreeSupport = false;
    showDetail();
    expect(screen.queryByRole("button", { name: "무료 지원" })).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: "무료 토벌 지원 허용" }),
    ).toBeNull();
  });
  it("전체 공개된 보스도 소환자는 지원 허용을 끌 수 있다", () => {
    h.detail!.session.isOwner = true;
    showDetail();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "무료 토벌 지원 허용" }),
    );
    expect(h.setFreeSupport).toHaveBeenCalledWith(false);
  });
  it("재공격 대기 중에는 무료 지원도 비활성이다", () => {
    h.detail!.my.lastAttackAt = Date.now();
    showDetail();
    expect(
      (screen.getByRole("button", { name: "무료 지원" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("처치된 보스에는 지원 공격과 설정을 제공하지 않는다", () => {
    h.detail!.session.defeated = true;
    h.detail!.session.isOwner = true;
    showDetail();
    expect(screen.queryByRole("button", { name: "무료 지원" })).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: "무료 토벌 지원 허용" }),
    ).toBeNull();
  });
  it("소환 옵션은 기본 꺼짐이고 선택값을 소환 요청에 전달한다", async () => {
    render(<V2CoopBossListView onBack={() => {}} onOpenSession={() => {}} />);
    const option = screen.getByRole("checkbox", {
      name: "무료 토벌 지원 허용",
    });
    expect((option as HTMLInputElement).checked).toBe(false);
    fireEvent.click(option);
    fireEvent.click(screen.getAllByRole("button", { name: "소환" })[0]);
    await waitFor(() =>
      expect(h.summon).toHaveBeenCalledWith("mountain_chief", true),
    );
  });
});
