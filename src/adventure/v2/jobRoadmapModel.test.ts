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
    expect(nodes.find((node) => node.id === "squire")?.prereqText).toContain(
      "숙련도",
    );
    expect(nodes.some((node) => node.hybrid)).toBe(true);
  });
});
