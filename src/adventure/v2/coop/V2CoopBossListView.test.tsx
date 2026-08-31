import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ sessions: [] as Record<string, unknown>[] }));

vi.mock("@/adventure/v2/coop/useCoopBossState", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/adventure/v2/coop/useCoopBossState")
  >();
  return {
    ...actual,
    useCoopListState: () => ({
      scrolls: 99,
      sessions: state.sessions,
      claimables: [],
      busy: false,
      loaded: true,
      notice: null,
      lastReward: null,
      refresh: vi.fn(async () => undefined),
      summon: vi.fn(async () => null),
      claim: vi.fn(async () => undefined),
    }),
  };
});

import { V2CoopBossListView } from "./V2CoopBossListView";

describe("협동 보스 소환 난이도 선택", () => {
  beforeEach(() => {
    state.sessions = [];
  });

  it("산군·스콜피온·호수 괴물을 각각 한 카드의 NORMAL/HARD 선택지로 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2CoopBossListView onOpenSession={() => {}} onBack={() => {}} />,
    );

    expect(html.match(/>NORMAL<\/button>/g)).toHaveLength(3);
    expect(html.match(/>HARD<\/button>/g)).toHaveLength(3);
    expect(html).not.toContain("재앙의 스콜피온 킹</span>");
    expect(html).not.toContain("혹한의 호수 괴물</span>");
  });

  it("개인 보스 카드에 나만 전투와 세 독립 드롭 확률을 표시한다", () => {
    state.sessions = [{
      id: "personal-1",
      kind: "tracking_weapon",
      hp: 10_800_000,
      maxHp: 10_800_000,
      bossMp: 0,
      bossMaxMp: 0,
      trackingThreat: 73,
      trackingThreatMax: 100,
      trackingReady: false,
      expiresAt: Date.now() + 60_000,
      summonedByName: "개척자",
      visibility: "summoner_only",
      isOwner: true,
      participantCount: 1,
      myDamage: 0,
      myTier: null,
    }];
    const html = renderToStaticMarkup(
      <V2CoopBossListView onOpenSession={() => {}} onBack={() => {}} />,
    );

    expect(html).toContain("추적 병기");
    expect(html).toContain("나만 전투");
    expect(html).toContain("각각 독립적으로 등장");
    expect(html).toContain("30%");
    expect(html).toContain("10%");
    expect(html).toContain("0.5%");
    expect(html).toContain("추적 위협");
    expect(html).toContain("73 / 100");
    expect(html).toContain("추적 섬멸 임박");
  });

  it("일반 협동 보스 카드에는 추적 위협을 표시하지 않는다", () => {
    state.sessions = [{
      id: "coop-1",
      kind: "mountain_chief",
      hp: 100,
      maxHp: 100,
      bossMp: 0,
      bossMaxMp: 0,
      trackingThreat: 0,
      trackingThreatMax: 0,
      trackingReady: false,
      expiresAt: Date.now() + 60_000,
      summonedByName: "개척자",
      visibility: "public",
      isOwner: true,
      participantCount: 1,
      myDamage: 0,
      myTier: null,
    }];

    const html = renderToStaticMarkup(
      <V2CoopBossListView onOpenSession={() => {}} onBack={() => {}} />,
    );

    expect(html).not.toContain("추적 위협");
  });
});
