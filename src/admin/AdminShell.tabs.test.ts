import { describe, expect, it } from "vitest";
import { visibleAdminTabs } from "./AdminShell";

describe("visibleAdminTabs", () => {
  it("최고 관리자에게만 채팅 모니터링 메뉴를 노출한다", () => {
    expect(
      visibleAdminTabs({ super: true }).map((tab) => tab.key),
    ).toContain("chatMonitor");
    expect(
      visibleAdminTabs({ super: false }).map((tab) => tab.key),
    ).not.toContain("chatMonitor");
  });
});
