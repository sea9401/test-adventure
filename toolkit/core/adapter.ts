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

export type AdapterImageSpec = {
  role: "boss" | "drop-30" | "drop-10" | "drop-rare";
  target: string;
  requiresAlpha: boolean;
  rightsSource: string;
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
  listImageSpecs?(
    context: AdapterContext,
    spec: TSpec,
  ): readonly AdapterImageSpec[];
  selectFastChecks(
    context: AdapterContext,
    spec: TSpec,
  ): readonly CheckDefinition[];
  selectFullChecks(
    context: AdapterContext,
    spec: TSpec,
  ): readonly CheckDefinition[];
};
