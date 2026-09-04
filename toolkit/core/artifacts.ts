export type ArtifactScope = "project" | "task";
export type ArtifactOperation = "create" | "replace-owned";

export type ArtifactPlan = {
  scope: ArtifactScope;
  path: string;
  operation: ArtifactOperation;
  content: string | Uint8Array;
  ownershipKey?: string;
};

export type CheckDefinition = {
  id: string;
  command: string;
  args: readonly string[];
  env?: Readonly<Record<string, string>>;
  inputHash?: string;
  toolVersion?: string;
  reason?: string;
  dependsOn: readonly string[];
};
