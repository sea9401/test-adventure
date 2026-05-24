import { describe, it, expect } from "vitest";
import { MAIN_DUNGEON } from "./dungeon";
import { MONSTERS } from "../monsters";

describe("v2 dungeon", () => {
  it("모든 enemy 이름이 라이브 MONSTERS 에 존재", () => {
    for (const floor of MAIN_DUNGEON.floors) {
      for (const name of floor.enemies) {
        expect(MONSTERS[name], `${floor.name} 의 ${name} 가 MONSTERS 에 없음`).toBeDefined();
      }
    }
  });

  it("5층 모두 정의됨", () => {
    expect(MAIN_DUNGEON.floors.map((f) => f.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("1~2층은 레벨 requirement, 3~5층은 endgame requirement", () => {
    const [f1, f2, f3, f4, f5] = MAIN_DUNGEON.floors;
    expect(f1.requirement.kind).toBe("level");
    expect(f2.requirement.kind).toBe("level");
    expect(f3.requirement.kind).toBe("endgame");
    expect(f4.requirement.kind).toBe("endgame");
    expect(f5.requirement.kind).toBe("endgame");
  });
});
