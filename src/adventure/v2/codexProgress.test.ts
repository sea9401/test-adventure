import { describe, expect, it } from "vitest";
import {
  codexSpMilestoneProgress,
  filterCodexEquipmentIds,
} from "./codexProgress";
import type { V2EquipmentId } from "@/adventure/data/v2/v2Equipment";

describe("codexSpMilestoneProgress", () => {
  const milestones = [5, 15, 35, 65] as const;

  it("다음 SP 기준과 남은 수를 알려 준다", () => {
    expect(codexSpMilestoneProgress(39, milestones)).toEqual({
      earned: 3,
      total: 4,
      next: 65,
      remaining: 26,
    });
  });

  it("기준 수에 정확히 도달하면 그 단계는 획득으로 센다", () => {
    expect(codexSpMilestoneProgress(15, milestones)).toMatchObject({
      earned: 2,
      next: 35,
      remaining: 20,
    });
  });

  it("모든 단계를 받으면 다음 기준이 없다", () => {
    expect(codexSpMilestoneProgress(70, milestones)).toEqual({
      earned: 4,
      total: 4,
      next: null,
      remaining: null,
    });
  });

  it("비정상 값은 0으로 본다", () => {
    expect(codexSpMilestoneProgress(Number.NaN, milestones)).toMatchObject({
      earned: 0,
      next: 5,
      remaining: 5,
    });
  });
});

describe("filterCodexEquipmentIds", () => {
  const ids = ["a", "b", "c"] as unknown as V2EquipmentId[];
  const registered = new Set(["a"]);
  const registerable = new Set(["b"]);

  it("전체는 그대로 돌려준다", () => {
    expect(filterCodexEquipmentIds(ids, "all", registered, registerable)).toEqual(ids);
  });

  it("미등록은 등록한 장비만 뺀다", () => {
    expect(
      filterCodexEquipmentIds(ids, "unregistered", registered, registerable),
    ).toEqual(["b", "c"]);
  });

  it("등록 가능은 미등록이면서 바로 등록할 수 있는 장비만 남긴다", () => {
    expect(
      filterCodexEquipmentIds(
        ids,
        "registerable",
        registered,
        new Set(["a", "b"]),
      ),
    ).toEqual(["b"]);
  });
});
