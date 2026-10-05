export type FarmBatchAction = "plant" | "harvest" | "fertilize";

type FarmBatchResponse = {
  ok: boolean;
  error?: string;
  result?: {
    farmingXpGained?: number;
    seedReturned?: number;
    planted?: number;
    stoppedError?: string | null;
  };
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
  seedsReturned = 0,
): string {
  if (error) {
    return completed > 0
      ? `${completed}칸 처리 후 일괄 작업이 중단되었습니다.`
      : error;
  }
  if (action === "harvest") {
    const base = `${completed}칸을 모두 수확했습니다.${seedsReturned > 0 ? ` 씨앗 ${seedsReturned}개 반환.` : ""}`;
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
  seedsReturned: number;
}> {
  let completed = 0;
  let seedsReturned = 0;
  let farmingXpGained = 0;

  // 심기는 서버가 한 트랜잭션에서 여러 칸을 처리한다. 칸마다 요청하면 밭이
  // 많을 때 수확 직후 농사 요청 제한(분당 30회)에 걸려 중간에 멈춘다.
  if (action === "plant") {
    try {
      const response = await request(FARM_BATCH_ENDPOINT.plant, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plotIds, cropId }),
      });
      const data = (await response.json()) as T;
      if (!response.ok || data.ok !== true) {
        return {
          completed: 0,
          error: data.error ?? "request_failed",
          farmingXpGained,
          seedsReturned,
        };
      }
      onSuccess(data);
      return {
        completed: Math.max(0, Math.floor(Number(data.result?.planted) || 0)),
        error: data.result?.stoppedError ?? null,
        farmingXpGained,
        seedsReturned,
      };
    } catch (error) {
      return {
        completed: 0,
        error: error instanceof Error ? error.message : "request_failed",
        farmingXpGained,
        seedsReturned,
      };
    }
  }

  for (const plotId of plotIds) {
    try {
      const response = await request(FARM_BATCH_ENDPOINT[action], {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plotId }),
      });
      const data = (await response.json()) as T;
      if (!response.ok || data.ok !== true) {
        return {
          completed,
          error: data.error ?? "request_failed",
          farmingXpGained,
          seedsReturned,
        };
      }
      onSuccess(data);
      if (action === "harvest") {
        seedsReturned += Math.max(0, Math.floor(Number(data.result?.seedReturned) || 0));
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
          seedsReturned,
        };
    }
  }

  return { completed, error: null, farmingXpGained, seedsReturned };
}
