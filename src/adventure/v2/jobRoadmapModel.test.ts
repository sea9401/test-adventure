import { describe, expect, it } from "vitest";
import {
  buildJobRoadmap,
  type JobRoadmapNode,
} from "./jobRoadmapModel";

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

  it("공개된 네 7차를 실제 로드맵에 한 번씩 배치하고 두 선행 계보를 보존한다", () => {
    const nodes = flatten(buildJobRoadmap());
    const tier7Ids = nodes
      .filter((node) => node.tier === 7)
      .map((node) => node.id)
      .sort();
    expect(tier7Ids).toEqual([
      "primordialsage",
      "ruinblade",
      "shadowblade",
      "skyascendant",
    ]);

    const node = nodes.find(
      (candidate) => candidate.id === "shadowblade",
    );

    expect(node).toMatchObject({
      id: "shadowblade",
      tier: 7,
      hybrid: true,
      prerequisiteJobIds: ["swordsaint", "blackmoon"],
    });
    expect(node?.prereqText).toContain("검성 숙련도 100000");
    expect(node?.prereqText).toContain("흑월 숙련도 100000");
  });
});
