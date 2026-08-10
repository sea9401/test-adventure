export type EnhancementResetResponse = {
  ok?: boolean;
  iid?: string;
  error?: string;
};

type EnhancementResetRequest = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

export async function resetEnhancementAndRefresh({
  iid,
  request = fetch,
  refreshEquipment,
  refreshGameState,
}: {
  iid: string;
  request?: EnhancementResetRequest;
  refreshEquipment: () => void | Promise<void>;
  refreshGameState: () => void | Promise<void>;
}): Promise<EnhancementResetResponse> {
  const response = await request("/api/v2/me/enhance/reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ iid }),
  });
  const result = (await response.json()) as EnhancementResetResponse;
  if (result.ok) {
    await Promise.all([refreshEquipment(), refreshGameState()]);
  }
  return result;
}
