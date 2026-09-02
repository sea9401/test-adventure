import type {
  AdapterContext,
  ToolkitAdapter,
} from "../core/adapter";
import type { CheckDefinition } from "../core/artifacts";

export type VerificationSelectionContext<TSpec = unknown> = {
  adapterContext: AdapterContext;
  spec: TSpec;
  changedPaths: readonly string[];
};

function withReason(check: CheckDefinition, reason: string): CheckDefinition {
  return { ...check, reason };
}

function fastReason(checkId: string): string {
  switch (checkId) {
    case "adapter-tests":
      return "adapter schema and generation contracts are always checked";
    case "catalog-tests":
      return "adapter-declared affected product catalogs must remain consistent";
    case "targeted-lint":
      return "changed toolkit and generated product paths require targeted lint";
    case "boss-simulation":
      return "the completed boss mechanic requires a seeded smoke simulation";
    default:
      return `adapter-selected check: ${checkId}`;
  }
}

function visualPath(path: string): boolean {
  return (
    path.startsWith("public/images/") ||
    path === "docs/asset-rights.json" ||
    path.startsWith("docs/asset-provenance-")
  );
}

export function selectFastChecks<TSpec>(
  context: VerificationSelectionContext<TSpec>,
  adapter: ToolkitAdapter<TSpec>,
): readonly CheckDefinition[] {
  const visualChanged = context.changedPaths.some(visualPath);
  const base = adapter
    .selectFastChecks(context.adapterContext, context.spec)
    .filter((check) => check.id !== "images")
    .map((check) =>
      withReason(
        {
          ...check,
          dependsOn: check.dependsOn.map((dependency) =>
            dependency === "images"
              ? visualChanged
                ? "images:references"
                : "targeted-lint"
              : dependency,
          ),
        },
        fastReason(check.id),
      ),
    );
  if (!visualChanged) return base;

  const imageChecks: readonly CheckDefinition[] = [
    {
      id: "images:references",
      command: "npm",
      args: ["run", "check-images"],
      dependsOn: [],
      reason: "visual files changed, so image references and orphans must be checked",
    },
    {
      id: "images:rights",
      command: "npm",
      args: ["run", "check-asset-rights", "--", "--strict"],
      dependsOn: ["images:references"],
      reason: "visual files changed, so exact rights hashes must be current",
    },
  ];
  return [...base, ...imageChecks];
}

function bossId(spec: unknown): string {
  if (
    spec === null ||
    typeof spec !== "object" ||
    !("id" in spec) ||
    typeof spec.id !== "string" ||
    spec.id.trim() === ""
  ) {
    throw new Error("full verification requires a boss id");
  }
  return spec.id;
}

export function selectFullChecks<TSpec>(
  context: VerificationSelectionContext<TSpec>,
  adapter: ToolkitAdapter<TSpec>,
): readonly CheckDefinition[] {
  if (
    !adapter
      .selectFastChecks(context.adapterContext, context.spec)
      .some((check) => check.id === "boss-simulation")
  ) {
    throw new Error("mechanic implementation blocks full verification");
  }
  const id = bossId(context.spec);
  return [
    {
      id: "images",
      command: "npm",
      args: ["run", "check-images"],
      dependsOn: [],
      reason: "authoritative verification checks every image reference",
    },
    {
      id: "rights",
      command: "npm",
      args: ["run", "check-asset-rights", "--", "--strict"],
      dependsOn: ["images"],
      reason: "authoritative verification requires cleared exact asset hashes",
    },
    {
      id: "typecheck",
      command: "npx",
      args: ["tsc", "--noEmit"],
      env: { NODE_OPTIONS: "--max-old-space-size=4096" },
      dependsOn: [],
      reason: "all TypeScript contracts must compile with the supported heap",
    },
    {
      id: "lint",
      command: "npm",
      args: ["run", "lint"],
      dependsOn: [],
      reason: "the full repository lint policy is authoritative",
    },
    {
      id: "unit",
      command: "npm",
      args: ["test"],
      dependsOn: ["rights", "typecheck", "lint"],
      reason: "all repository unit and integration tests must pass",
    },
    {
      id: "simulation",
      command: "npm",
      args: [
        "run",
        "sim:coop-boss",
        "--",
        "--trials=50",
        "--seed=20260902",
        `--boss=${id}`,
        "--json",
      ],
      dependsOn: ["unit"],
      reason: "a 50-trial seeded boss simulation is required for release",
    },
    {
      id: "build",
      command: "npm",
      args: ["run", "build"],
      env: {
        NODE_OPTIONS: "--max-old-space-size=4096",
        V2_UNEXPLORED: "true",
      },
      dependsOn: ["simulation"],
      reason: "the unexplored-enabled production build must complete",
    },
    {
      id: "diff",
      command: "git",
      args: ["diff", "--check"],
      dependsOn: ["build"],
      reason: "the final patch must contain no whitespace errors",
    },
  ];
}
