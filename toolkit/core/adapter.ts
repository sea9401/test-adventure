import type { ArtifactPlan, CheckDefinition } from "./artifacts";

export type AdapterContext = {
  projectRoot: string;
  taskId: string;
  taskRoot: string;
  baseSha: string;
};

export type ValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
  blockingPhase?: "content" | "release";
};

export type ToolkitAdapter<TSpec> = {
  id: string;
  displayName?: string;
  specVersion: number;
  parseSpec(input: unknown): TSpec;
  plan(
    context: AdapterContext,
    spec: TSpec,
  ): Promise<readonly ArtifactPlan[]>;
  validateGenerated(
    context: AdapterContext,
    spec: TSpec,
  ): Promise<readonly ValidationIssue[]>;
  listExternalTargets?(
    context: AdapterContext,
    spec: TSpec,
  ): readonly string[];
  selectFastChecks(
    context: AdapterContext,
    spec: TSpec,
  ): readonly CheckDefinition[];
  selectFullChecks(
    context: AdapterContext,
    spec: TSpec,
  ): readonly CheckDefinition[];
};
