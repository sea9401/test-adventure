import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MasteryCertificateEntryCard,
  MasteryCertificateUseModal,
  masteryCertificateErrorLabel,
} from "./MasteryCertificateUseModal";

const warriorJob = {
  id: "warrior",
  name: "전사",
  tier: 1,
  group: "warrior",
  mastery: 20,
};

describe("MasteryCertificateUseModal", () => {
  it("두 사용 모드와 보유량을 표시한다", () => {
    const html = renderToStaticMarkup(
      <MasteryCertificateUseModal
        open
        initialStatus={{ certificates: 10, jobs: [warriorJob] }}
        onClose={vi.fn()}
        onUsed={vi.fn()}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("직업 숙련도");
    expect(html).toContain("숙달 포인트");
    expect(html).toContain("보유 10개");
    expect(html).toContain("전사");
  });

  it("닫힌 상태에서는 아무것도 렌더하지 않는다", () => {
    expect(
      renderToStaticMarkup(
        <MasteryCertificateUseModal
          open={false}
          onClose={vi.fn()}
          onUsed={vi.fn()}
        />,
      ),
    ).toBe("");
  });

  it("서버 오류를 이용자 문구로 변환한다", () => {
    expect(masteryCertificateErrorLabel("no_certificate")).toBe(
      "보유한 숙련 증서가 없습니다.",
    );
    expect(masteryCertificateErrorLabel("job_locked")).toBe(
      "현재 사용할 수 없는 직업입니다.",
    );
  });
});

describe("MasteryCertificateEntryCard", () => {
  it("보유량과 공용 모달 진입 버튼을 표시한다", () => {
    const html = renderToStaticMarkup(
      <MasteryCertificateEntryCard certificates={10} onUse={vi.fn()} />,
    );

    expect(html).toContain("숙련 증서 사용");
    expect(html).toContain("보유 10개");
    expect(html).toContain(">사용<");
  });
});
