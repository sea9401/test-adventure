export type FarmBatchAction = "plant" | "harvest" | "fertilize";

type FarmBatchResponse = {
  ok: boolean;
  error?: string;
  result?: { farmingXpGained?: number };
};

const FARM_BATCH_ENDPOINT: Record<FarmBatchAction, string> = {
  plant: "/api/v2/farm/plant",
  harvest: "/api/v2/farm/harvest",
  fertilize: "/api/v2/farm/fertilize",
};

export function farmBatchOutcomeText(
  action: FarmBatchAction,
  completed: number,
  error: string | null,
  cropName?: string,
  farmingXpGained = 0,
): string {
  if (error) {
    return completed > 0
      ? `${completed}칸 처리 후 일괄 작업이 중단되었습니다.`
      : error;
  }
  if (action === "harvest") {
    const base = `${completed}칸을 모두 수확했습니다.`;
    return farmingXpGained > 0
      ? `${base} 농사 XP +${farmingXpGained.toLocaleString("ko-KR")}.`
      : base;
  }
  if (action === "fertilize") {
    return `유기질 거름을 ${completed}칸에 뿌렸습니다.`;
  }
  return `${cropName ?? "선택한 작물"} ${completed}칸에 심었습니다.`;
}

export async function runFarmPlotBatch<T extends FarmBatchResponse>({
  action,
  plotIds,
  cropId,
  onSuccess,
  request = fetch,
}: {
  action: FarmBatchAction;
  plotIds: readonly string[];
  cropId?: string;
  onSuccess: (data: T) => void;
  request?: typeof fetch;
}): Promise<{
  completed: number;
  error: string | null;
  farmingXpGained: number;
}> {
  let completed = 0;
  let farmingXpGained = 0;

  for (const plotId of plotIds) {
    try {
      const response = await request(FARM_BATCH_ENDPOINT[action], {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plotId,
          ...(action === "plant" ? { cropId } : {}),
        }),
      });
      const data = (await response.json()) as T;
      if (!response.ok || data.ok !== true) {
        return {
          completed,
          error: data.error ?? "request_failed",
          farmingXpGained,
        };
      }
      onSuccess(data);
      if (action === "harvest") {
        farmingXpGained += Math.max(
          0,
          Math.floor(Number(data.result?.farmingXpGained) || 0),
        );
      }
      completed += 1;
    } catch (error) {
        return {
          completed,
          error: error instanceof Error ? error.message : "request_failed",
          farmingXpGained,
        };
    }
  }

  return { completed, error: null, farmingXpGained };
}
