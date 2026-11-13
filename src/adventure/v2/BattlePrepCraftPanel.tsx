"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import {
  BATTLE_PREP_CRAFT_MAX_QUANTITY,
  BATTLE_PREP_SLOTS,
  BATTLE_PREP_SLOT_NAME,
  type BattlePrepActivity,
  type BattlePrepCraftRow,
} from "@/adventure/data/v2/battlePrep";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { LIFE_MAJOR_CRAFT_MIN_STAGE } from "@/adventure/v2/lifeMajorRules";
import { Card } from "@/components/ui/Card";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { Skeleton } from "@/components/ui/Skeleton";
import { SURFACE_INSET } from "@/components/ui/surfaces";

import { LifeWorkshopQuantityControls } from "./LifeWorkshopQuantityControls";

const ENDPOINT = "/api/v2/life-workshop/battle-prep";
const ACTIVITY_NAME: Record<BattlePrepActivity, string> = { mining: "채광", woodcutting: "벌목", fishing: "낚시" };

type Payload = { ok?: boolean; error?: string; crafted?: number; rows?: BattlePrepCraftRow[] };

function blockedText(row: Pick<BattlePrepCraftRow, "blocked" | "activity" | "requiredLevel">): string | null {
  if (row.blocked === "level") {
    return `${ACTIVITY_NAME[row.activity]} Lv.${row.requiredLevel}부터 제작할 수 있습니다.`;
  }
  if (row.blocked === "major") {
    return `${ACTIVITY_NAME[row.activity]} 주전공 명장 ${LIFE_MAJOR_CRAFT_MIN_STAGE}단계부터 제작할 수 있습니다.`;
  }
  return null;
}

function craftErrorText(error: string | undefined, row: BattlePrepCraftRow): string {
  if (error === "level_required") return blockedText({ ...row, blocked: "level" }) ?? "";
  if (error === "major_required") return blockedText({ ...row, blocked: "major" }) ?? "";
  if (error === "not_enough_materials") return "재료가 부족합니다.";
  return "제작하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

/** 생활 공방 제작 탭의 전투 준비물(숫돌·보강재·어유) 묶음. 자기 데이터를 직접 불러온다. */
export function BattlePrepCraftPanel({
  busy,
  onNotice,
}: {
  busy: boolean;
  onNotice: (text: string) => void;
}) {
  const [rows, setRows] = useState<BattlePrepCraftRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [crafting, setCrafting] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(ENDPOINT);
      const json = (await response.json().catch(() => null)) as Payload | null;
      if (response.ok && json?.ok && json.rows) {
        setRows(json.rows);
        setLoadFailed(false);
      } else {
        setLoadFailed(true);
      }
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 서버 상태를 불러온 뒤 렌더링한다.
    void load();
  }, [load]);

  const craft = useCallback(
    async (row: BattlePrepCraftRow, quantity: number) => {
      if (crafting) return;
      setCrafting(true);
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId: row.id, quantity }),
        });
        const json = (await response.json().catch(() => null)) as Payload | null;
        if (!response.ok || !json?.ok || !json.rows) {
          onNotice(craftErrorText(json?.error, row));
          return;
        }
        setRows(json.rows);
        onNotice(`${row.name} ${json.crafted ?? quantity}개를 완성했습니다.`);
      } catch {
        onNotice(craftErrorText(undefined, row));
      } finally {
        setCrafting(false);
      }
    },
    [crafting, onNotice],
  );

  return (
    <Card padding="md">
      <h2 className="text-sm font-bold">전투 준비물</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        인벤토리 소모품 탭에서 사용합니다. 무기 손질, 방어구 손질, 기력 보충은 음식과 함께 적용됩니다.
      </p>
      {loadFailed ? (
        <div className="mt-3">
          <LoadErrorBanner onRetry={() => void load()} />
        </div>
      ) : rows === null ? (
        <div className="mt-3">
          <Skeleton rows={3} />
        </div>
      ) : (
        BATTLE_PREP_SLOTS.map((slot) => (
          <div key={slot} className="mt-3">
            <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              {BATTLE_PREP_SLOT_NAME[slot]}
            </h3>
            <ul className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {rows
                .filter((row) => row.slot === slot)
                .map((row) => {
                  const blocked = blockedText(row);
                  return (
                    <li key={row.id} className={`${SURFACE_INSET} p-3`}>
                      <div className="flex items-start gap-3">
                        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-amber-200 bg-white dark:border-amber-900 dark:bg-zinc-950">
                          <Image
                            src={row.image}
                            width={256}
                            height={256}
                            sizes="56px"
                            alt=""
                            className="size-full object-contain p-1.5"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 font-bold">{row.name}</div>
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                              보유 {row.owned.toLocaleString()}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {row.effectText} · {row.durationHours}시간
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                        {row.costs.map((cost, index) => (
                          <span key={cost.id}>
                            {index > 0 ? " · " : ""}
                            <span
                              className={
                                cost.owned < cost.need ? "text-rose-600 dark:text-rose-400" : undefined
                              }
                            >
                              {cost.name ?? V2_MATERIALS[cost.id]?.name ?? cost.id} {cost.owned.toLocaleString()}/
                              {cost.need.toLocaleString()}
                            </span>
                          </span>
                        ))}
                      </p>
                      {/* 만들 수 없는 행은 수량 입력 없이 이유만 보여 줘 목록을 짧게 유지한다. */}
                      {blocked ? (
                        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{blocked}</p>
                      ) : row.maxCraftable === 0 ? (
                        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">재료가 부족합니다.</p>
                      ) : (
                        <div className="mt-2">
                          <LifeWorkshopQuantityControls
                            maxQuantity={Math.min(row.maxCraftable, BATTLE_PREP_CRAFT_MAX_QUANTITY)}
                            unit="개"
                            actionLabel="제작"
                            inputLabel={`${row.name} 제작 수량`}
                            busy={busy || crafting}
                            onSubmit={(quantity) => void craft(row, quantity)}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        ))
      )}
    </Card>
  );
}
