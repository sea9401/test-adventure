export function marketplaceFeatureRetired() {
  return Response.json(
    { ok: false, error: "marketplace_feature_retired" },
    { status: 410 },
  );
}
