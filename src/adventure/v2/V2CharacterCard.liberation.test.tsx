// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { V2CharacterCard } from "./V2CharacterCard";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (original) => ({
  ...(await original<typeof import("@/adventure/data/v2/coreLoopConfig")>()),
  V2_EQUIPMENT_LIBERATION: true,
}));
afterEach(cleanup);
it("캐릭터 상세 장착 슬롯을 누르면 실제 해방 옵션을 보여준다", () => {
  render(<V2CharacterCard
    character={{name: "모험가", level: 1, exp: 0, expToNext: 10, hp: 100, maxHp: 100, mp: 50, maxMp: 50, gold: 0}}
    equipped={{gloves: "glove"}}
    owned={[{iid: "glove", id: "v2_boss_catastrophe_gloves", liberation: {rank: 2, lineCount: 2, revision: 7, options: [{id: "base_str_pct", level: 10}, {id: "skill_crit_damage_pp", level: 8}]}}]}
  />);
  fireEvent.click(screen.getByRole("button", {name: /^장갑:/}));
  expect(screen.getByText("기초 STR +4.5%")).toBeTruthy();
  expect(screen.getByText("스킬 치명타 피해 +16%p")).toBeTruthy();
});
