import {
  addDiningXpBonus,
  diningXpBonusSuffix,
  parseDiningXpBonus,
  type DiningXpBonus,
} from "./diningXpBonus";
import {
  addMasterProductGain,
  masterProductGainText,
  parseMasterProductGain,
  type MasterProductGain,
} from "./masterProductGain";

export type FarmBatchAction = "plant" | "harvest" | "fertilize";
/** 화면이 "진행 중"으로 표시하는 일괄 작업. replant = 수확하고 다시 심기. */
export type FarmBusyBatchAction = FarmBatchAction | "replant";

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
  masterProduct?: MasterProductGain | null,
  diningXpBonus?: DiningXpBonus | null,
): string {
  if (error) {
    return completed > 0
      ? `${completed}칸 처리 후 일괄 작업이 중단되었습니다.`
      : error;
  }
  if (action === "harvest") {
    const base = `${completed}칸을 모두 수확했습니다.${seedsReturned > 0 ? ` 씨앗 ${seedsReturned}개 반환.` : ""}`;
    const withXp =
      farmingXpGained > 0
        ? `${base} 농사 XP +${farmingXpGained.toLocaleString("ko-KR")}${diningXpBonusSuffix(diningXpBonus)}.`
        : base;
    return masterProduct ? `${withXp} ${masterProductGainText(masterProduct)}.` : withXp;
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
  /** 수확으로 얻은 명장 작물 합계. 없으면 빠진다. */
  masterProduct?: MasterProductGain;
  /** 수확 경험치에 식당 효과로 붙은 합계. 효과가 없으면 빠진다. */
  diningXpBonus?: DiningXpBonus;
}> {
  let completed = 0;
  let seedsReturned = 0;
  let farmingXpGained = 0;
  let masterProduct: MasterProductGain | null = null;
  let diningXpBonus: DiningXpBonus | null = null;

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
          masterProduct: masterProduct ?? undefined,
          diningXpBonus: diningXpBonus ?? undefined,
        };
      }
      onSuccess(data);
      if (action === "harvest") {
        seedsReturned += Math.max(0, Math.floor(Number(data.result?.seedReturned) || 0));
        farmingXpGained += Math.max(
          0,
          Math.floor(Number(data.result?.farmingXpGained) || 0),
        );
        masterProduct = addMasterProductGain(masterProduct, parseMasterProductGain(data));
        diningXpBonus = addDiningXpBonus(diningXpBonus, parseDiningXpBonus(data));
      }
      completed += 1;
    } catch (error) {
        return {
          completed,
          error: error instanceof Error ? error.message : "request_failed",
          farmingXpGained,
          seedsReturned,
          masterProduct: masterProduct ?? undefined,
          diningXpBonus: diningXpBonus ?? undefined,
        };
    }
  }

  return {
    completed,
    error: null,
    farmingXpGained,
    seedsReturned,
    masterProduct: masterProduct ?? undefined,
    diningXpBonus: diningXpBonus ?? undefined,
  };
}

export type FarmReplantOutcome = {
  harvested: number;
  planted: number;
  /** 수확이나 심기가 중간에 멈춘 사유. 끝까지 했으면 null. */
  error: string | null;
  farmingXpGained: number;
  seedsReturned: number;
  masterProduct?: MasterProductGain;
  diningXpBonus?: DiningXpBonus;
};

/**
 * 다 자란 밭을 모두 수확하고, 수확한 칸에 같은 작물을 다시 심는다.
 * 수확은 칸마다, 심기는 작물별로 묶어 요청한다. 수확이 멈추면 그때까지 수확한 칸만 심는다.
 */
export async function runFarmHarvestAndReplant<T extends FarmBatchResponse>({
  plots,
  onSuccess,
  request = fetch,
}: {
  plots: ReadonlyArray<{ plotId: string; cropId: string }>;
  onSuccess: (data: T) => void;
  request?: typeof fetch;
}): Promise<FarmReplantOutcome> {
  const harvest = await runFarmPlotBatch<T>({
    action: "harvest",
    plotIds: plots.map((plot) => plot.plotId),
    onSuccess,
    request,
  });
  const plotIdsByCrop = new Map<string, string[]>();
  for (const plot of plots.slice(0, harvest.completed)) {
    plotIdsByCrop.set(plot.cropId, [...(plotIdsByCrop.get(plot.cropId) ?? []), plot.plotId]);
  }
  let planted = 0;
  let error = harvest.error;
  for (const [cropId, plotIds] of plotIdsByCrop) {
    const plant = await runFarmPlotBatch<T>({ action: "plant", plotIds, cropId, onSuccess, request });
    planted += plant.completed;
    error ??= plant.error;
  }
  return {
    harvested: harvest.completed,
    planted,
    error,
    farmingXpGained: harvest.farmingXpGained,
    seedsReturned: harvest.seedsReturned,
    masterProduct: harvest.masterProduct,
    diningXpBonus: harvest.diningXpBonus,
  };
}

export function farmReplantOutcomeText(
  outcome: Pick<
    FarmReplantOutcome,
    | "harvested"
    | "planted"
    | "farmingXpGained"
    | "seedsReturned"
    | "masterProduct"
    | "diningXpBonus"
  >,
): string {
  const parts = [`${outcome.harvested}칸을 수확하고 ${outcome.planted}칸에 다시 심었습니다.`];
  if (outcome.planted < outcome.harvested) {
    parts.push(`씨앗이 모자라 ${outcome.harvested - outcome.planted}칸은 비어 있습니다.`);
  }
  if (outcome.seedsReturned > 0) parts.push(`씨앗 ${outcome.seedsReturned}개 반환.`);
  if (outcome.farmingXpGained > 0) {
    parts.push(
      `농사 XP +${outcome.farmingXpGained.toLocaleString("ko-KR")}${diningXpBonusSuffix(outcome.diningXpBonus)}.`,
    );
  }
  if (outcome.masterProduct) parts.push(`${masterProductGainText(outcome.masterProduct)}.`);
  return parts.join(" ");
}
