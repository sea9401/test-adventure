// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GuildManagePanel } from "./GuildManagePanel";
import type { GuildInfoResponse } from "./guildShared";

// 건의 #873 — 직접 등록할 이미지를 고르면 코인을 쓰기 전에 화면에서 확인할 수 있어야 한다.
const info = {
  ok: true,
  guild: { id: 10, name: "만월", emblem: null, description: "" },
  members: [],
} as unknown as GuildInfoResponse;

const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

function openEmblemSettings() {
  const setNotice = vi.fn();
  const view = render(
    <GuildManagePanel
      info={info}
      guildId={10}
      stateGuildName="만월"
      acting={false}
      setActing={vi.fn()}
      notice={null}
      setNotice={setNotice}
      onRefresh={vi.fn(async () => {})}
      isMaster
      pendingRequests={[]}
      loading={false}
    />,
  );
  fireEvent.click(screen.getByRole("tab", { name: "길드 설정" }));
  const input =
    view.container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("이미지 선택 칸이 없습니다");
  return { ...view, input, setNotice };
}

function pick(input: HTMLInputElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

function imageFile(name: string, type = "image/png", size = 1024) {
  return new File([new Uint8Array(size)], name, { type });
}

beforeEach(() => {
  let seq = 0;
  createObjectURL.mockImplementation(() => `blob:preview-${++seq}`);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ok: true, coins: 1200 })),
  );
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL, revokeObjectURL }),
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("길드 엠블럼 직접 등록 미리보기", () => {
  it("이미지를 고르기 전에는 미리보기 그림이 없다", () => {
    openEmblemSettings();
    expect(screen.queryByAltText("적용할 엠블럼 미리보기")).toBeNull();
    expect(screen.getByText("미리보기")).toBeTruthy();
  });

  it("고른 이미지를 적용 전에 보여 준다", () => {
    const { input } = openEmblemSettings();
    const file = imageFile("moon.png");
    pick(input, file);

    const preview = screen.getByAltText("적용할 엠블럼 미리보기");
    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(preview.getAttribute("src")).toBe("blob:preview-1");
  });

  it("다른 이미지를 고르면 미리보기가 바뀌고 앞선 주소는 해제한다", () => {
    const { input, unmount } = openEmblemSettings();
    pick(input, imageFile("moon.png"));
    pick(input, imageFile("star.webp", "image/webp"));

    expect(
      screen.getByAltText("적용할 엠블럼 미리보기").getAttribute("src"),
    ).toBe("blob:preview-2");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-2");
  });

  it("등록할 수 없는 파일은 미리보기에 올리지 않는다", () => {
    const { input, setNotice } = openEmblemSettings();
    pick(input, imageFile("moon.png"));
    pick(input, imageFile("anim.gif", "image/gif"));

    expect(screen.queryByAltText("적용할 엠블럼 미리보기")).toBeNull();
    expect(setNotice).toHaveBeenLastCalledWith({
      kind: "err",
      text: "JPG, PNG, WebP 이미지 파일만 선택할 수 있어요.",
    });
  });

  it("브라우저가 열지 못하는 이미지는 그림 대신 안내를 보여 준다", () => {
    const { input } = openEmblemSettings();
    pick(input, imageFile("broken.png"));
    fireEvent.error(screen.getByAltText("적용할 엠블럼 미리보기"));

    expect(screen.queryByAltText("적용할 엠블럼 미리보기")).toBeNull();
    expect(screen.getByText("열 수 없는 이미지")).toBeTruthy();
  });
});
