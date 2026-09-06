// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";

vi.mock("@/adventure/v2/ReplayBattleScene", () => ({
  ReplayBattleScene: () => <section aria-label="전투 로그">전투 로그 본문</section>,
}));

vi.mock("@/components/ui/CosmeticAvatar", () => ({
  CosmeticAvatar: ({ name }: { name: string }) => <span>{name} 초상화</span>,
}));

import { V2CoopAttackLogView } from "./V2CoopAttackLogView";

const replay: ReplayPayload = {
  enemy: { name: "산군", hp: 30_000 },
  playerMaxHp: 1_000,
  playerMaxMp: 100,
  log: [],
};

function successfulResponse(isSupport = false) {
  return new Response(
    JSON.stringify({
      ok: true,
      kind: "mountain_chief",
      attack: {
        id: 17,
        name: "다른 모험가",
        damageDealt: 12_345,
        damageTaken: 678,
        diedEarly: false,
        isSupport,
        isMe: false,
        avatar: "male1",
        profileBorder: null,
        replay,
        at: Date.parse("2026-08-22T05:50:53.000Z"),
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("V2CoopAttackLogView", () => {
  it("무료 지원 기록에는 보상이 없음을 표시한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successfulResponse(true)));
    render(<V2CoopAttackLogView sessionId="session-1" attackId="17" viewerGender="male1" onBack={() => {}} />);
    expect(await screen.findByText(/무료 지원 · 스태미나 소모/)).toBeTruthy();
  });

  it("links another participant's name directly to their public profile", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successfulResponse()));

    render(
      <V2CoopAttackLogView
        sessionId="session-1"
        attackId="17"
        viewerGender="male1"
        onBack={vi.fn()}
      />,
    );

    const profileLink = await screen.findByRole("link", {
      name: "다른 모험가",
    });
    expect(profileLink.getAttribute("href")).toBe(
      "/character/%EB%8B%A4%EB%A5%B8%20%EB%AA%A8%ED%97%98%EA%B0%80",
    );
  });

  it("returns to the coop boss detail from a button after the battle log", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successfulResponse()));
    const onBack = vi.fn();

    render(
      <V2CoopAttackLogView
        sessionId="session-1"
        attackId="17"
        viewerGender="male1"
        onBack={onBack}
      />,
    );

    const battleLog = await screen.findByRole("region", { name: "전투 로그" });
    const bottomButton = screen.getByRole("button", {
      name: "토벌 화면으로 돌아가기",
    });
    expect(
      battleLog.compareDocumentPosition(bottomButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    fireEvent.click(bottomButton);

    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });
});
