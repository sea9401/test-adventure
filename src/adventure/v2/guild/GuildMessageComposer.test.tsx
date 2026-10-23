// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GuildMessageComposer } from "./GuildMessageComposer";

const fetchMock = vi.fn();

function setup() {
  const props = { acting: false, setActing: vi.fn(), setNotice: vi.fn() };
  render(<GuildMessageComposer {...props} />);
  return props;
}

beforeEach(() => {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? Response.json({ ok: true, sentCount: 5, remaining: 1, limit: 3 })
      : Response.json({ ok: true, remaining: 2, limit: 3, recipientCount: 5 }),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("길드 쪽지 보내기", () => {
  it("남은 횟수와 받는 인원을 보여 주고 보낸 뒤 결과를 알린다", async () => {
    const props = setup();

    expect(await screen.findByText("오늘 남은 횟수 2/3")).toBeTruthy();
    expect(screen.getByText(/받는 길드원 5명/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("길드 쪽지 내용"), {
      target: { value: " 토벌전 모여요 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));

    await waitFor(() =>
      expect(props.setNotice).toHaveBeenLastCalledWith({
        kind: "ok",
        text: "길드원 5명에게 쪽지를 보냈어요. 오늘 1번 더 보낼 수 있어요.",
      }),
    );
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({ text: "토벌전 모여요" });
    expect(await screen.findByText("오늘 남은 횟수 1/3")).toBeTruthy();
  });

  it("오늘 횟수를 다 쓰면 입력과 보내기를 막는다", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ ok: true, remaining: 0, limit: 3, recipientCount: 5 }),
    );
    setup();

    expect(await screen.findByText("오늘 남은 횟수 0/3")).toBeTruthy();
    expect((screen.getByLabelText("길드 쪽지 내용") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "보내기" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("한도 초과 응답을 플레이어 말로 알려 준다", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Response.json({ ok: false, error: "daily_limit", remaining: 0 }, { status: 429 })
        : Response.json({ ok: true, remaining: 1, limit: 3, recipientCount: 5 }),
    );
    const props = setup();
    await screen.findByText("오늘 남은 횟수 1/3");

    fireEvent.change(screen.getByLabelText("길드 쪽지 내용"), { target: { value: "공지" } });
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));

    await waitFor(() =>
      expect(props.setNotice).toHaveBeenLastCalledWith({
        kind: "err",
        text: "오늘 보낼 수 있는 길드 쪽지를 모두 보냈어요.",
      }),
    );
  });
});
