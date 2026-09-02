// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFocusTrap } from "./useFocusTrap";

function TestDialog({ onClose }: { onClose: () => void }) {
  const contentRef = useRef<HTMLDivElement>(null);
  useFocusTrap(contentRef);

  return (
    <div role="dialog" aria-label="검증 대화상자">
      <div ref={contentRef}>
        <button type="button">첫 동작</button>
        <button type="button" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        열기
      </button>
      {open ? <TestDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useFocusTrap", () => {
  it("대화상자 안에서 포커스를 순환시키고 닫으면 실행 버튼으로 복귀한다", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(
      document.body,
    );
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "열기" });
    trigger.focus();
    fireEvent.click(trigger);

    const first = screen.getByRole("button", { name: "첫 동작" });
    const last = screen.getByRole("button", { name: "닫기" });
    await waitFor(() => expect(document.activeElement).toBe(first));

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.click(last);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
