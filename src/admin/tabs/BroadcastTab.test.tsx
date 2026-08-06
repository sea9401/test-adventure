import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminProvider } from "../AdminContext";
import { BroadcastTab } from "./BroadcastTab";

describe("관리자 공지·우편", () => {
  it("개별 우편 수신자를 유저 ID 대신 닉네임으로 검색한다", () => {
    const html = renderToStaticMarkup(
      <AdminProvider>
        <BroadcastTab />
      </AdminProvider>,
    );

    expect(html).toContain("수신자 닉네임");
    expect(html).toContain('placeholder="닉네임 입력"');
    expect(html).toContain("닉네임을 검색한 뒤 정확한 계정을 선택하세요.");
    expect(html).not.toContain("유저 탭에서 복사한 user id");
    expect(html).not.toContain('placeholder="user id"');
  });
});
