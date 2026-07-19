"use client";

import { GUILD_MAX_LEVEL } from "@/adventure/data/guild";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import type { GuildInfoResponse, Notice } from "./guildShared";

const ERROR_LABELS: Record<string, string> = {
  no_guild: "길드 소속이 필요해요.",
  not_allowed: "마스터 또는 관리자만 길드 레벨을 올릴 수 있어요.",
  guild_not_found: "길드 정보를 찾지 못했어요.",
  maxed: "이미 최고 길드 레벨이에요.",
  insufficient_fame: "사용 가능한 길드 명성이 부족해요.",
  insufficient_gold: "길드 금고 골드가 부족해요.",
};

export function GuildLevelUpgradePanel({
  info,
  acting,
  setActing,
  setNotice,
  onRefresh,
}: {
  info: GuildInfoResponse | null;
  acting: boolean;
  setActing: (value: boolean) => void;
  setNotice: (notice: Notice | null) => void;
  onRefresh: () => Promise<void>;
}) {
  const guild = info?.guild;
  const cost = guild?.levelUpgradeCost ?? null;
  const fameAvailable = guild?.fameAvailable ?? 0;
  const guildGold = info?.guildGold ?? 0;
  const canAfford =
    cost !== null && fameAvailable >= cost.fame && guildGold >= cost.gold;

  const upgrade = async () => {
    if (!guild || !cost || acting) return;
    if (
      !window.confirm(
        `길드를 Lv.${cost.nextLevel}(으)로 올릴까요? 사용 가능 명성 ${cost.fame.toLocaleString()}과 길드 자금 ${cost.gold.toLocaleString()} G가 사용됩니다.`,
      )
    ) {
      return;
    }

    setActing(true);
    setNotice(null);
    try {
      const response = await fetch("/api/v2/guild/level", { method: "POST" });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        level?: number;
      } | null;
      if (body?.ok && typeof body.level === "number") {
        setNotice({
          kind: "ok",
          text: `길드가 Lv.${body.level}(으)로 승급했어요. 길드원 정원이 1명 늘었습니다.`,
        });
        await onRefresh();
        return;
      }
      setNotice({
        kind: "err",
        text:
          ERROR_LABELS[body?.error ?? ""] ??
          `승급하지 못했어요 (${body?.error ?? `http ${response.status}`}).`,
      });
    } catch {
      setNotice({
        kind: "err",
        text: "승급하지 못했어요. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setActing(false);
    }
  };

  return (
    <section className={`${SURFACE_CARD} overflow-hidden text-sm`}>
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-700">
        <div>
          <h2 className="font-semibold">길드 레벨 승급</h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            명성과 길드 자금을 함께 사용해 정원을 늘립니다.
          </p>
        </div>
        <span className="shrink-0 rounded bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
          Lv.{guild?.level ?? 1} / {GUILD_MAX_LEVEL}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">사용 가능 명성</div>
          <div className="mt-0.5 font-semibold tabular-nums">
            {fameAvailable.toLocaleString()}
          </div>
        </div>
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">길드 자금</div>
          <div className="mt-0.5 font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            {guildGold.toLocaleString()} G
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-200 px-3 py-3 dark:border-zinc-700">
        {cost ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-zinc-600 dark:text-zinc-300">
              <span className="font-semibold">Lv.{cost.nextLevel} 승급 비용</span>
              <span className="ml-2 tabular-nums">
                명성 {cost.fame.toLocaleString()} · {cost.gold.toLocaleString()} G
              </span>
            </div>
            <button
              type="button"
              onClick={() => void upgrade()}
              disabled={acting || !canAfford}
              className="rounded-md border border-sky-700 bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {acting ? "처리 중…" : "레벨 올리기"}
            </button>
          </div>
        ) : (
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            최고 길드 레벨을 달성했습니다.
          </p>
        )}
        {cost && !canAfford && (
          <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
            {fameAvailable < cost.fame && guildGold < cost.gold
              ? "사용 가능 명성과 길드 자금이 부족합니다."
              : fameAvailable < cost.fame
                ? "사용 가능한 길드 명성이 부족합니다."
                : "길드 자금이 부족합니다."}
          </p>
        )}
      </div>
    </section>
  );
}
