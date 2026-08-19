import { describe, expect, it } from "vitest";
import { buildJobRoadmap, type JobRoadmapNode } from "./jobRoadmapModel";

function flatten(node: JobRoadmapNode): JobRoadmapNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

describe("job roadmap model", () => {
  it("builds the manual job hierarchy from the shared catalog", () => {
    const root = buildJobRoadmap();
    const nodes = flatten(root);

    expect(root.name).toBe("시작");
    expect(root.children.map((node) => node.id)).toContain("none");
    const mutant = root.children.find((node) => node.id === "mutant");
    expect(mutant?.children.map((node) => node.id)).toEqual([
      "beastkin",
      "golem",
    ]);
    const beastkin = mutant?.children.find((node) => node.id === "beastkin");
    expect(beastkin?.children[0]?.id).toBe("beastwarrior");
    expect(beastkin?.children[0]?.prereqText).toBe("수인 숙련도 1000");
    expect(
      beastkin?.children[0]?.children[0]?.children[0]?.children[0]?.children[0]
        ?.id,
    ).toBe("primalpredator");
    expect(nodes.find((node) => node.id === "squire")?.prereqText).toContain(
      "숙련도",
    );
    expect(nodes.some((node) => node.hybrid)).toBe(true);
  });

  it("marks only level-free lifestyle job branches as production jobs", () => {
    const nodes = flatten(buildJobRoadmap());
    const byId = new Map(nodes.map((node) => [node.id, node]));

    for (const id of ["fisher", "farmer", "cook", "lumberjack", "miner"]) {
      expect(byId.get(id)?.production, id).toBe(true);
    }
    expect(byId.get("healthtrainer")?.production).toBe(false);
    expect(byId.get("mastertrainer")?.production).toBe(false);
    expect(byId.get("survivor")?.production).toBe(false);
  });
});
