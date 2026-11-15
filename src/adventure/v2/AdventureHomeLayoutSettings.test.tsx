import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdventureHomeLayoutSettings } from "./AdventureHomeLayoutSettings";

describe("AdventureHomeLayoutSettings", () => {
  const props = {
    order: ["character_summary", "life_collect", "announcements"] as const,
    hidden: [] as const,
    onOrderChange: vi.fn(),
    onHiddenChange: vi.fn(),
    onReset: vi.fn(),
  };

  it("열리지 않은 위젯은 순서 목록과 숨김 목록에서 빼고 보여 준다", () => {
    const unlocked = renderToStaticMarkup(<AdventureHomeLayoutSettings {...props} />);
    expect(unlocked).toContain("생활 한 번에 정산");

    const locked = renderToStaticMarkup(
      <AdventureHomeLayoutSettings {...props} unavailable={["life_collect"]} />,
    );
    expect(locked).not.toContain("생활 한 번에 정산");
    expect(locked).toContain("캐릭터");
    expect(locked).toContain("공지");

    const lockedHidden = renderToStaticMarkup(
      <AdventureHomeLayoutSettings {...props} hidden={["life_collect"]} unavailable={["life_collect"]} />,
    );
    expect(lockedHidden).not.toContain("생활 한 번에 정산");
  });
});
