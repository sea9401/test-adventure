import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MasteryCertificateTowerEntry,
  masteryTowerEntryNotice,
} from "./V2MasteryTowerView";

describe("MasteryCertificateTowerEntry", () => {
  it("숙련의 탑에서도 공용 증서 모달을 연 상태로 렌더할 수 있다", () => {
    const html = renderToStaticMarkup(
      <MasteryCertificateTowerEntry
        status={{
          certificates: 10,
          jobs: [
            {
              id: "warrior",
              name: "전사",
              tier: 1,
              group: "warrior",
              mastery: 20,
            },
          ],
        }}
        modalOpen
        onOpen={vi.fn()}
        onClose={vi.fn()}
        onUsed={vi.fn()}
      />,
    );

    expect(html).toContain("숙련 증서 사용");
    expect(html).toContain('role="dialog"');
    expect(html).toContain("보유 10개");
  });
});

describe("숙련의 탑 입장 비용 안내", () => {
  it("첫 입장 전에는 받을 스태미나를 보여 준다", () => {
    expect(masteryTowerEntryNotice(200, false)).toBe(
      "오늘 최초 입장 스태미나 200",
    );
  });

  it("프리미엄 지원권으로 면제된 날은 지불 완료가 아니라 면제로 알린다", () => {
    expect(masteryTowerEntryNotice(0, true)).toBe(
      "프리미엄 지원권 적용 중 · 입장 스태미나 면제",
    );
  });

  it("비용을 낸 뒤에는 재도전 무료로 알린다", () => {
    expect(masteryTowerEntryNotice(0, false)).toBe(
      "오늘 입장료 지불 완료 · 재도전 무료",
    );
  });
});
