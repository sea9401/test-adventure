import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import { ReplayBattleScene } from "./ReplayBattleScene";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const payload: ReplayPayload = {
  enemy: { name: "훈련용 적", hp: 100 },
  playerMaxHp: 100,
  playerMaxMp: 0,
  log: [
    { kind: "info", text: "전투가 시작됐다." },
    { kind: "hp_bar", playerHp: 90, enemyHp: 0 },
  ],
};

const commonProps = {
  payload,
  playerName: "모험가",
  gender: "male1" as const,
  exp: 0,
  maxExp: 1,
};

describe("전투 로그 표시 방식", () => {
  it("결과 화면에서는 전체 로그 대신 전용 페이지 이동 버튼을 표시한다", () => {
    const html = renderToStaticMarkup(<ReplayBattleScene {...commonProps} />);

    expect(html).toContain("전체 전투 로그 보기");
    expect(html).not.toContain("전투가 시작됐다.");
  });

  it("전용 페이지에서는 전체 로그를 자연 흐름으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <ReplayBattleScene {...commonProps} presentation="page" />,
    );

    expect(html).toContain("전투가 시작됐다.");
    expect(html).toContain('data-battle-log-viewport="page"');
    expect(html).not.toContain("h-[58svh]");
  });
});
