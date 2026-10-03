// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/adventure/bulletin/api", () => ({
  fetchNoticePreview: vi.fn(async () => []),
}));

import { V2AnnouncementsPanel } from "./V2AnnouncementsPanel";

afterEach(cleanup);

describe("홈 공지사항 위젯", () => {
  it("등록된 공지가 없으면 위젯을 숨긴다", async () => {
    const { container } = render(<V2AnnouncementsPanel />);

    await waitFor(() => expect(container.innerHTML).toBe(""));
  });
});
