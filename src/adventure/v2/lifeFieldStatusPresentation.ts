export type LifeFieldStatusPresentation = "loading" | "error" | "ready";

export function lifeFieldStatusPresentation({
  hasData,
  loading,
  error,
}: {
  hasData: boolean;
  loading: boolean;
  error: boolean;
}): LifeFieldStatusPresentation {
  if (hasData) return "ready";
  if (loading) return "loading";
  if (error) return "error";
  return "error";
}
