import { useRouter } from "next/navigation";
import { CaretRight } from "@phosphor-icons/react";
import { tileOutpostId } from "@/adventure/data/v2/tileWarfare";
import type { Outpost } from "@/adventure/data/v2/types";
import {
  POLICY_LABEL,
  TYPE_LABEL,
  settleTierLabel,
  type Occupation,
  type TileSettlementRow,
} from "./guildShared";

// 보유 거점 탭 — 자유 타일 정착지 + 점령 거점 목록. (V2GuildHome 에서 추출, 거동 불변)
export function GuildOutpostsPanel({
  guildId,
  guildSettlements,
  ownedOutposts,
  occByOutpost,
  memberNameById,
}: {
  guildId: number | null;
  guildSettlements: TileSettlementRow[];
  ownedOutposts: Outpost[];
  occByOutpost: Map<string, Occupation>;
  memberNameById: Map<string, string>;
}) {
  const router = useRouter();

  if (guildId == null) {
    return (
      <div className="text-sm text-zinc-500 dark:text-zinc-400">
        소속 길드가 없어요.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 우리 길드 영지 — 길드원이 세운 자유 타일 정착지(개인 소유·길드 귀속은 멤버십). */}
      <section>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          정착지
          {guildSettlements.length > 0
            ? ` (${guildSettlements.length})`
            : ""}
        </h3>
        {guildSettlements.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            아직 정착지가 없어요. 지도에서 빈 땅에 개척마을을 세우면 우리
            길드 영지로 표시됩니다.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {guildSettlements.map((s) => {
              const sid = tileOutpostId(s.col, s.row);
              const occ = occByOutpost.get(sid);
              const policy = occ?.policy ?? "open";
              return (
                <li key={`${s.col},${s.row}`}>
                  <button
                    type="button"
                    onClick={() => router.push(`/outpost/${sid}`)}
                    className="flex w-full items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {s.name ?? "개척 정착지"}
                        </span>
                        <span className="shrink-0 text-xs text-emerald-600 dark:text-emerald-400">
                          {settleTierLabel(s.tier)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                        {memberNameById.get(s.userId) ?? "길드원"} · ({s.col},{" "}
                        {s.row}) · 정책 {POLICY_LABEL[policy] ?? policy} ·
                        관리하기
                      </span>
                    </span>
                    <CaretRight
                      size={16}
                      weight="bold"
                      aria-hidden
                      className="shrink-0 text-zinc-400 dark:text-zinc-500"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 점령 거점 — 옛 거점 시스템과 공존(있을 때만). */}
      {ownedOutposts.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            점령 거점
          </h3>
          <ul className="space-y-1.5">
            {ownedOutposts.map((o) => {
              const occ = occByOutpost.get(o.id);
              const policy = occ?.policy ?? "open";
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/outpost/${o.id}`)}
                    className="flex w-full items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {occ?.villageName?.trim() || o.name}
                        </span>
                        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                          {TYPE_LABEL[o.type]}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                        정책 {POLICY_LABEL[policy] ?? policy} · 관리하기
                      </span>
                    </span>
                    <CaretRight
                      size={16}
                      weight="bold"
                      aria-hidden
                      className="shrink-0 text-zinc-400 dark:text-zinc-500"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
