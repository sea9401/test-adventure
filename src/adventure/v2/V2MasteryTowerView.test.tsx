import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MasteryCertificateTowerEntry } from "./V2MasteryTowerView";

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
