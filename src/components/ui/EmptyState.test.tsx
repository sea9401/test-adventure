// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "./EmptyState";

afterEach(cleanup);

describe("EmptyState 바로가기", () => {
  it("채우는 곳으로 가는 링크를 보여 줄 수 있다", () => {
    render(<EmptyState icon={<span />} title="강화할 장비가 없습니다" message="사냥터에서 장비를 얻을 수 있습니다." action={{ label: "사냥터로", href: "/battle/dungeon" }} />);
    expect(screen.getByRole("link", { name: "사냥터로" }).getAttribute("href")).toBe("/battle/dungeon");
  });

  it("버튼 동작을 받을 수 있다", () => {
    const onClick = vi.fn();
    render(<EmptyState icon={<span />} title="빈 목록" message="다시 불러오세요." action={{ label: "다시 불러오기", onClick }} />);
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(onClick).toHaveBeenCalled();
  });

  it("바로가기가 없으면 버튼을 만들지 않는다", () => {
    render(<EmptyState icon={<span />} title="빈 목록" message="없습니다." />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
