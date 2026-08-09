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

  it("보상 우편 소비 아이템 목록에서 세 소모품을 선택하고 코인샵 목록과 중복하지 않는다", () => {
    const html = renderToStaticMarkup(
      <AdminProvider>
        <BroadcastTab />
      </AdminProvider>,
    );

    const consumableStart = html.indexOf(">소비 아이템 첨부<");
    const cashItemStart = html.indexOf(">무슨 코인샵 아이템 첨부<");
    const consumableSection = html.slice(consumableStart, cashItemStart);
    const cashItemSection = html.slice(cashItemStart);

    expect(consumableStart).toBeGreaterThanOrEqual(0);
    expect(cashItemStart).toBeGreaterThan(consumableStart);
    expect(consumableSection).toContain("스태미나 회복약");
    expect(consumableSection).toContain("수행 초기화 물약");
    expect(consumableSection).toContain("100레벨 달성의 비약");
    expect(cashItemSection).not.toContain("수행 초기화 물약");
    expect(cashItemSection).not.toContain("100레벨 달성의 비약");
  });
});
