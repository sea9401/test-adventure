import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Inset } from "./Inset";

describe("Inset", () => {
  it("불투명 인셋을 다형 요소로 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <Inset as="section" padding="md">
        내용
      </Inset>,
    );

    expect(html).toContain("<section");
    expect(html).toContain("bg-zinc-50");
    expect(html).toContain("dark:bg-zinc-950");
    expect(html).toContain("p-3");
  });
});
